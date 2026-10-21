-- What a session is for, in the student's own terms (usability report,
-- Finding 12). Students saw the instructor-voiced learning goal ("The student
-- can …") on the home list, above the chat and in Moodle's activity text.
-- Empty = a plain line for the session's kind.
alter table tutorial add column if not exists student_goal text not null default '';
