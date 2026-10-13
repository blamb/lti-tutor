-- Phase 7: progression and instructor signals, per mode.

-- Learner feedback after the NPS question: how well the course material
-- prepared them (engagement type 5). 1–5, optional comment.
alter table tutorial_session add column if not exists prep_score   smallint check (prep_score between 1 and 5);
alter table tutorial_session add column if not exists prep_comment text;

-- Ordering hint for the learner's home view. Never enforced: Moodle's own
-- restrict-access handles locking if the instructor wants it.
alter table tutorial add column if not exists suggested_after_tutorial_id bigint references tutorial(id) on delete set null;

-- Informational, where the course has fixed dates (never enforced; AGS unchanged).
alter table tutorial add column if not exists week   int check (week between 1 and 60);
alter table tutorial add column if not exists due_at timestamptz;

-- The latest synthesis for a tutorial (group debrief / cohort note /
-- revision brief), so it can be marked delivered and turned into a short
-- after-session note that learners see on their home view.
create table if not exists tutorial_debrief (
  tutorial_id        bigint      primary key references tutorial(id) on delete cascade,
  kind               text        not null check (kind in ('group_debrief', 'cohort_note', 'revision_brief')),
  markdown           text        not null,
  generated_at       timestamptz not null default now(),
  delivered_at       timestamptz,
  after_session_note text,
  note_generated_at  timestamptz
);
