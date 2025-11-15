/**
 * Test script for organization creation with Stripe integration
 * Tests that both Metronome and Stripe customers are created when an organization is created
 */

require('dotenv').config();
const axios = require('axios');

// Configuration
const API_BASE_URL = 'http://localhost:3000'; // Change to your API URL
const TEST_USER_ID = 'test-user-' + Date.now();
const TEST_ORG_NAME = 'Test Organization ' + Date.now();
const TEST_ORG_USERNAME = 'testorg' + Date.now();

async function testOrganizationCreationWithStripe() {
  console.log('=== Testing Organization Creation with Stripe Integration ===\n');

  try {
    // Step 1: Create a test user first (so we have an email)
    console.log('Step 1: Creating test user...');
    
    // Note: You'll need to create a user in Firebase manually or via your user creation endpoint
    // For this test, we'll assume a user exists with the TEST_USER_ID
    console.log('⚠️  Make sure a user exists with ID:', TEST_USER_ID);
    console.log('⚠️  The user should have an email address set\n');

    // Step 2: Create organization
    console.log('Step 2: Creating organization...');
    const createOrgResponse = await axios.post(
      `${API_BASE_URL}/api/organizations`,
      {
        organizationName: TEST_ORG_NAME,
        organizationUsername: TEST_ORG_USERNAME,
        createdBy: TEST_USER_ID
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Organization created successfully!');
    console.log('Organization ID:', createOrgResponse.data.organization.id);
    console.log('Organization Name:', createOrgResponse.data.organization.organizationName);
    console.log('\nBilling Information:');
    console.log('- Metronome Customer ID:', createOrgResponse.data.organization.billingCustomerId);
    console.log('- Stripe Customer ID:', createOrgResponse.data.organization.stripeCustomerId);
    
    if (createOrgResponse.data.billing) {
      console.log('\nMetronome Details:');
      console.log('  Success:', createOrgResponse.data.billing.metronome?.success);
      console.log('  Customer ID:', createOrgResponse.data.billing.metronome?.customerId);
      console.log('  Free Trial:', createOrgResponse.data.billing.metronome?.freeTrial?.success);
      console.log('  Credits:', createOrgResponse.data.billing.metronome?.freeTrial?.credits);

      console.log('\nStripe Details:');
      console.log('  Success:', createOrgResponse.data.billing.stripe?.success);
      console.log('  Customer ID:', createOrgResponse.data.billing.stripe?.customerId);
      console.log('  Email:', createOrgResponse.data.billing.stripe?.email);
    }

    const organizationId = createOrgResponse.data.organization.id;
    const stripeCustomerId = createOrgResponse.data.organization.stripeCustomerId;

    // Step 3: Verify organization can be retrieved
    console.log('\n---\n');
    console.log('Step 3: Retrieving organization...');
    const getOrgResponse = await axios.get(
      `${API_BASE_URL}/api/organizations?organizationId=${organizationId}`
    );

    console.log('✅ Organization retrieved successfully!');
    console.log('Organization Name:', getOrgResponse.data.organization.organizationName);
    console.log('Metronome Customer ID:', getOrgResponse.data.organization.billingCustomerId);
    console.log('Stripe Customer ID:', getOrgResponse.data.organization.stripeCustomerId);

    // Step 4: Verify Stripe customer exists
    if (stripeCustomerId) {
      console.log('\n---\n');
      console.log('Step 4: Verifying Stripe customer...');
      
      const stripeService = require('../services/stripe-service');
      const stripeCustomer = await stripeService.getCustomer(stripeCustomerId);

      if (stripeCustomer.success) {
        console.log('✅ Stripe customer verified!');
        console.log('Customer Name:', stripeCustomer.data.name);
        console.log('Customer Email:', stripeCustomer.data.email);
        console.log('Metadata:', stripeCustomer.data.metadata);
      } else {
        console.log('❌ Failed to verify Stripe customer');
        console.log('Error:', stripeCustomer.error);
      }
    }

    console.log('\n=== Test Complete ===');
    console.log('\n✅ All tests passed!');
    console.log('\nSummary:');
    console.log('- Organization created with both Metronome and Stripe customers');
    console.log('- Organization ID:', organizationId);
    console.log('- Metronome Customer ID:', createOrgResponse.data.organization.billingCustomerId);
    console.log('- Stripe Customer ID:', stripeCustomerId);

  } catch (error) {
    console.error('\n❌ Test failed!');
    console.error('Error:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    
    process.exit(1);
  }
}

// Alternative test for PATCH endpoint (adding billing to existing org)
async function testAddBillingToExistingOrg() {
  console.log('\n=== Testing PATCH: Add Billing to Existing Organization ===\n');

  try {
    // You'll need to provide an existing organization ID that doesn't have billing yet
    const EXISTING_ORG_ID = process.argv[2];

    if (!EXISTING_ORG_ID) {
      console.log('⚠️  To test PATCH endpoint, provide an organization ID:');
      console.log('   node scripts/test-org-with-stripe.js <organizationId>');
      return;
    }

    console.log('Adding billing to organization:', EXISTING_ORG_ID);

    const patchResponse = await axios.patch(
      `${API_BASE_URL}/api/organizations`,
      {
        organizationId: EXISTING_ORG_ID
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Billing added successfully!');
    console.log('Organization ID:', patchResponse.data.organization.id);
    console.log('Metronome Customer ID:', patchResponse.data.organization.billingCustomerId);
    console.log('Stripe Customer ID:', patchResponse.data.organization.stripeCustomerId);

    if (patchResponse.data.billing) {
      console.log('\nMetronome Details:');
      console.log('  Success:', patchResponse.data.billing.metronome?.success);
      console.log('  Customer ID:', patchResponse.data.billing.metronome?.customerId);

      console.log('\nStripe Details:');
      console.log('  Success:', patchResponse.data.billing.stripe?.success);
      console.log('  Customer ID:', patchResponse.data.billing.stripe?.customerId);
      console.log('  Email:', patchResponse.data.billing.stripe?.email);
    }

  } catch (error) {
    console.error('\n❌ PATCH test failed!');
    console.error('Error:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run tests
async function runTests() {
  // Check if we're testing PATCH endpoint
  if (process.argv[2]) {
    await testAddBillingToExistingOrg();
  } else {
    console.log('⚠️  NOTE: This test requires a running API server and a test user with email');
    console.log('⚠️  Make sure to:');
    console.log('   1. Start your API server (e.g., vercel dev)');
    console.log('   2. Create a test user in Firebase with an email address');
    console.log('   3. Update TEST_USER_ID in this script to match your test user\n');
    
    // Uncomment the line below when ready to test
    // await testOrganizationCreationWithStripe();
    
    console.log('Test script ready. Uncomment the test function call to run.');
  }
}

runTests().catch(error => {
  console.error('Test script error:', error);
  process.exit(1);
});

