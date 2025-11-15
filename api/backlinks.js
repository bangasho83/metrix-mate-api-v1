/**
 * @fileoverview Backlinks API endpoint to fetch backlinks data by brand ID
 */

import { getBacklinksByBrandId, db } from '../services/firebase-service.js';
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
 * @param {string} fromDate - Start date (optional)
 * @param {string} toDate - End date (optional)
 * @returns {string} Cache key
 */
const generateCacheKey = (brandId, fromDate = null, toDate = null) => {
  const keyString = `backlinks_${brandId}_${fromDate || 'all'}_${toDate || 'all'}`;
  return crypto.createHash('md5').update(keyString).digest('hex');
};

/**
 * Gets data from cache if valid
 * @param {string} cacheKey - Cache key
 * @returns {Object|null} Cached data or null if not found/expired
 */
const getFromCache = (cacheKey) => {
  const now = Date.now();
  if (CACHE.data[cacheKey] && (now - CACHE.timestamps[cacheKey] < CACHE.TTL)) {
    console.log('Backlinks API - Cache hit for key:', cacheKey);
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
  console.log('Backlinks API - Data cached with key:', cacheKey);
};

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  // Handle DELETE (delete selected backlinks)
  if (req.method === 'DELETE') {
    try {
      const { brandId, ids, dryRun } = req.body || {};
      if (!brandId || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          error: 'Missing required parameters',
          message: 'Provide brandId and ids (array of document IDs) in the request body',
          success: false
        });
      }

      // Optional: audit token
      const authHeader = req.headers.authorization;
      const idToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
      if (idToken) console.log('Backlinks DELETE - Auth token present for audit');

      const backlinksRef = db.collection('backlinks');
      const deleted = [];
      const skipped = [];

      // Fetch docs in small batches to avoid exceeding Firestore limits
      const chunkSize = 20;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const snapshots = await Promise.all(chunk.map(id => backlinksRef.doc(id).get()));
        const batch = db.batch();

        snapshots.forEach((snap, idx) => {
          if (!snap.exists) {
            skipped.push({ id: chunk[idx], reason: 'not_found' });
            return;
          }
          const data = snap.data() || {};
          if (data.brandId !== brandId) {
            skipped.push({ id: chunk[idx], reason: 'brand_mismatch' });
            return;
          }
          if (!dryRun) batch.delete(snap.ref);
          deleted.push(chunk[idx]);
        });

        if (!dryRun) await batch.commit();
      }

      return res.status(200).json({
        success: true,
        brandId,
        deleted,
        skipped,
        dryRun: Boolean(dryRun),
        count: deleted.length,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error('Backlinks DELETE - Error:', err);
      return res.status(500).json({ success: false, error: 'Failed to delete backlinks', message: err.message });
    }
  }


  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'This endpoint only accepts POST requests',
      success: false
    });
  }

  console.log('Backlinks API - Processing request');

  // Extract parameters from request body
  const { brandId, from, to } = req.body;

  if (!brandId) {
    return res.status(400).json({
      error: 'Missing required parameter: brandId',
      message: 'Please provide brandId in the request body',
      success: false
    });
  }

  // Validate date format if provided (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (from && !dateRegex.test(from)) {
    return res.status(400).json({
      error: 'Invalid from date format',
      message: 'Please provide from date in YYYY-MM-DD format',
      success: false
    });
  }

  if (to && !dateRegex.test(to)) {
    return res.status(400).json({
      error: 'Invalid to date format',
      message: 'Please provide to date in YYYY-MM-DD format',
      success: false
    });
  }

  // Validate date range
  if (from && to && new Date(from) > new Date(to)) {
    return res.status(400).json({
      error: 'Invalid date range',
      message: 'from date must be before or equal to to date',
      success: false
    });
  }

  // Optional: Extract Authorization header for logging (not required with Admin SDK)
  const authHeader = req.headers.authorization;
  const idToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  try {
    const startTime = Date.now();

    console.log('Backlinks API - Fetching backlinks for brand:', brandId, {
      from,
      to,
      dateFiltering: !!(from || to)
    });

    // Generate cache key including date parameters
    const cacheKey = generateCacheKey(brandId, from, to);

    // Check for cache bypass (POST body only). Accept numeric 0 or string '0'.
    const bodyCache = req.body?.cache;
    const bypassCache = bodyCache === 0 || bodyCache === '0';

    if (bypassCache) {
      console.log('Backlinks API - Cache bypassed via body.cache=0');
      res.setHeader('X-Cache-Status', 'BYPASS');
    } else {
      // Check cache first
      const cachedData = getFromCache(cacheKey);
      if (cachedData) {
        const fetchTime = Date.now() - startTime;
        console.log('Backlinks API - Returning cached data for brand:', brandId);

        res.setHeader('X-Cache-Status', 'HIT');
        res.setHeader('X-Cache-Age', `${(Date.now() - CACHE.timestamps[cacheKey]) / 1000}s`);

        return res.status(200).json({
          ...cachedData,
          cached: true,
          responseTimeMs: fetchTime,
          timestamp: new Date().toISOString(),
          dateRange: {
            from: from || null,
            to: to || null
          }
        });
      } else {
        console.log('Backlinks API - Cache miss');
        res.setHeader('X-Cache-Status', 'MISS');
      }
    }

    console.log('Backlinks API - Fetching from Firebase...');

    // Fetch backlinks using Admin SDK with date filtering
    const backlinks = await getBacklinksByBrandId(brandId, idToken, from, to);

    const fetchTime = Date.now() - startTime;

    // Check if any backlinks were found
    if (!backlinks || backlinks.length === 0) {
      const message = from || to
        ? `No backlinks found for this brand in the specified date range (${from || 'start'} to ${to || 'end'})`
        : 'Either the brandId does not exist in your backlinks collection, or the backlinks do not have a brandId field matching this value';

      return res.status(404).json({
        error: 'No backlinks found for this brand',
        brandId,
        success: false,
        message,
        dateRange: {
          from: from || null,
          to: to || null
        }
      });
    }

    // Calculate totals and statistics
    const totals = {
      count: backlinks.length,
      doFollow: 0,
      noFollow: 0,
      averageDomainAuthority: 0,
      averagePageAuthority: 0,
      statusCounts: {},
      domains: new Set(),
      topDomains: {}
    };

    let totalDA = 0;
    let totalPA = 0;
    let validDACount = 0;
    let validPACount = 0;

    backlinks.forEach(backlink => {
      // Count do-follow vs no-follow
      if (backlink.isDoFollow) {
        totals.doFollow++;
      } else {
        totals.noFollow++;
      }

      // Calculate average domain authority
      if (backlink.domainAuthority && backlink.domainAuthority > 0) {
        totalDA += backlink.domainAuthority;
        validDACount++;
      }

      // Calculate average page authority
      if (backlink.pageAuthority && backlink.pageAuthority > 0) {
        totalPA += backlink.pageAuthority;
        validPACount++;
      }

      // Count status types
      const status = backlink.status || 'Unknown';
      totals.statusCounts[status] = (totals.statusCounts[status] || 0) + 1;

      // Count unique domains
      if (backlink.domain) {
        totals.domains.add(backlink.domain);
        totals.topDomains[backlink.domain] = (totals.topDomains[backlink.domain] || 0) + 1;
      }
    });

    // Calculate averages
    totals.averageDomainAuthority = validDACount > 0 ? Math.round((totalDA / validDACount) * 100) / 100 : 0;
    totals.averagePageAuthority = validPACount > 0 ? Math.round((totalPA / validPACount) * 100) / 100 : 0;
    totals.uniqueDomains = totals.domains.size;

    // Convert domains set to array for response
    delete totals.domains;

    // Get top 5 domains
    const topDomainsArray = Object.entries(totals.topDomains)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([domain, count]) => ({ domain, count }));

    totals.topDomains = topDomainsArray;

    const response = {
      backlinks,
      brandId,
      totals,
      success: true,
      timestamp: new Date().toISOString(),
      cached: false,
      responseTimeMs: fetchTime,
      dateRange: {
        from: from || null,
        to: to || null
      }
    };

    // Cache the response data (excluding timestamp and responseTimeMs)
    if (!bypassCache) {
      const dataToCache = {
        backlinks,
        brandId,
        totals,
        success: true
      };
      setCache(cacheKey, dataToCache);
    }

    console.log('Backlinks API - Response Summary:', {
      brandId,
      backlinksCount: backlinks.length,
      doFollow: totals.doFollow,
      noFollow: totals.noFollow,
      averageDomainAuthority: totals.averageDomainAuthority,
      averagePageAuthority: totals.averagePageAuthority,
      uniqueDomains: totals.uniqueDomains,
      dateRange: { from: from || null, to: to || null },
      cached: false
    });

    // Set Vercel cache headers (15 minutes cache, 5 minutes stale-while-revalidate)
    if (bypassCache) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=300');
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Backlinks API - Error:', error);

    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      success: false,
      brandId
    });
  }
}
