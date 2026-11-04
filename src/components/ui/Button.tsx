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
  primary: 'bg-[var(--vyra-accent-primary)] text-[var(--vyra-bg-canvas)] hover:opacity-90 border border-transparent',
  secondary: 'bg-[var(--vyra-bg-surface)] text-[var(--vyra-text-primary)] border border-[var(--vyra-border)] hover:bg-[var(--vyra-bg-hover)]',
  ghost: 'bg-transparent text-[var(--vyra-text-secondary)] border border-transparent hover:bg-[var(--vyra-bg-subtle)] hover:text-[var(--vyra-text-primary)]',
  danger: 'bg-[var(--vyra-danger)] text-white border border-transparent hover:opacity-90',
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
      className={`inline-flex items-center justify-center rounded-lg font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vyra-accent-primary)] disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading ? <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" /> : startIcon}
      {children}
      {!loading && endIcon}
    </button>
  )
);

Button.displayName = 'Button';
