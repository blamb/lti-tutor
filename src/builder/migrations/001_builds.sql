-- Module Builder: one row per uploaded course draft. The Word file is kept
-- so the restore file can be rebuilt after every review edit; the pages and
-- the .mbz are never stored, because the engine rebuilds them from the draft
-- and the activity specs in well under a second.

create table if not exists build (
  id               bigserial   primary key,
  lti_iss          text        not null,
  lti_context_id   text        not null,
  created_by       bigint      references student(id) on delete set null,
  -- The module name read from the draft, and the uploaded file's name.
  title            text        not null,
  source_name      text        not null,
  docx             bytea       not null,
  -- The H5P specs found in the draft, as the engine reports them:
  -- [{ n, title, chapter, under, type, text }].
  slots            jsonb       not null default '[]',
  -- How each spec was read, one entry per slot:
  -- [{ n, status: 'pending' | 'draft' | 'approved' | 'skipped' | 'failed',
  --    spec: { type, title, interpretation, ... } | null, problems: [], error, edited }].
  activities       jsonb       not null default '[]',
  -- Paragraphs the designer chose to leave out (notes to production that are
  -- not marked as notes), one starting phrase per entry.
  leave_out        jsonb       not null default '[]',
  -- Stamped on the backup: the course short name and the section it lands in.
  course_shortname text        not null default '',
  section_number   integer     not null default 1,
  -- reading: the AI step is still working through the specs.
  state            text        not null default 'reading' check (state in ('reading', 'ready')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists build_course_idx on build (lti_iss, lti_context_id, created_at desc);
