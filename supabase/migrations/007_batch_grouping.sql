-- Support intra-batch grouping: track which bulk-upload request each pending upload
-- belongs to, store its embedding for pairwise similarity, and record its cluster assignment.

alter table public.pending_uploads
  add column batch_id            uuid,
  add column embedding           vector(768),
  add column batch_group_id      uuid,
  add column batch_consolidated  boolean not null default false;

-- Fast lookup of all uploads in a batch (used by consolidateBatch)
create index pending_uploads_batch_id_idx on public.pending_uploads (batch_id)
  where batch_id is not null;

-- Fast lookup of all uploads in a group (used by confirm/separate APIs)
create index pending_uploads_batch_group_id_idx on public.pending_uploads (batch_group_id)
  where batch_group_id is not null;
