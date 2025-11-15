/**
 * @fileoverview Stripe Webhook Handler
 * Handles Stripe webhook events including payment method updates
 *
 * @route POST /api/webhooks/stripe
 */

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
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Stripe-Signature'
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
    const event = req.body;

    console.log('Stripe webhook received:', {
      type: event.type,
      id: event.id
    });

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;

      case 'payment_method.attached':
        await handlePaymentMethodAttached(event.data.object);
        break;

      case 'customer.updated':
        await handleCustomerUpdated(event.data.object);
        break;

      default:
        console.log('Unhandled event type:', event.type);
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('Stripe webhook error:', error);
    return res.status(500).json({
      error: 'Webhook handler failed',
      message: error.message
    });
  }
};

/**
 * Handle checkout.session.completed event
 * Links Stripe to Metronome when payment method is added
 */
async function handleCheckoutSessionCompleted(session) {
  try {
    console.log('Checkout session completed:', {
      session_id: session.id,
      customer: session.customer,
      mode: session.mode,
      status: session.status,
      setup_intent: session.setup_intent
    });

    // Only process setup mode (payment method setup)
    if (session.mode !== 'setup') {
      console.log('Skipping non-setup session');
      return;
    }

    const stripeCustomerId = session.customer;
    const setupIntentId = session.setup_intent;

    if (!stripeCustomerId) {
      console.log('No customer ID in session');
      return;
    }

    // Get the payment method from the setup intent
    let paymentMethodId = null;
    if (setupIntentId) {
      try {
        const setupIntentResponse = await axios.get(
          `${STRIPE_API_URL}/setup_intents/${setupIntentId}`,
          {
            headers: {
              'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 30000
          }
        );
        paymentMethodId = setupIntentResponse.data.payment_method;
        console.log('Payment method from setup intent:', paymentMethodId);
      } catch (error) {
        console.error('Failed to get setup intent:', error.message);
      }
    }

    // Set payment method as default if we have it
    if (paymentMethodId) {
      try {
        console.log('Setting payment method as default:', {
          customer: stripeCustomerId,
          payment_method: paymentMethodId
        });

        const updateResponse = await axios.post(
          `${STRIPE_API_URL}/customers/${stripeCustomerId}`,
          new URLSearchParams({
            'invoice_settings[default_payment_method]': paymentMethodId
          }).toString(),
          {
            headers: {
              'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 30000
          }
        );

        console.log('✅ Payment method set as default:', paymentMethodId);
      } catch (error) {
        console.error('Failed to set default payment method:', error.message);
      }
    }

    // Find organization by Stripe customer ID
    const orgsSnapshot = await db.collection('orgs')
      .where('stripeCustomerId', '==', stripeCustomerId)
      .limit(1)
      .get();

    if (orgsSnapshot.empty) {
      console.log('No organization found for Stripe customer:', stripeCustomerId);
      return;
    }

    const orgDoc = orgsSnapshot.docs[0];
    const orgData = orgDoc.data();
    const billingCustomerId = orgData.billingCustomerId;

    if (!billingCustomerId) {
      console.log('Organization has no Metronome customer ID');
      return;
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

    if (linkResult.success) {
      console.log('✅ Successfully linked Stripe to Metronome after checkout');
    } else {
      console.error('❌ Failed to link Stripe to Metronome:', linkResult.error);
      console.error('Details:', linkResult.details);
    }

  } catch (error) {
    console.error('Error handling checkout session completed:', error);
  }
}

/**
 * Handle payment_method.attached event
 * Links Stripe to Metronome when payment method is attached
 */
async function handlePaymentMethodAttached(paymentMethod) {
  try {
    console.log('Payment method attached:', {
      payment_method_id: paymentMethod.id,
      customer: paymentMethod.customer,
      type: paymentMethod.type
    });

    const stripeCustomerId = paymentMethod.customer;
    const paymentMethodId = paymentMethod.id;

    if (!stripeCustomerId) {
      console.log('No customer ID in payment method');
      return;
    }

    // Set payment method as default
    try {
      console.log('Setting payment method as default:', {
        customer: stripeCustomerId,
        payment_method: paymentMethodId
      });

      const updateResponse = await axios.post(
        `${STRIPE_API_URL}/customers/${stripeCustomerId}`,
        new URLSearchParams({
          'invoice_settings[default_payment_method]': paymentMethodId
        }).toString(),
        {
          headers: {
            'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 30000
        }
      );

      console.log('✅ Payment method set as default:', paymentMethodId);
    } catch (error) {
      console.error('Failed to set default payment method:', error.message);
    }

    // Find organization by Stripe customer ID
    const orgsSnapshot = await db.collection('orgs')
      .where('stripeCustomerId', '==', stripeCustomerId)
      .limit(1)
      .get();

    if (orgsSnapshot.empty) {
      console.log('No organization found for Stripe customer:', stripeCustomerId);
      return;
    }

    const orgDoc = orgsSnapshot.docs[0];
    const orgData = orgDoc.data();
    const billingCustomerId = orgData.billingCustomerId;

    if (!billingCustomerId) {
      console.log('Organization has no Metronome customer ID');
      return;
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

    if (linkResult.success) {
      console.log('✅ Successfully linked Stripe to Metronome after payment method attached');
    } else {
      console.error('❌ Failed to link Stripe to Metronome:', linkResult.error);
      console.error('Details:', linkResult.details);
    }

  } catch (error) {
    console.error('Error handling payment method attached:', error);
  }
}

/**
 * Handle customer.updated event
 * Links Stripe to Metronome when default payment method is set
 */
async function handleCustomerUpdated(customer) {
  try {
    console.log('Customer updated:', {
      customer_id: customer.id,
      has_default_payment_method: !!customer.invoice_settings?.default_payment_method
    });

    // Only process if default payment method was set
    if (!customer.invoice_settings?.default_payment_method) {
      console.log('No default payment method set');
      return;
    }

    const stripeCustomerId = customer.id;

    // Find organization by Stripe customer ID
    const orgsSnapshot = await db.collection('orgs')
      .where('stripeCustomerId', '==', stripeCustomerId)
      .limit(1)
      .get();

    if (orgsSnapshot.empty) {
      console.log('No organization found for Stripe customer:', stripeCustomerId);
      return;
    }

    const orgDoc = orgsSnapshot.docs[0];
    const orgData = orgDoc.data();
    const billingCustomerId = orgData.billingCustomerId;

    if (!billingCustomerId) {
      console.log('Organization has no Metronome customer ID');
      return;
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

    // Link Stripe to Metronome (customer-level)
    const linkResult = await metronomeService.addStripeBillingProvider(
      billingCustomerId,
      stripeCustomerId
    );

    if (linkResult.success) {
      console.log('✅ Successfully linked Stripe to Metronome after customer updated');

      // Now add billing provider configuration to the contract (contract-level)
      console.log('📋 Fetching contracts to add billing provider configuration...');
      const contractsResult = await metronomeService.listContracts(billingCustomerId);

      if (contractsResult.success && contractsResult.contracts.length > 0) {
        const activeContract = contractsResult.contracts[0];

        console.log('📋 Adding billing provider to contract:', {
          contract_id: activeContract.id,
          contract_name: activeContract.name
        });

        const billingConfigResult = await metronomeService.addBillingProviderToContract(
          billingCustomerId,
          activeContract.id
        );

        if (billingConfigResult.success) {
          console.log('✅ Successfully added billing provider configuration to contract');
        } else {
          console.error('❌ Failed to add billing provider to contract:', {
            error: billingConfigResult.error,
            details: billingConfigResult.details
          });
        }
      } else {
        console.log('⚠️ No contracts found for customer');
      }
    } else {
      console.error('❌ Failed to link Stripe to Metronome:', linkResult.error);
      console.error('Details:', linkResult.details);
    }

  } catch (error) {
    console.error('Error handling customer updated:', error);
  }
}

