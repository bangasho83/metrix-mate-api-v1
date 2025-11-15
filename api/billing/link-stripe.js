/**
 * @fileoverview Link Stripe to Metronome Customer
 * Links an existing Stripe customer to a Metronome customer for billing
 * 
 * @route POST /api/billing/link-stripe
 * @param {string} organizationId - Organization ID (required)
 * 
 * @returns {Object} Result of linking operation
 */

const metronomeService = require('../../services/metronome-service');
const { db } = require('../../services/firebase-service');

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
    const { organizationId } = req.body;

    // Validate required parameter
    if (!organizationId || typeof organizationId !== 'string') {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'organizationId is required'
      });
    }



    // Get organization data
    const orgRef = db.collection('orgs').doc(organizationId);
    const orgDoc = await orgRef.get();

    if (!orgDoc.exists) {
      return res.status(404).json({
        error: 'Organization not found',
        message: `Organization with ID ${organizationId} does not exist`
      });
    }

    const orgData = orgDoc.data();

    // Check if organization has both IDs
    const billingCustomerId = orgData.billingCustomerId;
    const stripeCustomerId = orgData.stripeCustomerId;

    if (!billingCustomerId) {
      return res.status(400).json({
        error: 'No Metronome customer',
        message: 'This organization does not have a Metronome customer ID',
        organizationId
      });
    }

    if (!stripeCustomerId) {
      return res.status(400).json({
        error: 'No Stripe customer',
        message: 'This organization does not have a Stripe customer ID',
        organizationId
      });
    }



    // Link Stripe to Metronome
    const linkResult = await metronomeService.addStripeBillingProvider(
      billingCustomerId,
      stripeCustomerId
    );

    if (!linkResult.success) {
      return res.status(linkResult.status || 500).json({
        error: 'Failed to link Stripe to Metronome',
        details: linkResult.error,
        metronome_details: linkResult.details
      });
    }

    // Get the customer's active contract to add billing provider configuration
    const contractsResult = await metronomeService.listContracts(billingCustomerId);

    if (contractsResult.success && contractsResult.contracts.length > 0) {
      // Find the most recent active contract
      const activeContract = contractsResult.contracts[0]; // Metronome returns most recent first

      if (activeContract && activeContract.id) {
        // Add billing provider configuration to the contract
        const billingConfigResult = await metronomeService.addBillingProviderToContract(
          billingCustomerId,
          activeContract.id
        );

        // Note: We don't fail the entire operation if this fails,
        // as customer-level billing provider is already configured
        if (!billingConfigResult.success) {
          console.error('❌ Failed to add billing provider to contract (non-fatal):', {
            customer_id: billingCustomerId,
            contract_id: activeContract.id,
            error: billingConfigResult.error,
            details: billingConfigResult.details
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Stripe billing provider linked to Metronome customer',
      organizationId,
      billingCustomerId,
      stripeCustomerId
    });

  } catch (error) {
    console.error('Billing link-stripe API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};
