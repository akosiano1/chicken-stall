/**
 * Philippines timezone (UTC+8) date utility functions
 * Ensures consistent date handling across the application
 */

/**
 * Get current date in Philippines timezone as YYYY-MM-DD string
 */
export function getPHDateString(date = new Date()) {
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); // en-CA gives YYYY-MM-DD format
}

/**
 * Get current date/time in Philippines timezone as Date object
 */
export function getPHDate(date = new Date()) {
    // Convert to PH timezone by getting the date string and parsing it
    const phDateStr = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    // Parse it as local date (treating it as PH date)
    const [year, month, day] = phDateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
}

/**
 * Format date string (YYYY-MM-DD) to readable format in PH timezone
 */
export function formatPHDate(dateString, options = { weekday: 'short', month: 'short', day: 'numeric' }) {
    if (!dateString) return '';
    // Parse the date string as PH date (treat YYYY-MM-DD as PH timezone)
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { ...options, timeZone: 'Asia/Manila' });
}

/**
 * Get date string for X days ago in PH timezone
 */
export function getPHDateDaysAgo(daysAgo) {
    const now = new Date();
    const phDate = getPHDate(now);
    phDate.setDate(phDate.getDate() - daysAgo);
    return getPHDateString(phDate);
}

/**
 * Parse sale_date string (YYYY-MM-DD) and return as YYYY-MM-DD string in PH timezone
 * This ensures dates from database are treated as PH dates, not UTC
 */
export function parseSaleDate(dateString) {
    if (!dateString) return '';
    // If it's already YYYY-MM-DD format, return as is (treating it as PH date)
    if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateString)) {
        return dateString.split('T')[0]; // Remove time part if present
    }
    // Otherwise parse and convert
    const date = new Date(dateString);
    return getPHDateString(date);
}

