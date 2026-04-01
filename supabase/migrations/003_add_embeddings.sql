-- Enable pgvector extension for image embedding similarity search
create extension if not exists vector;

-- Add embedding column for cover image embeddings (768-dim, smallest supported by gemini-embedding-2-preview)
alter table pieces add column cover_embedding vector(768);

-- HNSW index for fast cosine similarity search
create index pieces_cover_embedding_idx
  on pieces using hnsw (cover_embedding vector_cosine_ops);

-- RPC function for nearest-neighbor search by embedding
create or replace function match_pieces(
  query_embedding vector(768),
  match_user_id uuid,
  match_count int default 9
) returns table (
  id uuid,
  name text,
  ai_description text,
  cover_image_id uuid,
  similarity float
)
language sql stable as $$
  select
    p.id,
    p.name,
    p.ai_description,
    p.cover_image_id,
    1 - (p.cover_embedding <=> query_embedding) as similarity
  from pieces p
  where p.user_id = match_user_id
    and p.cover_embedding is not null
  order by p.cover_embedding <=> query_embedding
  limit match_count;
$$;
