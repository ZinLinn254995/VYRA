-- Cover composite ownership foreign keys to avoid table scans on parent updates/deletes.
create index if not exists generation_jobs_project_owner_idx
  on public.generation_jobs (project_id, user_id);

create index if not exists provider_attempts_job_owner_idx
  on public.provider_attempts (generation_job_id, user_id);

create index if not exists provider_cost_records_attempt_owner_idx
  on public.provider_cost_records (provider_attempt_id, user_id);

create index if not exists provider_cost_records_job_owner_idx
  on public.provider_cost_records (generation_job_id, user_id);

create index if not exists credit_ledger_entries_job_owner_idx
  on public.credit_ledger_entries (generation_job_id, user_id);
