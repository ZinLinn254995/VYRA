import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { getCurrentAccessToken } from '../../context/AuthContext';

type Policy = {
  id: string;
  version: string;
  creditsPerUsd: string | number;
  roundingMode: string;
  status: 'draft' | 'active' | 'retired';
  effectiveAt?: string | null;
  createdAt?: string | null;
  activatedAt?: string | null;
};
type PricingResponse = { policies?: Policy[]; activePolicy?: Policy | null; policy?: Policy; message?: string; error?: string };
const fieldClass = 'min-h-11 w-full rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3.5 text-sm text-[var(--vyra-text-primary)] outline-none placeholder:text-[var(--vyra-text-muted)] focus:border-[var(--vyra-accent-primary)]';

export const MediaCreditPricingSettings: React.FC = () => {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [version, setVersion] = useState('');
  const [creditsPerUsd, setCreditsPerUsd] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const request = useCallback(async (payload: Record<string, unknown>) => {
    const token = await getCurrentAccessToken();
    if (!token) throw new Error('Sign in to manage media credit pricing.');
    const response = await fetch('/api/admin/media-credit-pricing', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({})) as PricingResponse;
    if (response.status === 403) {
      setForbidden(true);
      throw new Error('Platform administrator access is required.');
    }
    if (!response.ok) throw new Error(data.error || 'Media credit pricing request failed.');
    return data;
  }, []);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await request({ action: 'status' });
      setPolicies(Array.isArray(data.policies) ? data.policies : []);
      setForbidden(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load pricing policies.');
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const createDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await request({ action: 'create_draft', version, creditsPerUsd });
      setMessage(data.message || 'Pricing draft created. It is not active.');
      setVersion('');
      setCreditsPerUsd('');
      await loadStatus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create pricing draft.');
    } finally {
      setSaving(false);
    }
  };

  if (forbidden) return (
    <section className="max-w-xl rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-subtle)] p-4">
      <ShieldCheck size={20} className="mb-2 text-[var(--vyra-text-muted)]" />
      <p className="text-sm font-semibold text-[var(--vyra-text-primary)]">Media credit pricing · Admin only</p>
      <p className="mt-1 text-xs leading-5 text-[var(--vyra-text-secondary)]">Only an authorized VYRA platform owner or administrator can view or manage pricing policies.</p>
    </section>
  );

  return (
    <section className="max-w-xl space-y-4 border-t border-[var(--vyra-border-subtle)] pt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--vyra-text-primary)]">Media Credit Pricing</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--vyra-text-secondary)]">Create versioned pricing drafts for media generation. Drafts do not affect customer balances or charges.</p>
        </div>
        <button type="button" onClick={() => void loadStatus()} disabled={loading} aria-label="Refresh pricing policies" className="grid size-9 shrink-0 place-items-center rounded-lg border border-[var(--vyra-border)] text-[var(--vyra-text-secondary)] hover:bg-[var(--vyra-bg-hover)] disabled:opacity-50">
          {loading ? <LoaderCircle size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </button>
      </div>

      <div className="rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-subtle)] p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--vyra-text-primary)]">
          {policies.some((policy) => policy.status === 'active') ? <CheckCircle2 size={15} className="text-emerald-600" /> : <CircleAlert size={15} className="text-[var(--vyra-text-muted)]" />}
          {policies.some((policy) => policy.status === 'active') ? 'An active policy exists' : 'No active pricing policy'}
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--vyra-text-secondary)]">
          {policies.some((policy) => policy.status === 'active')
            ? 'The active policy is used by the server-side credit calculation.'
            : 'Media credit reservation remains blocked until a commercial policy is reviewed and deliberately activated.'}
        </p>
      </div>

      <form onSubmit={createDraft} className="space-y-3">
        <div>
          <label htmlFor="vyra-credit-policy-version" className="mb-1.5 block text-xs font-semibold text-[var(--vyra-text-primary)]">Policy version</label>
          <input id="vyra-credit-policy-version" value={version} onChange={(event) => setVersion(event.target.value)} placeholder="e.g. media-v1-draft" maxLength={80} className={fieldClass} />
        </div>
        <div>
          <label htmlFor="vyra-credits-per-usd" className="mb-1.5 block text-xs font-semibold text-[var(--vyra-text-primary)]">Credits per USD</label>
          <input id="vyra-credits-per-usd" type="text" inputMode="decimal" value={creditsPerUsd} onChange={(event) => setCreditsPerUsd(event.target.value)} placeholder="Enter an approved candidate rate" className={fieldClass} />
          <p className="mt-1 text-[11px] leading-5 text-[var(--vyra-text-muted)]">Use a reviewed commercial rate only. Credit calculation rounds up to the next whole credit.</p>
        </div>
        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
        {message && <p role="status" className="text-xs text-[var(--vyra-text-secondary)]">{message}</p>}
        <button type="submit" disabled={saving || loading || !version.trim() || !creditsPerUsd.trim()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[var(--vyra-accent-primary)] px-4 text-xs font-semibold text-slate-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
          {saving && <LoaderCircle size={14} className="animate-spin" />}{saving ? 'Saving draft…' : 'Create pricing draft'}
        </button>
      </form>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-[var(--vyra-text-primary)]">Policy history</h4>
        {loading ? <p className="text-xs text-[var(--vyra-text-muted)]">Loading policies…</p> : policies.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--vyra-border)] px-3 py-4 text-xs text-[var(--vyra-text-muted)]">No pricing drafts have been created.</p>
        ) : policies.map((policy) => (
          <div key={policy.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--vyra-border)] px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[var(--vyra-text-primary)]">{policy.version}</p>
              <p className="mt-0.5 text-[11px] text-[var(--vyra-text-muted)]">{String(policy.creditsPerUsd)} credits / USD · {policy.roundingMode}</p>
            </div>
            <span className="shrink-0 rounded-full border border-[var(--vyra-border)] px-2 py-1 text-[10px] font-semibold capitalize text-[var(--vyra-text-secondary)]">{policy.status}</span>
          </div>
        ))}
      </div>
      <p className="text-[11px] leading-5 text-[var(--vyra-text-muted)]">Activation is intentionally not exposed here yet. First finalize the customer credit price, margin, refund rules and consent wording. API access also requires owner/admin authorization.</p>
    </section>
  );
};
