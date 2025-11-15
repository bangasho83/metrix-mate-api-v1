/**
 * @fileoverview Stripe Payment Service
 * Integration with Stripe API for payment processing and customer management
 * Documentation: https://stripe.com/docs/api
 */

const axios = require('axios');

// Stripe API configuration
const STRIPE_API_URL = 'https://api.stripe.com/v1';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

/**
 * Create a new customer in Stripe
 * @param {Object} params - Customer creation parameters
 * @param {string} params.name - Customer name
 * @param {string} params.email - Customer email address
 * @param {string} [params.description] - Optional customer description
 * @param {Object} [params.metadata] - Optional metadata object
 * @param {string} [params.phone] - Optional phone number
 * @param {Object} [params.address] - Optional address object
 * @returns {Promise<Object>} Created customer data
 */
async function createCustomer({ name, email, description = '', metadata = {}, phone = '', address = null }) {
  try {
    // Validate required parameters
    if (!name || typeof name !== 'string') {
      throw new Error('Missing or invalid required parameter: name');
    }
    if (!email || typeof email !== 'string') {
      throw new Error('Missing or invalid required parameter: email');
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }

    // Validate API key
    if (!STRIPE_SECRET_KEY) {
      throw new Error('Stripe API key not configured. Please set STRIPE_SECRET_KEY in environment variables.');
    }

    // Sanitize name - remove special characters that might cause issues
    const sanitizedName = name.trim().substring(0, 100); // Limit to 100 chars

    if (!sanitizedName) {
      throw new Error('Name cannot be empty after sanitization');
    }

    // Prepare form data for Stripe API (Stripe uses form-encoded data)
    const formData = new URLSearchParams();
    formData.append('name', sanitizedName);
    formData.append('email', email.trim());

    if (description) {
      formData.append('description', description.trim());
    }

    if (phone) {
      formData.append('phone', phone.trim());
    }

    // Add metadata if provided
    if (metadata && typeof metadata === 'object') {
      Object.keys(metadata).forEach(key => {
        formData.append(`metadata[${key}]`, String(metadata[key]));
      });
    }

    // Add address if provided
    if (address && typeof address === 'object') {
      if (address.line1) formData.append('address[line1]', address.line1);
      if (address.line2) formData.append('address[line2]', address.line2);
      if (address.city) formData.append('address[city]', address.city);
      if (address.state) formData.append('address[state]', address.state);
      if (address.postal_code) formData.append('address[postal_code]', address.postal_code);
      if (address.country) formData.append('address[country]', address.country);
    }

    console.log('Creating Stripe customer:', {
      name: sanitizedName,
      email: email.trim(),
      has_metadata: Object.keys(metadata).length > 0,
      has_address: !!address
    });

    // Make API request to Stripe
    const response = await axios.post(
      `${STRIPE_API_URL}/customers`,
      formData.toString(),
      {
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000 // 30 second timeout
      }
    );

    const customerData = response.data;

    console.log('Stripe customer created successfully:', {
      id: customerData.id,
      email: customerData.email,
      name: customerData.name
    });

    return {
      success: true,
      data: customerData,
      stripe_id: customerData.id,
      email: customerData.email,
      name: customerData.name
    };

  } catch (error) {
    // Handle Stripe-specific errors
    if (error.response?.status === 400 && error.response?.data?.error) {
      const stripeError = error.response.data.error;
      
      console.error('Stripe createCustomer error:', {
        type: stripeError.type,
        code: stripeError.code,
        message: stripeError.message,
        param: stripeError.param
      });

      return {
        success: false,
        error: stripeError.message,
        error_type: stripeError.type,
        error_code: stripeError.code,
        param: stripeError.param,
        status: 400
      };
    }

    // Other errors
    console.error('Stripe createCustomer error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
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
 * Get customer by ID
 * @param {string} customer_id - Stripe customer ID
 * @returns {Promise<Object>} Customer data
 */
async function getCustomer(customer_id) {
  try {
    if (!customer_id || typeof customer_id !== 'string') {
      throw new Error('Missing or invalid required parameter: customer_id');
    }

    if (!STRIPE_SECRET_KEY) {
      throw new Error('Stripe API key not configured.');
    }

    const response = await axios.get(
      `${STRIPE_API_URL}/customers/${customer_id}`,
      {
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      }
    );

    return {
      success: true,
      data: response.data
    };

  } catch (error) {
    console.error('Stripe getCustomer error:', {
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
 * List all customers
 * @param {Object} [options] - Query options
 * @param {number} [options.limit] - Number of results to return (max 100)
 * @param {string} [options.starting_after] - Pagination cursor
 * @param {string} [options.ending_before] - Pagination cursor
 * @param {string} [options.email] - Filter by email
 * @returns {Promise<Object>} List of customers
 */
async function listCustomers(options = {}) {
  try {
    if (!STRIPE_SECRET_KEY) {
      throw new Error('Stripe API key not configured.');
    }

    const params = new URLSearchParams();
    if (options.limit) params.append('limit', Math.min(options.limit, 100));
    if (options.starting_after) params.append('starting_after', options.starting_after);
    if (options.ending_before) params.append('ending_before', options.ending_before);
    if (options.email) params.append('email', options.email);

    const response = await axios.get(
      `${STRIPE_API_URL}/customers?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      }
    );

    return {
      success: true,
      data: response.data.data,
      has_more: response.data.has_more,
      url: response.data.url
    };

  } catch (error) {
    console.error('Stripe listCustomers error:', {
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
 * Update a customer
 * @param {string} customer_id - Stripe customer ID
 * @param {Object} updates - Fields to update
 * @param {string} [updates.name] - Customer name
 * @param {string} [updates.email] - Customer email
 * @param {string} [updates.description] - Customer description
 * @param {Object} [updates.metadata] - Metadata object
 * @param {string} [updates.phone] - Phone number
 * @param {Object} [updates.address] - Address object
 * @returns {Promise<Object>} Updated customer data
 */
async function updateCustomer(customer_id, updates = {}) {
  try {
    if (!customer_id || typeof customer_id !== 'string') {
      throw new Error('Missing or invalid required parameter: customer_id');
    }

    if (!STRIPE_SECRET_KEY) {
      throw new Error('Stripe API key not configured.');
    }

    const formData = new URLSearchParams();

    if (updates.name) formData.append('name', updates.name.trim());
    if (updates.email) formData.append('email', updates.email.trim());
    if (updates.description) formData.append('description', updates.description.trim());
    if (updates.phone) formData.append('phone', updates.phone.trim());

    // Add metadata if provided
    if (updates.metadata && typeof updates.metadata === 'object') {
      Object.keys(updates.metadata).forEach(key => {
        formData.append(`metadata[${key}]`, String(updates.metadata[key]));
      });
    }

    // Add address if provided
    if (updates.address && typeof updates.address === 'object') {
      if (updates.address.line1) formData.append('address[line1]', updates.address.line1);
      if (updates.address.line2) formData.append('address[line2]', updates.address.line2);
      if (updates.address.city) formData.append('address[city]', updates.address.city);
      if (updates.address.state) formData.append('address[state]', updates.address.state);
      if (updates.address.postal_code) formData.append('address[postal_code]', updates.address.postal_code);
      if (updates.address.country) formData.append('address[country]', updates.address.country);
    }

    console.log('Updating Stripe customer:', {
      customer_id,
      fields: Object.keys(updates)
    });

    const response = await axios.post(
      `${STRIPE_API_URL}/customers/${customer_id}`,
      formData.toString(),
      {
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      }
    );

    console.log('Stripe customer updated successfully:', {
      id: response.data.id
    });

    return {
      success: true,
      data: response.data
    };

  } catch (error) {
    console.error('Stripe updateCustomer error:', {
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
 * Create a checkout session for payment method setup
 * @param {Object} params - Checkout session parameters
 * @param {string} params.customer_id - Stripe customer ID
 * @param {string} [params.success_url] - URL to redirect after successful setup
 * @param {string} [params.cancel_url] - URL to redirect if user cancels
 * @param {string} [params.mode] - Session mode: 'setup', 'payment', or 'subscription' (default: 'setup')
 * @param {string} [params.currency] - Currency code (default: 'usd')
 * @param {Object} [params.metadata] - Optional metadata
 * @returns {Promise<Object>} Checkout session data with URL
 */
async function createCheckoutSession({
  customer_id,
  success_url = null,
  cancel_url = null,
  mode = 'setup',
  currency = 'usd',
  metadata = {}
}) {
  try {
    // Validate required parameters
    if (!customer_id || typeof customer_id !== 'string') {
      throw new Error('Missing or invalid required parameter: customer_id');
    }

    // Validate API key
    if (!STRIPE_SECRET_KEY) {
      throw new Error('Stripe API key not configured.');
    }

    // Validate mode
    const validModes = ['setup', 'payment', 'subscription'];
    if (!validModes.includes(mode)) {
      throw new Error(`Invalid mode. Must be one of: ${validModes.join(', ')}`);
    }

    // Default URLs if not provided
    const defaultSuccessUrl = 'https://yourapp.example/billing/success?session_id={CHECKOUT_SESSION_ID}';
    const defaultCancelUrl = 'https://yourapp.example/billing/cancel';

    const finalSuccessUrl = success_url || defaultSuccessUrl;
    const finalCancelUrl = cancel_url || defaultCancelUrl;

    // Prepare form data for Stripe API
    const formData = new URLSearchParams();
    formData.append('mode', mode);
    formData.append('customer', customer_id);
    formData.append('success_url', finalSuccessUrl);
    formData.append('cancel_url', finalCancelUrl);

    // Add currency for setup mode
    if (mode === 'setup') {
      formData.append('currency', currency);
    }

    // Add metadata if provided
    if (metadata && typeof metadata === 'object') {
      Object.keys(metadata).forEach(key => {
        formData.append(`metadata[${key}]`, String(metadata[key]));
      });
    }

    console.log('Creating Stripe checkout session:', {
      customer_id,
      mode,
      currency,
      has_metadata: Object.keys(metadata).length > 0
    });

    // Make API request to Stripe
    const response = await axios.post(
      `${STRIPE_API_URL}/checkout/sessions`,
      formData.toString(),
      {
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000 // 30 second timeout
      }
    );

    const sessionData = response.data;

    console.log('Stripe checkout session created successfully:', {
      session_id: sessionData.id,
      customer: sessionData.customer,
      url: sessionData.url
    });

    return {
      success: true,
      data: sessionData,
      session_id: sessionData.id,
      url: sessionData.url,
      customer: sessionData.customer,
      mode: sessionData.mode,
      status: sessionData.status
    };

  } catch (error) {
    // Handle Stripe-specific errors
    if (error.response?.status === 400 && error.response?.data?.error) {
      const stripeError = error.response.data.error;

      console.error('Stripe createCheckoutSession error:', {
        type: stripeError.type,
        code: stripeError.code,
        message: stripeError.message,
        param: stripeError.param
      });

      return {
        success: false,
        error: stripeError.message,
        error_type: stripeError.type,
        error_code: stripeError.code,
        param: stripeError.param,
        status: 400
      };
    }

    // Other errors
    console.error('Stripe createCheckoutSession error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
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
 * Check if customer has payment method added and if it's set as default
 * @param {string} customer_id - Stripe customer ID
 * @returns {Promise<Object>} Payment method status
 */
async function hasPaymentMethod(customer_id) {
  try {
    // Validate required parameters
    if (!customer_id || typeof customer_id !== 'string') {
      throw new Error('Missing or invalid required parameter: customer_id');
    }

    // Validate API key
    if (!STRIPE_SECRET_KEY) {
      throw new Error('Stripe API key not configured.');
    }

    console.log('Checking payment methods for customer:', customer_id);

    // Step 1: Get customer to check default payment method
    const customerResponse = await axios.get(
      `${STRIPE_API_URL}/customers/${customer_id}`,
      {
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      }
    );

    const customer = customerResponse.data;
    const defaultPaymentMethodId = customer.invoice_settings?.default_payment_method || null;

    // Step 2: List all payment methods for the customer
    const paymentMethodsResponse = await axios.get(
      `${STRIPE_API_URL}/payment_methods?customer=${customer_id}&type=card`,
      {
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      }
    );

    const paymentMethods = paymentMethodsResponse.data.data || [];
    const hasPaymentMethods = paymentMethods.length > 0;

    // Find the default payment method details
    let defaultPaymentMethod = null;
    if (defaultPaymentMethodId) {
      defaultPaymentMethod = paymentMethods.find(pm => pm.id === defaultPaymentMethodId) || null;
    }

    // If no explicit default but has payment methods, use the first one
    const effectiveDefaultPaymentMethod = defaultPaymentMethod || (hasPaymentMethods ? paymentMethods[0] : null);

    console.log('Payment method check result:', {
      customer_id,
      has_payment_methods: hasPaymentMethods,
      payment_methods_count: paymentMethods.length,
      has_default: !!defaultPaymentMethodId,
      default_payment_method_id: defaultPaymentMethodId
    });

    return {
      success: true,
      has_payment_method: hasPaymentMethods,
      payment_methods_count: paymentMethods.length,
      has_default_payment_method: !!defaultPaymentMethodId,
      default_payment_method_id: defaultPaymentMethodId,
      default_payment_method: effectiveDefaultPaymentMethod ? {
        id: effectiveDefaultPaymentMethod.id,
        type: effectiveDefaultPaymentMethod.type,
        card: effectiveDefaultPaymentMethod.card ? {
          brand: effectiveDefaultPaymentMethod.card.brand,
          last4: effectiveDefaultPaymentMethod.card.last4,
          exp_month: effectiveDefaultPaymentMethod.card.exp_month,
          exp_year: effectiveDefaultPaymentMethod.card.exp_year
        } : null,
        created: effectiveDefaultPaymentMethod.created
      } : null,
      payment_methods: paymentMethods.map(pm => ({
        id: pm.id,
        type: pm.type,
        card: pm.card ? {
          brand: pm.card.brand,
          last4: pm.card.last4,
          exp_month: pm.card.exp_month,
          exp_year: pm.card.exp_year
        } : null,
        created: pm.created,
        is_default: pm.id === defaultPaymentMethodId
      }))
    };

  } catch (error) {
    // Handle Stripe-specific errors
    if (error.response?.status === 404 && error.response?.data?.error) {
      const stripeError = error.response.data.error;

      console.error('Stripe hasPaymentMethod error (customer not found):', {
        type: stripeError.type,
        code: stripeError.code,
        message: stripeError.message,
        customer_id
      });

      return {
        success: false,
        error: stripeError.message,
        error_type: stripeError.type,
        error_code: stripeError.code,
        status: 404
      };
    }

    if (error.response?.status === 400 && error.response?.data?.error) {
      const stripeError = error.response.data.error;

      console.error('Stripe hasPaymentMethod error:', {
        type: stripeError.type,
        code: stripeError.code,
        message: stripeError.message,
        param: stripeError.param
      });

      return {
        success: false,
        error: stripeError.message,
        error_type: stripeError.type,
        error_code: stripeError.code,
        param: stripeError.param,
        status: 400
      };
    }

    // Other errors
    console.error('Stripe hasPaymentMethod error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      customer_id
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
 * Get payment method details
 * @param {string} payment_method_id - Stripe payment method ID
 * @returns {Promise<Object>} Payment method details
 */
async function getPaymentMethod(payment_method_id) {
  try {
    // Validate required parameters
    if (!payment_method_id || typeof payment_method_id !== 'string') {
      throw new Error('Missing or invalid required parameter: payment_method_id');
    }

    // Validate API key
    if (!STRIPE_SECRET_KEY) {
      throw new Error('Stripe API key not configured.');
    }

    console.log('Fetching payment method details:', payment_method_id);

    // Make API request to Stripe
    const response = await axios.get(
      `${STRIPE_API_URL}/payment_methods/${payment_method_id}`,
      {
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      }
    );

    const paymentMethod = response.data;

    console.log('Payment method retrieved successfully:', {
      id: paymentMethod.id,
      type: paymentMethod.type,
      has_card: !!paymentMethod.card
    });

    // Extract card details if available
    const cardDetails = paymentMethod.card ? {
      brand: paymentMethod.card.brand,
      last4: paymentMethod.card.last4,
      exp_month: paymentMethod.card.exp_month,
      exp_year: paymentMethod.card.exp_year,
      funding: paymentMethod.card.funding,
      country: paymentMethod.card.country
    } : null;

    return {
      success: true,
      data: paymentMethod,
      payment_method_id: paymentMethod.id,
      type: paymentMethod.type,
      card: cardDetails,
      customer: paymentMethod.customer,
      created: paymentMethod.created,
      billing_details: paymentMethod.billing_details
    };

  } catch (error) {
    // Handle Stripe-specific errors
    if (error.response?.status === 404 && error.response?.data?.error) {
      const stripeError = error.response.data.error;

      console.error('Stripe getPaymentMethod error (not found):', {
        type: stripeError.type,
        code: stripeError.code,
        message: stripeError.message,
        payment_method_id
      });

      return {
        success: false,
        error: stripeError.message,
        error_type: stripeError.type,
        error_code: stripeError.code,
        status: 404
      };
    }

    if (error.response?.status === 400 && error.response?.data?.error) {
      const stripeError = error.response.data.error;

      console.error('Stripe getPaymentMethod error:', {
        type: stripeError.type,
        code: stripeError.code,
        message: stripeError.message,
        param: stripeError.param
      });

      return {
        success: false,
        error: stripeError.message,
        error_type: stripeError.type,
        error_code: stripeError.code,
        param: stripeError.param,
        status: 400
      };
    }

    // Other errors
    console.error('Stripe getPaymentMethod error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      payment_method_id
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

module.exports = {
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
  createCheckoutSession,
  hasPaymentMethod,
  getPaymentMethod
};

