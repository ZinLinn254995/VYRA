import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

type Props = {
  onBack: () => void;
  backLabel: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  compactAction?: React.ReactNode;
};

export const ProfileSubpageHeader: React.FC<Props> = ({
  onBack, backLabel, icon, title, description, action,
}) => {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const update = () => setCompact(window.scrollY > 80);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <header
      className={`sticky top-[calc(var(--vyra-visual-viewport-top,0px)_+_109px)] sm:top-[calc(var(--vyra-visual-viewport-top,0px)_+_64px)] z-40 border-b border-[var(--vyra-border-subtle)] bg-[var(--vyra-bg-surface)]/95 backdrop-blur-xl transition-shadow duration-200 ${compact ? 'shadow-md shadow-black/5' : ''}`}
    >
      <div className={`transition-all duration-200 sm:px-6 ${compact ? 'px-3 py-2 sm:py-2.5' : 'p-5 sm:py-6'}`}>
        {compact ? (
          <div className="flex min-h-9 items-center gap-2.5">
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              title={backLabel}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1.5 text-xs font-medium text-[var(--vyra-text-secondary)] transition hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)]"
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--vyra-bg-subtle)] text-[var(--vyra-accent-primary)]">
              {icon}
            </span>
            <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--vyra-text-primary)]">
              {title}
            </h1>
            {compactAction || action ? <div className="shrink-0">{compactAction ?? action}</div> : null}
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onBack}
              className="mb-4 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--vyra-text-secondary)] transition hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--vyra-accent-primary)]"
            >
              <ArrowLeft size={16} /> {backLabel}
            </button>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--vyra-bg-subtle)] text-[var(--vyra-accent-primary)]">
                  {icon}
                </span>
                <div className="min-w-0">
                  <h1 className="text-xl font-bold text-[var(--vyra-text-primary)] sm:text-2xl">{title}</h1>
                  <p className="mt-1 text-sm text-[var(--vyra-text-secondary)]">{description}</p>
                </div>
              </div>
              {action ? <div className="shrink-0">{action}</div> : null}
            </div>
          </>
        )}
      </div>
    </header>
  );
};
