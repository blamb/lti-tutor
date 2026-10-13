-- Phase 5: printable, self-contained outputs for learners with limited or no
-- connection. Both are regenerated when their source changes (hash check).

-- Paper tutor script: the same brief, walked through on paper.
create table if not exists tutorial_print (
  tutorial_id   bigint      primary key references tutorial(id) on delete cascade,
  brief_hash    text        not null,
  markdown      text        not null,
  generated_at  timestamptz not null default now()
);

-- Non-personalised study/lecture debrief of a material, for the course pack.
create table if not exists material_debrief_template (
  material_id   bigint      primary key references material(id) on delete cascade,
  body_hash     text        not null,
  markdown      text        not null,
  generated_at  timestamptz not null default now()
);
