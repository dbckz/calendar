'use client';

import { Dispatch, SetStateAction } from 'react';
import { format } from 'date-fns';
import { CalendarEvent } from '@/types';
import { api } from '@/lib/api';
import { containsHtml, htmlToReadableText } from '@/lib/html-utils';
import { useToast } from '@/hooks/useToast';

type AttributionMap = Record<string, { asanaIntegrationId: string; googleIntegrationId: string }>;

interface GoogleEventModalProps {
  event: CalendarEvent;
  setSelectedGoogleEvent: Dispatch<SetStateAction<CalendarEvent | null>>;
  isEditing: boolean;
  setIsEditing: Dispatch<SetStateAction<boolean>>;
  editingTitle: string;
  setEditingTitle: Dispatch<SetStateAction<string>>;
  editingDescription: string;
  setEditingDescription: Dispatch<SetStateAction<string>>;
  isSaving: boolean;
  setIsSaving: Dispatch<SetStateAction<boolean>>;
  googleEventAttributions: AttributionMap;
  setGoogleEventAttributions: Dispatch<SetStateAction<AttributionMap>>;
  asanaIntegrations: { id: string; name: string }[];
  updateGoogleEvent: (
    eventId: string,
    integrationId: string,
    startTime: Date,
    endTime: Date,
    title?: string,
    description?: string,
    calendarId?: string
  ) => Promise<{ success: boolean; error?: string }>;
  onRequestDelete: (event: CalendarEvent) => void;
}

export function GoogleEventModal({
  event: selectedGoogleEvent,
  setSelectedGoogleEvent,
  isEditing: isEditingGoogleEvent,
  setIsEditing: setIsEditingGoogleEvent,
  editingTitle: editingGoogleEventTitle,
  setEditingTitle: setEditingGoogleEventTitle,
  editingDescription: editingGoogleEventDescription,
  setEditingDescription: setEditingGoogleEventDescription,
  isSaving: isSavingGoogleEvent,
  setIsSaving: setIsSavingGoogleEvent,
  googleEventAttributions,
  setGoogleEventAttributions,
  asanaIntegrations,
  updateGoogleEvent,
  onRequestDelete,
}: GoogleEventModalProps) {
  const toast = useToast();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between p-4 border-b">
          <div className="flex-1 min-w-0">
            {isEditingGoogleEvent ? (
              <input
                type="text"
                value={editingGoogleEventTitle}
                onChange={(e) => setEditingGoogleEventTitle(e.target.value)}
                className="w-full text-lg font-semibold text-gray-900 border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Event title"
                autoFocus
              />
            ) : (
              <h2 className="text-lg font-semibold text-gray-900 truncate">
                {selectedGoogleEvent.title}
              </h2>
            )}
            <p className="text-sm text-gray-500 mt-1">
              {format(selectedGoogleEvent.startTime, 'EEEE, MMMM d, yyyy')}
            </p>
            <p className="text-sm text-gray-500">
              {format(selectedGoogleEvent.startTime, 'h:mm a')} - {format(selectedGoogleEvent.endTime, 'h:mm a')}
            </p>
            {selectedGoogleEvent.integrationName && (
              <p className="text-xs text-blue-600 mt-1">
                {selectedGoogleEvent.integrationName}
              </p>
            )}
          </div>
          <button
            onClick={() => {
              setSelectedGoogleEvent(null);
              setIsEditingGoogleEvent(false);
            }}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors ml-2"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {selectedGoogleEvent.location && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-1">Location</h3>
              <p className="text-sm text-gray-600">{selectedGoogleEvent.location}</p>
            </div>
          )}

          {isEditingGoogleEvent ? (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-1">Description</h3>
              <textarea
                value={editingGoogleEventDescription}
                onChange={(e) => setEditingGoogleEventDescription(e.target.value)}
                className="w-full h-40 text-sm text-gray-600 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Add a description..."
              />
            </div>
          ) : (
            <>
              {selectedGoogleEvent.description ? (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-1">Description</h3>
                  <div className="text-sm text-gray-600 whitespace-pre-wrap break-words">
                    {(() => {
                      const displayText = containsHtml(selectedGoogleEvent.description)
                        ? htmlToReadableText(selectedGoogleEvent.description)
                        : selectedGoogleEvent.description;

                      return displayText.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                        part.match(/^https?:\/\//) ? (
                          <a
                            key={i}
                            href={part}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline break-all"
                          >
                            {part}
                          </a>
                        ) : (
                          <span key={i}>{part}</span>
                        )
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No description</p>
              )}
            </>
          )}

          {/* Time tracking attribution - only show for Google events not linked to Asana */}
          {!isEditingGoogleEvent && !selectedGoogleEvent.linkedAsanaTaskId && (
            <div className="mt-4 pt-4 border-t">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Time Tracking</h3>
              {(() => {
                const attribution = googleEventAttributions[selectedGoogleEvent.id];
                const currentIntegration = attribution
                  ? asanaIntegrations.find(i => i.id === attribution.asanaIntegrationId)
                  : null;

                if (attribution && currentIntegration) {
                  return (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">
                        Counts toward: <span className="font-medium">{currentIntegration.name}</span>
                      </span>
                      <button
                        onClick={async () => {
                          try {
                            await api.removeGoogleEventAttribution(selectedGoogleEvent.id);
                            setGoogleEventAttributions(prev => {
                              const next = { ...prev };
                              delete next[selectedGoogleEvent.id];
                              return next;
                            });
                            toast.success('Attribution removed');
                          } catch (err) {
                            console.error('Failed to remove attribution:', err);
                            toast.error('Failed to remove attribution');
                          }
                        }}
                        className="text-xs text-red-600 hover:text-red-800 underline"
                      >
                        Remove
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Count toward:</span>
                    {asanaIntegrations.map(integration => (
                      <button
                        key={integration.id}
                        onClick={async () => {
                          if (!selectedGoogleEvent.integrationId) {
                            toast.error('Cannot attribute: missing Google integration ID');
                            return;
                          }
                          try {
                            await api.setGoogleEventAttribution(
                              selectedGoogleEvent.id,
                              selectedGoogleEvent.integrationId,
                              integration.id
                            );
                            setGoogleEventAttributions(prev => ({
                              ...prev,
                              [selectedGoogleEvent.id]: {
                                asanaIntegrationId: integration.id,
                                googleIntegrationId: selectedGoogleEvent.integrationId!,
                              },
                            }));
                            toast.success(`Event counts toward ${integration.name}`);
                          } catch (err) {
                            console.error('Failed to set attribution:', err);
                            toast.error('Failed to set attribution');
                          }
                        }}
                        className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                      >
                        {integration.name}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50">
          {isEditingGoogleEvent ? (
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditingGoogleEvent(false)}
                disabled={isSavingGoogleEvent}
                className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!selectedGoogleEvent.integrationId) {
                    toast.error('Cannot update event: missing integration ID');
                    return;
                  }
                  setIsSavingGoogleEvent(true);
                  const result = await updateGoogleEvent(
                    selectedGoogleEvent.id,
                    selectedGoogleEvent.integrationId,
                    selectedGoogleEvent.startTime,
                    selectedGoogleEvent.endTime,
                    editingGoogleEventTitle,
                    editingGoogleEventDescription,
                    selectedGoogleEvent.calendarId
                  );
                  setIsSavingGoogleEvent(false);
                  if (result.success) {
                    setSelectedGoogleEvent({
                      ...selectedGoogleEvent,
                      title: editingGoogleEventTitle,
                      description: editingGoogleEventDescription || undefined,
                    });
                    setIsEditingGoogleEvent(false);
                    toast.success('Event updated');
                  } else {
                    toast.error(result.error || 'Failed to update event');
                  }
                }}
                disabled={isSavingGoogleEvent}
                className="flex-1 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isSavingGoogleEvent ? 'Saving...' : 'Save'}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setSelectedGoogleEvent(null);
                  setIsEditingGoogleEvent(false);
                }}
                className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setEditingGoogleEventTitle(selectedGoogleEvent.title);
                  const desc = selectedGoogleEvent.description || '';
                  setEditingGoogleEventDescription(containsHtml(desc) ? htmlToReadableText(desc) : desc);
                  setIsEditingGoogleEvent(true);
                }}
                className="flex-1 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  onRequestDelete(selectedGoogleEvent);
                }}
                className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
