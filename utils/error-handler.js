/**
 * @fileoverview API error handling utilities
 * @module utils/error-handler
 */

/**
 * Handles API errors consistently
 * @param {Error} error - Error object
 * @param {import('http').ServerResponse} res - HTTP response object
 * @param {Object} fallbackResponse - Fallback response data
 * @returns {void}
 */
exports.handleApiError = (error, res, fallbackResponse) => {
  console.error('GA4 Sales API Error:', error);

  if (error.message.includes('Missing required environment variables')) {
    return res.status(500).json({ 
      error: 'Server configuration error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }

  // For other errors, return fallback response
  return res.status(200).json(fallbackResponse);
};