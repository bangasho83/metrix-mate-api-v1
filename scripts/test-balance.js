#!/usr/bin/env node

/**
 * Test script for Metronome customer balance check
 */

require('dotenv').config();
const metronomeService = require('../services/metronome-service');

async function testCustomerBalance() {
  console.log('🧪 Testing Metronome Customer Balance Check...\n');

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

    // Create free trial contract
    console.log('\n2️⃣ Creating free trial contract (500 credits)...');
    const trialResult = await metronomeService.createFreeTrialContract(
      customerResult.metronome_id
    );

    if (!trialResult.success) {
      console.error('❌ Failed to create free trial:', trialResult.error);
      return;
    }

    console.log('✅ Free trial contract created!');
    console.log('   Contract ID:', trialResult.contract_id);
    console.log('   Credits:', trialResult.credits);

    // Wait a moment for the contract to be processed
    console.log('\n⏳ Waiting 2 seconds for contract to be processed...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check customer balance
    console.log('\n3️⃣ Checking customer balance...');
    const balanceResult = await metronomeService.getCustomerBalance(
      customerResult.metronome_id
    );

    if (balanceResult.success) {
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
        });
      }
    } else {
      console.log('❌ Failed to retrieve balance');
      console.log('   Error:', balanceResult.error);
      console.log('   Details:', JSON.stringify(balanceResult.details, null, 2));
    }

    console.log('\n' + '='.repeat(60));
    console.log('🏁 Test completed!\n');

    console.log('Summary:');
    console.log('  Customer ID:', customerResult.metronome_id);
    console.log('  Contract ID:', trialResult.contract_id);
    console.log('  Total Balance:', balanceResult.total_balance || 'N/A', 'credits');
    console.log('  Status:', balanceResult.success ? '✅ Success' : '❌ Failed');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
if (require.main === module) {
  testCustomerBalance().catch(error => {
    console.error('❌ Test script failed:', error);
    process.exit(1);
  });
}

module.exports = { testCustomerBalance };

