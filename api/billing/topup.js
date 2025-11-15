/**
 * @fileoverview Top Up Credits for Metronome Customer
 * Adds prepaid credits to a customer's contract
 *
 * @route POST /api/billing/topup
 * @param {string} organizationId - Organization ID (required)
 * @param {number} amount - Amount in CENTS to charge (required)
 *
 * The endpoint automatically:
 * - Fetches customer_id from organizationId
 * - Gets the active contract_id from Metronome
 * - Calculates credits (amount_in_cents * 2)
 * - Converts amount to dollars for invoice (amount_in_cents / 100)
 * - Sets starting_at to now (hour boundary)
 * - Sets ending_before to 1 year from now
 * - Uses Stripe payment intent for payment
 *
 * @returns {Object} Top-up result
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
    const { organizationId, amount } = req.body;

    // Validate required parameters
    if (!organizationId) {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'organizationId is required'
      });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({
        error: 'Invalid parameter',
        message: 'amount must be a positive number (in cents)'
      });
    }



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

    // 2. Get the active contract_id from Metronome
    const contractsResult = await metronomeService.listContracts(customer_id);

    if (!contractsResult.success || contractsResult.contracts.length === 0) {
      return res.status(404).json({
        error: 'No active contract',
        message: 'No active contract found for this customer',
        customer_id
      });
    }

    // Find the active contract that can be edited
    const contracts = contractsResult.contracts;

    // Find the contract that is NOT transitioned (can be edited)
    // Transitioned contracts are the "from_contract_id" in transitions
    // We want the contract that is NOT referenced as "from_contract_id"
    const transitionedContractIds = new Set();
    contracts.forEach(contract => {
      if (contract.transitions && contract.transitions.length > 0) {
        contract.transitions.forEach(transition => {
          if (transition.from_contract_id) {
            transitionedContractIds.add(transition.from_contract_id);
          }
        });
      }
    });

    const activeContracts = contracts.filter(c => !transitionedContractIds.has(c.id));

    if (activeContracts.length === 0) {
      return res.status(404).json({
        error: 'No active contract found',
        message: 'All contracts are transitioned and cannot be edited',
        customer_id,
        contracts: contracts.map(c => ({ id: c.id, has_transition: !!c.transition }))
      });
    }

    // Use the most recent active contract
    const sortedActiveContracts = [...activeContracts].sort((a, b) => {
      return new Date(b.starting_at) - new Date(a.starting_at);
    });

    const contract_id = sortedActiveContracts[0].id;

    // 3. Top up credits
    const credits = amount * 2;

    const result = await metronomeService.topUpCredits(customer_id, contract_id, amount);

    if (!result.success) {
      return res.status(result.status || 500).json({
        error: 'Failed to top up credits',
        details: result.error,
        metronome_details: result.details
      });
    }



    return res.status(200).json({
      success: true,
      message: 'Credits topped up successfully',
      organizationId,
      customer_id,
      contract_id,
      amount_charged_cents: amount,
      amount_charged_dollars: amount / 100,
      credits_added: credits,
      data: result.data
    });

  } catch (error) {
    console.error('Billing topup API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

