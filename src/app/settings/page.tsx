'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  XCircle,
  ExternalLink,
  Loader2,
  Trash2,
  Plus,
  RefreshCw,
} from 'lucide-react';

interface IntegrationInfo {
  id: string;
  name: string;
  enabled: boolean;
  connected: boolean;
  createdAt: string;
  workspaceId?: string;
}

interface SettingsState {
  googleIntegrations: IntegrationInfo[];
  asanaIntegrations: IntegrationInfo[];
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Google Calendar form
  const [showGoogleForm, setShowGoogleForm] = useState(false);
  const [googleName, setGoogleName] = useState('');
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Asana form
  const [showAsanaForm, setShowAsanaForm] = useState(false);
  const [asanaName, setAsanaName] = useState('');
  const [asanaClientId, setAsanaClientId] = useState('');
  const [asanaClientSecret, setAsanaClientSecret] = useState('');
  const [isAsanaLoading, setIsAsanaLoading] = useState(false);

  useEffect(() => {
    fetchSettings();

    // Check for callback messages
    const success = searchParams.get('success');
    const error = searchParams.get('error');

    if (success === 'google_connected') {
      setMessage({ type: 'success', text: 'Google Calendar connected successfully!' });
    } else if (success === 'asana_connected') {
      setMessage({ type: 'success', text: 'Asana connected successfully!' });
    } else if (error) {
      const details = searchParams.get('details');
      const errorMessages: Record<string, string> = {
        google_auth_denied: 'Google Calendar authorization was denied.',
        asana_auth_denied: 'Asana authorization was denied.',
        no_code: 'Authorization code was not received.',
        no_state: 'State parameter was missing.',
        no_integration_id: 'Integration ID was missing.',
        integration_not_found: 'Integration not found.',
        token_exchange_failed: 'Failed to complete Google authorization.',
        asana_token_exchange_failed: 'Failed to complete Asana authorization.',
        no_settings: 'Settings not found. Please try again.',
      };
      let errorText = errorMessages[error] || 'An error occurred.';
      if (details) {
        errorText += ` Details: ${decodeURIComponent(details)}`;
      }
      setMessage({ type: 'error', text: errorText });
    }
  }, [searchParams]);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings(data);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGoogleLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: googleName,
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        }),
      });

      if (!res.ok) throw new Error('Failed to save credentials');

      const { authUrl } = await res.json();
      window.location.href = authUrl;
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to connect Google Calendar.' });
      setIsGoogleLoading(false);
    }
  };

  const handleGoogleReconnect = async (integrationId: string) => {
    try {
      const res = await fetch(`/api/auth/google?integrationId=${integrationId}`);
      if (!res.ok) throw new Error('Failed to get auth URL');
      const { authUrl } = await res.json();
      window.location.href = authUrl;
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to reconnect Google Calendar.' });
    }
  };

  const handleGoogleDisconnect = async (integrationId: string) => {
    try {
      await fetch(`/api/settings?integrationId=${integrationId}`, { method: 'DELETE' });
      fetchSettings();
      setMessage({ type: 'success', text: 'Google Calendar disconnected.' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to disconnect Google Calendar.' });
    }
  };

  const handleAsanaConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAsanaLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/auth/asana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: asanaName,
          clientId: asanaClientId,
          clientSecret: asanaClientSecret,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save credentials');
      }

      const { authUrl } = await res.json();
      window.location.href = authUrl;
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to connect Asana.',
      });
      setIsAsanaLoading(false);
    }
  };

  const handleAsanaReconnect = async (integrationId: string) => {
    try {
      const res = await fetch(`/api/auth/asana?integrationId=${integrationId}`);
      if (!res.ok) throw new Error('Failed to get auth URL');
      const { authUrl } = await res.json();
      window.location.href = authUrl;
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to reconnect Asana.' });
    }
  };

  const handleAsanaDisconnect = async (integrationId: string) => {
    try {
      await fetch(`/api/settings?integrationId=${integrationId}`, { method: 'DELETE' });
      fetchSettings();
      setMessage({ type: 'success', text: 'Asana disconnected.' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to disconnect Asana.' });
    }
  };

  const toggleIntegration = async (integrationId: string, enabled: boolean) => {
    try {
      await fetch('/api/integrations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: integrationId, enabled }),
      });
      fetchSettings();
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update integration.' });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {message && (
          <div
            className={`p-4 rounded-lg flex items-center gap-3 ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <p>{message.text}</p>
          </div>
        )}

        {/* Google Calendar Integrations */}
        <section className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">Google Calendar</h2>
                  <p className="text-sm text-gray-500">
                    {settings?.googleIntegrations.length || 0} integration{settings?.googleIntegrations.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowGoogleForm(!showGoogleForm)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
          </div>

          <div className="divide-y">
            {/* Existing integrations */}
            {settings?.googleIntegrations.map((integration) => (
              <div key={integration.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${integration.connected ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div>
                    <p className="font-medium text-gray-900">{integration.name}</p>
                    <p className="text-xs text-gray-500">
                      {integration.connected ? 'Connected' : 'Not connected'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {integration.connected && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={integration.enabled}
                        onChange={(e) => toggleIntegration(integration.id, e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-600">Enabled</span>
                    </label>
                  )}
                  <button
                    onClick={() => handleGoogleReconnect(integration.id)}
                    className="flex items-center gap-1.5 px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Re-authenticate with Google"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {integration.connected ? 'Re-auth' : 'Connect'}
                  </button>
                  <button
                    onClick={() => handleGoogleDisconnect(integration.id)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {/* Add new form */}
            {showGoogleForm && (
              <div className="p-4 bg-gray-50">
                <form onSubmit={handleGoogleConnect} className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Create OAuth credentials in the{' '}
                    <a
                      href="https://console.cloud.google.com/apis/credentials"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      Google Cloud Console
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={googleName}
                      onChange={(e) => setGoogleName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="e.g., Work Google, Personal"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Client ID
                    </label>
                    <input
                      type="text"
                      value={googleClientId}
                      onChange={(e) => setGoogleClientId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="your-client-id.apps.googleusercontent.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Client Secret
                    </label>
                    <input
                      type="password"
                      value={googleClientSecret}
                      onChange={(e) => setGoogleClientSecret(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="Your client secret"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={!googleName || !googleClientId || !googleClientSecret || isGoogleLoading}
                      className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isGoogleLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        'Connect'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowGoogleForm(false);
                        setGoogleName('');
                        setGoogleClientId('');
                        setGoogleClientSecret('');
                      }}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Empty state */}
            {!showGoogleForm && settings?.googleIntegrations.length === 0 && (
              <div className="p-4 text-center text-gray-500 text-sm">
                No Google Calendar integrations. Click &quot;Add&quot; to connect one.
              </div>
            )}
          </div>
        </section>

        {/* Asana Integrations */}
        <section className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="p-4 border-b bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-orange-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.782 6.782a3.782 3.782 0 1 1-7.564 0 3.782 3.782 0 0 1 7.564 0zM5.218 17.218a3.782 3.782 0 1 0 7.564 0 3.782 3.782 0 0 0-7.564 0zM12 12a3.782 3.782 0 1 0 0-7.564A3.782 3.782 0 0 0 12 12z" />
                  </svg>
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">Asana</h2>
                  <p className="text-sm text-gray-500">
                    {settings?.asanaIntegrations.length || 0} integration{settings?.asanaIntegrations.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAsanaForm(!showAsanaForm)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
          </div>

          <div className="divide-y">
            {/* Existing integrations */}
            {settings?.asanaIntegrations.map((integration) => (
              <div key={integration.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${integration.connected ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <div>
                    <p className="font-medium text-gray-900">{integration.name}</p>
                    <p className="text-xs text-gray-500">
                      {integration.connected ? 'Connected' : 'Not connected'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {integration.connected && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={integration.enabled}
                        onChange={(e) => toggleIntegration(integration.id, e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                      />
                      <span className="text-sm text-gray-600">Enabled</span>
                    </label>
                  )}
                  <button
                    onClick={() => handleAsanaReconnect(integration.id)}
                    className="flex items-center gap-1.5 px-2 py-1 text-sm text-orange-600 hover:bg-orange-50 rounded transition-colors"
                    title="Re-authenticate with Asana"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {integration.connected ? 'Re-auth' : 'Connect'}
                  </button>
                  <button
                    onClick={() => handleAsanaDisconnect(integration.id)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {/* Add new form */}
            {showAsanaForm && (
              <div className="p-4 bg-gray-50">
                <form onSubmit={handleAsanaConnect} className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Create an app in the{' '}
                    <a
                      href="https://app.asana.com/0/my-apps"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      Asana Developer Console
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>

                  {settings && settings.asanaIntegrations.length > 0 && (
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Tip: To connect a different Asana account, log out of Asana first or use an incognito window.
                    </p>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={asanaName}
                      onChange={(e) => setAsanaName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                      placeholder="e.g., Work Asana, Personal"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Client ID
                    </label>
                    <input
                      type="text"
                      value={asanaClientId}
                      onChange={(e) => setAsanaClientId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                      placeholder="Your Asana Client ID"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Client Secret
                    </label>
                    <input
                      type="password"
                      value={asanaClientSecret}
                      onChange={(e) => setAsanaClientSecret(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                      placeholder="Your Asana Client Secret"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={!asanaName || !asanaClientId || !asanaClientSecret || isAsanaLoading}
                      className="flex-1 py-2 px-4 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isAsanaLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        'Connect'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAsanaForm(false);
                        setAsanaName('');
                        setAsanaClientId('');
                        setAsanaClientSecret('');
                      }}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Empty state */}
            {!showAsanaForm && settings?.asanaIntegrations.length === 0 && (
              <div className="p-4 text-center text-gray-500 text-sm">
                No Asana integrations. Click &quot;Add&quot; to connect one.
              </div>
            )}
          </div>
        </section>

        {/* About */}
        <section className="bg-white rounded-lg border shadow-sm p-4">
          <h2 className="font-semibold text-gray-900 mb-2">About Dave&apos;s Daily Planner</h2>
          <p className="text-sm text-gray-600">
            A unified daily planner that brings together your Google Calendar events,
            Asana tasks, and ad-hoc tasks in one beautiful interface.
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Ad-hoc tasks are stored locally in your browser and do not sync across devices.
          </p>
        </section>
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}
