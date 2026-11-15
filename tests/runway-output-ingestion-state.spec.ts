import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../supabase/migrations/20261116140000_runway_output_ingestion_state.sql', import.meta.url),
  'utf8',
);

describe('Runway output ingestion state contract', () => {
  it('keeps provider success separate from Project Asset readiness', () => {
    expect(migration).toContain("asset_ingestion_status text not null default 'pending'");
    expect(migration).toContain("'recovery_required'");
    expect(migration).toContain("v_job.status <> 'succeeded'");
    expect(migration).toContain("v_job.provider_task_status <> 'succeeded'");
    expect(migration).toContain("when v_remaining = 0 then 'ready'");
  });

  it('claims only owner-scoped, Project-bound output references with expiring leases', () => {
    expect(migration).toContain('where id = p_job_id and user_id = p_user_id for update');
    expect(migration).toContain('target_vyral_id');
    expect(migration).toContain("interval '10 minutes'");
    expect(migration).toContain('provider_output_expired');
    expect(migration).toContain('transfer_retry_limit');
  });

  it('requires private owner-prefixed storage and immutable Asset identity on completion', () => {
    expect(migration).toContain("p_storage_path !~ ('^' || p_user_id::text || '/')");
    expect(migration).toContain('p_asset_id is null or p_asset_version_id is null');
    expect(migration).toContain("v_output.transfer_status = 'ingested'");
    expect(migration).toContain('v_output.sha256 = p_sha256');
  });

  it('restricts both transfer RPCs to the service role', () => {
    expect(migration).toContain('grant execute on function public.claim_runway_output_transfer');
    expect(migration).toContain('grant execute on function public.record_runway_output_transfer');
    expect(migration).toContain('from public, anon, authenticated');
  });
});
