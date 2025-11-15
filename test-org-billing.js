/**
 * Check if org document has billingCustomerId
 */

const admin = require('firebase-admin');

const b64 = process.env.FIREBASE_ADMIN_CREDENTIALS;
if (!b64) {
  console.error('Missing FIREBASE_ADMIN_CREDENTIALS');
  process.exit(1);
}

const serviceAccount = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();

async function checkOrg() {
  try {
    const orgId = 'kq8D0URspd5I7uBck8l9';
    console.log(`Checking org document: ${orgId}\n`);
    
    const orgDoc = await db.collection('orgs').doc(orgId).get();

    if (!orgDoc.exists) {
      console.log('❌ Org document does not exist');
      process.exit(0);
    }

    const data = orgDoc.data();
    console.log('✅ Org document found');
    console.log('\nAll fields:');
    Object.entries(data).forEach(([key, value]) => {
      console.log(`  ${key}:`, value);
    });

    console.log('\n--- Billing Info ---');
    console.log('billingCustomerId:', data.billingCustomerId || '❌ NOT FOUND');
    console.log('billingCustomerId type:', typeof data.billingCustomerId);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkOrg();

