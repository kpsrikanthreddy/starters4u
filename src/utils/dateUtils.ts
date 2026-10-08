/**
 * Utility functions for formatting order dates and timestamps
 * according to the restaurant's configured timezone (e.g. 'Asia/Kolkata' for IST).
 */

export const DEFAULT_RESTAURANT_TIMEZONE = 'Asia/Kolkata';

/**
 * Format timestamp in restaurant timezone for compact table column display:
 * Example: "29 Sep, 6:25 PM"
 */
export function formatOrderDateTime(
  dateString?: string | Date | null,
  timeZone: string = DEFAULT_RESTAURANT_TIMEZONE
): string {
  if (!dateString) return '—';

  try {
    const d = typeof dateString === 'string' ? new Date(dateString) : dateString;
    if (isNaN(d.getTime())) return '—';

    // Format: Day Month, Hour:Minute AM/PM in configured timezone
    const formatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: timeZone || DEFAULT_RESTAURANT_TIMEZONE,
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    return formatter.format(d);
  } catch (err) {
    return '—';
  }
}

/**
 * Format timestamp in restaurant timezone for detailed modal display:
 * Example: "29 Sep 2026, 6:25 PM"
 */
export function formatOrderDateTimeLong(
  dateString?: string | Date | null,
  timeZone: string = DEFAULT_RESTAURANT_TIMEZONE
): string {
  if (!dateString) return '—';

  try {
    const d = typeof dateString === 'string' ? new Date(dateString) : dateString;
    if (isNaN(d.getTime())) return '—';

    const formatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: timeZone || DEFAULT_RESTAURANT_TIMEZONE,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    return formatter.format(d);
  } catch (err) {
    return '—';
  }
}
