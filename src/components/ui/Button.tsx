import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-[#55F4FF] text-[#090B18] hover:bg-[#55F4FF]/90 border border-transparent',
  secondary: 'bg-[#171A35] text-slate-100 border border-[#2B3058] hover:bg-[#262B54] light:bg-white light:text-slate-900 light:border-slate-300 light:hover:bg-slate-50',
  ghost: 'bg-transparent text-slate-300 border border-transparent hover:bg-[#171A35] light:text-slate-700 light:hover:bg-slate-100',
  danger: 'bg-red-600 text-white border border-transparent hover:bg-red-500',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-3 text-xs gap-1.5',
  md: 'min-h-10 px-4 text-sm gap-2',
  lg: 'min-h-12 px-5 text-sm gap-2',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, startIcon, endIcon, disabled, className = '', children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-lg font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#55F4FF] disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" /> : startIcon}
      {children}
      {!loading && endIcon}
    </button>
  )
);

Button.displayName = 'Button';
