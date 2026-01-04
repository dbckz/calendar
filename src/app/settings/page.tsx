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
} from 'lucide-react';

interface SettingsState {
  googleCalendar: {
    enabled: boolean;
    connected: boolean;
    hasCredentials: boolean;
  };
  asana: {
    enabled: boolean;
    connected: boolean;
    hasCredentials: boolean;
    workspaceId?: string;
  };
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Google Calendar form
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Asana form
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

  const handleGoogleDisconnect = async () => {
    try {
      await fetch('/api/settings?integration=google', { method: 'DELETE' });
      setGoogleClientId('');
      setGoogleClientSecret('');
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

  const handleAsanaDisconnect = async () => {
    try {
      await fetch('/api/settings?integration=asana', { method: 'DELETE' });
      setAsanaClientId('');
      setAsanaClientSecret('');
      fetchSettings();
      setMessage({ type: 'success', text: 'Asana disconnected.' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to disconnect Asana.' });
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

        {/* Google Calendar */}
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
                    Sync your Google Calendar events
                  </p>
                </div>
              </div>
              {settings?.googleCalendar.connected && (
                <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                  <CheckCircle className="w-4 h-4" />
                  Connected
                </span>
              )}
            </div>
          </div>

          <div className="p-4">
            {settings?.googleCalendar.connected ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Your Google Calendar is connected and syncing events.
                </p>
                <button
                  onClick={handleGoogleDisconnect}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Disconnect
                </button>
              </div>
            ) : (
              <form onSubmit={handleGoogleConnect} className="space-y-4">
                <p className="text-sm text-gray-600 mb-4">
                  To connect Google Calendar, create OAuth credentials in the{' '}
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

                <button
                  type="submit"
                  disabled={!googleClientId || !googleClientSecret || isGoogleLoading}
                  className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isGoogleLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    'Connect Google Calendar'
                  )}
                </button>
              </form>
            )}
          </div>
        </section>

        {/* Asana */}
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
                    Sync your Asana tasks
                  </p>
                </div>
              </div>
              {settings?.asana.connected && (
                <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                  <CheckCircle className="w-4 h-4" />
                  Connected
                </span>
              )}
            </div>
          </div>

          <div className="p-4">
            {settings?.asana.connected ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Your Asana account is connected and syncing tasks.
                </p>
                <button
                  onClick={handleAsanaDisconnect}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Disconnect
                </button>
              </div>
            ) : (
              <form onSubmit={handleAsanaConnect} className="space-y-4">
                <p className="text-sm text-gray-600 mb-4">
                  To connect Asana, create an app in the{' '}
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Client ID
                  </label>
                  <input
                    type="text"
                    value={asanaClientId}
                    onChange={(e) => setAsanaClientId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder="Your Asana Client Secret"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!asanaClientId || !asanaClientSecret || isAsanaLoading}
                  className="w-full py-2 px-4 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isAsanaLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    'Connect Asana'
                  )}
                </button>
              </form>
            )}
          </div>
        </section>

        {/* About */}
        <section className="bg-white rounded-lg border shadow-sm p-4">
          <h2 className="font-semibold text-gray-900 mb-2">About Daily Planner</h2>
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
