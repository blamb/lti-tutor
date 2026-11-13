-- RhizMode: a second way to build a module from readings. Where the first
-- drafts practice questions and flashcards with an answer key, this drafts
-- open prompts with none, anchored to passages of the reading, and puts each
-- on the page and (when the designer wants a shared answer) in a discussion
-- forum. Only meaningful when kind = 'readings'.

alter table build add column if not exists mode text not null default 'practice'
  check (mode in ('practice', 'rhizmode'));
