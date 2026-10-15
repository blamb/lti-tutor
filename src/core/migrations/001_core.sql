-- Core schema shared by every app in this repository: who launched, the
-- grounding materials of a course, conversation containers and turns, and
-- per-call model usage. Everything course-scoped carries
-- (lti_iss, lti_context_id), the platform issuer and the LTI course id, so
-- one deployment serves many courses. ltijs-sequelize manages its own
-- tables (platforms, keys, tokens).
--
-- Every statement is idempotent: the tutor's own 001_init.sql created these
-- tables before this file existed, so on that database this is a no-op.

create table if not exists student (
  id              bigserial   primary key,
  lti_sub         text        not null,
  lti_iss         text        not null,
  lti_context_id  text        not null,
  display_name    text        not null,
  created_at      timestamptz not null default now(),
  unique (lti_sub, lti_iss, lti_context_id)
);

create table if not exists material (
  id              bigserial   primary key,
  lti_iss         text        not null,
  lti_context_id  text        not null,
  title           text        not null,
  body            text        not null,
  created_by      bigint      references student(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists material_context_idx on material (lti_iss, lti_context_id, created_at);
alter table material add column if not exists source_url  text not null default '';
alter table material add column if not exists license     text not null default '';
alter table material add column if not exists attribution text not null default '';
alter table material add column if not exists role text not null default 'reading'
  check (role in ('reading', 'activities', 'assignment', 'other'));
alter table material add column if not exists unit        text    not null default '';
alter table material add column if not exists unit_order  integer not null default 0;
alter table material add column if not exists source_key  text    not null default '';
create index if not exists material_source_key_idx on material (lti_iss, lti_context_id, source_key) where source_key <> '';

-- A conversation container; turns live in tutor_turn (the name predates the
-- second app; both write to it).
create table if not exists session (
  id              bigserial   primary key,
  student_id      bigint      not null references student(id) on delete cascade,
  kind            text        not null,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  summary         jsonb       not null default '{}'::jsonb
);
create index if not exists session_student_idx on session (student_id, started_at desc);

create table if not exists tutor_turn (
  id              bigserial   primary key,
  session_id      bigint      not null references session(id) on delete cascade,
  role            text        not null check (role in ('user', 'assistant')),
  content         text        not null,
  ts              timestamptz not null default now()
);
create index if not exists tutor_turn_session_idx on tutor_turn (session_id, ts);

-- Per-call Anthropic usage and cost.
create table if not exists api_call (
  id                       bigserial primary key,
  student_id               bigint      references student(id) on delete set null,
  session_id               bigint      references session(id) on delete set null,
  lti_iss                  text,
  lti_context_id           text,
  endpoint                 text        not null,
  model                    text        not null,
  input_tokens             int         not null default 0,
  output_tokens            int         not null default 0,
  cache_creation_tokens    int         not null default 0,
  cache_read_tokens        int         not null default 0,
  cost_usd                 numeric(10, 6) not null default 0,
  duration_ms              int,
  ts                       timestamptz not null default now()
);
create index if not exists api_call_context_idx on api_call (lti_iss, lti_context_id, ts desc);
create index if not exists api_call_endpoint_idx on api_call (endpoint, ts desc);
