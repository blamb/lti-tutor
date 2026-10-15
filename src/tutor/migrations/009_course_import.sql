-- Course import (Moodle backup upload). Imported materials remember which
-- unit (course section) they came from, so the editor can group them, and a
-- stable source key so a newer backup updates them in place instead of
-- duplicating them.
alter table material add column if not exists unit        text    not null default '';
alter table material add column if not exists unit_order  integer not null default 0;
alter table material add column if not exists source_key  text    not null default '';
create index if not exists material_source_key_idx on material (lti_iss, lti_context_id, source_key) where source_key <> '';
