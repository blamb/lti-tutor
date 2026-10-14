-- Assignment start sessions and material roles.
--
-- A seventh tutorial kind: getting a learner started on an assignment
-- (unpack → connect → plan → first step → wrap-up). The kind column's check
-- constraint is widened.
alter table tutorial drop constraint if exists tutorial_kind_check;
alter table tutorial add constraint tutorial_kind_check
  check (kind in ('readiness', 'preparation_check', 'concept', 'practice', 'reflection', 'recall', 'assignment_start'));

-- What a material is: readings by default; the course's own activities and
-- study questions (used as probes before the model invents any); an
-- assignment description (the task, never a source). A course import sets
-- this from the course structure; by hand it is a selector on the material.
alter table material add column if not exists role text not null default 'reading'
  check (role in ('reading', 'activities', 'assignment', 'other'));
