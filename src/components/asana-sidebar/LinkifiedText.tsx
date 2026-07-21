'use client';

// Helper component to render text with clickable links
export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  // Regex to match URLs (http, https, or www)
  const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;

  const parts = text.split(urlRegex);
  const matches = text.match(urlRegex) || [];

  const elements: React.ReactNode[] = [];
  let matchIndex = 0;

  parts.forEach((part, index) => {
    if (part === matches[matchIndex]) {
      // This part is a URL
      const url = part.startsWith('www.') ? `https://${part}` : part;
      elements.push(
        <a
          key={index}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 hover:underline break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
      matchIndex++;
    } else if (part) {
      // Regular text
      elements.push(<span key={index}>{part}</span>);
    }
  });

  return <span className={className}>{elements}</span>;
}
