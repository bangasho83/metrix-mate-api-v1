#!/usr/bin/env node

/**
 * Test script for POST /api/billing/ingest
 * 
 * Usage:
 *   node scripts/test-billing-ingest.js <organizationId> <eventType> <credits>
 * 
 * Example:
 *   node scripts/test-billing-ingest.js 4CRMRogqT0aOBBsUs7Yq post_generation 10
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'https://social-apis-two.vercel.app';
const organizationId = process.argv[2];
const eventType = process.argv[3];
const credits = parseInt(process.argv[4], 10);

if (!organizationId || !eventType || !credits) {
  console.error('❌ Error: Missing required arguments');
  console.log('\nUsage:');
  console.log('  node scripts/test-billing-ingest.js <organizationId> <eventType> <credits>');
  console.log('\nExample:');
  console.log('  node scripts/test-billing-ingest.js 4CRMRogqT0aOBBsUs7Yq post_generation 10');
  console.log('\nCommon Event Types:');
  console.log('  - post_generation (10 credits)');
  console.log('  - image_generation (25 credits)');
  console.log('  - calendar_generation (50 credits)');
  console.log('  - ad_generation (30 credits)');
  process.exit(1);
}

if (isNaN(credits) || credits <= 0) {
  console.error('❌ Error: credits must be a positive number');
  process.exit(1);
}

async function testBillingIngest() {
  console.log('🧪 Testing POST /api/billing/ingest');
  console.log('====================================\n');

  // Step 1: Check organization exists and has billing
  console.log('Step 1: Checking organization...');
  try {
    const orgResponse = await axios.get(
      `${API_URL}/api/organizations?organizationId=${organizationId}`
    );

    const org = orgResponse.data.organization;
    
    console.log('✅ Organization found:');
    console.log('  ID:', org.id);
    console.log('  Name:', org.organizationName);
    console.log('  Billing Customer ID:', org.billingCustomerId || 'NOT CONFIGURED');
    console.log('');

    if (!org.billingCustomerId) {
      console.error('❌ Organization does not have billing configured');
      console.log('\nTo configure billing, run:');
      console.log(`  curl -X PATCH ${API_URL}/api/organizations \\`);
      console.log(`    -H "Content-Type: application/json" \\`);
      console.log(`    -d '{"organizationId": "${organizationId}"}'`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Failed to fetch organization:');
    console.error(error.response?.data || error.message);
    process.exit(1);
  }

  // Step 2: Check current balance
  console.log('Step 2: Checking current balance...');
  try {
    const balanceResponse = await axios.get(
      `${API_URL}/api/billing/balance?organizationId=${organizationId}`
    );

    const balance = balanceResponse.data;
    
    console.log('✅ Current balance:');
    console.log('  Total Credits:', balance.totalCredits);
    console.log('  Status:', balance.status);
    console.log('');

    if (balance.totalCredits < credits) {
      console.warn('⚠️  Warning: Insufficient credits!');
      console.warn(`  Required: ${credits}`);
      console.warn(`  Available: ${balance.totalCredits}`);
      console.warn('  The ingest may fail due to insufficient credits.');
      console.log('');
    }
  } catch (error) {
    console.warn('⚠️  Could not check balance:');
    console.warn(error.response?.data?.error || error.message);
    console.log('');
  }

  // Step 3: Ingest billing event
  console.log('Step 3: Ingesting billing event...');
  console.log('  Event Type:', eventType);
  console.log('  Credits:', credits);
  console.log('');

  try {
    const ingestResponse = await axios.post(
      `${API_URL}/api/billing/ingest`,
      {
        organizationId,
        eventType,
        credits,
        userId: 'test-user-123',
        brandId: 'test-brand-456',
        properties: {
          test: true,
          source: 'test-script',
          timestamp: new Date().toISOString()
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Event ingested successfully!\n');
    console.log('Response:');
    console.log(JSON.stringify(ingestResponse.data, null, 2));
    console.log('');

    console.log('Transaction Details:');
    console.log('  Transaction ID:', ingestResponse.data.transactionId);
    console.log('  Event Type:', ingestResponse.data.eventType);
    console.log('  Credits Consumed:', ingestResponse.data.credits);
    console.log('  Timestamp:', ingestResponse.data.timestamp);
    console.log('');

  } catch (error) {
    console.error('❌ Failed to ingest event:');
    console.error('Status:', error.response?.status);
    console.error('Error:', JSON.stringify(error.response?.data, null, 2));
    console.log('');
    process.exit(1);
  }

  // Step 4: Check updated balance
  console.log('Step 4: Checking updated balance...');
  try {
    const balanceResponse = await axios.get(
      `${API_URL}/api/billing/balance?organizationId=${organizationId}`
    );

    const balance = balanceResponse.data;
    
    console.log('✅ Updated balance:');
    console.log('  Total Credits:', balance.totalCredits);
    console.log('  Credits Consumed:', credits);
    console.log('  Status:', balance.status);
    console.log('');

  } catch (error) {
    console.warn('⚠️  Could not check updated balance:');
    console.warn(error.response?.data?.error || error.message);
    console.log('');
  }

  console.log('====================================');
  console.log('✅ Test complete!');
  console.log('');
  console.log('Next steps:');
  console.log('  - Check Metronome dashboard for the event');
  console.log('  - Verify credit balance was updated');
  console.log('  - Check transaction ID is unique');
}

testBillingIngest().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});

