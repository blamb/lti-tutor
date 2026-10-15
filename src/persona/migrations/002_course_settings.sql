-- Per-course settings for Persona Chat. For now: the Moodle web-service
-- token that lets the tool read the course live (encrypted at rest with
-- core/secrets.ts; who it belongs to and when it was last used are kept in
-- the clear for the settings page).
create table if not exists persona_course_settings (
  lti_iss               text        not null,
  lti_context_id        text        not null,
  moodle_ws_token_enc   text        not null default '',
  moodle_ws_user        text        not null default '',
  moodle_ws_checked_at  timestamptz,
  updated_at            timestamptz not null default now(),
  primary key (lti_iss, lti_context_id)
);
