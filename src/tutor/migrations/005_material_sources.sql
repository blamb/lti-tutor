-- Phase 4: where a material came from, so the tutor can cite it and the
-- instructor can keep to open educational resources.

alter table material add column if not exists source_url  text not null default '';
alter table material add column if not exists license     text not null default '';
alter table material add column if not exists attribution text not null default '';
