'use client';

import { useState, memo } from 'react';

// Curated emoji categories for task types
const EMOJI_CATEGORIES = {
  'Activities': ['🏃', '🚴', '🏋️', '🧘', '🎯', '📝', '✍️', '📖', '💻', '🎮', '🎬', '🎵', '🎨', '📸', '🧩'],
  'Travel': ['✈️', '🚂', '🚗', '🚌', '🚕', '🛫', '🚶', '🏨', '🗺️', '🧳', '⛽', '🚲'],
  'Work': ['💼', '📧', '📞', '📊', '📈', '💰', '🏢', '👔', '📋', '📁', '🗂️', '📌', '✅', '⏰'],
  'Health': ['💊', '🏥', '🩺', '💪', '🧠', '😴', '🥗', '💧', '🧘', '❤️'],
  'Home': ['🏠', '🛒', '🧹', '🍳', '🛠️', '🪴', '🐕', '🐈', '👶', '👨‍👩‍👧'],
  'Social': ['👥', '🎉', '🎂', '🍽️', '☕', '🍺', '💬', '📱', '💌', '🤝'],
  'Learning': ['📚', '🎓', '✏️', '📝', '🔬', '🧪', '🌐', '💡', '🤔', '📖'],
  'Nature': ['☀️', '🌙', '⭐', '🌈', '🌊', '🏔️', '🌲', '🌸', '🍀', '🔥'],
};

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  selectedEmoji?: string;
}

export const EmojiPicker = memo(function EmojiPicker({ onSelect, selectedEmoji }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState<string>('Activities');

  const categories = Object.keys(EMOJI_CATEGORIES);

  return (
    <div className="w-full">
      {/* Category tabs */}
      <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
        {categories.map(category => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveCategory(category)}
            className={`px-2 py-1 text-xs rounded whitespace-nowrap transition-colors ${
              activeCategory === category
                ? 'bg-purple-100 text-purple-700'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div className="grid grid-cols-8 gap-1">
        {EMOJI_CATEGORIES[activeCategory as keyof typeof EMOJI_CATEGORIES].map(emoji => (
          <button
            key={emoji}
            type="button"
            onClick={() => onSelect(emoji)}
            className={`w-8 h-8 flex items-center justify-center text-lg rounded hover:bg-gray-100 transition-colors ${
              selectedEmoji === emoji ? 'bg-purple-100 ring-2 ring-purple-400' : ''
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
});
