import React, { useState } from 'react';
import {
  ArrowRight, ArrowLeft, Check, Clapperboard, Film, Sparkles, ShieldCheck,
  Mail, LockKeyhole, UserRound, Building2, Eye, EyeOff, LoaderCircle,
} from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';
import { Button } from '../ui';
import { useAuth } from '../../context/AuthContext';
import { navigateVYRA } from '../../App';

type AuthMode = 'login' | 'signup' | 'forgot-password' | 'reset-password';

const inputClass = 'w-full rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-4 py-3 text-sm text-[var(--vyra-text-primary)] outline-none transition focus:border-[var(--vyra-accent-primary)] focus:ring-2 focus:ring-[var(--vyra-accent-primary)]/15 placeholder:text-[var(--vyra-text-muted)]';
const labelClass = 'mb-2 block text-sm font-medium text-[var(--vyra-text-primary)]';

function PublicFrame({ children, showBack = true }: React.PropsWithChildren<{ showBack?: boolean }>) {
  return (
    <div className="min-h-screen bg-[var(--vyra-bg-canvas)] text-[var(--vyra-text-primary)]">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <button type="button" onClick={() => navigateVYRA('welcome')} aria-label="Go to VYRA home">
          <BrandLogo size="md" />
        </button>
        {showBack && (
          <button type="button" onClick={() => navigateVYRA('workspace')} className="inline-flex items-center gap-2 text-sm text-[var(--vyra-text-secondary)] transition hover:text-[var(--vyra-text-primary)]">
            <ArrowLeft size={16} /> Back to workspace
          </button>
        )}
      </header>
      {children}
      <footer className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-8 text-xs text-[var(--vyra-text-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span>© {new Date().getFullYear()} VYRA Studio</span>
        <span>AI video creation workspace</span>
      </footer>
    </div>
  );
}

export const AuthLoadingScreen: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-[var(--vyra-bg-canvas)]">
    <div className="flex flex-col items-center gap-4 text-sm text-[var(--vyra-text-secondary)]">
      <LoaderCircle className="animate-spin" size={28} />
      Checking your session…
    </div>
  </div>
);

export const PublicLandingPage: React.FC = () => (
  <PublicFrame showBack={false}>
    <main className="mx-auto grid min-h-[70vh] max-w-7xl items-center gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:py-20">
      <section className="max-w-2xl">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] px-3 py-1.5 text-xs text-[var(--vyra-text-secondary)]">
          <Sparkles size={14} className="text-[var(--vyra-accent-primary)]" /> Your creative production workspace
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          From your idea to a video, <span className="text-[var(--vyra-accent-primary)]">all in one place.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-[var(--vyra-text-secondary)] sm:text-lg">
          Plan stories, build scenes, create media, review every detail, and prepare content for publishing in one connected workspace.
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" onClick={() => navigateVYRA('signup')} endIcon={<ArrowRight size={17} />}>Create your account</Button>
          <Button size="lg" variant="secondary" onClick={() => navigateVYRA('login')}>Sign in</Button>
        </div>
        <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs text-[var(--vyra-text-muted)]">
          <span className="inline-flex items-center gap-2"><Check size={14} /> Story-to-video workflow</span>
          <span className="inline-flex items-center gap-2"><Check size={14} /> Review before publishing</span>
          <span className="inline-flex items-center gap-2"><Check size={14} /> One creative workspace</span>
        </div>
      </section>
      <section className="relative">
        <div className="absolute -inset-6 rounded-[2rem] bg-[var(--vyra-accent-primary)]/10 blur-3xl" />
        <div className="relative overflow-hidden rounded-3xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-5 shadow-[var(--vyra-shadow-card)] sm:p-7">
          <div className="flex items-center justify-between border-b border-[var(--vyra-border)] pb-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><Clapperboard size={17} /> Production overview</div>
            <span className="rounded-full bg-[var(--vyra-accent-primary)]/10 px-3 py-1 text-[11px] font-semibold text-[var(--vyra-accent-primary)]">Workspace</span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {[['Projects','12'],['Scenes','48'],['Media assets','126'],['Ready to review','4']].map(([label,value]) => (
              <div key={label} className="rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] p-4">
                <p className="text-xs text-[var(--vyra-text-muted)]">{label}</p>
                <p className="mt-2 text-2xl font-bold">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-sm font-semibold">The last signal</p><p className="mt-1 text-xs text-[var(--vyra-text-muted)]">Storyboard · 8 scenes · 16:9</p></div>
              <Film className="text-[var(--vyra-accent-primary)]" size={22} />
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {['01','02','03','04'].map((item,index) => <div key={item} className="flex aspect-video items-end rounded-lg border border-[var(--vyra-border)] bg-gradient-to-br from-[var(--vyra-accent-secondary)]/30 to-[var(--vyra-accent-primary)]/10 p-2 text-[10px] text-[var(--vyra-text-secondary)]">SCENE {item}</div>)}
            </div>
          </div>
          <p className="mt-4 text-[11px] text-[var(--vyra-text-muted)]">Illustrative preview · Sample workspace data</p>
        </div>
      </section>
    </main>
  </PublicFrame>
);

export const AuthPage: React.FC<{ mode: AuthMode }> = ({ mode }) => {
  const { configured, signIn, signUp, resetPassword, updatePassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const isLogin = mode === 'login';
  const isSignup = mode === 'signup';
  const isForgot = mode === 'forgot-password';
  const isReset = mode === 'reset-password';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!isForgot && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (isSignup && password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      if (isLogin) {
        await signIn(email.trim(), password);
        navigateVYRA('workspace');
      } else if (isSignup) {
        const result = await signUp(email.trim(), password);
        if (result.needsEmailConfirmation) {
          setMessage('Your account request is ready. Check your email for the confirmation link before signing in.');
        } else {
          navigateVYRA('onboarding');
        }
      } else if (isForgot) {
        await resetPassword(email.trim());
        setMessage('If an account exists for this email, a password recovery link has been sent.');
      } else {
        await updatePassword(password);
        setMessage('Your password has been updated. You can now continue to your workspace.');
        setPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const title = isLogin ? 'Welcome back' : isSignup ? 'Create your account' : isForgot ? 'Reset your password' : 'Choose a new password';
  const description = isLogin
    ? 'Sign in to continue to your VYRA workspace.'
    : isSignup
      ? 'Create an account to start organizing your video projects.'
      : isForgot
        ? 'Enter the email address associated with your account.'
        : 'Choose a new password for your VYRA account.';

  return (
    <PublicFrame>
      <main className="mx-auto flex min-h-[68vh] max-w-6xl items-center justify-center px-5 py-10 sm:px-8">
        <section className="w-full max-w-md rounded-3xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-6 shadow-[var(--vyra-shadow-card)] sm:p-8">
          <div className="mb-7">
            <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-[var(--vyra-accent-primary)]/10 text-[var(--vyra-accent-primary)]">
              {isForgot || isReset ? <LockKeyhole size={22} /> : <ShieldCheck size={22} />}
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--vyra-text-secondary)]">{description}</p>
          </div>

          {!configured && (
            <div role="alert" className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
              Authentication is not connected in this environment yet. The page is ready, but sign-in and account creation require the Supabase project configuration.
            </div>
          )}
          {error && <div role="alert" className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">{error}</div>}
          {message && <div role="status" className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm leading-6 text-emerald-700 dark:text-emerald-300">{message}</div>}

          <form onSubmit={submit} className="space-y-5">
            {!isReset && (
              <div>
                <label className={labelClass} htmlFor="auth-email">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--vyra-text-muted)]" size={17} />
                  <input id="auth-email" className={`${inputClass} pl-11`} type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" />
                </div>
              </div>
            )}
            {!isForgot && (
              <div>
                <label className={labelClass} htmlFor="auth-password">{isReset ? 'New password' : 'Password'}</label>
                <div className="relative">
                  <LockKeyhole className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--vyra-text-muted)]" size={17} />
                  <input id="auth-password" className={`${inputClass} pl-11 pr-12`} type={showPassword ? 'text' : 'password'} autoComplete={isLogin ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 8 characters" />
                  <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--vyra-text-muted)]" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                </div>
              </div>
            )}
            {isSignup || isReset ? (
              <div>
                <label className={labelClass} htmlFor="auth-confirm-password">Confirm password</label>
                <input id="auth-confirm-password" className={inputClass} type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Enter your password again" />
              </div>
            ) : null}
            <Button type="submit" block className="w-full" loading={busy} disabled={!configured}>
              {isLogin ? 'Sign in' : isSignup ? 'Create account' : isForgot ? 'Send recovery link' : 'Update password'}
            </Button>
          </form>

          <div className="mt-6 flex flex-col gap-3 text-center text-sm">
            {isLogin && <><button type="button" onClick={() => navigateVYRA('forgot-password')} className="text-[var(--vyra-accent-primary)] hover:underline">Forgot password?</button><p className="text-[var(--vyra-text-secondary)]">New to VYRA? <button type="button" onClick={() => navigateVYRA('signup')} className="font-semibold text-[var(--vyra-accent-primary)] hover:underline">Create an account</button></p></>}
            {isSignup && <p className="text-[var(--vyra-text-secondary)]">Already have an account? <button type="button" onClick={() => navigateVYRA('login')} className="font-semibold text-[var(--vyra-accent-primary)] hover:underline">Sign in</button></p>}
            {isForgot && <button type="button" onClick={() => navigateVYRA('login')} className="font-semibold text-[var(--vyra-accent-primary)] hover:underline">Back to sign in</button>}
            {isReset && <button type="button" onClick={() => navigateVYRA('login')} className="font-semibold text-[var(--vyra-accent-primary)] hover:underline">Back to sign in</button>}
            {message && isReset && <Button variant="secondary" onClick={() => navigateVYRA('login')}>Continue to sign in</Button>}
          </div>
          <p className="mt-7 text-center text-[11px] leading-5 text-[var(--vyra-text-muted)]">By continuing, you agree to VYRA’s Terms of Service and Privacy Policy.</p>
        </section>
      </main>
    </PublicFrame>
  );
};

export const OnboardingPage: React.FC = () => {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user?.user_metadata?.full_name ?? '');
  const [workspaceName, setWorkspaceName] = useState('');
  const [purpose, setPurpose] = useState('social-content');
  const [done, setDone] = useState(false);

  return (
    <PublicFrame showBack={false}>
      <main className="mx-auto flex min-h-[68vh] max-w-3xl items-center justify-center px-5 py-10 sm:px-8">
        <section className="w-full rounded-3xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-6 shadow-[var(--vyra-shadow-card)] sm:p-9">
          <div className="mb-7 flex items-center justify-between gap-4">
            <BrandLogo size="md" />
            <span className="text-xs text-[var(--vyra-text-muted)]">Getting started · 1 of 1</span>
          </div>
          {done ? (
            <div className="py-8 text-center">
              <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500"><Check size={26} /></div>
              <h1 className="text-2xl font-bold">Your workspace is ready to explore</h1>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--vyra-text-secondary)]">This onboarding preview used local form state. Profile and workspace details are not saved yet.</p>
              <Button className="mt-7" onClick={() => navigateVYRA('workspace')} endIcon={<ArrowRight size={17} />}>Open workspace</Button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold">Let’s set up your workspace</h1>
              <p className="mt-2 text-sm leading-6 text-[var(--vyra-text-secondary)]">A few details help shape your first VYRA experience.</p>
              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="onboarding-name">Your name</label>
                  <div className="relative"><UserRound className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--vyra-text-muted)]" size={17} /><input id="onboarding-name" className={`${inputClass} pl-11`} value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Your name" /></div>
                </div>
                <div>
                  <label className={labelClass} htmlFor="onboarding-workspace">Workspace name</label>
                  <div className="relative"><Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--vyra-text-muted)]" size={17} /><input id="onboarding-workspace" className={`${inputClass} pl-11`} value={workspaceName} onChange={event => setWorkspaceName(event.target.value)} placeholder="My creative studio" /></div>
                </div>
              </div>
              <div className="mt-5">
                <label className={labelClass} htmlFor="onboarding-purpose">What will you create most?</label>
                <select id="onboarding-purpose" className={inputClass} value={purpose} onChange={event => setPurpose(event.target.value)}>
                  <option value="social-content">Short-form social videos</option>
                  <option value="storytelling">Animated stories and storytelling</option>
                  <option value="marketing">Marketing and product videos</option>
                  <option value="long-form">Long-form video content</option>
                  <option value="exploring">I’m exploring VYRA</option>
                </select>
              </div>
              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <Button variant="ghost" onClick={() => navigateVYRA('workspace')}>Skip for now</Button>
                <Button onClick={() => setDone(true)} endIcon={<ArrowRight size={17} />}>Continue</Button>
              </div>
            </>
          )}
        </section>
      </main>
    </PublicFrame>
  );
};
