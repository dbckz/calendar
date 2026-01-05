'use client';

import { Check, X, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface IntegrationInfo {
  id: string;
  name: string;
  enabled: boolean;
  connected: boolean;
}

interface SettingsState {
  googleIntegrations: IntegrationInfo[];
  asanaIntegrations: IntegrationInfo[];
}

interface IntegrationStatusProps {
  settings: SettingsState;
}

export function IntegrationStatus({ settings }: IntegrationStatusProps) {
  const googleConnected = settings.googleIntegrations?.some(i => i.enabled && i.connected) ?? false;
  const asanaConnected = settings.asanaIntegrations?.some(i => i.enabled && i.connected) ?? false;

  const integrations = [
    {
      name: 'Google Calendar',
      connected: googleConnected,
      count: settings.googleIntegrations?.filter(i => i.enabled && i.connected).length ?? 0,
    },
    {
      name: 'Asana',
      connected: asanaConnected,
      count: settings.asanaIntegrations?.filter(i => i.enabled && i.connected).length ?? 0,
    },
  ];

  const connectedCount = integrations.filter(i => i.connected).length;

  // Hide if at least one integration is connected
  if (connectedCount >= 1) {
    return null;
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h3 className="font-medium text-amber-800">Connect your integrations</h3>
          <p className="text-sm text-amber-700 mt-1">
            Link your calendars and task managers to see all your events in one place.
          </p>
          <div className="flex items-center gap-4 mt-3">
            {integrations.map(integration => (
              <div key={integration.name} className="flex items-center gap-2 text-sm">
                {integration.connected ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <X className="w-4 h-4 text-gray-400" />
                )}
                <span
                  className={
                    integration.connected
                      ? 'text-green-700'
                      : 'text-gray-500'
                  }
                >
                  {integration.name}
                </span>
              </div>
            ))}
          </div>
        </div>
        <Link
          href="/settings"
          className="flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-800"
        >
          Settings
          <ExternalLink className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
