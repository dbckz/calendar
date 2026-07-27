'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface ProjectOption {
  gid: string;
  name: string;
}

interface ProjectComboboxProps {
  value: string; // selected project gid ('' = none)
  onChange: (gid: string) => void;
  projects: ProjectOption[];
  // Label for the "clear selection" entry (e.g. "No project"). Omit to hide it.
  clearLabel?: string;
  placeholder?: string;
  ariaLabel?: string;
  invalid?: boolean;
  className?: string;
}

// A live-search combobox for picking a project from a potentially long list
// (100+). Typing filters options by case-insensitive substring; the filtered
// list shows in a scrollable popover. Keyboard: ArrowUp/Down move the highlight,
// Enter selects, Escape closes. Self-contained — no external dependencies.
export function ProjectCombobox({
  value,
  onChange,
  projects,
  clearLabel,
  placeholder = 'Select project…',
  ariaLabel = 'Project',
  invalid = false,
  className = '',
}: ProjectComboboxProps) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedName = useMemo(
    () => projects.find(p => p.gid === value)?.name ?? '',
    [projects, value]
  );

  // The clear entry (when offered) always shows; only projects are filtered.
  const items = useMemo<ProjectOption[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? projects.filter(p => p.name.toLowerCase().includes(q))
      : projects;
    return clearLabel !== undefined ? [{ gid: '', name: clearLabel }, ...filtered] : filtered;
  }, [projects, query, clearLabel]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, open]);

  const openList = () => {
    setOpen(true);
    setQuery('');
    setActiveIndex(0);
  };

  const select = (gid: string) => {
    onChange(gid);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) return openList();
      setActiveIndex(i => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return openList();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && items[activeIndex]) {
        e.preventDefault();
        select(items[activeIndex].gid);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setQuery('');
      }
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          aria-activedescendant={
            open && items[activeIndex] ? `${baseId}-opt-${activeIndex}` : undefined
          }
          value={open ? query : selectedName}
          placeholder={selectedName || placeholder}
          onChange={e => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={openList}
          onClick={() => {
            if (!open) openList();
          }}
          onKeyDown={handleKeyDown}
          className={`w-full pr-6 outline-none focus:ring-2 focus:ring-orange-500 ${
            invalid ? 'border-red-400' : ''
          } ${className}`}
        />
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
      </div>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full min-w-max overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          {items.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-gray-400">No matches</li>
          ) : (
            items.map((item, i) => {
              const isActive = i === activeIndex;
              const isSelected = item.gid === value;
              return (
                <li
                  key={item.gid || '__clear__'}
                  id={`${baseId}-opt-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={e => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => select(item.gid)}
                  className={`cursor-pointer px-2 py-1.5 text-xs ${
                    isActive ? 'bg-orange-50 text-orange-800' : 'text-gray-700'
                  } ${item.gid === '' ? 'italic text-gray-500' : ''}`}
                >
                  {item.name}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
