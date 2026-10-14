-- Live course sync through Moodle web services. One token per course,
-- encrypted at rest (secrets.ts); who it belongs to and when it was last
-- checked are kept in the clear for the settings page.
alter table course_settings add column if not exists moodle_ws_token_enc  text        not null default '';
alter table course_settings add column if not exists moodle_ws_user       text        not null default '';
alter table course_settings add column if not exists moodle_ws_checked_at timestamptz;
