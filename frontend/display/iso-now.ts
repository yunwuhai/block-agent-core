/**
 * Shared timestamp utility — deduplicates isoNow across display/ and runtime/.
 * proposal tui-002.
 */
export function isoNow(): string {
  return new Date().toISOString();
}
