'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppSettings } from '@/types';
import { getSettings, saveSettings, defaultSettings } from '@/lib/storage';

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setSettingsState(getSettings());
    setIsLoaded(true);
  }, []);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettingsState(prev => {
      const newSettings = { ...prev, ...updates };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateGoogleSettings = useCallback((updates: Partial<AppSettings['googleCalendar']>) => {
    setSettingsState(prev => {
      const newSettings = {
        ...prev,
        googleCalendar: { ...prev.googleCalendar, ...updates },
      };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateAsanaSettings = useCallback((updates: Partial<AppSettings['asana']>) => {
    setSettingsState(prev => {
      const newSettings = {
        ...prev,
        asana: { ...prev.asana, ...updates },
      };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  return {
    settings,
    isLoaded,
    updateSettings,
    updateGoogleSettings,
    updateAsanaSettings,
  };
}
