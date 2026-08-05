'use client';

import { LIFE_SECTIONS } from '@/lib/life-sections';
import { resolveIcon } from './section-icons';

interface SectionBarProps {
  activeSection: string;
  onSectionChange: (sectionId: string) => void;
  // Rendered over the coloured header, so the styling mirrors Header's tabs.
  onColoredBg?: boolean;
  // Count of goals currently worth attention, badged on the Goals section.
  nudgeCount?: number;
}

// The top level of the hierarchy: life areas (Work, Exercise, Music) plus the
// cross-cutting Goals view. Sits above the per-section tab row in Header, which
// renders the active section's sub-tabs.
export function SectionBar({
  activeSection,
  onSectionChange,
  onColoredBg,
  nudgeCount = 0,
}: SectionBarProps) {
  return (
    <nav
      aria-label="Life areas"
      className={`flex items-center gap-1 px-4 py-2 border-b flex-shrink-0 ${
        onColoredBg ? 'bg-black/10 border-white/10' : 'bg-white border-gray-200'
      }`}
    >
      {LIFE_SECTIONS.map(section => {
        const Icon = resolveIcon(section.icon);
        const isActive = activeSection === section.id;
        const showBadge = section.id === 'goals' && nudgeCount > 0;
        return (
          <button
            key={section.id}
            onClick={() => onSectionChange(section.id)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${
              isActive
                ? onColoredBg
                  ? 'bg-white/90 text-gray-900'
                  : 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200'
                : onColoredBg
                  ? 'text-white/75 hover:text-white hover:bg-white/10'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'
            }`}
          >
            <Icon className="w-4 h-4" />
            {section.label}
            {showBadge && (
              <span
                className="ml-0.5 min-w-5 px-1.5 py-0.5 text-[11px] leading-none font-bold rounded-full bg-amber-500 text-white"
                aria-label={`${nudgeCount} goals need attention`}
              >
                {nudgeCount}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
