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
      const mobile = window.matchMedia('(max-width: 639px)').matches;
      const mix = (from: number, to: number) => from + (to - from) * progress;
      const set = (name: string, value: number) => header.style.setProperty(name, `${value.toFixed(2)}px`);

      set('--profile-height', mix(mobile ? 150 : 156, mobile ? 48 : 48));
      set('--back-top', mix(12, 7));
      set('--back-left', mix(mobile ? 12 : 24, 10));
      set('--back-font-size', mix(14, 12));
      set('--icon-top', mix(58, 7));
      set('--icon-left', mix(mobile ? 12 : 24, mobile ? 84 : 108));
      set('--icon-size', mix(44, 32));
      set('--icon-radius', mix(12, 8));
      set('--icon-glyph-size', mix(22, 18));
      set('--title-top', mix(56, 14));
      set('--title-left', mix(mobile ? 64 : 84, mobile ? 132 : 172));
      set('--title-right', mix(mobile ? 12 : 24, mobile ? 110 : 142));
      set('--title-font-size', mix(mobile ? 21 : 24, 14));
      set('--description-top', mix(96, 72));
      set('--description-left', mix(mobile ? 64 : 84, mobile ? 132 : 172));
      set('--description-opacity', 1 - progress);
      set('--action-top', mix(mobile ? 58 : 56, 5));
      set('--action-right', mix(mobile ? 12 : 24, 12));
      set('--action-opacity', 1);
      header.style.setProperty('--profile-collapse', progress.toFixed(4));
      header.style.setProperty('--description-shift', `${(-8 * progress).toFixed(2)}px`);
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
      >
        <button type="button" onClick={onBack} aria-label={backLabel} title={backLabel} className="profile-collapse-back">
          <ArrowLeft size={16} />
          <span>{backLabel}</span>
        </button>
        <span className="profile-collapse-icon" aria-hidden="true">{icon}</span>
        <h1 className="profile-collapse-title">{title}</h1>
        <p className="profile-collapse-description">{description}</p>
        {action || compactAction ? <div className="profile-collapse-action">{action ?? compactAction}</div> : null}
      </div>
    </div>
  );
};
