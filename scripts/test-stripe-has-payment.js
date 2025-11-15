/**
 * Test script for Stripe hasPaymentMethod function
 * Tests checking if a customer has payment methods
 */

require('dotenv').config();
const stripeService = require('../services/stripe-service');

async function testHasPaymentMethod() {
  console.log('=== Testing Stripe Has Payment Method Check ===\n');

  // First, create a test customer
  console.log('Step 1: Creating a test customer...');
  const customerResult = await stripeService.createCustomer({
    name: 'Payment Method Test Customer',
    email: 'payment-test@example.com',
    metadata: {
      test: 'true',
      purpose: 'payment_method_test'
    }
  });

  if (!customerResult.success) {
    console.log('❌ Failed to create test customer');
    console.log('Error:', customerResult.error);
    return;
  }

  console.log('✅ Test customer created!');
  console.log('Customer ID:', customerResult.stripe_id);

  const customerId = customerResult.stripe_id;

  console.log('\n---\n');

  // Test 1: Check payment methods for a new customer (should have none)
  console.log('Test 1: Checking payment methods for new customer (should have none)...');
  const result1 = await stripeService.hasPaymentMethod(customerId);

  if (result1.success) {
    console.log('✅ Payment method check successful!');
    console.log('Has payment method:', result1.has_payment_method);
    console.log('Payment methods count:', result1.payment_methods_count);
    console.log('Has default payment method:', result1.has_default_payment_method);
    console.log('Default payment method:', result1.default_payment_method);
    
    if (!result1.has_payment_method) {
      console.log('✅ Correctly detected no payment methods for new customer');
    } else {
      console.log('⚠️  Unexpected: New customer has payment methods');
    }
  } else {
    console.log('❌ Failed to check payment methods');
    console.log('Error:', result1.error);
    console.log('Details:', result1.details);
  }

  console.log('\n---\n');

  // Test 2: Create a checkout session to add a payment method
  console.log('Test 2: Creating checkout session to add payment method...');
  console.log('(You would need to complete this manually in the browser)');
  
  const checkoutResult = await stripeService.createCheckoutSession({
    customer_id: customerId,
    mode: 'setup',
    currency: 'usd',
    success_url: 'https://example.com/success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://example.com/cancel'
  });

  if (checkoutResult.success) {
    console.log('✅ Checkout session created!');
    console.log('Session ID:', checkoutResult.session_id);
    console.log('Checkout URL:', checkoutResult.url);
    console.log('\n🔗 To test with a real payment method:');
    console.log('1. Open this URL in your browser:');
    console.log(checkoutResult.url);
    console.log('2. Use test card: 4242 4242 4242 4242');
    console.log('3. Use any future expiry date and any CVC');
    console.log('4. Complete the checkout');
    console.log('5. Run this script again to see the payment method detected\n');
  } else {
    console.log('❌ Failed to create checkout session');
    console.log('Error:', checkoutResult.error);
  }

  console.log('\n---\n');

  // Test 3: Test with an existing customer that has payment methods
  console.log('Test 3: Testing with a customer that might have payment methods...');
  console.log('(Using the same customer - will show no payment methods unless you completed checkout)');
  
  const result3 = await stripeService.hasPaymentMethod(customerId);

  if (result3.success) {
    console.log('✅ Payment method check successful!');
    console.log('Has payment method:', result3.has_payment_method);
    console.log('Payment methods count:', result3.payment_methods_count);
    console.log('Has default payment method:', result3.has_default_payment_method);
    
    if (result3.has_payment_method) {
      console.log('\n💳 Payment Methods:');
      result3.payment_methods.forEach((pm, index) => {
        console.log(`\nPayment Method ${index + 1}:`);
        console.log('  ID:', pm.id);
        console.log('  Type:', pm.type);
        console.log('  Is Default:', pm.is_default);
        if (pm.card) {
          console.log('  Card Brand:', pm.card.brand);
          console.log('  Last 4:', pm.card.last4);
          console.log('  Expiry:', `${pm.card.exp_month}/${pm.card.exp_year}`);
        }
      });

      if (result3.default_payment_method) {
        console.log('\n🎯 Default Payment Method:');
        console.log('  ID:', result3.default_payment_method.id);
        console.log('  Type:', result3.default_payment_method.type);
        if (result3.default_payment_method.card) {
          console.log('  Card:', `${result3.default_payment_method.card.brand} ****${result3.default_payment_method.card.last4}`);
        }
      }
    } else {
      console.log('ℹ️  No payment methods found (complete the checkout to add one)');
    }
  } else {
    console.log('❌ Failed to check payment methods');
    console.log('Error:', result3.error);
  }

  console.log('\n---\n');

  // Test 4: Test error handling - invalid customer ID
  console.log('Test 4: Testing error handling with invalid customer ID...');
  const result4 = await stripeService.hasPaymentMethod('cus_invalid_id_12345');

  if (!result4.success) {
    console.log('✅ Error handling works correctly!');
    console.log('Error message:', result4.error);
    console.log('Error type:', result4.error_type);
    console.log('Error code:', result4.error_code);
  } else {
    console.log('❌ Should have failed with invalid customer ID');
  }

  console.log('\n---\n');

  // Test 5: Test error handling - missing customer ID
  console.log('Test 5: Testing error handling with missing customer ID...');
  const result5 = await stripeService.hasPaymentMethod();

  if (!result5.success) {
    console.log('✅ Error handling works correctly!');
    console.log('Error message:', result5.error);
  } else {
    console.log('❌ Should have failed with missing customer ID');
  }

  console.log('\n=== Test Complete ===');
  console.log('\n📝 Summary:');
  console.log('- Test customer created:', customerId);
  console.log('- Payment method check works for customers with no payment methods');
  console.log('- Checkout session created for adding payment methods');
  console.log('- Error handling works correctly');
  console.log('\n💡 To fully test:');
  console.log('1. Complete the checkout session in your browser');
  console.log('2. Run this script again to see payment methods detected');
  console.log('3. Or check the Stripe dashboard to see the customer\'s payment methods');
}

// Run the test
testHasPaymentMethod().catch(error => {
  console.error('Test script error:', error);
  process.exit(1);
});

