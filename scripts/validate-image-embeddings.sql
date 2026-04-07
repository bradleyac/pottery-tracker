-- Validate embedding quality for intra-batch grouping threshold calibration.
-- Run these in the Supabase SQL editor after the backfill completes.

-- 1. Coverage check — how many images have embeddings?
select
  count(*) filter (where embedding is not null) as with_embedding,
  count(*) filter (where embedding is null)     as without_embedding,
  count(*)                                       as total
from images;


-- 2. Same-piece similarity — pairs of images belonging to the same piece
--    These should cluster HIGH if embeddings are useful for grouping.
select
  p.name                                                              as piece,
  count(*)                                                            as pair_count,
  round(min (1 - (a.embedding <=> b.embedding))::numeric, 4)         as min_similarity,
  round(avg (1 - (a.embedding <=> b.embedding))::numeric, 4)         as avg_similarity,
  round(max (1 - (a.embedding <=> b.embedding))::numeric, 4)         as max_similarity
from images a
join images b  on a.piece_id = b.piece_id and a.id < b.id
join pieces p  on p.id = a.piece_id
where a.embedding is not null
  and b.embedding is not null
group by p.id, p.name
order by avg_similarity desc;


-- 3. Cross-piece similarity — pairs of images from DIFFERENT pieces (same user)
--    These should cluster LOW. The gap between this and query 2 tells you
--    whether 0.70 is a safe threshold.
select
  round(min (1 - (a.embedding <=> b.embedding))::numeric, 4) as min_similarity,
  round(avg (1 - (a.embedding <=> b.embedding))::numeric, 4) as avg_similarity,
  round(max (1 - (a.embedding <=> b.embedding))::numeric, 4) as max_similarity,
  percentile_cont(0.90) within group (
    order by 1 - (a.embedding <=> b.embedding)
  )::numeric(6,4)                                            as p90_similarity
from images a
join images b  on a.piece_id <> b.piece_id and a.id < b.id
join pieces pa on pa.id = a.piece_id
join pieces pb on pb.id = b.piece_id
where pa.user_id = pb.user_id   -- same user, different piece
  and a.embedding is not null
  and b.embedding is not null;
