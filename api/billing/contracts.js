/**
 * @fileoverview Get Active Contracts for Customer
 * Lists contracts for a customer in Metronome
 * 
 * @route GET /api/billing/contracts
 * @param {string} organizationId - Organization ID (query param, optional - will fetch customer_id)
 * OR
 * @param {string} customerId - Metronome customer ID (query param, optional)
 * @param {string} coveringDate - Optional date to check contracts at (ISO 8601 format, defaults to now)
 * 
 * @returns {Object} List of contracts
 */

const metronomeService = require('../../services/metronome-service');
const { db } = require('../../services/firebase-service');

// In-memory cache for billing customer IDs
const BILLING_CACHE = {
  data: {},
  ts: {},
  TTL: 1 * 60 * 1000  // 1 minute
};

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
    const { organizationId, customerId, coveringDate } = req.query;

    let customer_id = customerId;

    // If organizationId provided, fetch customer_id from Firebase
    if (organizationId && !customer_id) {
      console.log('Fetching Metronome customer ID for organization:', organizationId);

      // Check cache first
      const now = Date.now();
      const cachedId = BILLING_CACHE.data[organizationId];
      const cachedTs = BILLING_CACHE.ts[organizationId];

      if (cachedId && cachedTs && (now - cachedTs < BILLING_CACHE.TTL)) {
        console.log('Using cached billing customer ID:', cachedId);
        customer_id = cachedId;
      } else {
        // Fetch from Firestore
        const orgRef = db.collection('orgs').doc(organizationId);
        const orgDoc = await orgRef.get();

        if (!orgDoc.exists) {
          return res.status(404).json({
            error: 'Organization not found',
            message: `Organization with ID ${organizationId} does not exist`
          });
        }

        const orgData = orgDoc.data();
        customer_id = orgData.billingCustomerId;

        if (!customer_id) {
          return res.status(400).json({
            error: 'No Metronome customer',
            message: 'This organization does not have a Metronome customer ID',
            organizationId
          });
        }

        // Cache the billing customer ID (only if it exists)
        BILLING_CACHE.data[organizationId] = customer_id;
        BILLING_CACHE.ts[organizationId] = now;

        console.log('Found Metronome customer ID:', customer_id);
      }
    }

    // Validate customer_id is present
    if (!customer_id) {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'Either organizationId or customerId must be provided'
      });
    }

    console.log('Fetching contracts for customer:', {
      customer_id,
      coveringDate: coveringDate || 'now'
    });

    // Get contracts from Metronome
    const result = await metronomeService.listContracts(customer_id, coveringDate);

    if (!result.success) {
      // If 404, it means no contracts exist - return empty array instead of error
      if (result.status === 404) {
        return res.status(200).json({
          success: true,
          customer_id,
          contracts: [],
          count: 0,
          data: [],
          message: 'No contracts found for this customer'
        });
      }
      return res.status(result.status || 500).json({
        error: 'Failed to fetch contracts',
        details: result.error,
        metronome_details: result.details
      });
    }



    return res.status(200).json({
      success: true,
      customer_id,
      contracts: result.contracts,
      count: result.count,
      data: result.data
    });

  } catch (error) {
    console.error('Billing contracts API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

