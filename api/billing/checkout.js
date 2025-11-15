/**
 * @fileoverview Stripe Checkout Session API Endpoint
 * Creates a Stripe checkout session for payment method setup
 * 
 * @route POST /api/billing/checkout
 * @param {string} organizationId - Organization ID (required) - will fetch stripeCustomerId
 * OR
 * @param {string} stripeCustomerId - Stripe customer ID (optional - if provided, skips org lookup)
 * @param {string} [successUrl] - URL to redirect after successful setup
 * @param {string} [cancelUrl] - URL to redirect if user cancels
 * @param {string} [mode] - Session mode: 'setup', 'payment', or 'subscription' (default: 'setup')
 * @param {string} [currency] - Currency code (default: 'usd')
 * @param {Object} [metadata] - Optional metadata
 * 
 * @returns {Object} Checkout session data with URL
 * 
 * @example
 * POST /api/billing/checkout
 * {
 *   "organizationId": "org-123",
 *   "successUrl": "https://myapp.com/billing/success?session_id={CHECKOUT_SESSION_ID}",
 *   "cancelUrl": "https://myapp.com/billing/cancel",
 *   "mode": "setup",
 *   "currency": "usd"
 * }
 */

const stripeService = require('../../services/stripe-service');
const { db } = require('../../services/firebase-service');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'This endpoint only accepts POST requests'
    });
  }

  try {
    // Extract parameters from request body
    const {
      organizationId,
      stripeCustomerId: providedStripeCustomerId,
      successUrl,
      cancelUrl,
      mode,
      currency,
      metadata
    } = req.body;

    let stripeCustomerId = providedStripeCustomerId;

    // If organizationId is provided, fetch stripeCustomerId from Firebase
    if (organizationId && !stripeCustomerId) {
      console.log('Fetching Stripe customer ID for organization:', organizationId);

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
          return res.status(400).json({
            error: 'No Stripe customer found for this organization',
            message: 'This organization does not have a Stripe customer ID. Please create one first.',
            organizationId
          });
        }

        console.log('Found Stripe customer ID:', {
          organizationId,
          stripeCustomerId
        });

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

    console.log('Creating checkout session for customer:', stripeCustomerId);

    // Prepare metadata
    const sessionMetadata = {
      ...metadata,
      organization_id: organizationId || metadata?.organization_id || ''
    };

    // Call Stripe service to create checkout session
    const result = await stripeService.createCheckoutSession({
      customer_id: stripeCustomerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      mode: mode || 'setup',
      currency: currency || 'usd',
      metadata: sessionMetadata
    });

    // Check if checkout session creation was successful
    if (!result.success) {
      console.error('Failed to create checkout session:', result.error);
      return res.status(result.status || 500).json({
        error: result.error,
        error_type: result.error_type,
        error_code: result.error_code,
        details: result.details
      });
    }

    // Return success response
    console.log('Checkout session created successfully:', {
      session_id: result.session_id,
      customer: result.customer,
      url: result.url
    });

    return res.status(200).json({
      success: true,
      message: 'Checkout session created successfully',
      session_id: result.session_id,
      url: result.url,
      customer: result.customer,
      mode: result.mode,
      status: result.status,
      data: result.data
    });

  } catch (error) {
    console.error('Billing checkout API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

