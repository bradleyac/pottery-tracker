-- Glaze inspirations: user-uploaded reference images for the glaze preview feature.
-- Stored in the existing 'pottery-images' bucket under {user_id}/glaze-inspirations/{id}.jpg

create table public.glaze_inspirations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null default '',
  storage_path text not null,
  created_at   timestamptz not null default now()
);

alter table public.glaze_inspirations enable row level security;

create policy "Users manage own glaze inspirations"
  on public.glaze_inspirations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index glaze_inspirations_user_idx
  on public.glaze_inspirations (user_id, created_at desc);
