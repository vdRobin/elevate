const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

/**
 * Escape text before placing it in HTML that is rendered as trusted (e.g. dialog title/content bound with
 * bypassSecurityTrustHtml). Use it for any value that comes from data or errors, never for static markup.
 */
export const escapeHtml = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).replace(/[&<>"']/g, char => HTML_ESCAPES[char]);
};
