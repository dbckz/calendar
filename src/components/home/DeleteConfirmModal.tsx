'use client';

import { CalendarEvent } from '@/types';

interface DeleteConfirmModalProps {
  event: CalendarEvent;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmModal({ event, onCancel, onConfirm }: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Event</h3>
        <p className="text-sm text-gray-600 mb-4">
          Are you sure you want to delete &quot;{event.title}&quot;?
          {event.source === 'google' && (
            <span className="block mt-2 text-amber-600">
              This will also delete the event from Google Calendar.
            </span>
          )}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
