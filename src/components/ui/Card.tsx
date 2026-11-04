import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6',
};

export const Card: React.FC<CardProps> = ({
  title, description, actions, padding = 'md', className = '', children, ...props
}) => (
  <section
    className={`min-w-0 rounded-xl border border-[#2B3058] bg-[#171A35] text-slate-100 transition-colors light:border-slate-200 light:bg-white light:text-slate-900 ${paddingClasses[padding]} ${className}`}
    {...props}
  >
    {(title || description || actions) && (
      <header className="mb-4 flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {description && <p className="mt-1 text-xs leading-5 text-slate-400 light:text-slate-500">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </header>
    )}
    {children}
  </section>
);
