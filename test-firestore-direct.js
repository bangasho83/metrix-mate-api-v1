/**
 * Direct Firestore query to check if billingCustomerId is being saved
 */

const admin = require('firebase-admin');
const fs = require('fs');

// Initialize Firebase
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

async function checkLogs() {
  try {
    console.log('Querying latest mates-take/overview logs...\n');
    
    const snapshot = await db.collection('api_logs')
      .where('api', '==', 'mates-take/overview')
      .where('organizationId', '==', 'kq8D0URspd5I7uBck8l9')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();

    if (snapshot.empty) {
      console.log('❌ No logs found');
      process.exit(0);
    }

    console.log(`✅ Found ${snapshot.size} logs:\n`);

    snapshot.forEach((doc, index) => {
      const data = doc.data();
      console.log(`\n--- Log ${index + 1} ---`);
      console.log('Document ID:', doc.id);
      console.log('API:', data.api);
      console.log('Method:', data.method);
      console.log('OrganizationId:', data.organizationId);
      console.log('BrandId:', data.brandId);
      console.log('UserId:', data.userId);
      console.log('Credits:', data.credits);
      console.log('BillingCustomerId:', data.billingCustomerId || '❌ NOT FOUND');
      console.log('CreatedAt:', data.createdAt?.toDate?.() || data.createdAt);
      console.log('All fields:', Object.keys(data));
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkLogs();

