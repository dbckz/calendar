'use client';

interface CalendarSelectionModalProps {
  integrations: { id: string; name: string }[];
  onSelect: (integrationId: string) => void;
  onCancel: () => void;
}

export function CalendarSelectionModal({ integrations, onSelect, onCancel }: CalendarSelectionModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Calendar</h3>
        <p className="text-sm text-gray-600 mb-4">Choose which Google Calendar to add this event to:</p>
        <div className="space-y-2">
          {integrations.map(integration => (
            <button
              key={integration.id}
              onClick={() => onSelect(integration.id)}
              className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              <span className="font-medium text-gray-900">{integration.name}</span>
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="mt-4 w-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
