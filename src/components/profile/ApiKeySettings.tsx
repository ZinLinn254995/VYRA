import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import { getCurrentAccessToken } from '../../context/AuthContext';
import { MediaCreditPricingSettings } from './MediaCreditPricingSettings';

type ApiKeyStatus = { configured?: boolean; message?: string; error?: string };
const fieldClass = 'min-h-11 w-full rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3.5 text-sm text-[var(--vyra-text-primary)] outline-none placeholder:text-[var(--vyra-text-muted)] focus:border-[var(--vyra-accent-primary)]';

export const ApiKeySettings: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const token = await getCurrentAccessToken();
      if (!token) throw new Error('Sign in to VYRA to manage API keys.');
      const response = await fetch('/api/providers/openai/settings', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as ApiKeyStatus;
      if (!response.ok) throw new Error(data.error || 'Could not load API key status.');
      setConfigured(data.configured === true);
      setMessage(data.configured ? 'OpenAI API key is saved securely.' : 'No OpenAI API key has been saved yet.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load API key status.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const key = apiKey.trim();
    if (key.length < 20 || key.length > 512 || /\s/.test(key)) { setError('Enter a valid-looking OpenAI API key.'); return; }
    setSaving(true); setError(''); setMessage('Verifying the key with OpenAI and saving it securely…');
    try {
      const token = await getCurrentAccessToken();
      if (!token) throw new Error('Your VYRA session has expired. Sign in again.');
      const response = await fetch('/api/providers/openai/settings', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key }), cache: 'no-store',
      });
      const data = await response.json().catch(() => ({})) as ApiKeyStatus;
      if (!response.ok) throw new Error(data.error || 'Could not save the OpenAI API key.');
      setConfigured(true); setApiKey(''); setMessage(data.message || 'OpenAI API key verified and saved securely.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the OpenAI API key.'); setMessage(''); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center gap-2 py-8 text-sm text-[var(--vyra-text-secondary)]"><LoaderCircle size={17} className="animate-spin" /> Checking API key…</div>;

  return <div className="max-w-xl space-y-5">
    <section className="rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-subtle)] p-4">
      <p className="mb-3 text-xs leading-5 text-[var(--vyra-text-secondary)]">API key ဝယ်ယူခြင်းနှင့် ထည့်သွင်းခြင်းကို Chat၊ App Actions နှင့် Media Generation integration များ အဆင်သင့်ဖြစ်ပြီး နောက်ဆုံး end-to-end စမ်းသပ်ချိန်အထိ ရွှေ့ဆိုင်းထားနိုင်ပါတယ်။ အခုအချိန်မှာ key မရှိသေးတာ ပုံမှန်ဖြစ်ပါတယ်။</p>
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-[var(--vyra-bg-surface)] text-[var(--vyra-accent-primary)]"><KeyRound size={19} /></span>
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[var(--vyra-text-primary)]">OpenAI</p><p className="mt-0.5 text-xs text-[var(--vyra-text-secondary)]">API key used by VYRA AI services.</p></div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${configured ? 'bg-emerald-500/10 text-emerald-600' : 'bg-[var(--vyra-bg-surface)] text-[var(--vyra-text-muted)]'}`}>{configured ? <CheckCircle2 size={13} /> : <CircleAlert size={13} />}{configured ? 'Connected' : 'Not connected'}</span>
      </div>
      {message && <p className="mt-3 text-xs text-[var(--vyra-text-secondary)]">{message}</p>}
    </section>
    <form onSubmit={handleSave} className="space-y-3">
      <div><label htmlFor="vyra-openai-api-key" className="mb-1.5 block text-xs font-semibold text-[var(--vyra-text-primary)]">OpenAI API Key</label>
        <div className="relative"><input id="vyra-openai-api-key" type={showKey ? 'text' : 'password'} autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={configured ? 'Enter a new key to replace the saved key' : 'Paste your OpenAI API key'} className={fieldClass + ' pr-12'} />
          <button type="button" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? 'Hide API key' : 'Show API key'} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[var(--vyra-text-muted)] hover:text-[var(--vyra-text-primary)]">{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button>
        </div>
      </div>
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      <div className="flex items-center justify-between gap-3"><p className="text-[11px] leading-5 text-[var(--vyra-text-muted)]">Stored in Supabase Vault. The saved key is never returned to the browser.</p>
        <button type="submit" disabled={saving || !apiKey.trim()} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--vyra-accent-primary)] px-4 text-xs font-semibold text-slate-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">{saving && <LoaderCircle size={14} className="animate-spin" />}{saving ? 'Saving…' : 'Verify & Save'}</button>
      </div>
    </form>
    <div className="flex items-start gap-2 rounded-lg border border-[var(--vyra-border)] p-3 text-xs leading-5 text-[var(--vyra-text-secondary)]"><ShieldCheck size={16} className="mt-0.5 shrink-0" /> This is the shared VYRA platform API key. Anyone who can access this temporary settings page can replace it.</div>
    <button type="button" onClick={() => void loadStatus()} className="text-xs font-medium text-[var(--vyra-accent-primary)] hover:underline">Refresh connection status</button>
    <MediaCreditPricingSettings />
  </div>;
};
