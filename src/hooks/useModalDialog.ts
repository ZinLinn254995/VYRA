import { useEffect, useState, type RefObject } from 'react';

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
      const targetElement = target instanceof Element
        ? target
        : target instanceof Node
          ? target.parentElement
          : null;
      const targetModal = targetElement?.closest('[role="dialog"][aria-modal="true"]');

      // A nested dialog rendered later in the DOM owns its own scroll area.
      // Do not let the underlying dialog cancel gestures inside that top dialog.
      if (targetModal && targetModal !== dialogRef.current) return;

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
    if (!open) return;

    // Let the browser perform its native, minimal focus scrolling. Programmatic
    // top/bottom jumps on every focus change caused visible blinking on mobile.
    const visualViewport = window.visualViewport;
    const syncViewport = () => {
      const next = {
        top: visualViewport?.offsetTop ?? 0,
        height: visualViewport?.height ?? window.innerHeight,
      };
      setViewport((current) =>
        current.top === next.top && current.height === next.height ? current : next
      );
    };

    syncViewport();
    visualViewport?.addEventListener('resize', syncViewport);
    visualViewport?.addEventListener('scroll', syncViewport);
    window.addEventListener('resize', syncViewport);

    return () => {
      visualViewport?.removeEventListener('resize', syncViewport);
      visualViewport?.removeEventListener('scroll', syncViewport);
      window.removeEventListener('resize', syncViewport);
    };
  }, [open]);

  return viewport;
}
