create table public.signed_url_cache (
  storage_path  text        primary key,
  signed_url    text        not null,
  expires_at    timestamptz not null,
  cached_at     timestamptz not null default now()
);

-- No RLS: table is service-role only; anon/user roles never access it.
-- storage_path values already contain user_id as a prefix, so no cross-user leak.

create index signed_url_cache_expires_at_idx
  on public.signed_url_cache (expires_at);
