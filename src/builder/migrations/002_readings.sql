-- A second kind of starter material: readings (a web page or open textbook
-- chapter, an uploaded file, pasted text) instead of a Word draft. A module
-- of this kind has no Word file; its pages come from `readings`, and its
-- activities are drafted by AI from each reading rather than read from
-- specifications.

alter table build alter column docx drop not null;

alter table build add column if not exists kind text not null default 'draft'
  check (kind in ('draft', 'readings'));

-- [{ id, title, text, source_url, license, attribution, include_text, origin }]
-- origin: 'url' | 'file' | 'paste'. include_text false = the page links to
-- the reading and carries only the activities.
alter table build add column if not exists readings jsonb not null default '[]';
