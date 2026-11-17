import React from 'react';

type Props = {
  children: React.ReactNode;
  fallbackTitle?: string;
};

type State = {
  hasError: boolean;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('VYRA page rendering error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section
          role="alert"
          className="mx-auto flex min-h-48 w-full max-w-xl flex-col items-center justify-center px-5 py-12 text-center"
        >
          <h2 className="text-base font-semibold text-[var(--vyra-text-primary)]">
            {this.props.fallbackTitle ?? 'This page could not be displayed'}
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-[var(--vyra-text-secondary)]">
            Your VYRA navigation is still available. Reload this page to try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-lg bg-[var(--vyra-accent-primary)] px-4 py-2 text-sm font-semibold text-slate-950 transition hover:opacity-90"
          >
            Reload page
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}
