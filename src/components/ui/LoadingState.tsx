import React from 'react';

export interface LoadingStateProps {
  label?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  label = 'Loading…', className = ''
}) => (
  <div className={`flex min-h-40 flex-col items-center justify-center gap-3 text-sm text-slate-400 ${className}`} role="status" aria-live="polite">
    <span className="size-6 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
    <span>{label}</span>
  </div>
);
