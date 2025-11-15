/**
 * Test script to debug Metronome API issues
 * Run with: node scripts/test-metronome-api.js
 */

require('dotenv').config();
const axios = require('axios');

const METRONOME_API_URL = 'https://api.metronome.com/v1';
const METRONOME_API_KEY = process.env.METRONOME_API_KEY;

async function testMetronomeAPI() {
  console.log('🔍 Testing Metronome API...\n');
  
  // Test 1: Check API key configuration
  console.log('1. API Key Check:');
  console.log(`   Key exists: ${!!METRONOME_API_KEY}`);
  console.log(`   Key length: ${METRONOME_API_KEY ? METRONOME_API_KEY.length : 0}`);
  console.log(`   Key preview: ${METRONOME_API_KEY ? METRONOME_API_KEY.substring(0, 8) + '...' : 'NOT SET'}\n`);
  
  if (!METRONOME_API_KEY) {
    console.error('❌ METRONOME_API_KEY not found in environment variables');
    return;
  }

  // Test 2: Test API connectivity with list customers
  console.log('2. API Connectivity Test (List Customers):');
  try {
    const response = await axios.get(`${METRONOME_API_URL}/customers`, {
      headers: {
        'Authorization': `Bearer ${METRONOME_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log(`   ✅ Success! Status: ${response.status}`);
    console.log(`   Response data keys: ${Object.keys(response.data || {}).join(', ')}`);
    console.log(`   Customer count: ${response.data?.data?.length || 0}\n`);
  } catch (error) {
    console.log(`   ❌ Failed! Status: ${error.response?.status || 'No response'}`);
    console.log(`   Error: ${error.message}`);
    console.log(`   Response data:`, error.response?.data);
    console.log('');
  }

  // Test 3: Test customer creation with a test organization
  console.log('3. Customer Creation Test:');
  const testOrgId = `test-org-${Date.now()}`;
  const testOrgName = `Test Organization ${new Date().toISOString()}`;
  
  try {
    const payload = {
      external_id: testOrgId,
      name: testOrgName,
      ingest_aliases: [testOrgId],
      custom_fields: {}
    };
    
    console.log(`   Testing with payload:`, JSON.stringify(payload, null, 2));
    
    const response = await axios.post(`${METRONOME_API_URL}/customers`, payload, {
      headers: {
        'Authorization': `Bearer ${METRONOME_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    console.log(`   ✅ Customer created! Status: ${response.status}`);
    console.log(`   Customer ID: ${response.data?.data?.id || response.data?.id}`);
    console.log(`   External ID: ${response.data?.data?.external_id || response.data?.external_id}`);
    
    // Clean up - delete the test customer if possible
    const customerId = response.data?.data?.id || response.data?.id;
    if (customerId) {
      console.log(`   🧹 Test customer created with ID: ${customerId}`);
      console.log(`   Note: You may want to manually clean this up in Metronome dashboard`);
    }
    
  } catch (error) {
    console.log(`   ❌ Customer creation failed! Status: ${error.response?.status || 'No response'}`);
    console.log(`   Error: ${error.message}`);
    console.log(`   Response data:`, JSON.stringify(error.response?.data, null, 2));
    
    // Check for specific error types
    if (error.response?.status === 401) {
      console.log(`   🔑 This looks like an authentication issue - check your API key`);
    } else if (error.response?.status === 403) {
      console.log(`   🚫 This looks like a permissions issue - check API key permissions`);
    } else if (error.response?.status === 409) {
      console.log(`   🔄 This looks like a conflict - customer might already exist`);
    } else if (error.response?.status === 422) {
      console.log(`   📝 This looks like a validation issue - check payload format`);
    }
  }
  
  console.log('\n🏁 Test completed!');
}

// Run the test
testMetronomeAPI().catch(console.error);
