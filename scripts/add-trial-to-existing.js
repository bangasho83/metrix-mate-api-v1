#!/usr/bin/env node

/**
 * Script to add free trial contracts to existing customers who don't have one
 * This is useful for customers created before the free trial feature was added
 */

require('dotenv').config();
const metronomeService = require('../services/metronome-service');

async function addTrialToExistingCustomer(customerId) {
  console.log('🔧 Adding free trial to existing customer...\n');
  console.log('Customer ID:', customerId);

  try {
    // Step 1: Check current balance
    console.log('\n1️⃣ Checking current balance...');
    const currentBalance = await metronomeService.getCustomerBalance(customerId);

    if (!currentBalance.success) {
      console.error('❌ Failed to fetch current balance:', currentBalance.error);
      return { success: false, error: currentBalance.error };
    }

    console.log('Current Balance:', currentBalance.total_balance, 'credits');
    console.log('Current Credits Count:', currentBalance.credits.length);

    if (currentBalance.credits.length > 0) {
      console.log('\n⚠️  Customer already has credits:');
      currentBalance.credits.forEach((credit, index) => {
        console.log(`   ${index + 1}. ${credit.name}: ${credit.balance} credits`);
      });
      
      const hasFreeTrial = currentBalance.credits.some(c => 
        c.name === 'Free Trial Credits'
      );

      if (hasFreeTrial) {
        console.log('\n✅ Customer already has Free Trial Credits. No action needed.');
        return { success: true, message: 'Customer already has free trial' };
      }
    }

    // Step 2: Create free trial contract
    console.log('\n2️⃣ Creating free trial contract (500 credits)...');
    const trialResult = await metronomeService.createFreeTrialContract(customerId);

    if (!trialResult.success) {
      console.error('❌ Failed to create free trial contract');
      console.error('   Error:', trialResult.error);
      console.error('   Details:', JSON.stringify(trialResult.details, null, 2));
      return { success: false, error: trialResult.error };
    }

    console.log('✅ Free trial contract created successfully!');
    console.log('   Contract ID:', trialResult.contract_id);
    console.log('   Credits:', trialResult.credits);

    // Step 3: Wait and verify
    console.log('\n⏳ Waiting 3 seconds for contract to be processed...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('\n3️⃣ Verifying new balance...');
    const newBalance = await metronomeService.getCustomerBalance(customerId);

    if (!newBalance.success) {
      console.error('❌ Failed to verify new balance:', newBalance.error);
      return { success: false, error: newBalance.error };
    }

    console.log('✅ New Balance:', newBalance.total_balance, 'credits');
    console.log('   Credits Count:', newBalance.credits.length);

    if (newBalance.credits.length > 0) {
      console.log('\n   Credit Details:');
      newBalance.credits.forEach((credit, index) => {
        console.log(`   ${index + 1}. ${credit.name}: ${credit.balance} credits`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('🏁 Free trial added successfully!\n');

    return {
      success: true,
      contract_id: trialResult.contract_id,
      old_balance: currentBalance.total_balance,
      new_balance: newBalance.total_balance,
      credits_added: newBalance.total_balance - currentBalance.total_balance
    };

  } catch (error) {
    console.error('\n❌ Failed to add free trial:', error.message);
    console.error('Stack:', error.stack);
    return { success: false, error: error.message };
  }
}

// Run the script
if (require.main === module) {
  const customerId = process.argv[2];

  if (!customerId) {
    console.error('❌ Usage: node scripts/add-trial-to-existing.js <CUSTOMER_ID>');
    console.error('\nExample:');
    console.error('  node scripts/add-trial-to-existing.js c6330dab-5b2a-43bc-a6c4-acc576c1fbe5');
    process.exit(1);
  }

  addTrialToExistingCustomer(customerId).catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

module.exports = { addTrialToExistingCustomer };

