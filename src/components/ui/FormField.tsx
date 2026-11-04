import React from 'react';

export interface FormFieldProps {
  label: React.ReactNode;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label, htmlFor, hint, error, required, children, className = ''
}) => (
  <div className={`min-w-0 space-y-1.5 ${className}`}>
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-[var(--vyra-text-primary)]">
      {label}{required && <span className="ml-1 text-[var(--vyra-danger)]" aria-hidden="true">*</span>}
    </label>
    {children}
    {error
      ? <p className="text-xs text-[var(--vyra-danger)]" role="alert">{error}</p>
      : hint ? <p className="text-xs leading-5 text-[var(--vyra-text-muted)]">{hint}</p> : null}
  </div>
);
