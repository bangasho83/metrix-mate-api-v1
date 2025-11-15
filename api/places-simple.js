/**
 * @fileoverview Simple Places API endpoint - Direct Firebase access with better error handling
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
      error: 'Missing required parameter: brandId',
      success: false
    });
  }

  console.log('Simple Places API - Processing request for brand:', brandId);

  try {
    // Initialize Firebase directly
    const { initializeApp } = await import('firebase/app');
    const { getFirestore, collection, query, where, getDocs, doc, getDoc } = await import('firebase/firestore');
    
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

    console.log('Simple Places API - Firebase initialized, checking brand...');

    // First, try to check if brand exists
    let brand = null;
    try {
      const brandRef = doc(db, 'brands', brandId);
      const brandSnap = await getDoc(brandRef);
      
      if (brandSnap.exists()) {
        brand = {
          id: brandSnap.id,
          ...brandSnap.data()
        };
        console.log('Simple Places API - Brand found:', brand.name || 'Unnamed brand');
      } else {
        console.log('Simple Places API - Brand not found in database');
        return res.status(404).json({
          error: 'Brand not found',
          brandId,
          success: false,
          suggestion: 'Please check if the brandId is correct and exists in your Firestore database'
        });
      }
    } catch (brandError) {
      console.error('Simple Places API - Error fetching brand:', brandError);
      
      // If it's a permission error, provide helpful guidance
      if (brandError.code === 'permission-denied') {
        return res.status(403).json({
          error: 'Permission denied',
          brandId,
          success: false,
          message: 'Firebase security rules are blocking access to the brands collection',
          suggestion: 'You may need to update your Firebase security rules or implement proper authentication'
        });
      }
      
      throw brandError;
    }

    // Now try to fetch places for this brand
    let places = [];
    try {
      console.log('Simple Places API - Fetching places for brand...');
      const placesRef = collection(db, 'places');
      const q = query(placesRef, where('brandId', '==', brandId));
      const querySnapshot = await getDocs(q);
      
      querySnapshot.forEach((doc) => {
        places.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      console.log('Simple Places API - Found places:', places.length);
    } catch (placesError) {
      console.error('Simple Places API - Error fetching places:', placesError);
      
      // If it's a permission error for places, we can still return the brand info
      if (placesError.code === 'permission-denied') {
        return res.status(200).json({
          brand,
          places: [],
          totals: {
            count: 0,
            verified: 0,
            unverified: 0,
            averageRating: 0,
            totalReviews: 0
          },
          success: true,
          warning: 'Brand found but unable to fetch places due to permission restrictions'
        });
      }
      
      throw placesError;
    }

    // Calculate totals
    const totals = {
      count: places.length,
      verified: 0,
      unverified: 0,
      averageRating: 0,
      totalReviews: 0
    };

    let totalRatingSum = 0;
    let placesWithRatings = 0;

    places.forEach(place => {
      // Count verified vs unverified places
      if (place.verified === true || place.isVerified === true) {
        totals.verified++;
      } else {
        totals.unverified++;
      }

      // Calculate rating statistics
      const rating = place.rating || place.averageRating || 0;
      const reviewCount = place.reviewCount || place.totalReviews || place.user_ratings_total || 0;

      if (rating > 0) {
        totalRatingSum += rating;
        placesWithRatings++;
      }

      totals.totalReviews += reviewCount;
    });

    // Calculate average rating
    totals.averageRating = placesWithRatings > 0 
      ? parseFloat((totalRatingSum / placesWithRatings).toFixed(2)) 
      : 0;

    const response = {
      places,
      brand,
      totals,
      success: true
    };

    console.log('Simple Places API - Success:', {
      brandId,
      brandName: brand?.name || 'Unknown',
      placesCount: places.length,
      verified: totals.verified,
      unverified: totals.unverified
    });

    return res.status(200).json(response);

  } catch (error) {
    console.error('Simple Places API - Unexpected error:', error);
    
    return res.status(500).json({
      error: 'Internal server error',
      brandId,
      message: error.message,
      code: error.code || 'unknown',
      success: false
    });
  }
}
