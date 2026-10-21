-- The fact sheet (factsheet.ts): any template's fixed facts as fixed
-- sections plus designer-defined ones, built beside the case file
-- (case_record, 006) for comparison. Both may be set; both reach the prompt.
alter table persona add column if not exists fact_sheet jsonb not null default '{}'::jsonb;
