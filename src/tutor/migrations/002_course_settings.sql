-- Phase 1: make the course's delivery mode explicit.
--
-- One row per course (platform issuer + LTI course id). A course with no row
-- behaves as TRUFlex 3 (on campus, scheduled), which is what the tool did
-- before this table existed. The raw number is interpreted only by
-- deliveryOf() in src/tutor/server/delivery.ts.

create table if not exists course_settings (
  lti_iss         text        not null,
  lti_context_id  text        not null,
  truflex         smallint    not null default 3 check (truflex between 1 and 10),
  course_level    text        check (course_level in ('abe', 'undergraduate', 'graduate')),
  -- Default reading level / tone for tutorials that don't set their own pitch.
  pitch_default   text        not null default '',
  -- Per-course AI disclosure shown to learners (empty = the tool's default text).
  ai_disclosure   text        not null default '',
  updated_at      timestamptz not null default now(),
  primary key (lti_iss, lti_context_id)
);

-- Reading level and tone for one tutorial, e.g. "Adult Basic Education
-- reading level, short sentences, everyday examples". Empty = course default.
alter table tutorial add column if not exists pitch text not null default '';
