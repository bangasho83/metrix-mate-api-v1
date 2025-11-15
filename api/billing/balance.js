/**
 * @fileoverview Billing Balance API - Get customer credit balance from Metronome
 * Endpoint: GET /api/billing/balance?organizationId=ORG_ID
 */

// Vercel function config (CJS)
module.exports.config = { maxDuration: 30 };

const { withLogging } = require('../../utils/logging.cjs.js');
const { db } = require('../../services/firebase-service');
const metronomeService = require('../../services/metronome-service');

// In-memory cache for billingCustomerId lookups (1 minute TTL)
const BILLING_CACHE = {
  data: {},      // { organizationId: billingCustomerId }
  ts: {},        // { organizationId: timestamp }
  TTL: 1 * 60 * 1000  // 1 minute
};

/**
 * Get billingCustomerId for an organization with caching
 * @param {string} organizationId - The organization ID
 * @returns {Promise<{success: boolean, billingCustomerId?: string, error?: string}>}
 */
async function getBillingCustomerId(organizationId) {
  if (!organizationId) {
    return { success: false, error: 'Missing organizationId' };
  }

  const now = Date.now();
  const cached = BILLING_CACHE.data[organizationId];
  const ts = BILLING_CACHE.ts[organizationId];

  // Return cached value if fresh (within 1 minute)
  if (cached !== undefined && ts && (now - ts < BILLING_CACHE.TTL)) {
    console.log('[BILLING-CACHE] Cache HIT for org:', organizationId, '→', cached);
    return { success: true, billingCustomerId: cached };
  }

  // Fetch from Firestore
  try {
    console.log('[BILLING-CACHE] Cache MISS for org:', organizationId, '- fetching from Firestore');
    const orgDoc = await db.collection('orgs').doc(organizationId).get();

    if (!orgDoc.exists) {
      console.warn('[BILLING-CACHE] Organization not found:', organizationId);
      return { success: false, error: 'Organization not found' };
    }

    const orgData = orgDoc.data();
    const billingId = orgData?.billingCustomerId || null;

    // Cache the result (only if billingId exists)
    if (billingId) {
      BILLING_CACHE.data[organizationId] = billingId;
      BILLING_CACHE.ts[organizationId] = now;
      console.log('[BILLING-CACHE] Cached billingCustomerId for org:', organizationId, '→', billingId);
    }

    if (!billingId) {
      return { success: false, error: 'Billing customer not found for this organization' };
    }

    return { success: true, billingCustomerId: billingId };
  } catch (error) {
    console.error('[BILLING-CACHE] Failed to fetch billingCustomerId:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Calculate credit status based on balance, dates, and schedule
 * @param {Object} credit - Credit object from Metronome
 * @returns {Object} Status object with status code and description
 */
function calculateCreditStatus(credit) {
  const now = new Date();
  const balance = credit.balance || 0;
  const schedule = credit.access_schedule?.schedule_items?.[0];

  // No schedule information
  if (!schedule) {
    if (balance > 0) {
      return {
        status: 'active',
        status_desc: 'Active - No expiration'
      };
    }
    return {
      status: 'depleted',
      status_desc: 'Depleted - No balance remaining'
    };
  }

  const startingAt = schedule.starting_at ? new Date(schedule.starting_at) : null;
  const endingBefore = schedule.ending_before ? new Date(schedule.ending_before) : null;

  // Check if not started yet
  if (startingAt && now < startingAt) {
    return {
      status: 'pending',
      status_desc: `Pending - Starts ${startingAt.toLocaleDateString()}`
    };
  }

  // Check if expired
  if (endingBefore && now >= endingBefore) {
    return {
      status: 'expired',
      status_desc: `Expired - Ended ${endingBefore.toLocaleDateString()}`
    };
  }

  // Check balance
  if (balance === 0) {
    return {
      status: 'depleted',
      status_desc: 'Depleted - No balance remaining'
    };
  }

  // Active with balance
  if (endingBefore) {
    const daysRemaining = Math.ceil((endingBefore - now) / (1000 * 60 * 60 * 24));

    if (daysRemaining <= 7) {
      return {
        status: 'expiring_soon',
        status_desc: `Expiring Soon - ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`
      };
    }

    if (daysRemaining <= 30) {
      return {
        status: 'active',
        status_desc: `Active - ${daysRemaining} days remaining`
      };
    }

    return {
      status: 'active',
      status_desc: `Active - Expires ${endingBefore.toLocaleDateString()}`
    };
  }

  // Active with no end date
  return {
    status: 'active',
    status_desc: 'Active - No expiration'
  };
}

/**
 * Calculate overall account status based on all credits
 * @param {Array} credits - Array of credit objects
 * @param {number} totalBalance - Total balance across all credits
 * @returns {Object} Overall status object
 */
function calculateOverallStatus(credits, totalBalance) {
  if (credits.length === 0) {
    return {
      status: 'no_credits',
      status_desc: 'No credits available'
    };
  }

  if (totalBalance === 0) {
    return {
      status: 'depleted',
      status_desc: 'All credits depleted'
    };
  }

  // Check if any credits are active
  const hasActiveCredits = credits.some(credit => {
    const status = calculateCreditStatus(credit);
    return status.status === 'active' || status.status === 'expiring_soon';
  });

  if (hasActiveCredits) {
    // Check if any are expiring soon
    const hasExpiringSoon = credits.some(credit => {
      const status = calculateCreditStatus(credit);
      return status.status === 'expiring_soon';
    });

    if (hasExpiringSoon) {
      return {
        status: 'active_expiring_soon',
        status_desc: `Active - ${totalBalance} credits (some expiring soon)`
      };
    }

    return {
      status: 'active',
      status_desc: `Active - ${totalBalance} credits available`
    };
  }

  // All credits are either pending or expired
  const allPending = credits.every(credit => {
    const status = calculateCreditStatus(credit);
    return status.status === 'pending';
  });

  if (allPending) {
    return {
      status: 'pending',
      status_desc: 'Credits pending - Not yet started'
    };
  }

  return {
    status: 'inactive',
    status_desc: 'Inactive - Credits expired or unavailable'
  };
}

module.exports = withLogging(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { organizationId, orgId } = req.query || {};
    const org = organizationId || orgId;

    // Validate required parameter
    if (!org) {
      return res.status(400).json({
        error: 'Missing required parameter: organizationId',
        message: 'Please provide organizationId as a query parameter'
      });
    }



    // Get billingCustomerId from Firestore
    const billingResult = await getBillingCustomerId(org);

    if (!billingResult.success) {
      const statusCode = billingResult.error === 'Organization not found' ? 404 : 404;
      return res.status(statusCode).json({
        error: billingResult.error,
        organizationId: org,
        message: billingResult.error === 'Billing customer not found for this organization'
          ? 'This organization does not have a billing customer ID. Please contact support.'
          : undefined
      });
    }

    const billingCustomerId = billingResult.billingCustomerId;


    // Get customer balance from Metronome
    const balanceResult = await metronomeService.getCustomerBalance(billingCustomerId);

    if (!balanceResult.success) {
      console.error('Failed to fetch balance from Metronome:', balanceResult.error);
      return res.status(500).json({
        error: 'Failed to fetch billing balance',
        details: balanceResult.error,
        organizationId: org
      });
    }

    // Calculate overall status
    const overallStatus = calculateOverallStatus(balanceResult.credits, balanceResult.total_balance);

    // Format response with status information
    const response = {
      success: true,
      organizationId: org,
      billing: {
        provider: 'metronome',
        customerId: billingCustomerId,
        status: overallStatus.status,
        status_desc: overallStatus.status_desc,
        balance: {
          total: balanceResult.total_balance,
          credits: balanceResult.credits.map(credit => {
            const creditStatus = calculateCreditStatus(credit);
            return {
              id: credit.id,
              name: credit.name,
              balance: credit.balance,
              type: credit.type,
              status: creditStatus.status,
              status_desc: creditStatus.status_desc,
              product: credit.product ? {
                id: credit.product.id,
                name: credit.product.name
              } : null,
              schedule: credit.access_schedule?.schedule_items?.[0] ? {
                amount: credit.access_schedule.schedule_items[0].amount,
                starting_at: credit.access_schedule.schedule_items[0].starting_at,
                ending_before: credit.access_schedule.schedule_items[0].ending_before
              } : null,
              created_at: credit.created_at
            };
          })
        }
      }
    };



    return res.status(200).json(response);

  } catch (err) {
    console.error('Billing balance API error:', {
      message: err?.message || err,
      code: err?.code,
      stack: err?.stack,
      query: req.query
    });
    
    return res.status(500).json({
      error: 'Internal server error',
      details: err?.message || 'Unknown error'
    });
  }
});

