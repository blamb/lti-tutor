-- Native Moodle activities for a module built from readings. The practice
-- questions can go into one Moodle Quiz for the module instead of (or as well
-- as) the H5P question sets on the pages, and the key terms into a Moodle
-- Glossary instead of (or as well as) the H5P flashcards.

alter table build add column if not exists questions_as text not null default 'h5p'
  check (questions_as in ('h5p', 'quiz', 'both'));
alter table build add column if not exists terms_as text not null default 'h5p'
  check (terms_as in ('h5p', 'glossary', 'both'));
