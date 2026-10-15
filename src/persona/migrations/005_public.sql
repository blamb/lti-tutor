-- Phase five: a persona beyond the LMS.
--   visibility        lti (default): only through the course launch
--                     passcode: anyone with the link and the passcode
--                     public: anyone with the link
--   public_slug       the unguessable part of the link, set when visibility leaves 'lti'
--   passcode_hash     HMAC of the passcode under the tool's secret; never the passcode
--   public_daily_usd  spend cap for web visitors per day, per persona
--   public_max_turns  student turns per web conversation
-- Web visitors are student rows with lti_iss = 'public'.
alter table persona add column if not exists visibility text not null default 'lti' check (visibility in ('lti', 'passcode', 'public'));
alter table persona add column if not exists public_slug text not null default '';
alter table persona add column if not exists passcode_hash text not null default '';
alter table persona add column if not exists public_daily_usd numeric(8, 2) not null default 2.00;
alter table persona add column if not exists public_max_turns int not null default 40;
create unique index if not exists persona_public_slug_idx on persona (public_slug) where public_slug <> '';
