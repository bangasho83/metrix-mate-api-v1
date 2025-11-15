#!/usr/bin/env node

/**
 * Test script for Metronome free trial contract creation
 */

require('dotenv').config();
const metronomeService = require('../services/metronome-service');

async function testFreeTrialContract() {
  console.log('🧪 Testing Metronome Free Trial Contract Creation...\n');

  try {
    // First, create a test customer
    const testOrgName = `Test Org ${Date.now()}`;
    const testOrgId = `test-org-${Date.now()}`;

    console.log('1️⃣ Creating test customer...');
    const customerResult = await metronomeService.createCustomer({
      external_id: testOrgId,
      name: testOrgName,
      custom_fields: {}
    });

    if (!customerResult.success) {
      console.error('❌ Failed to create customer:', customerResult.error);
      return;
    }

    console.log('✅ Customer created successfully!');
    console.log('   Customer ID:', customerResult.metronome_id);
    console.log('   External ID:', customerResult.external_id);

    // Create free trial contract
    console.log('\n2️⃣ Creating free trial contract (500 credits)...');
    const trialResult = await metronomeService.createFreeTrialContract(
      customerResult.metronome_id
    );

    if (trialResult.success) {
      console.log('✅ Free trial contract created successfully!');
      console.log('   Contract ID:', trialResult.contract_id);
      console.log('   Credits:', trialResult.credits);
      console.log('   Customer ID:', customerResult.metronome_id);
    } else {
      console.log('❌ Failed to create free trial contract');
      console.log('   Error:', trialResult.error);
      console.log('   Details:', JSON.stringify(trialResult.details, null, 2));
    }

    console.log('\n' + '='.repeat(60));
    console.log('🏁 Test completed!\n');

    console.log('Summary:');
    console.log('  Customer ID:', customerResult.metronome_id);
    console.log('  Contract ID:', trialResult.contract_id || 'N/A');
    console.log('  Credits:', trialResult.credits || 'N/A');
    console.log('  Status:', trialResult.success ? '✅ Success' : '❌ Failed');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
if (require.main === module) {
  testFreeTrialContract().catch(error => {
    console.error('❌ Test script failed:', error);
    process.exit(1);
  });
}

module.exports = { testFreeTrialContract };

