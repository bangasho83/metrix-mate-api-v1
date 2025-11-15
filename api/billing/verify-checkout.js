/**
 * @fileoverview Verify Checkout Session and Link Stripe to Metronome
 * Called after user completes Stripe checkout to link billing providers
 * 
 * @route POST /api/billing/verify-checkout
 * @param {string} sessionId - Stripe checkout session ID (required)
 * OR
 * @param {string} organizationId - Organization ID (required)
 * 
 * @returns {Object} Verification result and payment method status
 */

const stripeService = require('../../services/stripe-service');
const metronomeService = require('../../services/metronome-service');
const { db } = require('../../services/firebase-service');
const axios = require('axios');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_API_URL = 'https://api.stripe.com/v1';
const METRONOME_DELIVERY_METHOD_ID = '5d3b306a-785b-4538-843b-2c4500a7cb88';

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
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
    const { sessionId, organizationId } = req.body;

    let stripeCustomerId = null;
    let billingCustomerId = null;
    let orgId = organizationId;

    // If sessionId provided, get customer from session
    if (sessionId) {
      console.log('Verifying checkout session:', sessionId);

      // Get session from Stripe
      const sessionResponse = await axios.get(
        `${STRIPE_API_URL}/checkout/sessions/${sessionId}`,
        {
          headers: {
            'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 30000
        }
      );

      const session = sessionResponse.data;
      stripeCustomerId = session.customer;

      console.log('Checkout session retrieved:', {
        session_id: sessionId,
        customer: stripeCustomerId,
        status: session.status,
        mode: session.mode
      });

      if (session.status !== 'complete') {
        return res.status(400).json({
          error: 'Checkout not complete',
          message: 'The checkout session has not been completed yet',
          status: session.status
        });
      }

      // Find organization by Stripe customer ID
      const orgsSnapshot = await db.collection('orgs')
        .where('stripeCustomerId', '==', stripeCustomerId)
        .limit(1)
        .get();

      if (orgsSnapshot.empty) {
        return res.status(404).json({
          error: 'Organization not found',
          message: 'No organization found for this Stripe customer',
          stripeCustomerId
        });
      }

      const orgDoc = orgsSnapshot.docs[0];
      orgId = orgDoc.id;
      const orgData = orgDoc.data();
      billingCustomerId = orgData.billingCustomerId;
      stripeCustomerId = orgData.stripeCustomerId;

    } else if (organizationId) {
      // Get organization data
      console.log('Verifying organization:', organizationId);

      const orgRef = db.collection('orgs').doc(organizationId);
      const orgDoc = await orgRef.get();

      if (!orgDoc.exists) {
        return res.status(404).json({
          error: 'Organization not found',
          message: `Organization with ID ${organizationId} does not exist`
        });
      }

      const orgData = orgDoc.data();
      billingCustomerId = orgData.billingCustomerId;
      stripeCustomerId = orgData.stripeCustomerId;

    } else {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'Either sessionId or organizationId must be provided'
      });
    }

    // Validate we have both IDs
    if (!billingCustomerId) {
      return res.status(400).json({
        error: 'No Metronome customer',
        message: 'This organization does not have a Metronome customer ID',
        organizationId: orgId
      });
    }

    if (!stripeCustomerId) {
      return res.status(400).json({
        error: 'No Stripe customer',
        message: 'This organization does not have a Stripe customer ID',
        organizationId: orgId
      });
    }

    // Check if customer has payment methods
    const hasPaymentResult = await stripeService.hasPaymentMethod(stripeCustomerId);

    if (!hasPaymentResult.success) {
      return res.status(500).json({
        error: 'Failed to check payment methods',
        details: hasPaymentResult.error
      });
    }

    if (!hasPaymentResult.has_payment_method) {
      return res.status(400).json({
        error: 'No payment method',
        message: 'Customer does not have any payment methods added',
        organizationId: orgId,
        stripeCustomerId
      });
    }

    // Set default payment method if available
    if (hasPaymentResult.default_payment_method_id) {
      try {
        console.log('Setting payment method as default:', {
          customer: stripeCustomerId,
          payment_method: hasPaymentResult.default_payment_method_id
        });

        await axios.post(
          `${STRIPE_API_URL}/customers/${stripeCustomerId}`,
          new URLSearchParams({
            'invoice_settings[default_payment_method]': hasPaymentResult.default_payment_method_id
          }).toString(),
          {
            headers: {
              'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 30000
          }
        );

        console.log('✅ Payment method set as default:', hasPaymentResult.default_payment_method_id);
      } catch (error) {
        console.error('Failed to set default payment method:', error.message);
      }
    }

    // Log the curl command for testing
    const curlCommand = `curl -X POST https://api.metronome.com/v1/setCustomerBillingProviderConfigurations \\
  -H "Authorization: Bearer ${process.env.METRONOME_API_KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{
  "data": [
    {
      "customer_id": "${billingCustomerId}",
      "billing_provider": "stripe",
      "configuration": {
        "stripe_customer_id": "${stripeCustomerId}",
        "stripe_collection_method": "charge_automatically"
      },
      "delivery_method": "direct_to_billing_provider"
    }
  ]
}'`;

    console.log('\n📋 METRONOME LINK CURL COMMAND:');
    console.log('================================');
    console.log(curlCommand);
    console.log('================================\n');

    // Link Stripe to Metronome (without delivery_method_id)
    const linkResult = await metronomeService.addStripeBillingProvider(
      billingCustomerId,
      stripeCustomerId
    );

    if (!linkResult.success) {
      console.error('❌ Failed to link Stripe to Metronome:', linkResult.error);
      console.error('Details:', linkResult.details);
      return res.status(linkResult.status || 500).json({
        error: 'Failed to link Stripe to Metronome',
        details: linkResult.error,
        metronome_details: linkResult.details
      });
    }

    console.log('✅ Successfully linked Stripe to Metronome:', {
      organizationId: orgId,
      billingCustomerId,
      stripeCustomerId
    });

    return res.status(200).json({
      success: true,
      message: 'Checkout verified and Stripe linked to Metronome',
      organizationId: orgId,
      billingCustomerId,
      stripeCustomerId,
      deliveryMethodId: METRONOME_DELIVERY_METHOD_ID,
      payment_method: hasPaymentResult.default_payment_method,
      has_payment_method: hasPaymentResult.has_payment_method,
      payment_methods_count: hasPaymentResult.payment_methods_count
    });

  } catch (error) {
    console.error('Billing verify-checkout API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      details: error.response?.data || null
    });
  }
};

