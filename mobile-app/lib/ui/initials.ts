/**
 * Avatar initials from a display name.
 *
 *   "Gigii Gi"       → "GG"  first letter of the first and last word
 *   "Mary Ann Smith" → "MS"
 *   "Viraj"          → "VJ"  one word: its first and last letter
 *   "V"              → "V"
 *   ""               → null  the caller falls back (the email's first letter)
 *
 * Must match `initialsFromName` in blacknexa-backend/src/utils/initials.util.ts,
 * which builds the initials the feed, comments and profile show: the preview
 * drawn here while someone types has to be what everyone else will see.
 * Letters are taken by code point so accented or non-Latin names stay whole.
 */
export function initialsFromName(name: string): string | null {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const first = Array.from(words[0]);
  if (words.length >= 2) {
    return (first[0] + Array.from(words[words.length - 1])[0]).toUpperCase();
  }
  return (first.length === 1 ? first[0] : first[0] + first[first.length - 1]).toUpperCase();
}
