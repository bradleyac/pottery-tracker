-- Pieces table
create table public.pieces (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  description     text,
  ai_description  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  cover_image_id  uuid
);

-- Images table
create table public.images (
  id           uuid primary key default gen_random_uuid(),
  piece_id     uuid not null references public.pieces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  uploaded_at  timestamptz not null default now(),
  notes        text,
  is_cover     boolean not null default false
);

-- Deferred FK from pieces to images (for cover_image_id)
alter table public.pieces add constraint pieces_cover_image_id_fkey
  foreign key (cover_image_id) references public.images(id)
  on delete set null deferrable initially deferred;

-- Piece match audit log
create table public.piece_matches (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  candidate_path      text not null,
  suggested_piece_id  uuid references public.pieces(id) on delete set null,
  confidence          numeric(4,3),
  claude_reasoning    text,
  user_action         text not null check (user_action in ('accepted', 'overridden', 'new_piece')),
  final_piece_id      uuid references public.pieces(id) on delete set null,
  created_at          timestamptz not null default now()
);

-- Updated_at trigger
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger pieces_updated_at
  before update on public.pieces
  for each row execute procedure public.handle_updated_at();

-- RLS: pieces
alter table public.pieces enable row level security;

create policy "Users can view own pieces"
  on public.pieces for select
  using (auth.uid() = user_id);

create policy "Users can insert own pieces"
  on public.pieces for insert
  with check (auth.uid() = user_id);

create policy "Users can update own pieces"
  on public.pieces for update
  using (auth.uid() = user_id);

create policy "Users can delete own pieces"
  on public.pieces for delete
  using (auth.uid() = user_id);

-- RLS: images
alter table public.images enable row level security;

create policy "Users can view own images"
  on public.images for select
  using (auth.uid() = user_id);

create policy "Users can insert own images"
  on public.images for insert
  with check (auth.uid() = user_id);

create policy "Users can update own images"
  on public.images for update
  using (auth.uid() = user_id);

create policy "Users can delete own images"
  on public.images for delete
  using (auth.uid() = user_id);

-- RLS: piece_matches
alter table public.piece_matches enable row level security;

create policy "Users can view own matches"
  on public.piece_matches for select
  using (auth.uid() = user_id);

create policy "Users can insert own matches"
  on public.piece_matches for insert
  with check (auth.uid() = user_id);
