import React, { useEffect, useRef, useState } from 'react';
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
  onBack, backLabel, icon, title, description, action, compactAction,
}) => {
  const stickyBarRef = useRef<HTMLDivElement>(null);
  const titleRowRef = useRef<HTMLDivElement>(null);
  const compactVisibleRef = useRef(false);
  const [compactVisible, setCompactVisible] = useState(false);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const stickyBar = stickyBarRef.current;
      const titleRow = titleRowRef.current;
      if (!stickyBar || !titleRow) return;

      const stickyBottom = stickyBar.getBoundingClientRect().bottom;
      const titleTop = titleRow.getBoundingClientRect().top;
      const start = stickyBottom + 36;
      const end = stickyBottom - 12;
      const progress = Math.max(0, Math.min(1, (start - titleTop) / (start - end)));

      stickyBar.style.setProperty('--collapse', progress.toFixed(3));
      const nextVisible = progress >= 0.98;
      if (nextVisible !== compactVisibleRef.current) {
        compactVisibleRef.current = nextVisible;
        setCompactVisible(nextVisible);
      }
    };

    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(scheduleUpdate)
      : null;
    if (observer && stickyBarRef.current) observer.observe(stickyBarRef.current);
    if (observer && titleRowRef.current) observer.observe(titleRowRef.current);

    return () => {
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="relative">
      <div
        ref={stickyBarRef}
        className={`sticky top-[calc(var(--vyra-visual-viewport-top,0px)_+_var(--vyra-global-header-height,64px))] z-40 flex h-12 items-center gap-2.5 border-b px-3 transition-[border-color,box-shadow] duration-150 sm:px-6 ${compactVisible ? 'shadow-md shadow-black/5' : ''}`}
        style={{
          backgroundColor: 'color-mix(in srgb, var(--vyra-bg-surface) calc(var(--collapse, 0) * 96%), transparent)',
          borderColor: 'color-mix(in srgb, var(--vyra-border-subtle) calc(var(--collapse, 0) * 100%), transparent)',
          backdropFilter: 'blur(calc(var(--collapse, 0) * 16px))',
        }}
      >
        <div
          aria-hidden={!compactVisible}
          inert={!compactVisible}
          className="flex min-w-0 flex-1 items-center gap-2.5"
          style={{
            opacity: 'var(--collapse, 0)',
            transform: 'translateY(calc((1 - var(--collapse, 0)) * 5px))',
            pointerEvents: compactVisible ? 'auto' : 'none',
          }}
        >
          <button
            type="button"
            onClick={onBack}
            aria-label={backLabel}
            title={backLabel}
            tabIndex={compactVisible ? 0 : -1}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1.5 text-xs font-medium text-[var(--vyra-text-secondary)] transition hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)]"
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--vyra-bg-subtle)] text-[var(--vyra-accent-primary)]">
            {icon}
          </span>
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--vyra-text-primary)]">
            {title}
          </h2>
          {compactAction || action ? <div className="shrink-0">{compactAction ?? action}</div> : null}
        </div>
      </div>

      <div className="p-5 sm:px-6 sm:py-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[var(--vyra-text-secondary)] transition hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--vyra-accent-primary)]"
        >
          <ArrowLeft size={16} /> {backLabel}
        </button>
        <div ref={titleRowRef} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
      </div>
    </div>
  );
};
