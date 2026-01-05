/**
 * Script to scan Firebase invitations and brandAccess collections
 * to understand user-brand relationships
 */

require('dotenv').config();
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const b64 = process.env.FIREBASE_ADMIN_CREDENTIALS;
if (!b64) {
  console.error('❌ Missing FIREBASE_ADMIN_CREDENTIALS environment variable');
  console.error('Make sure you have a .env file with FIREBASE_ADMIN_CREDENTIALS set');
  process.exit(1);
}

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    Buffer.from(b64, 'base64').toString('utf8')
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
}

const db = admin.firestore();

async function scanInvitations() {
  console.log('\n=== Scanning invitations collection ===\n');
  
  try {
    const snapshot = await db.collection('invitations').limit(10).get();
    
    if (snapshot.empty) {
      console.log('❌ No documents found in invitations collection');
    } else {
      console.log(`✅ Found ${snapshot.size} documents in invitations collection\n`);
      
      snapshot.forEach((doc, index) => {
        const data = doc.data();
        console.log(`Document ${index + 1} (ID: ${doc.id}):`);
        console.log(JSON.stringify(data, null, 2));
        console.log('---');
      });
    }
  } catch (error) {
    console.error('❌ Error scanning invitations:', error.message);
  }
}

async function scanBrandAccess() {
  console.log('\n=== Scanning brandAccess collection ===\n');
  
  try {
    const snapshot = await db.collection('brandAccess').limit(10).get();
    
    if (snapshot.empty) {
      console.log('❌ No documents found in brandAccess collection');
    } else {
      console.log(`✅ Found ${snapshot.size} documents in brandAccess collection\n`);
      
      snapshot.forEach((doc, index) => {
        const data = doc.data();
        console.log(`Document ${index + 1} (ID: ${doc.id}):`);
        console.log(JSON.stringify(data, null, 2));
        console.log('---');
      });
    }
  } catch (error) {
    console.error('❌ Error scanning brandAccess:', error.message);
  }
}

async function scanBrandsWithUserId() {
  console.log('\n=== Scanning brands collection for userId field ===\n');
  
  try {
    const snapshot = await db.collection('brands').limit(10).get();
    
    if (snapshot.empty) {
      console.log('❌ No documents found in brands collection');
    } else {
      console.log(`✅ Found ${snapshot.size} documents in brands collection\n`);
      
      snapshot.forEach((doc, index) => {
        const data = doc.data();
        console.log(`Brand ${index + 1} (ID: ${doc.id}):`);
        console.log({
          id: doc.id,
          name: data.client_name || data.brandName || data.name || 'Unknown',
          organizationId: data.organizationId || null,
          userId: data.userId || null,
          createdBy: data.createdBy || null,
          hasUserId: !!data.userId,
          hasCreatedBy: !!data.createdBy
        });
        console.log('---');
      });
    }
  } catch (error) {
    console.error('❌ Error scanning brands:', error.message);
  }
}

async function main() {
  console.log('🔍 Scanning Firebase collections for user-brand relationships...\n');
  
  await scanInvitations();
  await scanBrandAccess();
  await scanBrandsWithUserId();
  
  console.log('\n✅ Scan complete!');
  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

