/**
 * Test script to verify keyword-sim API logging
 * 
 * Usage: node scripts/test-keyword-sim-logging.js
 */

const admin = require('firebase-admin');

// Initialize Firebase
if (!admin.apps.length) {
  const b64 = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (!b64) {
    console.error('Missing FIREBASE_ADMIN_CREDENTIALS environment variable');
    process.exit(1);
  }
  const serviceAccount = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
}

const db = admin.firestore();

async function checkKeywordSimLogs() {
  console.log('\n🔍 Checking keyword-sim logs...\n');

  try {
    // Check for keyword-sim logs
    const snapshot = await db.collection('api_logs')
      .where('api', '==', 'keyword-sim')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    if (snapshot.empty) {
      console.log('❌ No logs found for keyword-sim API');
      console.log('\nPossible reasons:');
      console.log('1. API has not been called yet');
      console.log('2. Logging is not working for ESM modules');
      console.log('3. API name is being extracted incorrectly');
      console.log('4. Logs are being skipped by the logging middleware');
    } else {
      console.log(`✅ Found ${snapshot.size} log(s) for keyword-sim:\n`);
      
      snapshot.forEach(doc => {
        const data = doc.data();
        const timestamp = data.createdAt?.toDate?.() || data.createdAt;
        console.log(`Log ID: ${doc.id}`);
        console.log(`  Method: ${data.method}`);
        console.log(`  API: ${data.api}`);
        console.log(`  Organization ID: ${data.organizationId || 'N/A'}`);
        console.log(`  Brand ID: ${data.brandId || 'N/A'}`);
        console.log(`  User ID: ${data.userId || 'N/A'}`);
        console.log(`  Billing Customer ID: ${data.billingCustomerId || 'N/A'}`);
        console.log(`  Credits: ${data.credits || 'N/A'}`);
        console.log(`  Created At: ${timestamp}`);
        console.log('');
      });
    }

    // Check for any recent logs to see what's being logged
    console.log('\n📊 Recent logs (all APIs):\n');
    const recentSnapshot = await db.collection('api_logs')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    const apiCounts = {};
    recentSnapshot.forEach(doc => {
      const api = doc.data().api;
      apiCounts[api] = (apiCounts[api] || 0) + 1;
    });

    console.log('Recent API calls:');
    Object.entries(apiCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([api, count]) => {
        console.log(`  ${api}: ${count} call(s)`);
      });

  } catch (error) {
    console.error('❌ Error checking logs:', error.message);
    if (error.message.includes('index')) {
      console.log('\n⚠️  Missing Firestore index. The query might not work without proper indexes.');
    }
  }
}

checkKeywordSimLogs()
  .then(() => {
    console.log('\n✅ Check complete');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

