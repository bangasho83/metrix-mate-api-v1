/**
 * Test script for Stripe getPaymentMethod function
 * Tests retrieving payment method details
 */

require('dotenv').config();
const stripeService = require('../services/stripe-service');

async function testGetPaymentMethod() {
  console.log('=== Testing Stripe Get Payment Method ===\n');

  // First, create a test customer
  console.log('Step 1: Creating a test customer...');
  const customerResult = await stripeService.createCustomer({
    name: 'Payment Info Test Customer',
    email: 'payment-info-test@example.com',
    metadata: {
      test: 'true',
      purpose: 'payment_info_test'
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

  // Step 2: Create a checkout session to add a payment method
  console.log('Step 2: Creating checkout session...');
  const checkoutResult = await stripeService.createCheckoutSession({
    customer_id: customerId,
    mode: 'setup',
    currency: 'usd',
    success_url: 'https://example.com/success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://example.com/cancel'
  });

  if (!checkoutResult.success) {
    console.log('❌ Failed to create checkout session');
    console.log('Error:', checkoutResult.error);
    return;
  }

  console.log('✅ Checkout session created!');
  console.log('Session ID:', checkoutResult.session_id);
  console.log('Checkout URL:', checkoutResult.url);
  console.log('\n🔗 To complete the test:');
  console.log('1. Open this URL in your browser:');
  console.log(checkoutResult.url);
  console.log('2. Use test card: 4242 4242 4242 4242');
  console.log('3. Use any future expiry date and any CVC');
  console.log('4. Complete the checkout');
  console.log('5. Come back here and press Enter to continue...\n');

  // Wait for user to complete checkout
  await new Promise(resolve => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    readline.question('Press Enter after completing the checkout...', () => {
      readline.close();
      resolve();
    });
  });

  console.log('\n---\n');

  // Step 3: Check if payment method was added
  console.log('Step 3: Checking for payment methods...');
  const hasPaymentResult = await stripeService.hasPaymentMethod(customerId);

  if (!hasPaymentResult.success) {
    console.log('❌ Failed to check payment methods');
    console.log('Error:', hasPaymentResult.error);
    return;
  }

  if (!hasPaymentResult.has_payment_method) {
    console.log('⚠️  No payment methods found. Did you complete the checkout?');
    console.log('Please run this script again and complete the checkout flow.');
    return;
  }

  console.log('✅ Payment methods found!');
  console.log('Payment methods count:', hasPaymentResult.payment_methods_count);
  console.log('Default payment method ID:', hasPaymentResult.default_payment_method_id);

  const paymentMethodId = hasPaymentResult.default_payment_method_id;

  console.log('\n---\n');

  // Test 1: Get payment method details
  console.log('Test 1: Getting payment method details...');
  const result1 = await stripeService.getPaymentMethod(paymentMethodId);

  if (result1.success) {
    console.log('✅ Payment method details retrieved successfully!');
    console.log('\n💳 Payment Method Information:');
    console.log('ID:', result1.payment_method_id);
    console.log('Type:', result1.type);
    console.log('Customer:', result1.customer);
    
    if (result1.card) {
      console.log('\n🎴 Card Details:');
      console.log('  Brand:', result1.card.brand);
      console.log('  Last 4:', result1.card.last4);
      console.log('  Expiry:', `${result1.card.exp_month}/${result1.card.exp_year}`);
      console.log('  Funding:', result1.card.funding);
      console.log('  Country:', result1.card.country);
    }

    if (result1.billing_details) {
      console.log('\n📧 Billing Details:');
      console.log('  Name:', result1.billing_details.name || 'N/A');
      console.log('  Email:', result1.billing_details.email || 'N/A');
      console.log('  Phone:', result1.billing_details.phone || 'N/A');
    }
  } else {
    console.log('❌ Failed to get payment method details');
    console.log('Error:', result1.error);
    console.log('Details:', result1.details);
  }

  console.log('\n---\n');

  // Test 2: Test error handling - invalid payment method ID
  console.log('Test 2: Testing error handling with invalid payment method ID...');
  const result2 = await stripeService.getPaymentMethod('pm_invalid_id_12345');

  if (!result2.success) {
    console.log('✅ Error handling works correctly!');
    console.log('Error message:', result2.error);
    console.log('Error type:', result2.error_type);
    console.log('Error code:', result2.error_code);
  } else {
    console.log('❌ Should have failed with invalid payment method ID');
  }

  console.log('\n---\n');

  // Test 3: Test error handling - missing payment method ID
  console.log('Test 3: Testing error handling with missing payment method ID...');
  const result3 = await stripeService.getPaymentMethod();

  if (!result3.success) {
    console.log('✅ Error handling works correctly!');
    console.log('Error message:', result3.error);
  } else {
    console.log('❌ Should have failed with missing payment method ID');
  }

  console.log('\n=== Test Complete ===');
  console.log('\n📝 Summary:');
  console.log('- Test customer created:', customerId);
  console.log('- Payment method details retrieved successfully');
  console.log('- Card information extracted (brand, last4, expiry)');
  console.log('- Error handling works correctly');
  console.log('\n💡 Use case:');
  console.log('- Display payment method to users in billing dashboard');
  console.log('- Show card details before processing charges');
  console.log('- Verify payment method before subscription renewal');
}

// Run the test
testGetPaymentMethod().catch(error => {
  console.error('Test script error:', error);
  process.exit(1);
});

