-- Canonical concepts (usability report, Finding 13).
--
-- Learner-model entries are free text written by the model, so near-duplicate
-- wording split the instructor's Concepts tab into one row per learner. Each
-- course now keeps a list of canonical concepts, which session briefs name
-- ("Key concepts") and which every entry is mapped onto when the match is
-- confident. Entries that do not match wait, unmapped, for the instructor.

create table if not exists course_concept (
  id              bigserial   primary key,
  lti_iss         text        not null,
  lti_context_id  text        not null,
  label           text        not null,
  -- Normalised label (lower case, punctuation and plural s dropped), so
  -- "Static versus dynamic trade-offs" and "static versus dynamic trade-off" are one concept.
  label_key       text        not null,
  created_at      timestamptz not null default now(),
  unique (lti_iss, lti_context_id, label_key)
);

-- The key concepts a brief covers, in the instructor's order.
alter table tutorial add column if not exists concept_ids bigint[] not null default '{}';

-- Which canonical concept an entry maps to (null = unmapped, for review) and
-- how sure the match was (1 = exact wording or set by the instructor).
alter table learner_model add column if not exists concept_id bigint references course_concept(id) on delete set null;
alter table learner_model add column if not exists match_confidence real;
create index if not exists learner_model_concept_idx on learner_model (lti_iss, lti_context_id, concept_id);
