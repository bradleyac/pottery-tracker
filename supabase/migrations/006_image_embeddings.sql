-- Add per-image embedding column for similarity validation and intra-batch grouping
alter table images add column embedding vector(768);

-- HNSW index for fast cosine similarity search across all image embeddings
create index images_embedding_idx
  on images using hnsw (embedding vector_cosine_ops);
