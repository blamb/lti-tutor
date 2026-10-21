-- October usability report.
--   case_record   a simulated patient's or client's fixed facts (casefile.ts):
--                 demographics with date of birth, presenting complaint,
--                 history, medications including OTC, social history,
--                 referral source, planted cues, disclosure rules
--   quote_book    a thinker's vetted quotations, known misattributions and
--                 the reading it may recommend (quotebook.ts)
--   debrief_state none | generating | ready | failed, kept server-side so an
--                 aborted request or a closed tab never loses the debrief or
--                 the way to ask for it again (debrief.ts)
alter table persona add column if not exists case_record jsonb not null default '{}'::jsonb;
alter table persona add column if not exists quote_book jsonb not null default '{}'::jsonb;

alter table persona_session add column if not exists debrief_state text not null default 'none'
  check (debrief_state in ('none', 'generating', 'ready', 'failed'));
alter table persona_session add column if not exists debrief_started_at timestamptz;
alter table persona_session add column if not exists debrief_error text;
update persona_session set debrief_state = 'ready' where debrief is not null and debrief_state <> 'ready';
