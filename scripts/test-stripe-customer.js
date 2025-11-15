/**
 * Test script for Stripe customer creation
 * Tests the createCustomer function in stripe-service.js
 */

require('dotenv').config();
const stripeService = require('../services/stripe-service');

async function testCreateCustomer() {
  console.log('=== Testing Stripe Customer Creation ===\n');

  // Test 1: Create a basic customer
  console.log('Test 1: Creating a basic customer...');
  const result1 = await stripeService.createCustomer({
    name: 'Test Customer',
    email: 'test@example.com'
  });

  if (result1.success) {
    console.log('✅ Customer created successfully!');
    console.log('Customer ID:', result1.stripe_id);
    console.log('Name:', result1.name);
    console.log('Email:', result1.email);
    console.log('Full data:', JSON.stringify(result1.data, null, 2));
  } else {
    console.log('❌ Failed to create customer');
    console.log('Error:', result1.error);
    console.log('Details:', result1.details);
  }

  console.log('\n---\n');

  // Test 2: Create a customer with metadata
  console.log('Test 2: Creating a customer with metadata...');
  const result2 = await stripeService.createCustomer({
    name: 'Customer with Metadata',
    email: 'metadata@example.com',
    description: 'Test customer with custom metadata',
    metadata: {
      organization_id: 'org_123456',
      plan: 'premium',
      signup_date: new Date().toISOString()
    }
  });

  if (result2.success) {
    console.log('✅ Customer with metadata created successfully!');
    console.log('Customer ID:', result2.stripe_id);
    console.log('Metadata:', result2.data.metadata);
  } else {
    console.log('❌ Failed to create customer with metadata');
    console.log('Error:', result2.error);
  }

  console.log('\n---\n');

  // Test 3: Create a customer with full details
  console.log('Test 3: Creating a customer with full details...');
  const result3 = await stripeService.createCustomer({
    name: 'Full Details Customer',
    email: 'fulldetails@example.com',
    description: 'Customer with complete information',
    phone: '+1234567890',
    address: {
      line1: '123 Main St',
      line2: 'Apt 4B',
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94102',
      country: 'US'
    },
    metadata: {
      source: 'test_script',
      environment: 'development'
    }
  });

  if (result3.success) {
    console.log('✅ Customer with full details created successfully!');
    console.log('Customer ID:', result3.stripe_id);
    console.log('Phone:', result3.data.phone);
    console.log('Address:', result3.data.address);
  } else {
    console.log('❌ Failed to create customer with full details');
    console.log('Error:', result3.error);
  }

  console.log('\n---\n');

  // Test 4: Test error handling - invalid email
  console.log('Test 4: Testing error handling with invalid email...');
  const result4 = await stripeService.createCustomer({
    name: 'Invalid Email Customer',
    email: 'not-an-email'
  });

  if (!result4.success) {
    console.log('✅ Error handling works correctly!');
    console.log('Error message:', result4.error);
  } else {
    console.log('❌ Should have failed with invalid email');
  }

  console.log('\n---\n');

  // Test 5: Get customer (if we created one successfully)
  if (result1.success) {
    console.log('Test 5: Retrieving customer by ID...');
    const getResult = await stripeService.getCustomer(result1.stripe_id);

    if (getResult.success) {
      console.log('✅ Customer retrieved successfully!');
      console.log('Customer ID:', getResult.data.id);
      console.log('Name:', getResult.data.name);
      console.log('Email:', getResult.data.email);
    } else {
      console.log('❌ Failed to retrieve customer');
      console.log('Error:', getResult.error);
    }

    console.log('\n---\n');

    // Test 6: Update customer
    console.log('Test 6: Updating customer...');
    const updateResult = await stripeService.updateCustomer(result1.stripe_id, {
      description: 'Updated description',
      metadata: {
        updated_at: new Date().toISOString(),
        test: 'true'
      }
    });

    if (updateResult.success) {
      console.log('✅ Customer updated successfully!');
      console.log('Description:', updateResult.data.description);
      console.log('Metadata:', updateResult.data.metadata);
    } else {
      console.log('❌ Failed to update customer');
      console.log('Error:', updateResult.error);
    }

    console.log('\n---\n');
  }

  // Test 7: List customers
  console.log('Test 7: Listing customers...');
  const listResult = await stripeService.listCustomers({ limit: 5 });

  if (listResult.success) {
    console.log('✅ Customers listed successfully!');
    console.log('Number of customers:', listResult.data.length);
    console.log('Has more:', listResult.has_more);
    console.log('First customer:', listResult.data[0]?.name || 'N/A');
  } else {
    console.log('❌ Failed to list customers');
    console.log('Error:', listResult.error);
  }

  console.log('\n=== Test Complete ===');
}

// Run the test
testCreateCustomer().catch(error => {
  console.error('Test script error:', error);
  process.exit(1);
});

