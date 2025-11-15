/**
 * @fileoverview Places API endpoint - Fetches places data from Firebase Firestore with authentication
 */

import { getPlacesByBrandId } from '../services/firebase-service.js';
import crypto from 'crypto';

// Cache configuration
const CACHE = {
  data: {},
  timestamps: {},
  TTL: 15 * 60 * 1000 // 15 minutes in milliseconds
};

/**
 * Generates a cache key from parameters
 * @param {string} brandId - Brand ID
 * @returns {string} Cache key
 */
const generateCacheKey = (brandId) => {
  return crypto.createHash('md5').update(`places_${brandId}`).digest('hex');
};

/**
 * Gets data from cache if valid
 * @param {string} cacheKey - Cache key
 * @returns {Object|null} Cached data or null if not found/expired
 */
const getFromCache = (cacheKey) => {
  const now = Date.now();
  if (CACHE.data[cacheKey] && (now - CACHE.timestamps[cacheKey] < CACHE.TTL)) {
    console.log('Places API - Cache hit for key:', cacheKey);
    return CACHE.data[cacheKey];
  }
  return null;
};

/**
 * Stores data in cache
 * @param {string} cacheKey - Cache key
 * @param {any} data - Data to cache
 */
const setCache = (cacheKey, data) => {
  CACHE.data[cacheKey] = data;
  CACHE.timestamps[cacheKey] = Date.now();
  console.log('Places API - Data cached with key:', cacheKey);
};

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'This endpoint only accepts POST requests',
      success: false
    });
  }

  // Extract brandId from request body
  const { brandId } = req.body;

  if (!brandId) {
    return res.status(400).json({
      error: 'Missing required parameter: brandId',
      message: 'Please provide brandId in the request body',
      success: false
    });
  }

  // Optional: Extract Authorization header for logging (not required with Admin SDK)
  const authHeader = req.headers.authorization;
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  // Generate cache key from request parameters including auth
  const cacheKey = crypto.createHash('md5').update(JSON.stringify({ brandId, auth: idToken.substring(0, 10) })).digest('hex');
  const now = Date.now();

  // Check if we have a valid cached response
  if (CACHE.data[cacheKey] && (now - CACHE.timestamps[cacheKey] < CACHE.TTL)) {
    console.log('Places API - Returning cached response for:', {
      cacheKey,
      age: (now - CACHE.timestamps[cacheKey]) / 1000,
      brandId
    });

    // Set cache headers to indicate a cache hit
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('X-Cache-Age', `${(now - CACHE.timestamps[cacheKey]) / 1000}s`);
    return res.status(200).json(CACHE.data[cacheKey]);
  }

  // Set cache headers to indicate a cache miss
  res.setHeader('X-Cache', 'MISS');

  console.log('Places API - Request parameters:', {
    brandId,
    method: req.method,
    hasAuth: !!idToken
  });

  try {
    const startTime = Date.now();

    console.log('Places API - Fetching places for brand:', brandId);

    // Generate cache key
    const cacheKey = generateCacheKey(brandId);

    // Check cache first
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      const fetchTime = Date.now() - startTime;
      console.log('Places API - Returning cached data for brand:', brandId);

      return res.status(200).json({
        ...cachedData,
        cached: true,
        responseTimeMs: fetchTime,
        timestamp: new Date().toISOString()
      });
    }

    console.log('Places API - Cache miss, fetching from Firebase...');

    // Fetch places using Admin SDK (bypasses all security rules)
    const places = await getPlacesByBrandId(brandId, idToken);

    const fetchTime = Date.now() - startTime;

    // Check if any places were found
    if (!places || places.length === 0) {
      return res.status(404).json({
        error: 'No places found for this brand',
        brandId,
        success: false,
        message: 'Either the brandId does not exist in your places collection, or the places do not have a brandId field matching this value'
      });
    }

    // Check if any places were found
    if (!places || places.length === 0) {
      return res.status(404).json({
        error: 'No places found for this brand',
        brandId,
        success: false,
        message: 'Either the brandId does not exist in your places collection, or the places do not have a brandId field matching this value'
      });
    }

    // Calculate totals and statistics
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
      brandId,
      totals,
      success: true,
      timestamp: new Date().toISOString(),
      cached: false,
      responseTimeMs: fetchTime
    };

    // Cache the response data (excluding timestamp and responseTimeMs)
    const dataToCache = {
      places,
      brandId,
      totals,
      success: true
    };
    setCache(cacheKey, dataToCache);

    console.log('Places API - Response Summary:', {
      brandId,
      placesCount: places.length,
      verified: totals.verified,
      unverified: totals.unverified,
      averageRating: totals.averageRating,
      totalReviews: totals.totalReviews,
      cached: false
    });

    // Set Vercel cache headers (15 minutes cache, 5 minutes stale-while-revalidate)
    res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=300');

    return res.status(200).json(response);

  } catch (error) {
    console.error('Places API - Error:', {
      message: error.message,
      stack: error.stack,
      queryParams: req.query
    });

    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      success: false
    });
  }
}
