-- Phase three: the student experience.
--   voice_pref   which installed voice reads the persona aloud: automatic, or
--                lean feminine / masculine when the device offers a choice
--   coach        whether students may step out mid-conversation and ask a
--                coach what to try next ('off' for assessment-like runs)
--   coach_session_id   the coach's own transcript, kept apart from the persona's
--   debrief_generated_at, reflection, reflection_at   after the conversation
alter table persona add column if not exists voice_pref text not null default 'auto'
  check (voice_pref in ('auto', 'feminine', 'masculine'));
alter table persona add column if not exists coach text not null default 'on' check (coach in ('on', 'off'));

alter table persona_session add column if not exists coach_session_id bigint references session(id) on delete set null;
alter table persona_session add column if not exists debrief_generated_at timestamptz;
alter table persona_session add column if not exists reflection text not null default '';
alter table persona_session add column if not exists reflection_at timestamptz;
