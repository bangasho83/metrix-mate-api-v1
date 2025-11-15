/**
 * @fileoverview Get Payment Method Information
 * Retrieves detailed information about a specific payment method
 * 
 * @route GET /api/billing/payment-info
 * @param {string} paymentMethodId - Payment method ID (query param) - required
 * 
 * @returns {Object} Payment method details including card information
 * 
 * @example
 * GET /api/billing/payment-info?paymentMethodId=pm_1ABC123
 * 
 * Response:
 * {
 *   "success": true,
 *   "payment_method_id": "pm_1ABC123",
 *   "type": "card",
 *   "card": {
 *     "brand": "visa",
 *     "last4": "4242",
 *     "exp_month": 12,
 *     "exp_year": 2025,
 *     "funding": "credit",
 *     "country": "US"
 *   },
 *   "customer": "cus_ABC123",
 *   "billing_details": {
 *     "name": "John Doe",
 *     "email": "john@example.com"
 *   }
 * }
 */

const stripeService = require('../../services/stripe-service');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'This endpoint only accepts GET requests'
    });
  }

  try {
    // Extract parameters from query string
    const { paymentMethodId } = req.query;

    // Validate required parameter
    if (!paymentMethodId || typeof paymentMethodId !== 'string') {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'paymentMethodId is required'
      });
    }



    // Call Stripe service to get payment method
    const result = await stripeService.getPaymentMethod(paymentMethodId);

    // Check if the request was successful
    if (!result.success) {
      console.error('Failed to get payment method:', result.error);
      return res.status(result.status || 500).json({
        error: result.error,
        error_type: result.error_type,
        error_code: result.error_code,
        details: result.details
      });
    }

    // Return success response

    return res.status(200).json({
      success: true,
      payment_method_id: result.payment_method_id,
      type: result.type,
      card: result.card,
      customer: result.customer,
      created: result.created,
      billing_details: result.billing_details,
      data: result.data
    });

  } catch (error) {
    console.error('Billing payment-info API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

