/**
 * @fileoverview Add Contract to Metronome Customer
 * Creates a contract for a customer in Metronome
 *
 * @route POST /api/billing/add-contract
 * @param {string} organizationId - Organization ID (required - only parameter needed!)
 *
 * The endpoint automatically:
 * - Fetches customer_id from organizationId
 * - Uses default rate_card_id from environment
 * - Sets starting_at to now
 * - Sets ending_before to 1 year from now
 * - Gets existing contract and sets transition.from_contract_id
 * - Uses default billing_provider_configuration for Stripe
 * - Uses default recurring_commits configuration
 *
 * @returns {Object} Contract creation result
 */

const metronomeService = require('../../services/metronome-service');
const { db } = require('../../services/firebase-service');
const { METRONOME_IDS } = require('../../constants/metronome-config');

// Use centralized Metronome configuration
const DEFAULT_RATE_CARD_ID = METRONOME_IDS.RATE_CARD_ID;
const DEFAULT_PRODUCT_ID = METRONOME_IDS.PRODUCT_ID;
const DEFAULT_ACCESS_CREDIT_TYPE_ID = METRONOME_IDS.CREDIT_TYPE_ID;
const DEFAULT_INVOICE_CREDIT_TYPE_ID = METRONOME_IDS.INVOICE_CREDIT_TYPE_ID;

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
    if (!organizationId) {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'organizationId is required'
      });
    }

    console.log('Fetching organization data for:', organizationId);

    // 1. Fetch customer_id from Firebase
    const orgRef = db.collection('orgs').doc(organizationId);
    const orgDoc = await orgRef.get();

    if (!orgDoc.exists) {
      return res.status(404).json({
        error: 'Organization not found',
        message: `Organization with ID ${organizationId} does not exist`
      });
    }

    const orgData = orgDoc.data();
    const customer_id = orgData.billingCustomerId;

    if (!customer_id) {
      return res.status(400).json({
        error: 'No Metronome customer',
        message: 'This organization does not have a Metronome customer ID',
        organizationId
      });
    }



    // 2. Set starting_at to now (on hour boundary) and ending_before to 1 year from now
    const now = new Date();
    // Round to the nearest hour boundary for Metronome requirement
    now.setMinutes(0, 0, 0);
    const starting_at = now.toISOString();
    const oneYearFromNow = new Date(now);
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    const ending_before = oneYearFromNow.toISOString();



    // 3. Get existing contracts to find the free trial contract to upgrade
    const existingContractsResult = await metronomeService.listContracts(customer_id);

    let contract_id = null;
    if (existingContractsResult.success && existingContractsResult.contracts.length > 0) {
      // Get the most recent contract (the free trial contract to upgrade)
      contract_id = existingContractsResult.contracts[0].id;
    } else {
      return res.status(404).json({
        error: 'No existing contract found to upgrade',
        customer_id
      });
    }

    // 4. Build the contract edit payload to upgrade free trial to paid
    const contractEditData = {
      customer_id,
      contract_id,
      add_recurring_commits: [
        {
          product_id: DEFAULT_PRODUCT_ID,
          access_amount: {
            credit_type_id: DEFAULT_ACCESS_CREDIT_TYPE_ID,
            unit_price: 10000,
            quantity: 1
          },
          invoice_amount: {
            credit_type_id: DEFAULT_INVOICE_CREDIT_TYPE_ID,
            unit_price: 5000,
            quantity: 1
          },
          priority: 1,
          recurrence_frequency: 'MONTHLY',
          commit_duration: {
            value: 1,
            unit: 'periods'
          },
          starting_at
        }
      ]
    };



    // 5. Edit the contract to upgrade it
    const result = await metronomeService.editContract(contractEditData);

    if (!result.success) {
      return res.status(result.status || 500).json({
        error: 'Failed to upgrade contract',
        details: result.error,
        metronome_details: result.details
      });
    }

    // 6. Contract upgrade complete
    // Note: Customer-level Stripe billing provider should be sufficient for top-ups

    return res.status(200).json({
      success: true,
      message: 'Contract upgraded successfully',
      organizationId,
      customer_id,
      contract_id,
      starting_at,
      ending_before,
      recurring_commits_added: true,
      data: result.data
    });

  } catch (error) {
    console.error('Billing add-contract API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

