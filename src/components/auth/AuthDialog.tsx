import React, { useRef, useState } from 'react';
import { useModalDialog } from '../../hooks/useModalDialog';
import { Eye, EyeOff, LockKeyhole, Mail, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { FormField } from '../ui/FormField';
import { useAuth } from '../../context/AuthContext';

type AuthDialogProps = {
  open: boolean;
  initialMode?: 'login' | 'signup';
  onClose: () => void;
};

const inputClass = 'min-h-11 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] outline-none transition focus:border-[var(--vyra-accent-primary)] placeholder:text-[var(--vyra-text-muted)]';

export const AuthDialog: React.FC<AuthDialogProps> = ({ open, initialMode = 'login', onClose }) => {
  const { configured, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const dialogRef = useRef<HTMLElement>(null);
  const dialogBodyRef = useRef<HTMLDivElement>(null);
  const visualViewport = useModalDialog(open, dialogRef, dialogBodyRef);

  React.useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError('');
      setSuccess('');
      setPassword('');
      setConfirmPassword('');
    }
  }, [open, initialMode]);

  if (!open) return null;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!configured) {
      setError('Authentication is not configured for this preview yet. Please try again later.');
      return;
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setError('Your passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Use a password with at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        await signIn(email.trim(), password);
        onClose();
      } else {
        const result = await signUp(email.trim(), password);
        if (result.needsEmailConfirmation) {
          setSuccess('Account created. Check your email to confirm your address, then sign in.');
          setMode('login');
          setPassword('');
          setConfirmPassword('');
        } else {
          onClose();
        }
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Authentication failed. Please try again.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-x-0 z-[60] flex items-center justify-center overflow-hidden bg-slate-950/75 p-2 backdrop-blur-md sm:p-4" style={{ top: visualViewport.top, height: visualViewport.height }} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title" ref={dialogRef} className="flex min-h-0 w-full max-w-md flex-col overflow-hidden overscroll-contain rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] shadow-[var(--vyra-shadow-overlay)]" style={{ maxHeight: Math.max(120, visualViewport.height - 16) }}>
        <div ref={dialogBodyRef} className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
          <div className="mb-4">
            <div className="mb-2 flex justify-end">
              <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="shrink-0 rounded-lg p-2 text-[var(--vyra-text-muted)] transition hover:bg-[var(--vyra-bg-hover)] disabled:opacity-40"><X size={18} /></button>
            </div>
            <h2 id="auth-dialog-title" className="text-2xl font-bold tracking-tight">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--vyra-text-secondary)]">{mode === 'login' ? 'Sign in to access your account, credits and Workspace.' : 'Create a VYRA account to save your work and start creating.'}</p>
          </div>

          {success && <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs leading-5 text-emerald-300" role="status">{success}</p>}
          {error && <p className="mb-4 rounded-lg border border-[var(--vyra-danger)]/30 bg-[var(--vyra-danger)]/10 px-3 py-2.5 text-xs leading-5 text-[var(--vyra-danger)]" role="alert">{error}</p>}

          <form onSubmit={submit} className="space-y-3.5">
            <FormField label="Email address" htmlFor="vyra-auth-email" required>
              <div className="relative">
                <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--vyra-text-muted)]" />
                <input id="vyra-auth-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className={inputClass + ' pl-9'} />
              </div>
            </FormField>

            <FormField label="Password" htmlFor="vyra-auth-password" required hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
              <div className="relative">
                <LockKeyhole size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--vyra-text-muted)]" />
                <input id="vyra-auth-password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className={inputClass + ' pl-9 pr-10'} />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-[var(--vyra-text-muted)] hover:text-[var(--vyra-text-primary)]">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
            </FormField>

            {mode === 'signup' && (
              <FormField label="Confirm password" htmlFor="vyra-auth-confirm" required>
                <input id="vyra-auth-confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter your password again" className={inputClass} />
              </FormField>
            )}

            <Button type="submit" loading={busy} className="mt-2 w-full">
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          <div className="mt-5 text-center text-xs text-[var(--vyra-text-secondary)]">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button type="button" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess(''); }} className="font-semibold text-[var(--vyra-accent-primary)] hover:underline disabled:opacity-50">
              {mode === 'login' ? 'Create account' : 'Sign in'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
