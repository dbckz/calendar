'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { Clock, MapPin, Trash2, X } from 'lucide-react';
import { CalendarEvent } from '@/types';

interface AsanaIntegrationInfo {
  id: string;
  name: string;
}

// Separate component to avoid nested component issues
function AttributionIndicator({
  attribution,
  asanaIntegrations,
  onSetAttribution,
  onRemoveAttribution,
}: {
  attribution?: { asanaIntegrationId: string };
  asanaIntegrations?: AsanaIntegrationInfo[];
  onSetAttribution?: (asanaIntegrationId: string) => void;
  onRemoveAttribution?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const justOpenedRef = useRef(false);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    // Skip the first mousedown after opening to avoid race condition
    justOpenedRef.current = true;
    const timer = setTimeout(() => {
      justOpenedRef.current = false;
    }, 100);

    const handleClickOutside = (e: MouseEvent) => {
      if (justOpenedRef.current) return;
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      clearTimeout(timer);
    };
  }, [isOpen]);

  if (!onSetAttribution || !asanaIntegrations?.length) return null;

  const currentAttribution = attribution?.asanaIntegrationId;
  const currentIntegration = currentAttribution
    ? asanaIntegrations.find(i => i.id === currentAttribution)
    : null;

  // Get short label for integration
  const getLabel = (integrationId: string) => {
    const integration = asanaIntegrations.find(i => i.id === integrationId);
    if (!integration) return '?';
    const name = integration.name;
    if (name.length <= 3) return name;
    return name.substring(0, 3).toUpperCase();
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        tabIndex={-1}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (!isOpen && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect();
            setPos({ top: rect.bottom + 4, left: rect.left });
          }
          setIsOpen(!isOpen);
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        className={`flex items-center justify-center text-[9px] font-bold rounded transition-colors ${
          currentAttribution
            ? 'bg-green-500 text-white w-auto min-w-[18px] h-[18px] px-1'
            : 'bg-gray-200 text-gray-500 hover:bg-gray-300 w-[18px] h-[18px]'
        }`}
        title={currentIntegration ? `Counts toward ${currentIntegration.name}` : 'Set time tracking'}
      >
        {currentAttribution ? getLabel(currentAttribution) : '+'}
      </button>

      {isOpen && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          className="fixed bg-white rounded shadow-lg border min-w-[100px]"
          style={{ top: pos.top, left: pos.left, zIndex: 9999 }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {asanaIntegrations.map(integration => (
            <button
              key={integration.id}
              onClick={(e) => {
                e.stopPropagation();
                if (currentAttribution === integration.id) {
                  onRemoveAttribution?.();
                } else {
                  onSetAttribution(integration.id);
                }
                setIsOpen(false);
              }}
              className={`w-full text-left px-2 py-1 text-xs hover:bg-gray-100 flex items-center gap-2 ${
                currentAttribution === integration.id ? 'bg-green-50 text-green-700' : ''
              }`}
            >
              {currentAttribution === integration.id && (
                <span className="text-green-500">✓</span>
              )}
              <span className={currentAttribution === integration.id ? '' : 'pl-4'}>
                {integration.name}
              </span>
            </button>
          ))}
          {currentAttribution && (
            <>
              <div className="border-t" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveAttribution?.();
                  setIsOpen(false);
                }}
                className="w-full text-left px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                Remove
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

interface EventCardProps {
  event: CalendarEvent;
  onDelete?: (id: string) => void;
  onDeleteEvent?: () => void;
  compact?: boolean;
  isPast?: boolean;
  height?: number;
  attribution?: { asanaIntegrationId: string };
  asanaIntegrations?: AsanaIntegrationInfo[];
  onSetAttribution?: (asanaIntegrationId: string) => void;
  onRemoveAttribution?: () => void;
}

export function EventCard({
  event,
  onDelete,
  onDeleteEvent,
  compact,
  isPast,
  height,
  attribution,
  asanaIntegrations,
  onSetAttribution,
  onRemoveAttribution,
}: EventCardProps) {
  const sourceLabels = {
    google: 'Google Calendar',
    asana: 'Asana',
    adhoc: 'Task',
  };

  const sourceColors = {
    google: 'bg-blue-100 text-blue-700',
    asana: 'bg-orange-100 text-orange-700',
    adhoc: 'bg-purple-100 text-purple-700',
  };

  const isVerySmall = height !== undefined && height <= 20;
  const isSmall = height !== undefined && height <= 35;

  const showAttribution = event.source === 'google' && !event.linkedAsanaTaskId && onSetAttribution;

  if (compact) {
    if (isVerySmall) {
      return (
        <div
          className={`h-full rounded border shadow-sm overflow-hidden transition-all hover:shadow-md ${
            event.completed || isPast ? 'opacity-50' : ''
          } ${isPast ? 'grayscale-[30%]' : ''}`}
          style={{
            borderLeftColor: event.color,
            borderLeftWidth: '3px',
            backgroundColor: event.color ? `${event.color}20` : 'white',
          }}
          title={`${event.title} (${format(event.startTime, 'h:mm a')} - ${format(event.endTime, 'h:mm a')})`}
        >
          <div className="px-1.5 h-full flex items-center justify-between gap-1">
            <span
              className={`text-xs font-medium text-gray-900 truncate flex-1 ${
                event.completed ? 'line-through text-gray-500' : ''
              }`}
            >
              {event.title}
            </span>
            {onDeleteEvent && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteEvent();
                }}
                className="p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                aria-label="Delete event"
                title="Delete event"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      );
    }

    if (isSmall) {
      return (
        <div
          className={`h-full rounded-lg border shadow-sm overflow-hidden transition-all hover:shadow-md ${
            event.completed || isPast ? 'opacity-50' : ''
          } ${isPast ? 'grayscale-[30%]' : ''}`}
          style={{
            borderLeftColor: event.color,
            borderLeftWidth: '4px',
            backgroundColor: event.color ? `${event.color}15` : 'white',
          }}
        >
          <div className="px-2 py-1 h-full flex items-center justify-between gap-1">
            <span
              className={`text-xs font-medium text-gray-900 truncate flex-1 ${
                event.completed ? 'line-through text-gray-500' : ''
              }`}
            >
              {event.title}
            </span>
            <span className="text-[10px] text-gray-500 flex-shrink-0">
              {format(event.startTime, 'h:mm a')}
            </span>
            {showAttribution && (
              <AttributionIndicator
                attribution={attribution}
                asanaIntegrations={asanaIntegrations}
                onSetAttribution={onSetAttribution}
                onRemoveAttribution={onRemoveAttribution}
              />
            )}
            {onDeleteEvent && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteEvent();
                }}
                className="p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                aria-label="Delete event"
                title="Delete event"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div
        className={`h-full rounded-lg border shadow-sm overflow-hidden transition-all hover:shadow-md ${
          event.completed || isPast ? 'opacity-50' : ''
        } ${isPast ? 'grayscale-[30%]' : ''}`}
        style={{
          borderLeftColor: event.color,
          borderLeftWidth: '4px',
          backgroundColor: event.color ? `${event.color}15` : 'white',
        }}
      >
        <div className="p-2 h-full flex flex-col">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <h3
                className={`text-sm font-medium text-gray-900 line-clamp-2 ${
                  event.completed ? 'line-through text-gray-500' : ''
                }`}
              >
                {event.title}
              </h3>
              <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
                <span>
                  {format(event.startTime, 'h:mm a')} - {format(event.endTime, 'h:mm a')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {showAttribution && (
                <AttributionIndicator
                  attribution={attribution}
                  asanaIntegrations={asanaIntegrations}
                  onSetAttribution={onSetAttribution}
                  onRemoveAttribution={onRemoveAttribution}
                />
              )}
              {onDeleteEvent && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteEvent();
                  }}
                  className="p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                  aria-label="Delete event"
                  title="Delete event"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-lg border shadow-sm overflow-hidden transition-all hover:shadow-md ${
        event.completed ? 'opacity-60' : ''
      }`}
      style={{ borderLeftColor: event.color, borderLeftWidth: '4px' }}
    >
      <div className="p-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3
                className={`font-medium text-gray-900 ${
                  event.completed ? 'line-through text-gray-500' : ''
                }`}
              >
                {event.title}
              </h3>
              <span
                className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                  sourceColors[event.source]
                }`}
              >
                {sourceLabels[event.source]}
              </span>
            </div>

            {event.description && (
              <p className="text-sm text-gray-600 mt-1 line-clamp-2">{event.description}</p>
            )}

            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>
                  {event.allDay
                    ? 'All day'
                    : `${format(event.startTime, 'h:mm a')} - ${format(event.endTime, 'h:mm a')}`}
                </span>
              </div>
              {event.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  <span className="truncate max-w-[150px]">{event.location}</span>
                </div>
              )}
            </div>
          </div>

          {event.source === 'adhoc' && onDelete && (
            <button
              onClick={() => onDelete(event.id)}
              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
              aria-label="Delete task"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
