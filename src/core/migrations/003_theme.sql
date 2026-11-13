-- Course look and feel (core/theme.ts, core/theme-store.ts).
--
-- theme_cache holds what was read from a Moodle site: which theme is its
-- default ('site'), the values taken from one theme's stylesheet
-- ('theme:<name>'), and which themes it has ('installed'). It is only a
-- cache and can be emptied at any time.
create table if not exists theme_cache (
  lti_iss     text        not null,
  key         text        not null,
  data        jsonb,
  fetched_at  timestamptz not null default now(),
  primary key (lti_iss, key)
);

-- One row per course once anything is known or chosen. mode: 'auto' follows
-- the course's Moodle theme (ws_theme when the web-service token could read
-- it, otherwise the site default), 'picked' uses picked_theme, 'off' keeps
-- the tool's own look.
create table if not exists course_theme (
  lti_iss         text        not null,
  lti_context_id  text        not null,
  mode            text        not null default 'auto',
  picked_theme    text        not null default '',
  ws_theme        text,
  ws_checked_at   timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (lti_iss, lti_context_id)
);
