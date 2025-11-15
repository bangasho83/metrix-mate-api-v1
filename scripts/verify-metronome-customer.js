#!/usr/bin/env node

/**
 * Verify if a Metronome customer exists
 * 
 * Usage:
 *   node scripts/verify-metronome-customer.js <customerId>
 * 
 * Example:
 *   node scripts/verify-metronome-customer.js 3c3e7995-a256-4160-8433-14bdd3a23f57
 */

require('dotenv').config();
const axios = require('axios');

const METRONOME_API_KEY = process.env.METRONOME_API_KEY;
const METRONOME_API_URL = 'https://api.metronome.com/v1';

const customerId = process.argv[2];

if (!customerId) {
  console.error('❌ Error: customerId is required');
  console.log('\nUsage:');
  console.log('  node scripts/verify-metronome-customer.js <customerId>');
  console.log('\nExample:');
  console.log('  node scripts/verify-metronome-customer.js 3c3e7995-a256-4160-8433-14bdd3a23f57');
  process.exit(1);
}

if (!METRONOME_API_KEY) {
  console.error('❌ Error: METRONOME_API_KEY not found in environment');
  process.exit(1);
}

async function verifyCustomer() {
  console.log('🔍 Verifying Metronome Customer');
  console.log('================================\n');
  console.log('Customer ID:', customerId);
  console.log('');

  try {
    const response = await axios.get(
      `${METRONOME_API_URL}/customers/${customerId}`,
      {
        headers: {
          'Authorization': `Bearer ${METRONOME_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Customer EXISTS in Metronome\n');
    console.log('Customer Details:');
    console.log('================');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('');

    const customer = response.data?.data || response.data;
    console.log('Summary:');
    console.log('--------');
    console.log('ID:', customer.id);
    console.log('Name:', customer.name);
    console.log('External ID:', customer.external_id);
    console.log('Ingest Aliases:', customer.ingest_aliases);
    console.log('');

  } catch (error) {
    if (error.response?.status === 404) {
      console.log('❌ Customer NOT FOUND in Metronome\n');
      console.log('This means:');
      console.log('- The customer was deleted from Metronome');
      console.log('- Or the customer ID is incorrect');
      console.log('- Or there was never a customer created');
      console.log('');
      console.log('Solution:');
      console.log('- Remove billingCustomerId from Firebase organization');
      console.log('- Run PATCH again to create new customer');
      console.log('');
    } else {
      console.error('❌ Error checking customer:');
      console.error('Status:', error.response?.status);
      console.error('Message:', error.response?.data?.message || error.message);
      console.log('');
    }
  }
}

verifyCustomer().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});

