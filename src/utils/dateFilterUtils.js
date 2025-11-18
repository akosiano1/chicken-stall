/**
 * Date filter utilities for consistent date range handling across the application
 * Uses Philippines timezone (UTC+8) for all date operations
 */

import { getPHDate, getPHDateString } from './dateUtils';

/**
 * Preset date range types
 */
export const DATE_PRESETS = {
  TODAY: 'today',
  YESTERDAY: 'yesterday',
  LAST_7_DAYS: 'last_7_days',
  LAST_30_DAYS: 'last_30_days',
  THIS_MONTH: 'this_month',
  LAST_MONTH: 'last_month',
  CUSTOM: 'custom',
};

/**
 * Calculate date range for a preset type
 * @param {string} preset - One of DATE_PRESETS values
 * @returns {{startDate: string, endDate: string}} - Date range in YYYY-MM-DD format
 */
export function getPresetDateRange(preset) {
  const now = getPHDate();
  const today = getPHDateString(now);

  switch (preset) {
    case DATE_PRESETS.TODAY:
      return { startDate: today, endDate: today };

    case DATE_PRESETS.YESTERDAY: {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = getPHDateString(yesterday);
      return { startDate: yesterdayStr, endDate: yesterdayStr };
    }

    case DATE_PRESETS.LAST_7_DAYS: {
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 6); // Last 7 days including today
      return {
        startDate: getPHDateString(startDate),
        endDate: today,
      };
    }

    case DATE_PRESETS.LAST_30_DAYS: {
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 29); // Last 30 days including today
      return {
        startDate: getPHDateString(startDate),
        endDate: today,
      };
    }

    case DATE_PRESETS.THIS_MONTH: {
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        startDate: getPHDateString(startDate),
        endDate: today,
      };
    }

    case DATE_PRESETS.LAST_MONTH: {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        startDate: getPHDateString(lastMonth),
        endDate: getPHDateString(lastDayOfLastMonth),
      };
    }

    default:
      return { startDate: '', endDate: '' };
  }
}

/**
 * Validate date range
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {Object} options - Validation options
 * @param {number} options.maxDays - Maximum allowed days in range (optional)
 * @param {boolean} options.allowFuture - Allow future dates (default: false)
 * @returns {{valid: boolean, error: string|null}} - Validation result
 */
export function validateDateRange(startDate, endDate, options = {}) {
  const { maxDays, allowFuture = false } = options;

  // Empty dates are valid (means no filter)
  if (!startDate && !endDate) {
    return { valid: true, error: null };
  }

  // If only one date is provided, it's valid
  if (!startDate || !endDate) {
    return { valid: true, error: null };
  }

  // Check if startDate is after endDate
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (start > end) {
    return {
      valid: false,
      error: 'Start date must be before or equal to end date',
    };
  }

  // Check maximum range
  if (maxDays) {
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end
    if (diffDays > maxDays) {
      return {
        valid: false,
        error: `Date range cannot exceed ${maxDays} days`,
      };
    }
  }

  // Check for future dates
  if (!allowFuture) {
    const today = getPHDate();
    const todayStr = getPHDateString(today);
    if (startDate > todayStr || endDate > todayStr) {
      return {
        valid: false,
        error: 'Future dates are not allowed',
      };
    }
  }

  return { valid: true, error: null };
}

/**
 * Convert date string to UTC timestamp for database queries (for timestamp columns)
 * @param {string} dateStr - Date in YYYY-MM-DD format (PH timezone)
 * @param {boolean} isEndDate - If true, sets time to 23:59:59, otherwise 00:00:00
 * @returns {string} - ISO timestamp string in UTC
 */
export function dateToUTCTimestamp(dateStr, isEndDate = false) {
  if (!dateStr) return null;

  // Parse the date as PH timezone date
  const [year, month, day] = dateStr.split('-').map(Number);
  // Create date in local timezone (treating it as PH date)
  const date = new Date(year, month - 1, day);

  if (isEndDate) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  // Convert to UTC ISO string
  return date.toISOString();
}

/**
 * Apply date range filters to a Supabase query
 * @param {Object} query - Supabase query builder
 * @param {string} dateColumn - Column name to filter on
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {boolean} isTimestamp - If true, uses UTC timestamp conversion (default: false)
 * @returns {Object} - Modified query builder
 */
export function applyDateRangeFilter(query, dateColumn, startDate, endDate, isTimestamp = false) {
  if (!query || !dateColumn) return query;

  if (startDate) {
    if (isTimestamp) {
      const startTimestamp = dateToUTCTimestamp(startDate, false);
      if (startTimestamp) {
        query = query.gte(dateColumn, startTimestamp);
      }
    } else {
      query = query.gte(dateColumn, startDate);
    }
  }

  if (endDate) {
    if (isTimestamp) {
      const endTimestamp = dateToUTCTimestamp(endDate, true);
      if (endTimestamp) {
        query = query.lte(dateColumn, endTimestamp);
      }
    } else {
      query = query.lte(dateColumn, endDate);
    }
  }

  return query;
}

/**
 * Get preset label for display
 * @param {string} preset - Preset type
 * @returns {string} - Human-readable label
 */
export function getPresetLabel(preset) {
  const labels = {
    [DATE_PRESETS.TODAY]: 'Today',
    [DATE_PRESETS.YESTERDAY]: 'Yesterday',
    [DATE_PRESETS.LAST_7_DAYS]: 'Last 7 Days',
    [DATE_PRESETS.LAST_30_DAYS]: 'Last 30 Days',
    [DATE_PRESETS.THIS_MONTH]: 'This Month',
    [DATE_PRESETS.LAST_MONTH]: 'Last Month',
    [DATE_PRESETS.CUSTOM]: 'Custom Range',
  };
  return labels[preset] || 'Custom Range';
}

