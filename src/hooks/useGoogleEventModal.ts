'use client';

import { useState } from 'react';
import { CalendarEvent } from '@/types';

/**
 * Groups the editing state for the Google-event detail modal: the selected
 * event, whether it's in edit mode, the draft title/description, and the
 * in-flight save flag. Home reads `selectedGoogleEvent`/`isEditing` for its
 * Escape handler and opens the modal via `setSelectedGoogleEvent`.
 */
export function useGoogleEventModal() {
  const [selectedGoogleEvent, setSelectedGoogleEvent] = useState<CalendarEvent | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  return {
    selectedGoogleEvent,
    setSelectedGoogleEvent,
    isEditing,
    setIsEditing,
    editingTitle,
    setEditingTitle,
    editingDescription,
    setEditingDescription,
    isSaving,
    setIsSaving,
  };
}
