-- Course pages: a module built from readings can also carry page content
-- drafted from them (a module overview, a reading guide per reading, key
-- takeaways). They live in `slots` and `activities` like everything else that
-- is drafted and reviewed. The one new thing stored is the course outline,
-- which the designer may paste or upload: learning outcomes on the overview
-- page are copied from it word for word, never drafted.

alter table build add column if not exists outline text not null default '';
