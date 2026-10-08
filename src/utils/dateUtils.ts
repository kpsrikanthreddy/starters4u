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
  dateString?: string | number | Date | null,
  timeZone: string = DEFAULT_RESTAURANT_TIMEZONE
): string {
  if (!dateString) return '—';

  try {
    let d: Date;
    if (dateString instanceof Date) {
      d = dateString;
    } else if (typeof dateString === 'number') {
      d = new Date(dateString);
    } else if (typeof dateString === 'string') {
      const num = Number(dateString);
      d = !isNaN(num) && /^\d+$/.test(dateString) ? new Date(num) : new Date(dateString);
    } else {
      return '—';
    }

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
 * Format timestamp in restaurant timezone for compact table column displaying date only:
 * Example: "1 Oct"
 */
export function formatOrderDateOnly(
  dateString?: string | number | Date | null,
  timeZone: string = DEFAULT_RESTAURANT_TIMEZONE
): string {
  if (!dateString) return '—';

  try {
    let d: Date;
    if (dateString instanceof Date) {
      d = dateString;
    } else if (typeof dateString === 'number') {
      d = new Date(dateString);
    } else if (typeof dateString === 'string') {
      const num = Number(dateString);
      d = !isNaN(num) && /^\d+$/.test(dateString) ? new Date(num) : new Date(dateString);
    } else {
      return '—';
    }

    if (isNaN(d.getTime())) return '—';

    // Format: Day Month in configured timezone (date only, no time)
    const formatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: timeZone || DEFAULT_RESTAURANT_TIMEZONE,
      day: 'numeric',
      month: 'short',
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
  dateString?: string | number | Date | null,
  timeZone: string = DEFAULT_RESTAURANT_TIMEZONE
): string {
  if (!dateString) return '—';

  try {
    let d: Date;
    if (dateString instanceof Date) {
      d = dateString;
    } else if (typeof dateString === 'number') {
      d = new Date(dateString);
    } else if (typeof dateString === 'string') {
      const num = Number(dateString);
      d = !isNaN(num) && /^\d+$/.test(dateString) ? new Date(num) : new Date(dateString);
    } else {
      return '—';
    }

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
