-- Glaze previews: saved generated glaze preview images, persisted to storage
create table glaze_previews (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references pieces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  piece_image_id uuid references images(id) on delete set null,
  glaze_inspiration_id uuid references glaze_inspirations(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table glaze_previews enable row level security;

create policy "Users can manage their own glaze previews"
  on glaze_previews
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
