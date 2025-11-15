/**
 * @fileoverview Keywords API endpoint to fetch keywords data by brand ID
 */

import { getKeywordsByBrandId } from '../services/firebase-service.js';
import crypto from 'crypto';

// Cache configuration
const CACHE = {
  data: {},
  timestamps: {},
  TTL: 5 * 60 * 1000 // 5 minutes in milliseconds
};

/**
 * Generates a cache key from parameters
 * @param {string} brandId - Brand ID
 * @returns {string} Cache key
 */
const generateCacheKey = (brandId) => {
  return crypto.createHash('md5').update(`keywords_${brandId}`).digest('hex');
};

/**
 * Gets data from cache if valid
 * @param {string} cacheKey - Cache key
 * @returns {Object|null} Cached data or null if not found/expired
 */
const getFromCache = (cacheKey) => {
  const now = Date.now();
  if (CACHE.data[cacheKey] && (now - CACHE.timestamps[cacheKey] < CACHE.TTL)) {
    console.log('Keywords API - Cache hit for key:', cacheKey);
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
  console.log('Keywords API - Data cached with key:', cacheKey);
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

  console.log('Keywords API - Processing request');

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

  try {
    const startTime = Date.now();

    console.log('Keywords API - Fetching keywords for brand:', brandId);

    // Generate cache key
    const cacheKey = generateCacheKey(brandId);
    
    // Check cache first
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      const fetchTime = Date.now() - startTime;
      console.log('Keywords API - Returning cached data for brand:', brandId);
      
      return res.status(200).json({
        ...cachedData,
        cached: true,
        responseTimeMs: fetchTime,
        timestamp: new Date().toISOString()
      });
    }

    console.log('Keywords API - Cache miss, fetching from Firebase...');

    // Fetch keywords using Admin SDK (bypasses all security rules)
    const keywords = await getKeywordsByBrandId(brandId, idToken);
    
    const fetchTime = Date.now() - startTime;
    
    const response = {
      keywords,
      brandId,
      success: true,
      timestamp: new Date().toISOString(),
      cached: false,
      responseTimeMs: fetchTime
    };

    // Cache the response data (excluding timestamp and responseTimeMs)
    const dataToCache = {
      keywords,
      brandId,
      success: true
    };
    setCache(cacheKey, dataToCache);

    console.log('Keywords API - Response Summary:', {
      brandId,
      keywordsCount: Array.isArray(keywords) ? keywords.length : 0,
      keywordsType: typeof keywords,
      cached: false
    });

    return res.status(200).json(response);

  } catch (error) {
    console.error('Keywords API - Error:', error);
    
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      success: false,
      brandId
    });
  }
}
