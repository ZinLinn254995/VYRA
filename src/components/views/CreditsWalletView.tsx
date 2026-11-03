/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

type WalletActivity = {
  id: string;
  entryType: string;
  availableDelta: string;
  reservedDelta: string;
  note?: string;
  createdAt: string;
  counterpartyUsername?: string;
  counterpartyDisplayName?: string;
};

type WalletSnapshot = {
  account: { username: string | null; displayName: string | null };
  availableBalance: string;
  reservedBalance: string;
  recentActivity: WalletActivity[];
};

type Recipient = {
  userId: string;
  username: string;
  displayName?: string;
};

type PendingTransferRequest = {
  recipientUserId: string;
  amount: number;
  note: string | null;
  fingerprint: string;
  idempotencyKey: string;
  attempted: boolean;
};

type StoredPendingTransfer = {
  fingerprint: string;
  idempotencyKey: string;
  attempted: boolean;
  createdAt: number;
};

const PENDING_TRANSFER_STORAGE_KEY = 'vyra.pending-credit-transfers.v1';
const PENDING_TRANSFER_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PENDING_TRANSFER_MAX_RECORDS = 10;

function readPendingTransferRecords(): Record<string, StoredPendingTransfer> {
  try {
    const raw = localStorage.getItem(PENDING_TRANSFER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StoredPendingTransfer>;
    const now = Date.now();
    return Object.fromEntries(Object.entries(parsed)
      .filter(([fingerprint, record]) =>
        /^[a-f0-9]{64}$/.test(fingerprint)
        && record
        && record.fingerprint === fingerprint
        && /^wallet-[a-f0-9-]{36}$/.test(record.idempotencyKey)
        && typeof record.attempted === 'boolean'
        && Number.isFinite(record.createdAt)
        && now - record.createdAt >= 0
        && now - record.createdAt <= PENDING_TRANSFER_MAX_AGE_MS
      ));
  } catch {
    return {};
  }
}

function writePendingTransferRecord(record: StoredPendingTransfer): void {
  try {
    const records = readPendingTransferRecords();
    records[record.fingerprint] = record;
    const recent = Object.entries(records)
      .sort((a, b) => b[1].createdAt - a[1].createdAt)
      .slice(0, PENDING_TRANSFER_MAX_RECORDS);
    localStorage.setItem(PENDING_TRANSFER_STORAGE_KEY, JSON.stringify(Object.fromEntries(recent)));
  } catch {
    // In-memory idempotency still protects retries during the current page session.
  }
}

function removePendingTransferRecord(fingerprint: string): void {
  try {
    const records = readPendingTransferRecords();
    delete records[fingerprint];
    localStorage.setItem(PENDING_TRANSFER_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Storage is best-effort; the server remains the source of truth.
  }
}

async function fingerprintTransferRequest(request: {
  recipientUserId: string;
  amount: number;
  note: string | null;
}): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(request));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

const cardClass = 'rounded-2xl border border-[#2B3058] light:border-slate-200 bg-[#171A35] light:bg-white';
const fieldClass = 'w-full rounded-lg border border-[#2B3058] light:border-slate-300 bg-[#090B18] light:bg-slate-50 px-3 py-2.5 text-sm text-white light:text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-[#55F4FF] light:focus:border-indigo-500';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-[#55F4FF] px-4 py-2.5 text-xs font-bold text-[#090B18] transition-colors hover:bg-[#55F4FF]/90 disabled:cursor-not-allowed disabled:opacity-50';

function formatCredits(value: string): string {
  try {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(BigInt(value));
  } catch {
    return '—';
  }
}

function activityLabel(type: string): string {
  const labels: Record<string, string> = {
    grant: 'Credits added',
    refund: 'Refund',
    adjustment: 'Balance adjustment',
    reserve: 'Generation reserved',
    commit: 'Generation charged',
    release: 'Reservation released',
    transfer_debit: 'Credits sent',
    transfer_credit: 'Credits received',
  };
  return labels[type] ?? 'Wallet activity';
}

function signedAmount(value: string): string {
  try {
    const amount = BigInt(value);
    return (amount > 0n ? '+' : '') + formatCredits(value);
  } catch {
    return '—';
  }
}

export const CreditsWalletView: React.FC = () => {
  const { configured, loading: authLoading, session, serverVerified, verificationError } = useAuth();
  const accessToken = session?.access_token ?? '';
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientSearchLoading, setRecipientSearchLoading] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransferRequest | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const apiHeaders = useMemo(() => ({
    Authorization: 'Bearer ' + accessToken,
    'Content-Type': 'application/json',
  }), [accessToken]);

  const loadWallet = useCallback(async () => {
    if (!accessToken || !serverVerified) return;
    setWalletLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/credits/wallet', {
        headers: { Authorization: 'Bearer ' + accessToken },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({})) as WalletSnapshot & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Your wallet could not be loaded.');
      setWallet(payload);
      setUsername(payload.account?.username ?? '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your wallet could not be loaded.');
    } finally {
      setWalletLoading(false);
    }
  }, [accessToken, serverVerified]);

  useEffect(() => {
    if (serverVerified && accessToken) void loadWallet();
    else setWallet(null);
  }, [serverVerified, accessToken, loadWallet]);

  const saveUsername = async (event: React.FormEvent) => {
    event.preventDefault();
    setUsernameSaving(true);
    setError(null);
    setNotice(null);
    try {
      const normalized = username.trim().toLowerCase();
      if (normalized && !/^[a-z0-9_]{3,24}$/.test(normalized)) {
        throw new Error('Use 3–24 letters, numbers or underscores.');
      }
      const response = await fetch('/api/credits/username', {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({ username: normalized || null }),
      });
      const payload = await response.json().catch(() => ({})) as { username?: string | null; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Username could not be saved.');
      setUsername(payload.username ?? '');
      setNotice(payload.username ? 'Your VYRA username is saved.' : 'Your VYRA username was cleared.');
      await loadWallet();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Username could not be saved.');
    } finally {
      setUsernameSaving(false);
    }
  };

  const searchRecipients = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(query)) {
      setError('Enter at least 3 letters, numbers or underscores to search.');
      return;
    }
    setRecipientSearchLoading(true);
    setError(null);
    setRecipients([]);
    setSelectedRecipient(null);
    try {
      const response = await fetch('/api/credits/recipients?query=' + encodeURIComponent(query), {
        headers: { Authorization: 'Bearer ' + accessToken },
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({})) as { recipients?: Recipient[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Recipient search is unavailable.');
      setRecipients(Array.isArray(payload.recipients) ? payload.recipients : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Recipient search is unavailable.');
    } finally {
      setRecipientSearchLoading(false);
    }
  };

  const parsedAmount = /^\d+$/.test(amount) && Number.isSafeInteger(Number(amount)) ? Number(amount) : 0;
  const hasEnoughCredits = useMemo(() => {
    try {
      return parsedAmount > 0 && BigInt(String(parsedAmount)) <= BigInt(wallet?.availableBalance ?? '0');
    } catch {
      return false;
    }
  }, [parsedAmount, wallet?.availableBalance]);

  const reviewTransfer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRecipient) {
      setError('Choose a recipient before continuing.');
      return;
    }
    if (!hasEnoughCredits) {
      setError('Enter a whole-number amount within your available balance.');
      return;
    }
    if (note.length > 500) {
      setError('The note must be 500 characters or fewer.');
      return;
    }
    const request = {
      recipientUserId: selectedRecipient.userId,
      amount: parsedAmount,
      note: note.trim() || null,
    };
    setReviewLoading(true);
    try {
      const fingerprint = await fingerprintTransferRequest(request);
      const current = pendingTransfer?.fingerprint === fingerprint ? pendingTransfer : null;
      const stored = readPendingTransferRecords()[fingerprint];
      const existingKey = current?.idempotencyKey ?? stored?.idempotencyKey;
      const attempted = current?.attempted ?? stored?.attempted ?? false;
      const next: PendingTransferRequest = {
        ...request,
        fingerprint,
        idempotencyKey: existingKey ?? 'wallet-' + crypto.randomUUID(),
        attempted,
      };
      setPendingTransfer(next);
      writePendingTransferRecord({
        fingerprint,
        idempotencyKey: next.idempotencyKey,
        attempted: next.attempted,
        createdAt: stored?.createdAt ?? Date.now(),
      });
      setError(null);
      setConfirmOpen(true);
    } catch {
      setError('Could not prepare a secure transfer request. Please try again.');
    } finally {
      setReviewLoading(false);
    }
  };

  const closeTransferReview = () => {
    setConfirmOpen(false);
    // An attempted request may have completed even if its response was lost.
    // Keep its fingerprint/key in local storage until confirmed or expired.
    if (pendingTransfer && !pendingTransfer.attempted) {
      removePendingTransferRecord(pendingTransfer.fingerprint);
      setPendingTransfer(null);
    }
  };

  const sendTransfer = async () => {
    if (!selectedRecipient || !hasEnoughCredits) return;
    const request = pendingTransfer;
    const requestNote = note.trim() || null;
    if (!request || request.recipientUserId !== selectedRecipient.userId
        || request.amount !== parsedAmount || request.note !== requestNote) {
      setConfirmOpen(false);
      setPendingTransfer(null);
      setError('Transfer details changed. Review the transfer again before sending.');
      return;
    }
    setPendingTransfer({ ...request, attempted: true });
    writePendingTransferRecord({
      fingerprint: request.fingerprint,
      idempotencyKey: request.idempotencyKey,
      attempted: true,
      createdAt: readPendingTransferRecords()[request.fingerprint]?.createdAt ?? Date.now(),
    });
    setTransferLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/credits/transfers', {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({
          recipientUserId: request.recipientUserId,
          amount: request.amount,
          idempotencyKey: request.idempotencyKey,
          note: request.note,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { transfer?: { id: string }; error?: string };
      if (!response.ok) {
        if (response.status === 503) {
          throw new Error(payload.error ?? 'Transfer status is not confirmed. Check your wallet history before trying again.');
        }
        throw new Error(payload.error ?? 'The transfer could not be completed.');
      }
      if (!payload.transfer?.id) {
        throw new Error('Transfer status is not confirmed. Check wallet history before retrying this same request.');
      }
      setConfirmOpen(false);
      removePendingTransferRecord(request.fingerprint);
      setPendingTransfer(null);
      setNotice('Credits sent successfully. Your wallet has been refreshed.');
      setAmount('');
      setNote('');
      setSelectedRecipient(null);
      setRecipients([]);
      await loadWallet();
    } catch (cause) {
      setConfirmOpen(false);
      setError(cause instanceof Error ? cause.message : 'The transfer could not be completed.');
    } finally {
      setTransferLoading(false);
    }
  };

  if (authLoading) {
    return <div className="mx-auto max-w-5xl py-16 text-center text-sm text-slate-400">Checking your account…</div>;
  }

  if (!configured || !session) {
    return (
      <div className="mx-auto max-w-3xl py-12">
        <section className={cardClass + ' p-6 sm:p-8 text-center space-y-3'}>
          <Wallet className="mx-auto h-9 w-9 text-[#55F4FF]" />
          <h1 className="text-xl font-bold text-white light:text-slate-900">VYRA Credit Wallet</h1>
          <p className="text-sm text-slate-400 light:text-slate-600">Sign in with your VYRA account to view your balance and manage credit transfers.</p>
          <p className="text-xs text-slate-500">Use the Account button in the top-right corner to sign in.</p>
        </section>
      </div>
    );
  }

  if (!serverVerified) {
    return (
      <div className="mx-auto max-w-3xl py-12">
        <section className={cardClass + ' p-6 sm:p-8 text-center space-y-3'}>
          <ShieldCheck className="mx-auto h-9 w-9 text-amber-400" />
          <h1 className="text-xl font-bold text-white light:text-slate-900">Verify your VYRA session</h1>
          <p className="text-sm text-slate-400 light:text-slate-600">{verificationError ?? 'Wallet access is available after server-side session verification.'}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-14">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-[#55F4FF] light:text-indigo-600">
            <Wallet className="h-4 w-4" /> VYRA ACCOUNT
          </div>
          <h1 className="text-2xl font-bold text-white light:text-slate-900">Credit Wallet</h1>
          <p className="mt-1 text-sm text-slate-400 light:text-slate-500">View your credits, manage your public username and send credits securely.</p>
        </div>
        <button type="button" onClick={() => void loadWallet()} disabled={walletLoading} className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-[#2B3058] light:border-slate-300 px-3 py-2 text-xs font-semibold text-slate-300 light:text-slate-700 hover:bg-[#1E2345] light:hover:bg-slate-100 disabled:opacity-50">
          {walletLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh wallet
        </button>
      </div>

      {error && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300 light:text-rose-700">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300 light:text-emerald-700">{notice}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className={cardClass + ' relative overflow-hidden p-5 sm:p-6'}>
          <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-[#55F4FF]/10 blur-3xl" />
          <div className="relative flex items-center gap-2 text-xs font-semibold text-slate-400 light:text-slate-500"><Wallet className="h-4 w-4 text-[#55F4FF]" /> AVAILABLE CREDITS</div>
          <div className="relative mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tight text-white light:text-slate-900 tabular-nums">{wallet ? formatCredits(wallet.availableBalance) : '—'}</span>
            <span className="text-sm font-semibold text-[#55F4FF]">credits</span>
          </div>
          <p className="relative mt-2 text-xs text-slate-500">Calculated from your verified credit ledger. Credits are not displayed as cash value.</p>
        </section>
        <section className={cardClass + ' p-5 sm:p-6'}>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 light:text-slate-500"><Clock3 className="h-4 w-4 text-violet-400" /> RESERVED CREDITS</div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold tracking-tight text-white light:text-slate-900 tabular-nums">{wallet ? formatCredits(wallet.reservedBalance) : '—'}</span>
            <span className="text-sm font-semibold text-violet-400">credits</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Credits temporarily held for generation jobs.</p>
        </section>
      </div>

      <section className={cardClass + ' p-5 sm:p-6'}>
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#55F4FF]" />
          <h2 className="text-sm font-bold text-white light:text-slate-900">Your VYRA Username</h2>
        </div>
        <form onSubmit={saveUsername} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 space-y-1.5">
            <span className="text-xs font-medium text-slate-300 light:text-slate-700">Public username</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} maxLength={24} placeholder="e.g. vyra_creator" className={fieldClass} />
            <span className="block text-[10px] text-slate-500">3–24 lowercase letters, numbers or underscores. This is visible in recipient search.</span>
          </label>
          <button type="submit" disabled={usernameSaving || !accessToken} className={buttonClass}>
            {usernameSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Save username
          </button>
        </form>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={cardClass + ' p-5 sm:p-6 space-y-4'}>
          <div>
            <h2 className="text-sm font-bold text-white light:text-slate-900">Send Credits</h2>
            <p className="mt-1 text-xs text-slate-400 light:text-slate-500">Find an account by public username, then review the transfer before sending.</p>
          </div>
          <form onSubmit={searchRecipients} className="flex gap-2">
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} maxLength={24} placeholder="Search username…" className={fieldClass} />
            <button type="submit" disabled={recipientSearchLoading || searchQuery.trim().length < 3} className={buttonClass + ' shrink-0 px-3'}>
              {recipientSearchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="hidden sm:inline">Search</span>
            </button>
          </form>
          {recipients.length > 0 && (
            <div className="space-y-2" aria-label="Recipient search results">
              {recipients.map((recipient) => (
                <button key={recipient.userId} type="button" onClick={() => setSelectedRecipient(recipient)} className={'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ' + (selectedRecipient?.userId === recipient.userId ? 'border-[#55F4FF] bg-[#55F4FF]/10' : 'border-[#2B3058] light:border-slate-200 hover:bg-[#1E2345] light:hover:bg-slate-50')}>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-white light:text-slate-900">@{recipient.username}</span>
                    {recipient.displayName && <span className="block truncate text-[11px] text-slate-500">{recipient.displayName}</span>}
                  </span>
                  <span className="text-[10px] font-semibold text-[#55F4FF]">{selectedRecipient?.userId === recipient.userId ? 'Selected' : 'Select'}</span>
                </button>
              ))}
            </div>
          )}
          {searchQuery.trim().length >= 3 && recipients.length === 0 && !recipientSearchLoading && (
            <p className="text-xs text-slate-500">No matching accounts yet. Search by the beginning of a username.</p>
          )}
          {selectedRecipient && (
            <form onSubmit={reviewTransfer} className="space-y-3 border-t border-[#2B3058] light:border-slate-200 pt-4">
              <div className="rounded-lg bg-[#090B18]/70 light:bg-slate-50 px-3 py-2.5 text-xs text-slate-300 light:text-slate-700">
                Sending to <strong className="text-white light:text-slate-900">@{selectedRecipient.username}</strong>
              </div>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-300 light:text-slate-700">Amount (whole credits)</span>
                <input type="number" min="1" step="1" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Enter amount" className={fieldClass} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-300 light:text-slate-700">Note (optional)</span>
                <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Add a short note" className={fieldClass} />
              </label>
              <button type="submit" disabled={!hasEnoughCredits || transferLoading || reviewLoading} className={buttonClass + ' w-full'}>{reviewLoading ? 'Preparing secure request…' : 'Review transfer'}</button>
            </form>
          )}
          <p className="text-[10px] leading-relaxed text-slate-500">Transfers are final once confirmed. Always check the recipient username and amount carefully. If a request times out, retry the same details; VYRA reuses the original request ID to prevent duplicate transfers.</p>
        </section>

        <section className={cardClass + ' p-5 sm:p-6'}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-white light:text-slate-900">Recent Activity</h2>
              <p className="mt-1 text-xs text-slate-400 light:text-slate-500">Latest 50 entries from your credit ledger.</p>
            </div>
            <span className="rounded-md bg-[#090B18] light:bg-slate-100 px-2 py-1 text-[10px] font-mono text-slate-400">{wallet?.recentActivity.length ?? 0} entries</span>
          </div>
          <div className="space-y-1">
            {(wallet?.recentActivity ?? []).map((entry) => {
              const delta = BigInt(entry.availableDelta);
              const positive = delta > 0n;
              const transfer = entry.entryType.startsWith('transfer_');
              return (
                <div key={entry.id} className="flex items-center gap-3 border-b border-[#2B3058]/60 light:border-slate-100 py-3 last:border-0">
                  <span className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-full ' + (positive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-[#55F4FF]/10 text-[#55F4FF]')}>
                    {positive ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-white light:text-slate-900">{activityLabel(entry.entryType)}</span>
                    <span className="block truncate text-[10px] text-slate-500">
                      {transfer && entry.counterpartyUsername ? '@' + entry.counterpartyUsername : entry.note || new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </span>
                  <span className={'shrink-0 text-xs font-bold tabular-nums ' + (positive ? 'text-emerald-400' : 'text-slate-200 light:text-slate-700')}>{signedAmount(entry.availableDelta)}</span>
                </div>
              );
            })}
            {!walletLoading && (wallet?.recentActivity.length ?? 0) === 0 && (
              <div className="py-10 text-center text-xs text-slate-500">No wallet activity yet.</div>
            )}
            {walletLoading && !wallet && <div className="py-10 text-center text-xs text-slate-500">Loading wallet activity…</div>}
          </div>
        </section>
      </div>

      {confirmOpen && selectedRecipient && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !transferLoading) closeTransferReview(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="transfer-confirm-title" className={cardClass + ' w-full max-w-md space-y-5 p-5 sm:p-6 shadow-2xl'}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold tracking-widest text-[#55F4FF]">FINAL CONFIRMATION</div>
                <h2 id="transfer-confirm-title" className="mt-1 text-lg font-bold text-white light:text-slate-900">Confirm credit transfer</h2>
              </div>
              <button type="button" onClick={closeTransferReview} disabled={transferLoading} aria-label="Close confirmation" className="rounded-lg p-1.5 text-slate-400 hover:bg-[#2B3058] disabled:opacity-40"><X className="h-4 w-4" /></button>
            </div>
            <div className="rounded-xl bg-[#090B18] light:bg-slate-50 p-4 text-center">
              <div className="text-xs text-slate-400">You are sending</div>
              <div className="my-2 text-3xl font-extrabold tabular-nums text-white light:text-slate-900">{formatCredits(String(parsedAmount))}</div>
              <div className="text-xs font-semibold text-[#55F4FF]">credits</div>
              <div className="mt-3 border-t border-[#2B3058] light:border-slate-200 pt-3 text-sm font-semibold text-white light:text-slate-900">@{selectedRecipient.username}</div>
              {note.trim() && <div className="mt-1 text-xs text-slate-500">{note.trim()}</div>}
            </div>
            <p className="text-xs leading-relaxed text-slate-400 light:text-slate-600">This transfer cannot be cancelled after it completes. Verify the username and amount before confirming.</p>
            <div className="flex gap-2">
              <button type="button" onClick={closeTransferReview} disabled={transferLoading} className="flex-1 rounded-lg border border-[#2B3058] light:border-slate-300 px-3 py-2.5 text-xs font-semibold text-slate-300 light:text-slate-700">Go back</button>
              <button type="button" onClick={() => void sendTransfer()} disabled={transferLoading} className={buttonClass + ' flex-1'}>
                {transferLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirm & send
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
