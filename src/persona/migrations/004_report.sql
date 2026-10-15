-- Phase four: completion passback and the instructor's report.
alter table persona add column if not exists gradebook boolean not null default false;
alter table persona_session add column if not exists grade_posted_at timestamptz;
alter table persona_session add column if not exists grade_error text;

-- The latest synthesis across a persona's conversations, for the instructor.
create table if not exists persona_report (
  persona_id    bigint      primary key references persona(id) on delete cascade,
  markdown      text        not null,
  runs          int         not null default 0,
  generated_at  timestamptz not null default now()
);
