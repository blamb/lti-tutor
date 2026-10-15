-- Persona Chat: a persona is a character students talk with, authored by an
-- instructor as structured fields rather than one free-form prompt. The
-- visible layer (character, voice, behaviour) and the hidden layer (cues,
-- reveal conditions, hidden facts) are separate columns, so the hidden layer
-- never reaches a student's browser and the model is told exactly which
-- part it must not volunteer.

create table if not exists persona (
  id                 bigserial   primary key,
  lti_iss            text        not null,
  lti_context_id     text        not null,
  -- Which shape of activity: a thinker in conversation, a simulated client
  -- or patient, a role-play partner, or none of the above (templates.ts).
  template           text        not null default 'thinker'
                     check (template in ('thinker', 'client', 'partner', 'custom')),
  -- On the card students see.
  title              text        not null,
  subtitle           text        not null default '',
  summary            text        not null default '',
  -- The pre-brief students read before they begin.
  student_role       text        not null default '',
  setting            text        not null default '',
  student_brief      text        not null default '',
  -- The character (visible layer).
  character          text        not null default '',
  voice              text        not null default '',
  behaviour          text        not null default '',
  -- The hidden layer: never sent to a student's browser.
  hidden             text        not null default '',
  -- Boundaries.
  guardrails         text        not null default '',
  historical_cutoff  text        not null default '',
  -- Escape hatch: instructions appended verbatim after the structured ones.
  raw_instructions   text        not null default '',
  -- What the debrief judges against, one objective per line, and how.
  objectives         text        not null default '',
  debrief_guidance   text        not null default '',
  -- Conduct of the conversation.
  opening            text        not null default 'student' check (opening in ('student', 'persona')),
  opening_line       text        not null default '',
  response_length    text        not null default 'medium' check (response_length in ('short', 'medium', 'long')),
  -- '' = the deployment default (PERSONA_MODEL).
  model              text        not null default '',
  material_ids       bigint[]    not null default '{}',
  status             text        not null default 'draft'
                     check (status in ('draft', 'published', 'archived')),
  created_by         bigint      references student(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists persona_context_idx on persona (lti_iss, lti_context_id, status, created_at);

-- One student's conversation with one persona. 'preview' runs are the
-- instructor trying their own persona; they never count in reports.
create table if not exists persona_session (
  id            bigserial   primary key,
  persona_id    bigint      not null references persona(id) on delete cascade,
  student_id    bigint      not null references student(id) on delete cascade,
  session_id    bigint      not null references session(id) on delete cascade,
  mode          text        not null default 'live' check (mode in ('live', 'preview')),
  status        text        not null default 'in_progress' check (status in ('in_progress', 'ended')),
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  -- The debrief written after the conversation ends (a later phase).
  debrief       jsonb
);
create index if not exists persona_session_persona_idx on persona_session (persona_id, started_at desc);
create index if not exists persona_session_student_idx on persona_session (student_id, persona_id, started_at desc);
