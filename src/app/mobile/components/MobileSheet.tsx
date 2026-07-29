'use client';

import { ReactNode, useEffect } from 'react';

// Generic bottom sheet: backdrop tap / Escape to close, drag-handle bar, body
// scroll lock while open, and contained overscroll so the page behind never
// scrolls along with the sheet.
export function MobileSheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45" onClick={onClose}>
      <div
        className="flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex flex-shrink-0 justify-center py-2">
          <span className="h-1 w-10 rounded-full bg-gray-300" aria-hidden />
        </div>
        {children}
      </div>
    </div>
  );
}
