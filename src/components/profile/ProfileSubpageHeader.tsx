import React, { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import './profileSubpageHeader.css';

type Props = {
  onBack: () => void;
  backLabel: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  compactAction?: React.ReactNode;
};

/**
 * A single sticky header whose original controls move into their compact
 * positions as the page scrolls. The zero-height sentinel stays in normal
 * document flow and gives us scroll progress after the header reaches the
 * global navigation bar.
 */
export const ProfileSubpageHeader: React.FC<Props> = ({
  onBack, backLabel, icon, title, description, action, compactAction,
}) => {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      const sentinel = sentinelRef.current;
      const header = headerRef.current;
      if (!sentinel || !header) return;

      const rootStyle = getComputedStyle(document.documentElement);
      const globalHeight = Number.parseFloat(rootStyle.getPropertyValue('--vyra-global-header-height')) || 64;
      const viewportTop = Number.parseFloat(rootStyle.getPropertyValue('--vyra-visual-viewport-top')) || 0;
      const stickyTop = globalHeight + viewportTop;
      const sentinelTop = sentinel.getBoundingClientRect().top;
      const progress = Math.max(0, Math.min(1, (stickyTop - sentinelTop) / 104));

      header.style.setProperty('--profile-collapse', progress.toFixed(4));
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (sentinelRef.current) observer?.observe(sentinelRef.current);
    if (headerRef.current) observer?.observe(headerRef.current);

    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="profile-collapse-shell">
      <div ref={sentinelRef} aria-hidden="true" className="profile-collapse-sentinel" />
      <div
        ref={headerRef}
        className="profile-collapse-header sticky top-[calc(var(--vyra-visual-viewport-top,0px)_+_var(--vyra-global-header-height,64px))] z-40"
        style={{ '--profile-collapse': 0 } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          title={backLabel}
          className="profile-collapse-back"
        >
          <ArrowLeft size={16} />
          <span>{backLabel}</span>
        </button>

        <span className="profile-collapse-icon" aria-hidden="true">{icon}</span>

        <h1 className="profile-collapse-title">{title}</h1>
        <p className="profile-collapse-description">{description}</p>

        {action ? <div className="profile-collapse-action">{action}</div> : null}
        {compactAction ? (
          <div className="profile-collapse-compact-action" aria-hidden="true" inert>
            {compactAction}
          </div>
        ) : null}
      </div>
    </div>
  );
};
