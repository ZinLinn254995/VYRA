import { useEffect, useRef, useState, type RefObject } from 'react';

type ViewportState = { top: number; height: number };

export function useModalDialog(
  open: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  scrollAreaRef: RefObject<HTMLElement | null>,
): ViewportState {
  const [viewport, setViewport] = useState<ViewportState>(() => ({
    top: 0,
    height: typeof window === 'undefined' ? 800 : window.innerHeight,
  }));
  const focusedTarget = useRef<'top' | 'bottom' | null>(null);

  useEffect(() => {
    if (!open) return;

    // Lock the document itself, not just the backdrop. Fixed-body locking
    // prevents touch scrolling of the page behind the modal on mobile browsers.
    const scrollY = window.scrollY;
    const html = document.documentElement;
    const body = document.body;
    const htmlOverflow = html.style.overflow;
    const htmlOverscroll = html.style.overscrollBehavior;
    const bodyStyles = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      overscrollBehavior: body.style.overscrollBehavior,
    };

    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.position = 'fixed';
    body.style.top = '-' + scrollY + 'px';
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';

    const preventBackgroundGesture = (event: Event) => {
      const target = event.target;
      const scrollArea = scrollAreaRef.current;
      if (!(target instanceof Node) || !scrollArea?.contains(target)) {
        event.preventDefault();
      }
    };
    document.addEventListener('touchmove', preventBackgroundGesture, { passive: false, capture: true });
    document.addEventListener('wheel', preventBackgroundGesture, { passive: false, capture: true });

    return () => {
      document.removeEventListener('touchmove', preventBackgroundGesture, true);
      document.removeEventListener('wheel', preventBackgroundGesture, true);
      html.style.overflow = htmlOverflow;
      html.style.overscrollBehavior = htmlOverscroll;
      body.style.position = bodyStyles.position;
      body.style.top = bodyStyles.top;
      body.style.left = bodyStyles.left;
      body.style.right = bodyStyles.right;
      body.style.width = bodyStyles.width;
      body.style.overflow = bodyStyles.overflow;
      body.style.overscrollBehavior = bodyStyles.overscrollBehavior;
      window.scrollTo(0, scrollY);
    };
  }, [open, scrollAreaRef]);

  useEffect(() => {
    if (!open) {
      focusedTarget.current = null;
      return;
    }

    const visualViewport = window.visualViewport;
    let settleTimer: number | undefined;

    const syncViewport = () => {
      const next = {
        top: visualViewport?.offsetTop ?? 0,
        height: visualViewport?.height ?? window.innerHeight,
      };
      setViewport((current) =>
        current.top === next.top && current.height === next.height ? current : next
      );
    };

    const applyFocusedTarget = () => {
      const scrollArea = scrollAreaRef.current;
      const target = focusedTarget.current;
      if (!scrollArea || !target) return;
      const nextTop = target === 'top'
        ? 0
        : Math.max(0, scrollArea.scrollHeight - scrollArea.clientHeight);
      if (Math.abs(scrollArea.scrollTop - nextTop) > 1) {
        scrollArea.scrollTop = nextTop;
      }
    };

    const scheduleScroll = () => {
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        window.requestAnimationFrame(applyFocusedTarget);
      }, 160);
    };

    const handleFocusIn = (event: FocusEvent) => {
      const field = event.target instanceof HTMLElement ? event.target : null;
      const scrollArea = scrollAreaRef.current;
      if (!field || !scrollArea || !field.matches('input, textarea, select')) return;

      // Convert the field's current screen position back into its stable
      // content position. This prevents classification flipping when the
      // user focuses another field after the dialog has already scrolled.
      const areaBounds = scrollArea.getBoundingClientRect();
      const fieldBounds = field.getBoundingClientRect();
      const contentMidpoint =
        fieldBounds.top - areaBounds.top + scrollArea.scrollTop + fieldBounds.height / 2;
      focusedTarget.current = contentMidpoint < scrollArea.clientHeight / 2 ? 'top' : 'bottom';
      scheduleScroll();
    };

    const handleViewportResize = () => {
      syncViewport();
      if (focusedTarget.current) scheduleScroll();
    };

    syncViewport();
    visualViewport?.addEventListener('resize', handleViewportResize);
    visualViewport?.addEventListener('scroll', syncViewport);
    window.addEventListener('resize', handleViewportResize);
    dialogRef.current?.addEventListener('focusin', handleFocusIn);

    return () => {
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      visualViewport?.removeEventListener('resize', handleViewportResize);
      visualViewport?.removeEventListener('scroll', syncViewport);
      window.removeEventListener('resize', handleViewportResize);
      dialogRef.current?.removeEventListener('focusin', handleFocusIn);
    };
  }, [open, dialogRef, scrollAreaRef]);

  return viewport;
}
