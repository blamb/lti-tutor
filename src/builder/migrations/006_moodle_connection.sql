-- An optional web-service connection to the course in Moodle, one per
-- course, used to read the course's sections so a designer can choose
-- where a module lands by name. The token is encrypted (core/secrets.ts);
-- whose it is and when it last worked are kept in the clear for the screen.

create table if not exists moodle_connection (
  lti_iss        text        not null,
  lti_context_id text        not null,
  token_enc      text        not null default '',
  ws_user        text        not null default '',
  checked_at     timestamptz,
  primary key (lti_iss, lti_context_id)
);
