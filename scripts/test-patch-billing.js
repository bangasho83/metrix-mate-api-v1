#!/usr/bin/env node

/**
 * Test script for PATCH /api/organizations (add billing)
 * 
 * Usage:
 *   node scripts/test-patch-billing.js <organizationId>
 * 
 * Example:
 *   node scripts/test-patch-billing.js 4CRMRogqT0aOBBsUs7Yq
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'https://social-apis-two.vercel.app';
const organizationId = process.argv[2];

if (!organizationId) {
  console.error('❌ Error: organizationId is required');
  console.log('\nUsage:');
  console.log('  node scripts/test-patch-billing.js <organizationId>');
  console.log('\nExample:');
  console.log('  node scripts/test-patch-billing.js 4CRMRogqT0aOBBsUs7Yq');
  process.exit(1);
}

async function testPatchBilling() {
  console.log('🧪 Testing PATCH /api/organizations');
  console.log('=====================================\n');

  // Step 1: Get organization details
  console.log('Step 1: Fetching organization details...');
  try {
    const getResponse = await axios.get(
      `${API_URL}/api/organizations?organizationId=${organizationId}`
    );

    console.log('✅ Organization found:');
    console.log(JSON.stringify(getResponse.data, null, 2));
    console.log('');
  } catch (error) {
    console.error('❌ Failed to fetch organization:');
    console.error(error.response?.data || error.message);
    console.log('');
  }

  // Step 2: Add billing
  console.log('Step 2: Adding billing to organization...');
  try {
    const patchResponse = await axios.patch(
      `${API_URL}/api/organizations`,
      {
        organizationId
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Billing added successfully:');
    console.log(JSON.stringify(patchResponse.data, null, 2));
    console.log('');
  } catch (error) {
    console.error('❌ Failed to add billing:');
    console.error('Status:', error.response?.status);
    console.error('Error:', JSON.stringify(error.response?.data, null, 2));
    console.log('');
  }

  // Step 3: Verify billing was added
  console.log('Step 3: Verifying billing was added...');
  try {
    const verifyResponse = await axios.get(
      `${API_URL}/api/organizations?organizationId=${organizationId}`
    );

    const org = verifyResponse.data.organization;
    
    if (org.billingCustomerId) {
      console.log('✅ Billing verified:');
      console.log('  Organization ID:', org.id);
      console.log('  Organization Name:', org.organizationName);
      console.log('  Billing Customer ID:', org.billingCustomerId);
    } else {
      console.log('❌ Billing not found on organization');
    }
    console.log('');
  } catch (error) {
    console.error('❌ Failed to verify:');
    console.error(error.response?.data || error.message);
    console.log('');
  }

  console.log('=====================================');
  console.log('✅ Test complete');
}

testPatchBilling().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

