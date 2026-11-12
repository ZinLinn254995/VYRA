import React, { useEffect, useId, useRef } from 'react';
import { Button } from './Button';

export interface ConfirmationDialogProps {
  open: boolean;
  title: React.ReactNode;
  description: React.ReactNode;
  icon?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * VYRA's shared confirmation dialog.
 * Keep confirmation flows visually and behaviorally consistent across the app.
 */
export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  open,
  title,
  description,
  icon,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  onClose,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) {
        event.preventDefault();
        onCloseRef.current();
      } else if (event.key === 'Tab') {
        const first = cancelButtonRef.current;
        const last = confirmButtonRef.current;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, loading]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-sm rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-5 shadow-[var(--vyra-shadow-overlay)]"
      >
        {icon && (
          <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-[var(--vyra-danger)]/10 text-[var(--vyra-danger)]">
            {icon}
          </div>
        )}
        <h2 id={titleId} className="text-base font-semibold text-[var(--vyra-text-primary)]">
          {title}
        </h2>
        <div id={descriptionId} className="mt-2 text-sm leading-6 text-[var(--vyra-text-secondary)]">
          {description}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            ref={cancelButtonRef}
            type="button"
            variant="ghost"
            disabled={loading}
            onClick={onClose}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'danger' : 'primary'}
            ref={confirmButtonRef}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
};
