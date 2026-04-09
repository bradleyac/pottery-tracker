-- Resiliency overhaul: per-row retry/lease tracking, pending_batches table,
-- drop batch_consolidated (replaced by pending_batches.consolidated_at),
-- and pg_cron/pg_net tick driver.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Add retry/lease columns to pending_uploads
-- ──────────────────────────────────────────────────────────────────────────────

alter table public.pending_uploads
  add column if not exists analyze_attempts         int not null default 0,
  add column if not exists analyze_next_attempt_at  timestamptz,
  add column if not exists analyze_last_error       text,
  add column if not exists analyze_locked_at        timestamptz;

-- Index for the tick sweep: eligible rows that are ready to be retried
create index if not exists pending_uploads_tick_eligible_idx
  on public.pending_uploads (analyze_next_attempt_at)
  where status in ('queued', 'preprocessing', 'analyzing', 'waiting_for_batch');

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Create pending_batches table
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists public.pending_batches (
  batch_id                    uuid primary key,
  user_id                     uuid not null references auth.users(id) on delete cascade,
  created_at                  timestamptz not null default now(),
  consolidate_attempts        int not null default 0,
  consolidate_next_attempt_at timestamptz,
  consolidate_locked_at       timestamptz,
  consolidate_last_error      text,
  consolidated_at             timestamptz
);

-- Index for tick sweep C: batches awaiting consolidation
create index if not exists pending_batches_tick_eligible_idx
  on public.pending_batches (consolidate_next_attempt_at)
  where consolidated_at is null;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Backfill pending_batches from existing pending_uploads
-- ──────────────────────────────────────────────────────────────────────────────

insert into public.pending_batches (batch_id, user_id, created_at, consolidated_at)
select
  pu.batch_id,
  pu.user_id,
  min(pu.created_at),
  -- Mark already-consolidated batches (all members have batch_consolidated=true)
  case
    when bool_and(pu.batch_consolidated) then now()
    else null
  end
from public.pending_uploads pu
where pu.batch_id is not null
group by pu.batch_id, pu.user_id
on conflict (batch_id) do nothing;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Drop batch_consolidated column (replaced by pending_batches.consolidated_at)
-- ──────────────────────────────────────────────────────────────────────────────

alter table public.pending_uploads
  drop column if exists batch_consolidated;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Enable pg_cron and pg_net extensions
-- ──────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Grant usage so our function can call net.http_post
grant usage on schema extensions to postgres;

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. Stored helper: invoke_tick() reads app_url/service_role_key from app_config
-- ──────────────────────────────────────────────────────────────────────────────

create or replace function public.invoke_tick() returns void
language plpgsql security definer as $$
declare
  app_url     text;
  service_key text;
begin
  select value into app_url     from public.app_config where key = 'app_url';
  select value into service_key from public.app_config where key = 'service_role_key';

  if app_url is null or service_key is null then
    raise notice 'invoke_tick: app_url or service_role_key not set in app_config, skipping';
    return;
  end if;

  perform extensions.http_post(
    url     := app_url || '/api/internal/tick',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 50000
  );
end;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. Register cron jobs (idempotent — unschedule first if already present)
-- ──────────────────────────────────────────────────────────────────────────────

select cron.unschedule('pending-uploads-tick')  where exists (select 1 from cron.job where jobname = 'pending-uploads-tick');
select cron.unschedule('delete-job-run-details') where exists (select 1 from cron.job where jobname = 'delete-job-run-details');

select cron.schedule(
  'pending-uploads-tick',
  '* * * * *',
  $$select public.invoke_tick();$$
);

select cron.schedule(
  'delete-job-run-details',
  '0 12 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
