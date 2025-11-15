/**
 * @fileoverview Date utility functions
 * @module utils/date-utils
 */

const moment = require('moment-timezone');

/**
 * Get parsed or default date range
 * @param {string} from - From date string in YYYY-MM-DD format (optional)
 * @param {string} to - To date string in YYYY-MM-DD format (optional)
 * @returns {{fromDate: string, toDate: string}} Date range in YYYY-MM-DD format
 */
const getDefaultDateRange = (from, to) => {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  const today = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 7);

  const fromDate = (from && dateRegex.test(from)) ? from : sevenDaysAgo.toISOString().split('T')[0];
  const toDate = (to && dateRegex.test(to)) ? to : today.toISOString().split('T')[0];

  return {
    fromDate,
    toDate
  };
};

/**
 * Parse date string into Date object
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Date|null} Parsed date or null if invalid
 */
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
};

/**
 * Format date to YYYY-MM-DD
 * @param {Date|string} date - Date object or valid date string
 * @returns {string} Formatted date string
 */
const formatDate = (date) => {
  if (typeof date === 'string') return date;
  return date.toISOString().split('T')[0];
};

/**
 * Get business timezone from environment variable or default to UTC
 * @param {string} [accountTimezone] - Timezone from Meta account (optional)
 * @returns {string} Business timezone (e.g., 'America/New_York')
 */
const getBusinessTimezone = (accountTimezone = null) => {
  return accountTimezone || process.env.BUSINESS_TIMEZONE || 'UTC';
};

/**
 * Convert UTC timestamp to business timezone
 * @param {string} utcTimestamp - UTC timestamp in ISO format
 * @param {string} [businessTimezone] - Business timezone (optional, defaults to env var or UTC)
 * @returns {string} Timestamp converted to business timezone in ISO format
 */
const convertToBusinessTimezone = (utcTimestamp, businessTimezone = null) => {
  if (!utcTimestamp) return utcTimestamp;

  const timezone = getBusinessTimezone(businessTimezone);

  try {
    // Parse the UTC timestamp and convert to business timezone
    const convertedTime = moment.utc(utcTimestamp).tz(timezone);
    return convertedTime.format();
  } catch (error) {
    console.error('Error converting timestamp to business timezone:', {
      utcTimestamp,
      timezone,
      error: error.message
    });
    // Return original timestamp if conversion fails
    return utcTimestamp;
  }
};

/**
 * Convert UTC date string to business timezone date string
 * @param {string} utcDateStr - UTC date string in YYYY-MM-DD format
 * @param {string} [businessTimezone] - Business timezone (optional, defaults to env var or UTC)
 * @returns {string} Date string in business timezone in YYYY-MM-DD format
 */
const convertDateToBusinessTimezone = (utcDateStr, businessTimezone = null) => {
  if (!utcDateStr) return utcDateStr;

  const timezone = getBusinessTimezone(businessTimezone);

  try {
    // Parse the UTC date and convert to business timezone
    const convertedDate = moment.utc(utcDateStr).tz(timezone);
    return convertedDate.format('YYYY-MM-DD');
  } catch (error) {
    console.error('Error converting date to business timezone:', {
      utcDateStr,
      timezone,
      error: error.message
    });
    // Return original date if conversion fails
    return utcDateStr;
  }
};

/**
 * Convert an object's timestamp fields to business timezone
 * @param {Object} obj - Object containing timestamp fields
 * @param {string[]} timestampFields - Array of field names that contain timestamps
 * @param {string} [businessTimezone] - Business timezone (optional, defaults to env var or UTC)
 * @returns {Object} Object with converted timestamps
 */
const convertObjectTimestamps = (obj, timestampFields, businessTimezone = null) => {
  if (!obj || !timestampFields || timestampFields.length === 0) return obj;

  const converted = { ...obj };
  const timezone = getBusinessTimezone(businessTimezone);

  timestampFields.forEach(field => {
    if (converted[field]) {
      converted[field] = convertToBusinessTimezone(converted[field], timezone);
    }
  });

  return converted;
};

module.exports = {
  getDefaultDateRange,
  parseDate,
  formatDate,
  getBusinessTimezone,
  convertToBusinessTimezone,
  convertDateToBusinessTimezone,
  convertObjectTimestamps
};
