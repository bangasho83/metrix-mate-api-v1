/**
 * Test script to debug Metronome Free Trial Contract creation issues
 * Run with: node scripts/test-free-trial-contract.js [customer_id]
 */

require('dotenv').config();
const axios = require('axios');
const {
  METRONOME_API_URL,
  METRONOME_IDS,
  FREE_TRIAL_CONFIG
} = require('../constants/metronome-config');

const METRONOME_API_KEY = process.env.METRONOME_API_KEY;

// Use centralized configuration
const RATE_CARD_ID = METRONOME_IDS.RATE_CARD_ID;
const PRODUCT_ID = METRONOME_IDS.PRODUCT_ID;
const CREDIT_TYPE_ID = METRONOME_IDS.ACCESS_CREDIT_TYPE_ID;
const TRIAL_CREDITS = FREE_TRIAL_CONFIG.CREDITS;
const TRIAL_DURATION_YEARS = FREE_TRIAL_CONFIG.DURATION_YEARS;

async function testFreeTrialContract(customerId = null) {
  console.log('🔍 Testing Metronome Free Trial Contract Creation...\n');
  
  // Check API key
  if (!METRONOME_API_KEY) {
    console.error('❌ METRONOME_API_KEY not found in environment variables');
    return;
  }
  
  console.log('1. Configuration Check:');
  console.log(`   API Key: ${METRONOME_API_KEY.substring(0, 8)}...`);
  console.log(`   Rate Card ID: ${RATE_CARD_ID}`);
  console.log(`   Product ID: ${PRODUCT_ID}`);
  console.log(`   Credit Type ID: ${CREDIT_TYPE_ID}`);
  console.log(`   Trial Credits: ${TRIAL_CREDITS}`);
  console.log('');

  // If no customer ID provided, try to find one or create a test customer
  if (!customerId) {
    console.log('2. Finding/Creating Test Customer:');
    try {
      // Try to list existing customers first
      const listResponse = await axios.get(`${METRONOME_API_URL}/customers`, {
        headers: {
          'Authorization': `Bearer ${METRONOME_API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: { limit: 5 },
        timeout: 10000
      });
      
      const customers = listResponse.data?.data || [];
      if (customers.length > 0) {
        customerId = customers[0].id;
        console.log(`   ✅ Using existing customer: ${customerId}`);
        console.log(`   Customer name: ${customers[0].name || 'N/A'}`);
      }
    } catch (error) {
      console.log(`   ⚠️ Could not list customers: ${error.message}`);
    }
    
    // If still no customer, create a test one
    if (!customerId) {
      try {
        const testOrgId = `test-trial-${Date.now()}`;
        const createResponse = await axios.post(`${METRONOME_API_URL}/customers`, {
          external_id: testOrgId,
          name: `Test Trial Customer ${new Date().toISOString()}`,
          ingest_aliases: [testOrgId],
          custom_fields: {}
        }, {
          headers: {
            'Authorization': `Bearer ${METRONOME_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        });
        
        customerId = createResponse.data?.data?.id || createResponse.data?.id;
        console.log(`   ✅ Created test customer: ${customerId}`);
      } catch (error) {
        console.error(`   ❌ Failed to create test customer: ${error.message}`);
        return;
      }
    }
    console.log('');
  }

  // Test 3: Validate the configuration IDs exist in Metronome
  console.log('3. Validating Configuration IDs:');
  
  // Check Rate Card
  try {
    const rateCardResponse = await axios.get(`${METRONOME_API_URL}/rate-cards/${RATE_CARD_ID}`, {
      headers: {
        'Authorization': `Bearer ${METRONOME_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    console.log(`   ✅ Rate Card exists: ${rateCardResponse.data?.data?.name || 'N/A'}`);
  } catch (error) {
    console.log(`   ❌ Rate Card validation failed: ${error.response?.status} - ${error.message}`);
    if (error.response?.status === 404) {
      console.log(`   🚨 CRITICAL: Rate Card ID ${RATE_CARD_ID} does not exist!`);
    }
  }

  // Test 4: Create the free trial contract
  console.log('\n4. Creating Free Trial Contract:');
  
  // Create dates on hour boundary (required by Metronome)
  const now = new Date();
  now.setMinutes(0, 0, 0); // Set to hour boundary
  const startingAt = now.toISOString();
  
  const endingDate = new Date(now);
  endingDate.setFullYear(endingDate.getFullYear() + TRIAL_DURATION_YEARS);
  const endingBefore = endingDate.toISOString();
  
  const payload = {
    customer_id: customerId,
    rate_card_id: RATE_CARD_ID,
    starting_at: startingAt,
    ending_before: endingBefore,
    credits: [
      {
        product_id: PRODUCT_ID,
        access_schedule: {
          credit_type_id: CREDIT_TYPE_ID,
          schedule_items: [
            {
              amount: TRIAL_CREDITS,
              starting_at: startingAt,
              ending_before: endingBefore
            }
          ]
        },
        priority: 1,
        name: 'Free Trial Credits'
      }
    ]
  };
  
  console.log(`   Customer ID: ${customerId}`);
  console.log(`   Starting At: ${startingAt}`);
  console.log(`   Ending Before: ${endingBefore}`);
  console.log(`   Payload:`, JSON.stringify(payload, null, 2));
  
  try {
    const response = await axios.post(`${METRONOME_API_URL}/contracts/create`, payload, {
      headers: {
        'Authorization': `Bearer ${METRONOME_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    console.log(`   ✅ Free trial contract created successfully!`);
    console.log(`   Contract ID: ${response.data?.data?.id || response.data?.id}`);
    console.log(`   Response:`, JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.log(`   ❌ Free trial contract creation failed!`);
    console.log(`   Status: ${error.response?.status || 'No response'}`);
    console.log(`   Error: ${error.message}`);
    console.log(`   Response:`, JSON.stringify(error.response?.data, null, 2));
    
    // Analyze specific error types
    if (error.response?.status === 400) {
      console.log(`   🔍 Bad Request - Check payload format and required fields`);
    } else if (error.response?.status === 404) {
      console.log(`   🔍 Not Found - One of the IDs (rate_card, product, credit_type) doesn't exist`);
    } else if (error.response?.status === 422) {
      console.log(`   🔍 Validation Error - Check date formats and business rules`);
    }
  }
  
  console.log('\n🏁 Free Trial Contract Test completed!');
}

// Get customer ID from command line argument or use null
const customerId = process.argv[2] || null;

if (customerId) {
  console.log(`Using provided customer ID: ${customerId}\n`);
}

// Run the test
testFreeTrialContract(customerId).catch(console.error);
