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
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-slate-300 light:text-slate-700">
      {label}{required && <span className="ml-1 text-red-400" aria-hidden="true">*</span>}
    </label>
    {children}
    {error
      ? <p className="text-xs text-red-400" role="alert">{error}</p>
      : hint ? <p className="text-xs leading-5 text-slate-500">{hint}</p> : null}
  </div>
);
