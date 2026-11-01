import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createClient, type Session, type User } from '@supabase/supabase-js';

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  session: Session | null;
  serverVerified: boolean;
  verificationError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
};

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

const AuthContext = createContext<AuthContextValue | null>(null);

async function verifyServerSession(accessToken: string): Promise<{ verified: boolean; error: string | null }> {
  try {
    const response = await fetch('/api/auth/session', {
      headers: { Authorization: 'Bearer ' + accessToken },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({})) as { authenticated?: boolean; error?: string };
    if (response.ok && payload.authenticated) return { verified: true, error: null };
    return { verified: false, error: payload.error ?? 'Server-side session verification is unavailable.' };
  } catch {
    return { verified: false, error: 'Could not reach VYRA authentication service.' };
  }
}

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [serverVerified, setServerVerified] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const checkServer = useCallback(async (nextSession: Session | null) => {
    if (!nextSession?.access_token) {
      setServerVerified(false);
      setVerificationError(null);
      return;
    }
    const result = await verifyServerSession(nextSession.access_token);
    setServerVerified(result.verified);
    setVerificationError(result.error);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return;
      const nextSession = error ? null : data.session;
      setSession(nextSession);
      setLoading(false);
      await checkServer(nextSession);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        // Defer network verification to avoid doing asynchronous work inside the auth callback.
        queueMicrotask(() => { void checkServer(nextSession); });
      } else {
        setServerVerified(false);
        setVerificationError(null);
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [checkServer]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase is not configured. Add the VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setSession(data.session);
    await checkServer(data.session);
  }, [checkServer]);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase is not configured. Add the VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.');
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (data.session) {
      setSession(data.session);
      await checkServer(data.session);
    }
    return { needsEmailConfirmation: !data.session };
  }, [checkServer]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    setServerVerified(false);
    setVerificationError(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    configured: Boolean(supabase),
    loading,
    user: session?.user ?? null,
    session,
    serverVerified,
    verificationError,
    signIn,
    signUp,
    signOut,
  }), [loading, session, serverVerified, verificationError, signIn, signUp, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}
