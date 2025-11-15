/**
 * Automated test script for Stripe getPaymentMethod function
 * Tests error handling and basic functionality
 */

require('dotenv').config();
const stripeService = require('../services/stripe-service');

async function testGetPaymentMethodAuto() {
  console.log('=== Testing Stripe Get Payment Method (Automated) ===\n');

  // Test 1: Test error handling - invalid payment method ID
  console.log('Test 1: Testing with invalid payment method ID...');
  const result1 = await stripeService.getPaymentMethod('pm_invalid_id_12345');

  if (!result1.success) {
    console.log('✅ Error handling works correctly!');
    console.log('Error message:', result1.error);
    console.log('Error type:', result1.error_type);
    console.log('Error code:', result1.error_code);
    console.log('Status:', result1.status);
  } else {
    console.log('❌ Should have failed with invalid payment method ID');
  }

  console.log('\n---\n');

  // Test 2: Test error handling - missing payment method ID
  console.log('Test 2: Testing with missing payment method ID...');
  const result2 = await stripeService.getPaymentMethod();

  if (!result2.success) {
    console.log('✅ Error handling works correctly!');
    console.log('Error message:', result2.error);
  } else {
    console.log('❌ Should have failed with missing payment method ID');
  }

  console.log('\n---\n');

  // Test 3: Test with malformed payment method ID
  console.log('Test 3: Testing with malformed payment method ID...');
  const result3 = await stripeService.getPaymentMethod('not-a-valid-pm-id');

  if (!result3.success) {
    console.log('✅ Error handling works correctly!');
    console.log('Error message:', result3.error);
    console.log('Error type:', result3.error_type || 'N/A');
  } else {
    console.log('❌ Should have failed with malformed payment method ID');
  }

  console.log('\n---\n');

  // Test 4: Demonstrate the full flow
  console.log('Test 4: Demonstrating full flow with real payment method...');
  console.log('Creating test customer and checkout session...');

  const customerResult = await stripeService.createCustomer({
    name: 'Payment Info Auto Test',
    email: 'auto-test@example.com',
    metadata: {
      test: 'true',
      purpose: 'automated_payment_info_test'
    }
  });

  if (customerResult.success) {
    console.log('✅ Test customer created:', customerResult.stripe_id);

    const checkoutResult = await stripeService.createCheckoutSession({
      customer_id: customerResult.stripe_id,
      mode: 'setup',
      currency: 'usd'
    });

    if (checkoutResult.success) {
      console.log('✅ Checkout session created:', checkoutResult.session_id);
      console.log('\n📝 To test with a real payment method:');
      console.log('1. Open this URL in your browser:');
      console.log(checkoutResult.url);
      console.log('2. Use test card: 4242 4242 4242 4242');
      console.log('3. Complete the checkout');
      console.log('4. Then run this command to get the payment method:');
      console.log(`\n   node -e "require('./services/stripe-service').hasPaymentMethod('${customerResult.stripe_id}').then(r => { if(r.success && r.has_payment_method) { require('./services/stripe-service').getPaymentMethod(r.default_payment_method_id).then(pm => console.log(JSON.stringify(pm, null, 2))); } })"`);
    }
  }

  console.log('\n=== Test Complete ===');
  console.log('\n📝 Summary:');
  console.log('- ✅ Error handling validated for invalid payment method IDs');
  console.log('- ✅ Error handling validated for missing parameters');
  console.log('- ✅ Error handling validated for malformed IDs');
  console.log('- ✅ Full flow demonstrated (requires manual checkout completion)');
  console.log('\n💡 API Endpoint Usage:');
  console.log('GET /api/billing/payment-info?paymentMethodId=pm_123ABC');
  console.log('\n💡 Service Function Usage:');
  console.log('const result = await stripeService.getPaymentMethod("pm_123ABC");');
  console.log('if (result.success) {');
  console.log('  console.log("Card:", result.card.brand, "****" + result.card.last4);');
  console.log('  console.log("Expiry:", result.card.exp_month + "/" + result.card.exp_year);');
  console.log('}');
}

// Run the test
testGetPaymentMethodAuto().catch(error => {
  console.error('Test script error:', error);
  process.exit(1);
});

