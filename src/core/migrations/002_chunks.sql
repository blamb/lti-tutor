-- Passages of each material for retrieval. A material is split into chunks
-- of roughly a thousand characters on paragraph boundaries (core/chunks.ts);
-- each carries a full-text index so a turn can pull the passages that match
-- what the student just said instead of sending the whole corpus. Built-in
-- Postgres full-text search, so no extension is needed on the server.
create table if not exists material_chunk (
  id           bigserial primary key,
  material_id  bigint    not null references material(id) on delete cascade,
  seq          int       not null,
  body         text      not null,
  tsv          tsvector  generated always as (to_tsvector('english', body)) stored,
  unique (material_id, seq)
);
create index if not exists material_chunk_tsv_idx on material_chunk using gin (tsv);
