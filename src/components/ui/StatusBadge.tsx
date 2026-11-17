import React from 'react';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'processing';

const tones: Record<StatusTone, string> = {
  neutral: 'border-slate-500/30 bg-slate-500/10 text-slate-300 light:text-slate-600',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 light:text-emerald-700',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-400 light:text-amber-700',
  danger: 'border-red-500/30 bg-red-500/10 text-red-400 light:text-red-700',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-400 light:text-sky-700',
  processing: 'border-violet-500/30 bg-violet-500/10 text-violet-400 light:text-violet-700',
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  dot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  tone = 'neutral', dot = false, className = '', children, ...props
}) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none ${tones[tone]} ${className}`}
    {...props}
  >
    {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
    {children}
  </span>
);
