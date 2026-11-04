import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon, title, description, action, className = ''
}) => (
  <div className={`flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-[#2B3058] px-5 py-10 text-center light:border-slate-300 ${className}`}>
    {icon && <div className="mb-3 text-slate-400" aria-hidden="true">{icon}</div>}
    <h3 className="text-sm font-semibold text-slate-100 light:text-slate-900">{title}</h3>
    {description && <p className="mt-1.5 max-w-md text-xs leading-5 text-slate-400 light:text-slate-500">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
