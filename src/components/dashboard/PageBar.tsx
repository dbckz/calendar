'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Measure a container and report how many rows of ~rowPx fit in it, so a
// paginated list can size its page to the available height and never scroll.
// Updates on resize via ResizeObserver.
export function useFitCount<T extends HTMLElement = HTMLDivElement>(rowPx: number, min = 1): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [count, setCount] = useState(min);

  useEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (el && el.clientHeight > 0) setCount(Math.max(min, Math.floor(el.clientHeight / rowPx)));
    };
    // Measure only from async callbacks (never synchronously in the effect body),
    // and from several triggers, because a single ResizeObserver/rAF fire can land
    // before flex sizing or web-font loading has settled the list's height:
    //   • double rAF — after layout AND paint
    //   • a delayed pass — after fonts/async layout
    //   • ResizeObserver — any later size change
    //   • window resize
    const raf = requestAnimationFrame(() => requestAnimationFrame(measure));
    const t = setTimeout(measure, 250);
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [rowPx, min]);

  return [ref, count];
}

// Slice `items` into pages of `pageSize`. The stored page index is clamped into
// range on read (via `clamped`) so a shrinking list never strands an empty page;
// next/prev also clamp, so the stored value self-corrects on interaction.
export function usePaged<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const clamped = Math.min(page, pageCount - 1);

  const pageItems = useMemo(
    () => items.slice(clamped * pageSize, clamped * pageSize + pageSize),
    [items, clamped, pageSize]
  );

  return {
    page: clamped,
    pageCount,
    pageItems,
    next: () => setPage(p => Math.min(p + 1, pageCount - 1)),
    prev: () => setPage(p => Math.max(p - 1, 0)),
  };
}

interface PageBarProps {
  page: number;      // 0-indexed
  pageCount: number;
  onPrev: () => void;
  onNext: () => void;
}

// Compact prev/next footer, shown only when there is more than one page.
export function PageBar({ page, pageCount, onPrev, onNext }: PageBarProps) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 pt-2 mt-auto flex-shrink-0 text-xs text-gray-500">
      <button
        onClick={onPrev}
        disabled={page === 0}
        className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Previous page"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="tabular-nums">{page + 1} / {pageCount}</span>
      <button
        onClick={onNext}
        disabled={page >= pageCount - 1}
        className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Next page"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
