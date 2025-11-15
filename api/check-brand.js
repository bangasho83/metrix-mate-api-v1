/**
 * @fileoverview Check Brand API endpoint - Simple brand existence checker
 */

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { brandId } = req.query;

  if (!brandId) {
    return res.status(400).json({
      error: 'Missing brandId parameter',
      example: '/api/check-brand?brandId=your_brand_id'
    });
  }

  console.log('Check Brand API - Checking brand:', brandId);

  try {
    // Initialize Firebase directly in this endpoint
    const { initializeApp } = await import('firebase/app');
    const { getFirestore, doc, getDoc } = await import('firebase/firestore');
    
    const firebaseConfig = {
      apiKey: "AIzaSyA5RszTHcZfwZJwYosjZ2ox4wy16zdP1Fo",
      authDomain: "metrixmate-4535e.firebaseapp.com",
      projectId: "metrixmate-4535e",
      storageBucket: "metrixmate-4535e.firebasestorage.app",
      messagingSenderId: "1088870133164",
      appId: "1:1088870133164:web:380af7b331c76ac99dde09"
    };

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    // Try to get the brand document
    const brandRef = doc(db, 'brands', brandId);
    const brandSnap = await getDoc(brandRef);

    if (brandSnap.exists()) {
      const brandData = brandSnap.data();
      
      return res.status(200).json({
        exists: true,
        brandId,
        brand: {
          id: brandSnap.id,
          name: brandData.name || 'No name',
          organizationId: brandData.organizationId || 'No organization',
          createdAt: brandData.createdAt || 'No creation date'
        },
        message: 'Brand found successfully'
      });
    } else {
      return res.status(404).json({
        exists: false,
        brandId,
        message: 'Brand not found in Firestore',
        suggestion: 'Check if the brandId is correct and the brand exists in your Firestore database'
      });
    }

  } catch (error) {
    console.error('Check Brand API - Error:', error);
    
    return res.status(500).json({
      error: 'Failed to check brand',
      brandId,
      message: error.message,
      details: {
        name: error.name,
        code: error.code || 'unknown'
      }
    });
  }
}
