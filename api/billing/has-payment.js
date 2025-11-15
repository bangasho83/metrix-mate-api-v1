/**
 * @fileoverview Check if Customer Has Payment Method
 * Checks if a Stripe customer has payment methods added and if one is set as default
 * 
 * @route GET /api/billing/has-payment
 * @param {string} organizationId - Organization ID (query param) - will fetch stripeCustomerId
 * OR
 * @param {string} stripeCustomerId - Stripe customer ID (query param)
 * 
 * @returns {Object} Payment method status
 * 
 * @example
 * GET /api/billing/has-payment?organizationId=org_123
 * 
 * Response:
 * {
 *   "success": true,
 *   "has_payment_method": true,
 *   "payment_methods_count": 2,
 *   "has_default_payment_method": true,
 *   "default_payment_method": {
 *     "id": "pm_123",
 *     "type": "card",
 *     "card": {
 *       "brand": "visa",
 *       "last4": "4242",
 *       "exp_month": 12,
 *       "exp_year": 2025
 *     }
 *   }
 * }
 */

const stripeService = require('../../services/stripe-service');
const { db } = require('../../services/firebase-service');

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
    const {
      organizationId,
      stripeCustomerId: providedStripeCustomerId
    } = req.query;

    let stripeCustomerId = providedStripeCustomerId;

    // If organizationId is provided, fetch stripeCustomerId from Firebase
    if (organizationId && !stripeCustomerId) {


      try {
        const orgRef = db.collection('orgs').doc(organizationId);
        const orgDoc = await orgRef.get();

        if (!orgDoc.exists) {
          return res.status(404).json({
            error: 'Organization not found',
            message: `Organization with ID ${organizationId} does not exist`
          });
        }

        const orgData = orgDoc.data();

        // Check if organization is deleted
        if (orgData.deleted === true) {
          return res.status(410).json({
            error: 'Organization has been deleted',
            organizationId,
            deletedAt: orgData.deletedAt
          });
        }

        stripeCustomerId = orgData.stripeCustomerId;

        if (!stripeCustomerId) {
          return res.status(200).json({
            success: true,
            has_payment_method: false,
            payment_methods_count: 0,
            has_default_payment_method: false,
            default_payment_method: null,
            payment_methods: [],
            message: 'Organization does not have a Stripe customer ID',
            organizationId
          });
        }



      } catch (firebaseError) {
        console.error('Firebase error:', firebaseError);
        return res.status(500).json({
          error: 'Failed to fetch organization data',
          details: firebaseError.message
        });
      }
    }

    // Validate that we have a Stripe customer ID
    if (!stripeCustomerId || typeof stripeCustomerId !== 'string') {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'Either organizationId or stripeCustomerId must be provided'
      });
    }



    // Call Stripe service to check payment methods
    const result = await stripeService.hasPaymentMethod(stripeCustomerId);

    // Check if the check was successful
    if (!result.success) {
      console.error('Failed to check payment methods:', result.error);
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
      has_payment_method: result.has_payment_method,
      payment_methods_count: result.payment_methods_count,
      has_default_payment_method: result.has_default_payment_method,
      default_payment_method_id: result.default_payment_method_id,
      default_payment_method: result.default_payment_method,
      payment_methods: result.payment_methods
    });

  } catch (error) {
    console.error('Billing has-payment API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

