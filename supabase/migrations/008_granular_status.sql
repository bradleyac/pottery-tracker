-- Expand status values for granular pipeline progress tracking.
-- Single uploads: queued → preprocessing → analyzing → ready
-- Batch uploads:  queued → preprocessing → analyzing → waiting_for_batch → consolidating → ready

alter table public.pending_uploads
  drop constraint if exists pending_uploads_status_check;

alter table public.pending_uploads
  add constraint pending_uploads_status_check
  check (status in (
    'queued', 'preprocessing', 'analyzing',
    'waiting_for_batch', 'consolidating',
    'ready', 'failed'
  ));
