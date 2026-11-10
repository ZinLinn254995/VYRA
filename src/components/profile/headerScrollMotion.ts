import type { WheelEvent, TouchEvent } from 'react';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

const getHeader = (content: HTMLElement) =>
  content.closest<HTMLElement>('.profile-subpage-card')?.querySelector<HTMLElement>('.profile-collapse-header') ?? null;

export const getCompactProgress = (content: HTMLElement) => {
  const header = getHeader(content);
  return clamp(Number.parseFloat(header?.style.getPropertyValue('--profile-header-progress') || '0') || 0);
};

export const setCompactProgress = (content: HTMLElement, progress: number) => {
  const header = getHeader(content);
  if (!header) return;
  const p = clamp(progress);
  const expandedHeight = Number.parseFloat(getComputedStyle(header).getPropertyValue('--profile-header-expanded')) || 148;
  const collapseDistance = Number.parseFloat(getComputedStyle(header).getPropertyValue('--profile-header-collapse-distance')) || 44;
  header.style.setProperty('--profile-header-progress', String(p));
  header.style.setProperty('--profile-header-height', (expandedHeight - collapseDistance * p) + 'px');
  header.style.setProperty('--profile-header-shift-y', (44 * p) + 'px');
  header.style.setProperty('--profile-header-shift-x', (48 * p) + 'px');
  header.style.setProperty('--profile-header-icon-rotation', '0deg');
  header.style.setProperty('--profile-header-title-shift-y', (40 * p) + 'px');
  header.style.setProperty('--profile-header-title-shift-x', (48 * p) + 'px');
  header.style.setProperty('--profile-header-icon-size', (44 - 8 * p) + 'px');
  header.style.setProperty('--profile-header-title-size', ((window.innerWidth < 640 ? 21 : 24) - 4 * p) + 'px');
  header.style.setProperty('--profile-header-action-shift', (42 * p) + 'px');
  header.style.setProperty('--profile-create-button-width', (148 - 64 * p) + 'px');
  header.style.setProperty('--profile-create-extra-width', (100 * (1 - p)) + 'px');
  header.style.setProperty('--profile-create-extra-opacity', (1 - p).toFixed(3));
  header.style.setProperty('--profile-create-extra-shift', (12 * p) + 'px');
  header.style.setProperty('--profile-back-label-opacity', (1 - p).toFixed(3));
  header.style.setProperty('--profile-description-shift', (-8 * p) + 'px');
  header.style.setProperty('--profile-full-action-events', p >= 0.5 ? 'none' : 'auto');
  header.style.setProperty('--profile-compact-action-events', p >= 0.5 ? 'auto' : 'none');
  const fullAction = header.querySelector<HTMLElement>('.profile-collapse-action-full');
  const compactAction = header.querySelector<HTMLElement>('.profile-collapse-action-compact');
  fullAction?.toggleAttribute('inert', p >= 0.5);
  fullAction?.setAttribute('aria-hidden', String(p >= 0.5));
  compactAction?.toggleAttribute('inert', p < 0.5);
  compactAction?.setAttribute('aria-hidden', String(p < 0.5));
};

const getMainProgress = () => clamp(Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vyra-main-header-progress')) || 0);
const setMainProgress = (progress: number) => {
  const value = clamp(progress);
  window.dispatchEvent(new CustomEvent('vyra:main-header-progress', { detail: value }));
};

export const applyHeaderScrollDelta = (content: HTMLElement, deltaY: number) => {
  if (!deltaY) return 0;
  const header = getHeader(content);
  if (!header) return 0;
  let remaining = Math.abs(deltaY);
  const direction = deltaY > 0 ? 1 : -1;
  let compact = getCompactProgress(content);
  let main = getMainProgress();
  const compactDistance = Number.parseFloat(getComputedStyle(header).getPropertyValue('--profile-header-collapse-distance')) || 44;
  const mainDistance = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vyra-global-header-height')) || 64;

  if (direction > 0) {
    if (compact < 1) {
      const amount = Math.min(remaining, (1 - compact) * compactDistance);
      compact += amount / compactDistance;
      remaining -= amount;
      setCompactProgress(content, compact);
    }
    if (remaining > 0 && compact >= 0.999 && main < 1) {
      const amount = Math.min(remaining, (1 - main) * mainDistance);
      main += amount / mainDistance;
      remaining -= amount;
      setMainProgress(main);
    }
  } else {
    if (content.scrollTop > 0) return 0;
    if (main > 0) {
      const amount = Math.min(remaining, main * mainDistance);
      main -= amount / mainDistance;
      remaining -= amount;
      setMainProgress(main);
    }
    if (remaining > 0 && main <= 0.001 && compact > 0) {
      const amount = Math.min(remaining, compact * compactDistance);
      compact -= amount / compactDistance;
      remaining -= amount;
      setCompactProgress(content, compact);
    }
  }
  return Math.abs(deltaY) - remaining;
};

export const settleHeaderMotion = (content: HTMLElement) => {
  const header = getHeader(content);
  if (!header) return;
  const compact = getCompactProgress(content);
  const main = getMainProgress();
  setCompactProgress(content, compact >= 0.5 ? 1 : 0);
  setMainProgress(main >= 0.5 ? 1 : 0);
  content.classList.remove('is-header-dragging');
  document.documentElement.classList.remove('is-header-dragging');
};

export const beginHeaderMotion = (content: HTMLElement) => {
  content.classList.add('is-header-dragging');
  document.documentElement.classList.add('is-header-dragging');
};

export const scheduleHeaderSettle = (content: HTMLElement) => {
  const key = '__vyraHeaderSettleTimer';
  const target = content as HTMLElement & { [key: string]: number | undefined };
  if (target[key]) window.clearTimeout(target[key]);
  target[key] = window.setTimeout(() => settleHeaderMotion(content), 140);
};

export const handleHeaderWheel = (event: WheelEvent<HTMLDivElement>) => {
  const content = event.currentTarget;
  const consumed = applyHeaderScrollDelta(content, event.deltaY);
  if (consumed <= 0) return;
  event.preventDefault();
  const remaining = Math.abs(event.deltaY) - consumed;
  if (remaining > 0) content.scrollTop = Math.max(0, content.scrollTop + Math.sign(event.deltaY) * remaining);
  beginHeaderMotion(content);
  scheduleHeaderSettle(content);
};

export const handleHeaderTouchStart = (event: TouchEvent<HTMLDivElement>) => {
  const content = event.currentTarget;
  content.dataset.headerLastTouchY = String(event.touches[0]?.clientY ?? 0);
};

export const handleHeaderTouchMove = (event: TouchEvent<HTMLDivElement>) => {
  const content = event.currentTarget;
  const currentY = event.touches[0]?.clientY;
  if (currentY === undefined) return;
  const previousY = Number(content.dataset.headerLastTouchY ?? currentY);
  const deltaY = previousY - currentY;
  content.dataset.headerLastTouchY = String(currentY);
  if (!deltaY) return;
  const consumed = applyHeaderScrollDelta(content, deltaY);
  if (consumed <= 0) return;
  event.preventDefault();
  const remaining = Math.abs(deltaY) - consumed;
  if (remaining > 0) content.scrollTop = Math.max(0, content.scrollTop + Math.sign(deltaY) * remaining);
  beginHeaderMotion(content);
};

export const handleHeaderTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
  delete event.currentTarget.dataset.headerLastTouchY;
  settleHeaderMotion(event.currentTarget);
};
