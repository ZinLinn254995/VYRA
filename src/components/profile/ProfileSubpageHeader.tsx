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
  const headerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let frame = 0;
    let cardExtra = 0;
    let cardMeasured = false;
    const update = () => {
      frame = 0;
      const header = headerRef.current;
      const scrollContainer = scrollRef.current;
      const card = header?.parentElement as HTMLElement | null;
      if (!header || !scrollContainer || !card) return;

      // Measure overflow against the final, screen-fitted card height. Give
      // long cards a little extra initial room, then remove that room as the
      // card's own content scrolls so its bottom settles to the screen margin.
      if (!cardMeasured) {
        card.style.setProperty('--profile-card-extra', '0px');
        card.style.setProperty('--profile-card-shrink', '0px');
        const overflow = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
        cardExtra = Math.min(160, overflow * 0.5);
        card.style.setProperty('--profile-card-extra', `${cardExtra.toFixed(2)}px`);
        cardMeasured = true;
      }
      const cardShrink = Math.min(cardExtra, Math.max(0, scrollContainer.scrollTop));
      card.style.setProperty('--profile-card-shrink', `${cardShrink.toFixed(2)}px`);

      const progress = Math.max(0, Math.min(1, scrollContainer.scrollTop / 104));
      const mobile = window.matchMedia('(max-width: 639px)').matches;
      const mix = (from: number, to: number) => from + (to - from) * progress;
      const set = (name: string, value: number) => header.style.setProperty(name, `${value.toFixed(2)}px`);
      header.classList.toggle('is-compact', progress >= 0.98);
      header.style.setProperty('--profile-collapse', progress.toFixed(4));
      header.style.setProperty('--profile-collapse-percent', `${(progress * 100).toFixed(2)}%`);
      header.style.setProperty('--profile-shadow-opacity', (progress * 0.06).toFixed(4));
      set('--profile-height', mix(mobile ? 150 : 156, 48));
      set('--back-top', 12);
      set('--back-left', mobile ? 12 : 24);
      set('--back-font-size', 14);
      set('--back-width', mix(mobile ? 190 : 210, 32));
      set('--back-gap', mix(7, 0));
      header.style.setProperty('--back-label-opacity', (1 - progress).toFixed(4));
      set('--icon-top', mix(58, 7));
      set('--icon-left', mix(mobile ? 12 : 24, mobile ? 52 : 56));
      set('--icon-size', mix(44, 32));
      set('--icon-radius', mix(12, 8));
      set('--icon-glyph-size', mix(22, 18));
      set('--title-top', mix(56, 14));
      set('--title-left', mix(mobile ? 64 : 84, mobile ? 92 : 100));
      set('--title-right', mix(mobile ? 12 : 24, (action || compactAction) ? (mobile ? 112 : 176) : 12));
      set('--title-font-size', mix(mobile ? 21 : 24, 14));
      set('--description-top', mix(96, 72));
      set('--description-left', mix(mobile ? 64 : 84, mobile ? 92 : 100));
      const descriptionFade = Math.max(0, Math.min(1, (progress - 0.28) / 0.58));
      header.style.setProperty('--description-opacity', (1 - descriptionFade).toFixed(4));
      set('--description-shift', -12 * progress);
      set('--action-top', mix(mobile ? 58 : 56, 5));
      set('--action-right', mix(mobile ? 12 : 24, 12));
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    const attachScrollContainer = () => {
      const container = headerRef.current?.parentElement?.querySelector<HTMLElement>('.profile-subpage-scroll') ?? null;
      if (scrollRef.current === container) return;
      scrollRef.current?.removeEventListener('scroll', schedule);
      scrollRef.current = container;
      scrollRef.current?.addEventListener('scroll', schedule, { passive: true });
      update();
    };
    attachScrollContainer();
    window.addEventListener('resize', schedule, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { attachScrollContainer(); schedule(); }) : null;
    if (headerRef.current) observer?.observe(headerRef.current);
    return () => {
      scrollRef.current?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="profile-collapse-shell">
      <div ref={headerRef} className="profile-collapse-header">
        <button type="button" onClick={onBack} aria-label={backLabel} title={backLabel} className="profile-collapse-back">
          <ArrowLeft size={16} /><span>{backLabel}</span>
        </button>
        <span className="profile-collapse-icon" aria-hidden="true">{icon}</span>
        <h1 className="profile-collapse-title">{title}</h1>
        <p className="profile-collapse-description">{description}</p>
        {action ? <div className="profile-collapse-action profile-collapse-action-expanded">{action}</div> : null}
        {compactAction ? <div className="profile-collapse-action profile-collapse-action-compact">{compactAction}</div> : null}
      </div>
    </div>
  );
};
