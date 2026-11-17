import React from 'react';

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title, description, eyebrow, breadcrumbs, actions, className = ''
}) => (
  <header className={`mb-6 flex min-w-0 flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between ${className}`}>
    <div className="min-w-0">
      {breadcrumbs && <div className="mb-2 text-xs text-[var(--vyra-text-muted)]">{breadcrumbs}</div>}
      {eyebrow && <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--vyra-text-secondary)]">{eyebrow}</div>}
      <h1 className="text-xl font-bold tracking-tight text-[var(--vyra-text-primary)] sm:text-2xl">{title}</h1>
      {description && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[var(--vyra-text-secondary)]">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </header>
);
