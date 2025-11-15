#!/usr/bin/env node

/**
 * Script to check if a customer has a free trial contract
 * Usage: node scripts/check-customer-trial.js <CUSTOMER_ID or ORGANIZATION_ID>
 */

require('dotenv').config();
const metronomeService = require('../services/metronome-service');
const { db } = require('../services/firebase-service');

async function checkCustomerTrial(input) {
  console.log('🔍 Checking customer trial status...\n');

  try {
    let customerId = input;
    let organizationId = null;

    // Check if input is an organization ID (Firebase format)
    if (input.length < 30) {
      console.log('Input appears to be an organization ID. Looking up billing customer...');
      organizationId = input;
      
      const orgDoc = await db.collection('orgs').doc(organizationId).get();
      
      if (!orgDoc.exists) {
        console.error('❌ Organization not found:', organizationId);
        return;
      }

      const orgData = orgDoc.data();
      customerId = orgData.billingCustomerId;

      if (!customerId) {
        console.error('❌ Organization does not have a billing customer ID');
        console.log('Organization data:', orgData);
        return;
      }

      console.log('✅ Found billing customer ID:', customerId);
      console.log('   Organization:', orgData.organizationName);
    }

    // Get customer balance
    console.log('\n📊 Fetching customer balance...');
    const balanceResult = await metronomeService.getCustomerBalance(customerId);

    if (!balanceResult.success) {
      console.error('❌ Failed to fetch balance:', balanceResult.error);
      console.error('Details:', JSON.stringify(balanceResult.details, null, 2));
      return;
    }

    console.log('\n' + '='.repeat(60));
    console.log('Customer Balance Report');
    console.log('='.repeat(60));
    
    if (organizationId) {
      console.log('Organization ID:', organizationId);
    }
    console.log('Customer ID:', customerId);
    console.log('Total Balance:', balanceResult.total_balance, 'credits');
    console.log('Credits Count:', balanceResult.credits.length);

    if (balanceResult.credits.length === 0) {
      console.log('\n⚠️  NO CREDITS FOUND');
      console.log('This customer does not have any credits or contracts.');
      console.log('\nTo add free trial:');
      console.log(`  node scripts/add-trial-to-existing.js ${customerId}`);
      return;
    }

    console.log('\n📋 Credit Details:');
    console.log('-'.repeat(60));

    let hasFreeTrial = false;

    balanceResult.credits.forEach((credit, index) => {
      console.log(`\n${index + 1}. ${credit.name}`);
      console.log(`   ID: ${credit.id}`);
      console.log(`   Balance: ${credit.balance} credits`);
      console.log(`   Type: ${credit.type}`);
      
      if (credit.product) {
        console.log(`   Product: ${credit.product.name} (${credit.product.id})`);
      }

      if (credit.access_schedule?.schedule_items?.[0]) {
        const schedule = credit.access_schedule.schedule_items[0];
        console.log(`   Amount: ${schedule.amount} credits`);
        console.log(`   Starting: ${schedule.starting_at}`);
        if (schedule.ending_before) {
          console.log(`   Ending: ${schedule.ending_before}`);
        }
      }

      console.log(`   Created: ${credit.created_at}`);

      if (credit.name === 'Free Trial Credits') {
        hasFreeTrial = true;
      }
    });

    console.log('\n' + '='.repeat(60));
    console.log('Summary');
    console.log('='.repeat(60));
    console.log('Has Free Trial:', hasFreeTrial ? '✅ YES' : '❌ NO');
    console.log('Total Balance:', balanceResult.total_balance, 'credits');

    if (!hasFreeTrial) {
      console.log('\n💡 To add free trial to this customer:');
      console.log(`   node scripts/add-trial-to-existing.js ${customerId}`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the script
if (require.main === module) {
  const input = process.argv[2];

  if (!input) {
    console.error('❌ Usage: node scripts/check-customer-trial.js <CUSTOMER_ID or ORGANIZATION_ID>');
    console.error('\nExamples:');
    console.error('  node scripts/check-customer-trial.js c6330dab-5b2a-43bc-a6c4-acc576c1fbe5');
    console.error('  node scripts/check-customer-trial.js kq8D0URspd5I7uBck8l9');
    process.exit(1);
  }

  checkCustomerTrial(input).catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

module.exports = { checkCustomerTrial };

