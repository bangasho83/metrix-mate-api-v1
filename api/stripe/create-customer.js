/**
 * @fileoverview Stripe Create Customer API Endpoint
 * Creates a new customer in Stripe
 * 
 * @route POST /api/stripe/create-customer
 * @param {string} name - Customer name (required)
 * @param {string} email - Customer email (required)
 * @param {string} [description] - Customer description (optional)
 * @param {Object} [metadata] - Custom metadata (optional)
 * @param {string} [phone] - Phone number (optional)
 * @param {Object} [address] - Address object (optional)
 * 
 * @returns {Object} Created customer data with Stripe customer ID
 * 
 * @example
 * POST /api/stripe/create-customer
 * {
 *   "name": "John Doe",
 *   "email": "john@example.com",
 *   "description": "Premium customer",
 *   "metadata": {
 *     "organization_id": "org_123",
 *     "plan": "premium"
 *   },
 *   "phone": "+1234567890",
 *   "address": {
 *     "line1": "123 Main St",
 *     "city": "San Francisco",
 *     "state": "CA",
 *     "postal_code": "94102",
 *     "country": "US"
 *   }
 * }
 */

const stripeService = require('../../services/stripe-service');

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
      name,
      email,
      description,
      metadata,
      phone,
      address
    } = req.body;

    // Validate required parameters
    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid required parameter: name',
        message: 'Please provide a valid customer name'
      });
    }

    if (!email || typeof email !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid required parameter: email',
        message: 'Please provide a valid customer email'
      });
    }

    console.log('Creating Stripe customer via API:', {
      name,
      email,
      has_metadata: !!metadata,
      has_address: !!address
    });

    // Call Stripe service to create customer
    const result = await stripeService.createCustomer({
      name,
      email,
      description,
      metadata,
      phone,
      address
    });

    // Check if customer creation was successful
    if (!result.success) {
      console.error('Failed to create Stripe customer:', result.error);
      return res.status(result.status || 500).json({
        error: result.error,
        error_type: result.error_type,
        error_code: result.error_code,
        details: result.details
      });
    }

    // Return success response
    console.log('Stripe customer created successfully via API:', {
      stripe_id: result.stripe_id,
      email: result.email
    });

    return res.status(200).json({
      success: true,
      message: 'Customer created successfully',
      stripe_id: result.stripe_id,
      customer: result.data
    });

  } catch (error) {
    console.error('Stripe create customer API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

