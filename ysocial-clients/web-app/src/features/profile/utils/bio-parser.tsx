import React from "react";

/**
 * Parses biography texts, converting valid URLs starting with http:// or https:// into styled <a> links.
 * Strictly checks protocol using standard URL constructor to eliminate XSS exploits (e.g. javascript:).
 */
export function parseBio(bio?: string): React.ReactNode[] {
  if (!bio) return [];

  // Match URLs starting with HTTP/HTTPS or www.
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const parts = bio.split(urlRegex);

  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      let href = part;
      if (part.toLowerCase().startsWith("www.")) {
        href = "https://" + part;
      }

      try {
        const parsedUrl = new URL(href);
        // Strict protocol verification
        if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
          return (
            <a
              key={index}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline dark:text-blue-400 font-medium break-all transition-colors"
            >
              {part}
            </a>
          );
        }
      } catch {
        // Fall back to plain text if not a valid URL
      }
      return <span key={index}>{part}</span>;
    }
    return <span key={index}>{part}</span>;
  });
}
