/**
 * @fileoverview Metronome Billing Service
 * Integration with Metronome API for billing and usage tracking
 * Documentation: https://metronome.com/
 */

const axios = require('axios');
const {
  METRONOME_API_URL,
  METRONOME_API_V2_URL,
  METRONOME_IDS,
  FREE_TRIAL_CONFIG,
  TOPUP_CONFIG,
  TIMEOUTS,
  createHourBoundaryDate,
  createTrialEndDate,
  createTopupEndDate,
  validateCustomerId,
  validateContractId,
  validateCredits
} = require('../constants/metronome-config');

// Metronome API configuration
const METRONOME_API_KEY = process.env.METRONOME_API_KEY;

/**
 * Create a new customer in Metronome
 * @param {Object} params - Customer creation parameters
 * @param {string} params.external_id - External ID (typically Firebase organization ID)
 * @param {string} params.name - Customer/Organization name
 * @param {Array<string>} [params.ingest_aliases] - Optional ingest aliases
 * @param {Object} [params.custom_fields] - Optional custom fields
 * @returns {Promise<Object>} Created customer data
 */
async function createCustomer({ external_id, name, ingest_aliases = [], custom_fields = {} }) {
  try {
    // Validate required parameters
    if (!external_id || typeof external_id !== 'string') {
      throw new Error('Missing or invalid required parameter: external_id');
    }
    if (!name || typeof name !== 'string') {
      throw new Error('Missing or invalid required parameter: name');
    }

    // Sanitize name - remove special characters that might cause issues
    const sanitizedName = name.trim().substring(0, 100); // Limit to 100 chars

    if (!sanitizedName) {
      throw new Error('Name cannot be empty after sanitization');
    }

    // Validate API key
    if (!METRONOME_API_KEY) {
      throw new Error('Metronome API key not configured. Please set METRONOME_API_KEY in environment variables.');
    }

    // Normalize custom_fields - Metronome requires all values to be strings
    const normalizedCustomFields = {};
    if (custom_fields && typeof custom_fields === 'object') {
      Object.keys(custom_fields).forEach(key => {
        const value = custom_fields[key];
        // Convert all values to strings
        normalizedCustomFields[key] = value !== null && value !== undefined
          ? String(value)
          : '';
      });
    }

    // Prepare request payload
    // Use ingest_aliases instead of external_id for conflict detection
    const payload = {
      name: sanitizedName,
      ingest_aliases: [external_id], // Metronome will use this for deduplication
      custom_fields: normalizedCustomFields
    };

    // Make API request to Metronome
    const response = await axios.post(
      `${METRONOME_API_URL}/customers`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${METRONOME_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: TIMEOUTS.DEFAULT
      }
    );

    const customerData = response.data?.data || response.data;



    return {
      success: true,
      data: customerData,
      metronome_id: customerData?.id,
      external_id: customerData?.external_id,
      ingest_aliases: customerData?.ingest_aliases || [],
      isExisting: false
    };

  } catch (error) {
    // Handle 409 Conflict - ingest_alias already exists
    if (error.response?.status === 409) {
      const conflictData = error.response?.data;
      const conflictingCustomerId = conflictData?.conflicting_id;
      const conflictingValue = conflictData?.conflicting_value;

      // Return the existing customer info from conflict response
      // We don't need to fetch the full customer details - just use the conflicting_id
      return {
        success: true,
        metronome_id: conflictingCustomerId,
        external_id,
        isExisting: true,
        message: 'Customer already exists with this ingest_alias',
        conflicting_value: conflictingValue
      };
    }

    // Other errors
    console.error('Metronome createCustomer error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      external_id
    });

    // Return structured error
    return {
      success: false,
      error: error.message,
      details: error.response?.data || null,
      status: error.response?.status || 500
    };
  }
}

/**
 * Get customer by ID (Metronome ID or external ID)
 * @param {string} id - Customer ID (Metronome ID or external ID)
 * @returns {Promise<Object>} Customer data
 */
async function getCustomer(id) {
  try {
    if (!id || typeof id !== 'string') {
      throw new Error('Missing or invalid required parameter: id');
    }

    if (!METRONOME_API_KEY) {
      throw new Error('Metronome API key not configured.');
    }

    const response = await axios.get(
      `${METRONOME_API_URL}/customers/${id}`,
      {
        headers: {
          'Authorization': `Bearer ${METRONOME_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: TIMEOUTS.DEFAULT
      }
    );

    return {
      success: true,
      data: response.data?.data || response.data
    };

  } catch (error) {
    console.error('Metronome getCustomer error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      id
    });

    return {
      success: false,
      error: error.message,
      details: error.response?.data || null,
      status: error.response?.status || 500
    };
  }
}

/**
 * List all customers
 * @param {Object} [options] - Query options
 * @param {number} [options.limit] - Number of results to return
 * @param {string} [options.next_page] - Pagination token
 * @returns {Promise<Object>} List of customers
 */
async function listCustomers(options = {}) {
  try {
    if (!METRONOME_API_KEY) {
      throw new Error('Metronome API key not configured.');
    }

    const params = {};
    if (options.limit) params.limit = options.limit;
    if (options.next_page) params.next_page = options.next_page;

    const response = await axios.get(
      `${METRONOME_API_URL}/customers`,
      {
        headers: {
          'Authorization': `Bearer ${METRONOME_API_KEY}`,
          'Content-Type': 'application/json'
        },
        params,
        timeout: TIMEOUTS.DEFAULT
      }
    );

    return {
      success: true,
      data: response.data?.data || response.data,
      next_page: response.data?.next_page || null
    };

  } catch (error) {
    console.error('Metronome listCustomers error:', {
      message: error.message,
      status: error.response?.status
    });

    return {
      success: false,
      error: error.message,
      details: error.response?.data || null,
      status: error.response?.status || 500
    };
  }
}

/**
 * Create a free trial contract for a customer
 * Grants 500 credits to the customer
 * @param {string} customer_id - Metronome customer ID
 * @returns {Promise<Object>} Contract creation result
 */
async function createFreeTrialContract(customer_id) {
  try {
    // Validate parameters using centralized validation
    validateCustomerId(customer_id);

    if (!METRONOME_API_KEY) {
      throw new Error('Metronome API key not configured.');
    }

    // Use centralized configuration
    const startingDate = createHourBoundaryDate();
    const endingDate = createTrialEndDate(startingDate);
    const startingAt = startingDate.toISOString();
    const endingBefore = endingDate.toISOString();

    const payload = {
      customer_id,
      rate_card_id: METRONOME_IDS.RATE_CARD_ID,
      starting_at: startingAt,
      ending_before: endingBefore,
      credits: [
        {
          product_id: METRONOME_IDS.PRODUCT_ID,
          access_schedule: {
            credit_type_id: METRONOME_IDS.CREDIT_TYPE_ID,
            schedule_items: [
              {
                amount: FREE_TRIAL_CONFIG.CREDITS,
                starting_at: startingAt,
                ending_before: endingBefore
              }
            ]
          },
          priority: FREE_TRIAL_CONFIG.PRIORITY,
          name: FREE_TRIAL_CONFIG.NAME
        }
      ]
    };

    const response = await axios.post(
      `${METRONOME_API_URL}/contracts/create`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${METRONOME_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: TIMEOUTS.DEFAULT
      }
    );



    return {
      success: true,
      data: response.data?.data || response.data,
      contract_id: response.data?.data?.id || response.data?.id,
      credits: FREE_TRIAL_CONFIG.CREDITS
    };

  } catch (error) {
    console.error('Metronome createFreeTrialContract error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      customer_id
    });

    return {
      success: false,
      error: error.message,
      details: error.response?.data || null,
      status: error.response?.status || 500
    };
  }
}

/**
 * Get customer credit balance
 * @param {string} customer_id - Metronome customer ID
 * @param {string} covering_date - Optional date to check balance at (ISO 8601 format)
 * @returns {Promise<Object>} Credit balance information
 */
async function getCustomerBalance(customer_id, covering_date = null) {
  try {
    if (!customer_id || typeof customer_id !== 'string') {
      throw new Error('Missing or invalid required parameter: customer_id');
    }

    if (!METRONOME_API_KEY) {
      throw new Error('Metronome API key not configured.');
    }

    const payload = {
      customer_id,
      include_balance: true,
      include_contract_balances: true,
      covering_date: covering_date || new Date().toISOString()
    };

    const response = await axios.post(
      `${METRONOME_API_URL}/contracts/customerBalances/list`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${METRONOME_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: TIMEOUTS.DEFAULT
      }
    );

    const data = response.data?.data || [];

    // Calculate total balance across all credits
    let totalBalance = 0;
    const credits = data.map(item => {
      const balance = item.balance || 0;
      totalBalance += balance;

      return {
        id: item.id,
        name: item.name,
        balance: balance,
        type: item.type,
        product: item.product,
        access_schedule: item.access_schedule,
        created_at: item.created_at
      };
    });

    return {
      success: true,
      customer_id,
      total_balance: totalBalance,
      credits,
      next_page: response.data?.next_page || null
    };

  } catch (error) {
    console.error('Metronome getCustomerBalance error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      customer_id
    });

    return {
      success: false,
      error: error.message,
      details: error.response?.data || null,
      status: error.response?.status || 500
    };
  }
}

/**
 * Ingest billing event to Metronome
 * @param {Object} params - Event parameters
 * @param {string} params.organization_id - Organization ID (for transaction_id)
 * @param {string} params.customer_id - Metronome customer ID
 * @param {string} params.event_type - Event type name
 * @param {Object} params.properties - Properties object containing credits and other metadata
 * @param {number} params.properties.credits - Number of credits consumed (required)
 * @param {string} [params.properties.user_id] - Optional user ID
 * @param {string} [params.properties.project_id] - Optional project/brand ID
 * @param {string} [params.timestamp] - Optional timestamp (defaults to now)
 * @returns {Promise<Object>} Ingest result
 */
async function ingestEvent({
  organization_id,
  customer_id,
  event_type,
  properties = {},
  timestamp = null
}) {
  try {
    // Validate required parameters
    if (!organization_id || typeof organization_id !== 'string') {
      throw new Error('Missing or invalid required parameter: organization_id');
    }
    if (!customer_id || typeof customer_id !== 'string') {
      throw new Error('Missing or invalid required parameter: customer_id');
    }
    if (!event_type || typeof event_type !== 'string') {
      throw new Error('Missing or invalid required parameter: event_type');
    }

    // Normalize event_type: replace slashes with hyphens for Metronome compatibility
    const normalized_event_type = event_type.replace(/\//g, '-');

    // Log normalization for debugging
    if (event_type !== normalized_event_type) {
      console.log(`[METRONOME] Event type normalized: "${event_type}" -> "${normalized_event_type}"`);
    }

    if (!properties || typeof properties !== 'object') {
      throw new Error('Missing or invalid required parameter: properties');
    }
    if (typeof properties.credits !== 'number' || properties.credits <= 0) {
      throw new Error('Missing or invalid required parameter: properties.credits (must be positive number)');
    }

    if (!METRONOME_API_KEY) {
      throw new Error('Metronome API key not configured.');
    }

    // Generate unique transaction ID: organizationId + random key
    const randomKey = Math.random().toString(36).substring(2, 15) +
                      Math.random().toString(36).substring(2, 15);
    const transaction_id = `${organization_id}+${randomKey}`;

    // Use provided timestamp or current time in ISO format
    const event_timestamp = timestamp || new Date().toISOString();

    // Prepare event payload (array of events) - matches Metronome API exactly
    const payload = [
      {
        transaction_id,
        customer_id,
        event_type: normalized_event_type,
        timestamp: event_timestamp,
        properties  // Properties object passed as-is
      }
    ];

    // Make API request to Metronome ingest endpoint
    const response = await axios.post(
      `${METRONOME_API_URL}/ingest`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${METRONOME_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: TIMEOUTS.DEFAULT
      }
    );



    return {
      success: true,
      transaction_id,
      event_type,
      properties,
      timestamp: event_timestamp,
      response: response.data
    };

  } catch (error) {
    console.error('Metronome ingestEvent error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      organization_id,
      customer_id,
      event_type
    });

    // Return structured error
    return {
      success: false,
      error: error.message,
      details: error.response?.data || null,
      status: error.response?.status || 500
    };
  }
}

/**
 * Add Stripe billing provider configuration to a Metronome customer
 * @param {string} customer_id - Metronome customer ID
 * @param {string} stripe_customer_id - Stripe customer ID
 * @returns {Promise<Object>} Result of the operation
 */
async function addStripeBillingProvider(customer_id, stripe_customer_id) {
  try {
    if (!customer_id || typeof customer_id !== 'string') {
      throw new Error('Missing or invalid required parameter: customer_id');
    }
    if (!stripe_customer_id || typeof stripe_customer_id !== 'string') {
      throw new Error('Missing or invalid required parameter: stripe_customer_id');
    }

    if (!METRONOME_API_KEY) {
      throw new Error('Metronome API key not configured.');
    }

    const configData = {
      customer_id,
      billing_provider: 'stripe',
      configuration: {
        stripe_customer_id,
        stripe_collection_method: 'charge_automatically'
      },
      delivery_method: 'direct_to_billing_provider'
    };

    const payload = {
      data: [configData]
    };

    const response = await axios.post(
      `${METRONOME_API_URL}/setCustomerBillingProviderConfigurations`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${METRONOME_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: TIMEOUTS.DEFAULT
      }
    );



    return {
      success: true,
      data: response.data
    };

  } catch (error) {
    console.error('Metronome addStripeBillingProvider error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      customer_id,
      stripe_customer_id
    });

    return {
      success: false,
      error: error.message,
      details: error.response?.data || null,
      status: error.response?.status || 500
    };
  }
}

/**
 * Edit a contract (used for upgrading free trial to paid)
 * @param {Object} contractEditData - Contract edit data (passed directly to Metronome)
 * @param {string} contractEditData.customer_id - Metronome customer ID (required)
 * @param {string} contractEditData.contract_id - Contract ID to edit (required)
 * @returns {Promise<Object>} Contract edit result
 */
async function editContract(contractEditData) {
  try {
    // Validate required parameters
    if (!contractEditData.customer_id || typeof contractEditData.customer_id !== 'string') {
      throw new Error('Missing or invalid required parameter: customer_id');
    }
    if (!contractEditData.contract_id || typeof contractEditData.contract_id !== 'string') {
      throw new Error('Missing or invalid required parameter: contract_id');
    }

    if (!METRONOME_API_KEY) {
      throw new Error('Metronome API key not configured.');
    }

    // Pass all contract edit data directly to Metronome
    const response = await axios.post(
      `${METRONOME_API_V2_URL}/contracts/edit`,
      contractEditData,
      {
        headers: {
          'Authorization': `Bearer ${METRONOME_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: TIMEOUTS.DEFAULT
      }
    );



    return {
      success: true,
      data: response.data?.data || response.data,
      contract_id: contractEditData.contract_id
    };

  } catch (error) {
    console.error('Metronome editContract error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      customer_id: contractEditData.customer_id,
      contract_id: contractEditData.contract_id
    });

    return {
      success: false,
      error: error.message,
      details: error.response?.data || null,
      status: error.response?.status || 500
    };
  }
}

/**
 * Create a contract for a customer
 * @param {Object} contractData - Contract data (passed directly to Metronome)
 * @param {string} contractData.customer_id - Metronome customer ID (required)
 * @returns {Promise<Object>} Contract creation result
 */
async function createContract(contractData) {
  try {
    // Validate only customer_id
    if (!contractData.customer_id || typeof contractData.customer_id !== 'string') {
      throw new Error('Missing or invalid required parameter: customer_id');
    }

    if (!METRONOME_API_KEY) {
      throw new Error('Metronome API key not configured.');
    }

    // Pass all contract data directly to Metronome
    const response = await axios.post(
      `${METRONOME_API_URL}/contracts/create`,
      contractData,
      {
        headers: {
          'Authorization': `Bearer ${METRONOME_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: TIMEOUTS.DEFAULT
      }
    );

    return {
      success: true,
      data: response.data?.data || response.data,
      contract_id: response.data?.data?.id || response.data?.id
    };

  } catch (error) {
    console.error('Metronome createContract error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      customer_id: contractData.customer_id
    });

    return {
      success: false,
      error: error.message,
      details: error.response?.data || null,
      status: error.response?.status || 500
    };
  }
}

/**
 * List contracts for a customer
 * @param {string} customer_id - Metronome customer ID
 * @param {string} [covering_date] - Optional date to check contracts at (ISO 8601 format, defaults to now)
 * @returns {Promise<Object>} List of contracts
 */
async function listContracts(customer_id, covering_date = null) {
  try {
    if (!customer_id || typeof customer_id !== 'string') {
      throw new Error('Missing or invalid required parameter: customer_id');
    }

    if (!METRONOME_API_KEY) {
      throw new Error('Metronome API key not configured.');
    }

    // Build payload - only include covering_date if explicitly provided
    // If not provided, Metronome will return all contracts for the customer
    const payload = {
      customer_id
    };

    if (covering_date) {
      payload.covering_date = covering_date;
    }

    // Use v2 API for contracts list - construct full URL
    const contractsListUrl = 'https://api.metronome.com/v2/contracts/list';



    const response = await axios.post(
      contractsListUrl,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${METRONOME_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: TIMEOUTS.DEFAULT
      }
    );

    const contracts = response.data?.data || [];

    return {
      success: true,
      data: contracts,
      contracts: contracts,
      count: contracts.length
    };

  } catch (error) {
    const payload = { customer_id };
    if (covering_date) {
      payload.covering_date = covering_date;
    }

    console.error('Metronome listContracts error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      customer_id,
      url: 'https://api.metronome.com/v2/contracts/list',
      payload: JSON.stringify(payload, null, 2)
    });

    return {
      success: false,
      error: error.message,
      details: error.response?.data || null,
      status: error.response?.status || 500
    };
  }
}

/**
 * Add billing provider configuration to a contract
 * @param {string} customer_id - Metronome customer ID
 * @param {string} contract_id - Contract ID to configure
 * @returns {Promise<Object>} Result of the operation
 */
async function addBillingProviderToContract(customer_id, contract_id) {
  try {
    if (!customer_id || typeof customer_id !== 'string') {
      throw new Error('Missing or invalid required parameter: customer_id');
    }
    if (!contract_id || typeof contract_id !== 'string') {
      throw new Error('Missing or invalid required parameter: contract_id');
    }

    if (!METRONOME_API_KEY) {
      throw new Error('Metronome API key not configured.');
    }



    const payload = {
      customer_id,
      contract_id,
      add_billing_provider_configuration_update: {
        billing_provider_configuration: {
          billing_provider: 'stripe',
          delivery_method: 'direct_to_billing_provider'
        },
        schedule: {
          effective_at: 'START_OF_CURRENT_PERIOD'
        }
      }
    };

    const response = await axios.post(
      `${METRONOME_API_V2_URL}/contracts/edit`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${METRONOME_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: TIMEOUTS.DEFAULT
      }
    );

    return {
      success: true,
      data: response.data?.data || response.data
    };

  } catch (error) {
    console.error('Metronome addBillingProviderToContract error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      customer_id,
      contract_id
    });

    return {
      success: false,
      error: error.message,
      details: error.response?.data || null,
      status: error.response?.status || 500
    };
  }
}

/**
 * Top up credits for a customer by editing their contract
 * @param {string} customer_id - Metronome customer ID
 * @param {string} contract_id - Contract ID to add credits to
 * @param {number} amountInCents - Amount in cents to charge (credits = amountInCents * 2, invoice = amountInCents)
 * @returns {Promise<Object>} Top-up result
 */
async function topUpCredits(customer_id, contract_id, amountInCents) {
  try {
    // Validate parameters using centralized validation
    validateCustomerId(customer_id);
    validateContractId(contract_id);

    if (typeof amountInCents !== 'number' || amountInCents <= 0) {
      throw new Error('Missing or invalid required parameter: amountInCents (must be positive number)');
    }

    if (!METRONOME_API_KEY) {
      throw new Error('Metronome API key not configured.');
    }

    // Calculate credits using centralized configuration
    const credits = amountInCents * TOPUP_CONFIG.CREDITS_PER_CENT;

    // Create dates using centralized utilities
    const startingDate = createHourBoundaryDate();
    const endingDate = createTopupEndDate(startingDate);
    const starting_at = startingDate.toISOString();
    const ending_before = endingDate.toISOString();

    const payload = {
      customer_id,
      contract_id,
      add_commits: [
        {
          type: 'prepaid',
          name: TOPUP_CONFIG.NAME,
          product_id: METRONOME_IDS.TOPUP_PRODUCT_ID,
          access_schedule: {
            credit_type_id: METRONOME_IDS.CREDIT_TYPE_ID,
            schedule_items: [
              {
                amount: credits,
                starting_at,
                ending_before
              }
            ]
          },
          invoice_schedule: {
            schedule_items: [
              {
                amount: amountInCents,
                timestamp: starting_at
              }
            ]
          },
          payment_gate_config: {
            payment_gate_type: TOPUP_CONFIG.PAYMENT_GATE_TYPE,
            stripe_config: {
              payment_type: TOPUP_CONFIG.PAYMENT_TYPE
            }
          },
          priority: TOPUP_CONFIG.PRIORITY
        }
      ]
    };

    // 🔍 LOG CURL COMMAND
    const curlCommand = `curl -X POST '${METRONOME_API_V2_URL}/contracts/edit' \\
  -H 'Authorization: Bearer ${METRONOME_API_KEY}' \\
  -H 'Content-Type: application/json' \\
  -d '${JSON.stringify(payload, null, 2)}'`;

    console.log('\n========== METRONOME TOP-UP REQUEST ==========');
    console.log('📤 CURL COMMAND:');
    console.log(curlCommand);
    console.log('\n📦 PAYLOAD:');
    console.log(JSON.stringify(payload, null, 2));
    console.log('==============================================\n');

    const response = await axios.post(
      `${METRONOME_API_V2_URL}/contracts/edit`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${METRONOME_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: TIMEOUTS.DEFAULT
      }
    );

    // 🔍 LOG RESPONSE
    console.log('\n========== METRONOME TOP-UP RESPONSE ==========');
    console.log('✅ STATUS:', response.status);
    console.log('📥 RESPONSE DATA:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('===============================================\n');

    return {
      success: true,
      data: response.data?.data || response.data,
      customer_id,
      contract_id,
      credits_added: credits,
      amount_charged_cents: amountInCents
    };

  } catch (error) {
    // 🔍 LOG ERROR RESPONSE
    console.error('\n========== METRONOME TOP-UP ERROR ==========');
    console.error('❌ ERROR MESSAGE:', error.message);
    console.error('❌ STATUS:', error.response?.status);
    console.error('❌ RESPONSE DATA:');
    console.error(JSON.stringify(error.response?.data, null, 2));
    console.error('❌ FULL ERROR:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      customer_id,
      contract_id,
      amount_cents: amountInCents
    });
    console.error('============================================\n');

    return {
      success: false,
      error: error.message,
      details: error.response?.data,
      status: error.response?.status || 500
    };
  }
}

module.exports = {
  createCustomer,
  getCustomer,
  listCustomers,
  createFreeTrialContract,
  createContract,
  editContract,
  listContracts,
  getCustomerBalance,
  ingestEvent,
  addStripeBillingProvider,
  addBillingProviderToContract,
  topUpCredits
};
