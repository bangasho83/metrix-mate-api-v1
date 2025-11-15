#!/usr/bin/env node

/**
 * Test script to verify organization creation with free trial
 */

require('dotenv').config();
const metronomeService = require('../services/metronome-service');

async function testOrganizationWithTrial() {
  console.log('🧪 Testing Complete Organization Creation Flow...\n');

  try {
    const testOrgName = `Test Org ${Date.now()}`;
    const testOrgId = `test-org-${Date.now()}`;

    // Step 1: Create customer
    console.log('1️⃣ Creating Metronome customer...');
    const customerResult = await metronomeService.createCustomer({
      external_id: testOrgId,
      name: testOrgName,
      custom_fields: {}
    });

    if (!customerResult.success) {
      console.error('❌ Failed to create customer:', customerResult.error);
      console.error('Details:', JSON.stringify(customerResult.details, null, 2));
      return;
    }

    console.log('✅ Customer created successfully!');
    console.log('   Customer ID:', customerResult.metronome_id);
    console.log('   External ID:', customerResult.external_id);

    // Step 2: Create free trial contract
    console.log('\n2️⃣ Creating free trial contract (500 credits)...');
    const trialResult = await metronomeService.createFreeTrialContract(
      customerResult.metronome_id
    );

    if (!trialResult.success) {
      console.error('❌ Failed to create free trial contract');
      console.error('   Error:', trialResult.error);
      console.error('   Status:', trialResult.status);
      console.error('   Details:', JSON.stringify(trialResult.details, null, 2));
      return;
    }

    console.log('✅ Free trial contract created successfully!');
    console.log('   Contract ID:', trialResult.contract_id);
    console.log('   Credits:', trialResult.credits);

    // Step 3: Wait for contract to be processed
    console.log('\n⏳ Waiting 3 seconds for contract to be processed...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 4: Check balance
    console.log('\n3️⃣ Checking customer balance...');
    const balanceResult = await metronomeService.getCustomerBalance(
      customerResult.metronome_id
    );

    if (!balanceResult.success) {
      console.error('❌ Failed to retrieve balance');
      console.error('   Error:', balanceResult.error);
      console.error('   Details:', JSON.stringify(balanceResult.details, null, 2));
      return;
    }

    console.log('✅ Balance retrieved successfully!');
    console.log('   Total Balance:', balanceResult.total_balance, 'credits');
    console.log('   Credits Count:', balanceResult.credits.length);

    if (balanceResult.credits.length > 0) {
      console.log('\n   Credit Details:');
      balanceResult.credits.forEach((credit, index) => {
        console.log(`   ${index + 1}. ${credit.name}`);
        console.log(`      Balance: ${credit.balance} credits`);
        console.log(`      Type: ${credit.type}`);
        console.log(`      Product: ${credit.product?.name || 'N/A'}`);
        if (credit.access_schedule?.schedule_items?.[0]) {
          const schedule = credit.access_schedule.schedule_items[0];
          console.log(`      Amount: ${schedule.amount}`);
          console.log(`      Starting: ${schedule.starting_at}`);
          console.log(`      Ending: ${schedule.ending_before || 'N/A'}`);
        }
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('🏁 Test completed successfully!\n');

    console.log('Summary:');
    console.log('  Customer ID:', customerResult.metronome_id);
    console.log('  External ID:', customerResult.external_id);
    console.log('  Contract ID:', trialResult.contract_id);
    console.log('  Total Balance:', balanceResult.total_balance, 'credits');
    console.log('  Expected Balance: 500 credits');
    console.log('  Status:', balanceResult.total_balance === 500 ? '✅ PASS' : '⚠️  MISMATCH');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
if (require.main === module) {
  testOrganizationWithTrial().catch(error => {
    console.error('❌ Test script failed:', error);
    process.exit(1);
  });
}

module.exports = { testOrganizationWithTrial };

