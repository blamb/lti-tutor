-- Phase 2: tutorial kinds. The original behaviour is 'concept'; the other
-- five map to TRU's engagement types (see src/server/kinds.ts).

alter table tutorial add column if not exists kind text not null default 'concept'
  check (kind in ('readiness', 'preparation_check', 'concept', 'practice', 'reflection', 'recall'));

-- practice: sample questions or scenarios the tutor may offer, one per line.
alter table tutorial add column if not exists practice_prompts text not null default '';

-- recall: earlier tutorials in the same course this one revisits.
alter table tutorial add column if not exists recall_tutorial_ids bigint[] not null default '{}';

create index if not exists tutorial_kind_idx on tutorial (lti_iss, lti_context_id, kind);
