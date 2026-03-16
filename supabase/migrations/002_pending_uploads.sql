create table public.pending_uploads (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  temp_storage_path   text not null,
  original_filename   text,
  -- Filled in by Edge Function after analysis
  matched_piece_id    uuid references public.pieces(id) on delete set null,
  confidence          numeric(4,3),
  claude_reasoning    text,
  suggested_name      text,
  updated_description text,
  -- 'queued': waiting for Edge Function; 'ready': analyzed; 'failed': error
  status              text not null default 'queued'
                      check (status in ('queued', 'ready', 'failed')),
  created_at          timestamptz not null default now()
);

alter table public.pending_uploads enable row level security;
create policy "Users manage own pending uploads" on public.pending_uploads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index pending_uploads_user_status_idx on public.pending_uploads(user_id, status);
