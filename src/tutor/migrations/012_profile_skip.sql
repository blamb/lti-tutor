-- "Skip for now" on the About you form is remembered per student (usability
-- report, Finding 11): it reappeared before every session. A skipped student
-- gets a profile row with empty fields and skipped_at set; deleting their
-- data removes it with the rest of the profile.
alter table student_profile add column if not exists skipped_at timestamptz;
