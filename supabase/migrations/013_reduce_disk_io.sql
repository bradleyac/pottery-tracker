-- Reduce disk I/O burn rate:
--   1. Slow the pending-uploads-tick from every minute to every 5 minutes.
--      Uploads trigger their own processing inline; the tick is a recovery
--      sweep, so once-per-minute is overkill and burns the disk IO budget
--      with PATCH-no-op churn even when both queues are empty.
--   2. Drop images_embedding_idx — the HNSW index has never been read
--      (`match_pieces` uses pieces.cover_embedding, not images.embedding)
--      and HNSW maintenance is expensive on every insert.

select cron.unschedule('pending-uploads-tick')
where exists (select 1 from cron.job where jobname = 'pending-uploads-tick');

select cron.schedule(
  'pending-uploads-tick',
  '*/5 * * * *',
  $$select public.invoke_tick();$$
);

drop index if exists public.images_embedding_idx;
