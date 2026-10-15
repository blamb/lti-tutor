-- Phase 3: a learner model that spans sessions.
--
-- One row per (learner, course, concept): what this learner has shown about
-- that concept, updated after every completed session by a small model call
-- (learner.ts). Learners can see and delete their own rows; instructors see
-- course-wide counts without names.

create table if not exists learner_model (
  id                          bigserial   primary key,
  student_id                  bigint      not null references student(id) on delete cascade,
  lti_iss                     text        not null,
  lti_context_id              text        not null,
  concept                     text        not null,
  status                      text        not null
                              check (status in ('secure', 'developing', 'fragile', 'misconception')),
  evidence                    text        not null default '',
  source_tutorial_session_id  bigint      references tutorial_session(id) on delete set null,
  first_seen                  timestamptz not null default now(),
  last_seen                   timestamptz not null default now(),
  unique (student_id, lti_iss, lti_context_id, concept)
);
create index if not exists learner_model_student_idx on learner_model (student_id, lti_iss, lti_context_id, last_seen desc);
create index if not exists learner_model_course_idx on learner_model (lti_iss, lti_context_id, concept);

-- Course start date, for "week of the course" breakdowns where the course has
-- fixed dates. Seeded from an LTI custom parameter `course_start`
-- (e.g. course_start=$CourseSection.timeFrame.begin in Moodle) or set by the
-- instructor under Course settings. Null = unknown.
alter table course_settings add column if not exists course_start date;
