/**
 * @fileoverview Places Debug API endpoint - Debug version for troubleshooting
 */

import { getPlacesByBrandId, getBrandById, validateBrandExists } from '../services/firebase-service.js';

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log('Places Debug API - Request parameters:', {
    queryParams: req.query,
    method: req.method
  });

  try {
    const { brandId } = req.query;
    
    // brandId is required
    if (!brandId) {
      return res.status(400).json({
        error: 'Missing required parameter: brandId',
        debug: true
      });
    }

    console.log('Places Debug API - Starting debug for brand:', brandId);

    // Step 1: Test Firebase connection
    let firebaseConnectionTest;
    try {
      // Try to import Firebase modules to test connection
      const { getFirestore } = await import('firebase/firestore');
      firebaseConnectionTest = 'Firebase modules imported successfully';
    } catch (error) {
      firebaseConnectionTest = `Firebase import error: ${error.message}`;
    }

    // Step 2: Test brand validation
    let brandValidationResult;
    try {
      brandValidationResult = await validateBrandExists(brandId);
    } catch (error) {
      brandValidationResult = `Brand validation error: ${error.message}`;
    }

    // Step 3: Test brand fetching
    let brandFetchResult;
    try {
      const brand = await getBrandById(brandId);
      brandFetchResult = brand ? 'Brand found' : 'Brand not found';
    } catch (error) {
      brandFetchResult = `Brand fetch error: ${error.message}`;
    }

    // Step 4: Test places fetching
    let placesFetchResult;
    try {
      const places = await getPlacesByBrandId(brandId);
      placesFetchResult = `Found ${places.length} places`;
    } catch (error) {
      placesFetchResult = `Places fetch error: ${error.message}`;
    }

    const debugResponse = {
      debug: true,
      brandId,
      tests: {
        firebaseConnection: firebaseConnectionTest,
        brandValidation: brandValidationResult,
        brandFetch: brandFetchResult,
        placesFetch: placesFetchResult
      },
      timestamp: new Date().toISOString()
    };

    console.log('Places Debug API - Debug results:', debugResponse);

    return res.status(200).json(debugResponse);

  } catch (error) {
    console.error('Places Debug API - Error:', {
      message: error.message,
      stack: error.stack,
      queryParams: req.query
    });

    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      debug: true,
      timestamp: new Date().toISOString()
    });
  }
}
