import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

type AuthPanelProps = { onClose: () => void };

export const AuthPanel: React.FC<AuthPanelProps> = ({ onClose }) => {
  const { configured, loading, user, serverVerified, verificationError, signIn, signUp, signOut } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
        setMessage('Signed in. Your session is saved on this device.');
      } else {
        const result = await signUp(email.trim(), password);
        setMessage(result.needsEmailConfirmation
          ? 'Account created. Check your email to confirm your address, then sign in.'
          : 'Account created and signed in.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    setError('');
    try {
      await signOut();
      setMessage('You have signed out.');
      setPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign out.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center overflow-y-auto overscroll-contain bg-black/70 px-3 py-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="account-panel-title" className="my-auto w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-[#2B3058] light:border-slate-200 bg-[#11152B] light:bg-white p-5 sm:p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#55F4FF] light:text-sky-600">VYRA ACCOUNT</p>
            <h2 id="account-panel-title" className="mt-1 text-xl font-bold text-white light:text-slate-900">
              {user ? 'Your account' : mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="mt-1 text-xs text-slate-400 light:text-slate-500">
              {user ? 'Manage your signed-in session.' : 'Sign in to prepare your VYRA cloud workspace.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close account panel" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10 light:hover:bg-slate-100">✕</button>
        </div>

        {!configured ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200 light:text-amber-800">
            Account sign-in is not configured yet. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to the Vercel project environment, and add the matching server-side Supabase settings before enabling accounts.
          </div>
        ) : loading ? (
          <p className="text-sm text-slate-300 light:text-slate-600">Checking your session…</p>
        ) : user ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#2B3058] light:border-slate-200 p-4">
              <p className="text-xs text-slate-400 light:text-slate-500">Signed in as</p>
              <p className="mt-1 text-sm font-semibold text-white light:text-slate-900 break-all">{user.email ?? user.id}</p>
              <p className="mt-3 text-xs">
                <span className={serverVerified ? 'text-emerald-400' : 'text-amber-400'}>
                  {serverVerified ? '✓ Server session verified' : '• Server verification pending'}
                </span>
              </p>
              {!serverVerified && verificationError && (
                <p className="mt-2 text-xs text-amber-300 light:text-amber-700">{verificationError}</p>
              )}
            </div>
            <button type="button" disabled={busy} onClick={handleSignOut} className="w-full rounded-xl border border-[#3B416B] light:border-slate-300 px-4 py-2.5 text-sm font-semibold text-white light:text-slate-800 hover:bg-white/5 light:hover:bg-slate-50 disabled:opacity-50">
              {busy ? 'Please wait…' : 'Sign out'}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-xs font-medium text-slate-300 light:text-slate-700">
              Email
              <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#343A64] light:border-slate-300 bg-[#090B18] light:bg-white px-3 py-2.5 text-sm text-white light:text-slate-900 outline-none focus:border-[#55F4FF] light:focus:border-sky-500" placeholder="you@example.com" />
            </label>
            <label className="block text-xs font-medium text-slate-300 light:text-slate-700">
              Password
              <input required minLength={8} type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-[#343A64] light:border-slate-300 bg-[#090B18] light:bg-white px-3 py-2.5 text-sm text-white light:text-slate-900 outline-none focus:border-[#55F4FF] light:focus:border-sky-500" placeholder="At least 8 characters" />
            </label>
            {error && <p role="alert" className="rounded-lg bg-rose-500/10 p-3 text-xs text-rose-300 light:text-rose-700">{error}</p>}
            {message && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-300 light:text-emerald-700">{message}</p>}
            <button disabled={busy} type="submit" className="w-full rounded-xl bg-[#55F4FF] px-4 py-2.5 text-sm font-bold text-[#090B18] hover:bg-[#55F4FF]/90 disabled:opacity-50">
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
            <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setMessage(''); }} className="w-full py-2 text-xs text-slate-400 hover:text-white light:hover:text-slate-900">
              {mode === 'signin' ? 'New to VYRA? Create an account' : 'Already have an account? Sign in'}
            </button>
            <p className="text-[10px] leading-relaxed text-slate-500">Signing in does not yet sync projects or activate paid credits. Your existing local workspace remains available on this device.</p>
          </form>
        )}
      </section>
    </div>
  );
};
