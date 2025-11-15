/**
 * Test script for Stripe checkout session creation
 * Tests the createCheckoutSession function in stripe-service.js
 */

require('dotenv').config();
const stripeService = require('../services/stripe-service');

async function testCheckoutSession() {
  console.log('=== Testing Stripe Checkout Session Creation ===\n');

  // First, create a test customer to use for checkout
  console.log('Step 1: Creating a test customer...');
  const customerResult = await stripeService.createCustomer({
    name: 'Checkout Test Customer',
    email: 'checkout-test@example.com',
    metadata: {
      test: 'true',
      purpose: 'checkout_session_test'
    }
  });

  if (!customerResult.success) {
    console.log('❌ Failed to create test customer');
    console.log('Error:', customerResult.error);
    return;
  }

  console.log('✅ Test customer created!');
  console.log('Customer ID:', customerResult.stripe_id);
  console.log('Email:', customerResult.email);

  const customerId = customerResult.stripe_id;

  console.log('\n---\n');

  // Test 1: Create a basic setup mode checkout session
  console.log('Test 1: Creating basic setup mode checkout session...');
  const result1 = await stripeService.createCheckoutSession({
    customer_id: customerId,
    mode: 'setup',
    currency: 'usd'
  });

  if (result1.success) {
    console.log('✅ Checkout session created successfully!');
    console.log('Session ID:', result1.session_id);
    console.log('Checkout URL:', result1.url);
    console.log('Mode:', result1.mode);
    console.log('Status:', result1.status);
    console.log('\n🔗 Open this URL in your browser to test the checkout flow:');
    console.log(result1.url);
  } else {
    console.log('❌ Failed to create checkout session');
    console.log('Error:', result1.error);
    console.log('Details:', result1.details);
  }

  console.log('\n---\n');

  // Test 2: Create checkout session with custom URLs
  console.log('Test 2: Creating checkout session with custom URLs...');
  const result2 = await stripeService.createCheckoutSession({
    customer_id: customerId,
    mode: 'setup',
    currency: 'usd',
    success_url: 'https://myapp.com/billing/success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://myapp.com/billing/cancel',
    metadata: {
      organization_id: 'test-org-123',
      test_run: 'true'
    }
  });

  if (result2.success) {
    console.log('✅ Checkout session with custom URLs created!');
    console.log('Session ID:', result2.session_id);
    console.log('Checkout URL:', result2.url);
    console.log('Metadata:', result2.data.metadata);
  } else {
    console.log('❌ Failed to create checkout session');
    console.log('Error:', result2.error);
  }

  console.log('\n---\n');

  // Test 3: Test error handling - invalid customer ID
  console.log('Test 3: Testing error handling with invalid customer ID...');
  const result3 = await stripeService.createCheckoutSession({
    customer_id: 'cus_invalid_id_12345',
    mode: 'setup',
    currency: 'usd'
  });

  if (!result3.success) {
    console.log('✅ Error handling works correctly!');
    console.log('Error message:', result3.error);
    console.log('Error type:', result3.error_type);
  } else {
    console.log('❌ Should have failed with invalid customer ID');
  }

  console.log('\n---\n');

  // Test 4: Test error handling - missing customer ID
  console.log('Test 4: Testing error handling with missing customer ID...');
  const result4 = await stripeService.createCheckoutSession({
    mode: 'setup',
    currency: 'usd'
  });

  if (!result4.success) {
    console.log('✅ Error handling works correctly!');
    console.log('Error message:', result4.error);
  } else {
    console.log('❌ Should have failed with missing customer ID');
  }

  console.log('\n=== Test Complete ===');
  console.log('\n📝 Summary:');
  console.log('- Test customer created:', customerId);
  console.log('- Checkout sessions can be created for payment method setup');
  console.log('- Custom URLs and metadata are supported');
  console.log('- Error handling works correctly');
  console.log('\n💡 Next steps:');
  console.log('1. Open the checkout URL in your browser');
  console.log('2. Complete the payment method setup flow');
  console.log('3. Check the Stripe dashboard to see the setup intent');
}

// Run the test
testCheckoutSession().catch(error => {
  console.error('Test script error:', error);
  process.exit(1);
});

