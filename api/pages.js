/**
 * @fileoverview Pages API endpoint to fetch pages data by brand ID with optional GA4 metrics
 */

const { getPagesByBrandId, getBrandInfo, getBrandConnection } = require('../services/firebase-service.js');
const { getGa4TopPages } = require('../services/ga4-service.js');
const { getDefaultDateRange } = require('../utils/date-utils.js');
const crypto = require('crypto');

// Cache configuration
const CACHE = {
  data: {},
  timestamps: {},
  TTL: 15 * 60 * 1000 // 15 minutes in milliseconds
};

/**
 * Generates a cache key from parameters
 * @param {string} brandId - Brand ID
 * @param {boolean} includeGA4 - Whether GA4 data is included
 * @param {string} ga4PropertyId - GA4 Property ID
 * @param {string} from - Start date
 * @param {string} to - End date
 * @returns {string} Cache key
 */
const generateCacheKey = (brandId, includeGA4 = false, ga4PropertyId = null, from = null, to = null) => {
  const keyString = `pages_${brandId}_ga4_${includeGA4}_${ga4PropertyId || 'none'}_${from || 'none'}_${to || 'none'}`;
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
    console.log('Pages API - Cache hit for key:', cacheKey);
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
  console.log('Pages API - Data cached with key:', cacheKey);
};

/**
 * Matches pages with GA4 data based on URL patterns
 * @param {Array} pages - Array of page objects
 * @param {Object} ga4Data - GA4 top pages data
 * @returns {Array} Pages enhanced with GA4 metrics
 */
const enhancePagesWithGA4Data = (pages, ga4Data) => {
  if (!ga4Data || !ga4Data.rows) {
    console.log('Pages API - No GA4 data available for enhancement');
    return pages.map(page => ({
      ...page,
      ga4Metrics: {
        pageViews: 0,
        users: 0,
        averageSessionDuration: 0,
        bounceRate: 0,
        dataAvailable: false
      }
    }));
  }

  console.log('Pages API - Enhancing pages with GA4 data. GA4 rows:', ga4Data.rows.length);

  // Create helpers for normalization and specific matching
  const normalizePath = (p) => {
    if (!p) return '';
    try {
      let s = decodeURIComponent(p);
      if (!s.startsWith('/')) s = '/' + s;
      s = s.replace(/\/+/, '/');
      if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
      return s.toLowerCase();
    } catch (e) {
      const s = p.startsWith('/') ? p : '/' + p;
      return (s.length > 1 && s.endsWith('/')) ? s.slice(0, -1).toLowerCase() : s.toLowerCase();
    }
  };
  const isGenericPath = (p) => p === '' || p === '/' || p === '/home';

  // Create a map of GA4 data by normalized page path for faster lookup
  const ga4Map = new Map();

  ga4Data.rows.forEach(row => {
    const rawPath = row.dimensionValues[0].value || '';
    const pagePath = normalizePath(rawPath);
    const pageTitle = row.dimensionValues[1].value || '';
    const pageViews = parseInt(row.metricValues[0].value || '0');
    const users = parseInt(row.metricValues[1].value || '0');
    const avgSessionDuration = parseFloat(row.metricValues[2].value || '0');

    // Aggregate data if multiple rows exist for the same path
    if (ga4Map.has(pagePath)) {
      const existing = ga4Map.get(pagePath);
      ga4Map.set(pagePath, {
        pageViews: existing.pageViews + pageViews,
        users: existing.users + users,
        averageSessionDuration: (existing.averageSessionDuration + avgSessionDuration) / 2,
        pageTitle: existing.pageTitle || pageTitle
      });
    } else {
      ga4Map.set(pagePath, {
        pageViews,
        users,
        averageSessionDuration: avgSessionDuration,
        pageTitle
      });
    }
  });

  // Precompute keys sorted by specificity (longest first)
  const ga4KeysByLength = Array.from(ga4Map.keys()).sort((a, b) => b.length - a.length);

  // Log available GA4 paths for debugging
  console.log('Pages API - Available GA4 paths:', ga4KeysByLength.slice(0, 10));
  console.log('Pages API - Page URLs to match:', pages.map(p => p.url));

  // Enhance each page with GA4 data
  return pages.map(page => {
    let ga4Metrics = {
      pageViews: 0,
      users: 0,
      averageSessionDuration: 0,
      bounceRate: 0,
      dataAvailable: false
    };

    if (page.url) {
      try {
        const url = new URL(page.url);
        const pagePath = normalizePath(url.pathname);

        console.log(`Pages API - Matching page ${page.id}: URL=${page.url}, Path=${pagePath}`);

        // 1) Exact normalized path match
        if (ga4Map.has(pagePath)) {
          const data = ga4Map.get(pagePath);
          ga4Metrics = {
            pageViews: data.pageViews,
            users: data.users,
            averageSessionDuration: Math.round(data.averageSessionDuration * 100) / 100,
            bounceRate: data.pageViews > 0 ? Math.round((1 - (data.users / data.pageViews)) * 100 * 100) / 100 : 0,
            dataAvailable: true,
            matchedPath: pagePath,
            matchType: 'exact'
          };
          console.log(`Pages API - Exact match found for ${pagePath}:`, ga4Metrics);
        } else {
          // 2) Fallback: find the most specific GA4 key that includes the page path or vice versa
          const candidate = ga4KeysByLength.find(key => key === pagePath || key.endsWith(pagePath) || pagePath.endsWith(key));
          if (candidate && !isGenericPath(candidate)) {
            const data = ga4Map.get(candidate);
            ga4Metrics = {
              pageViews: data.pageViews,
              users: data.users,
              averageSessionDuration: Math.round(data.averageSessionDuration * 100) / 100,
              bounceRate: data.pageViews > 0 ? Math.round((1 - (data.users / data.pageViews)) * 100 * 100) / 100 : 0,
              dataAvailable: true,
              matchedPath: candidate,
              matchType: 'fallback'
            };
            console.log(`Pages API - Fallback match for ${pagePath} -> ${candidate}:`, ga4Metrics);
          } else {
            console.log(`Pages API - No GA4 match found for ${pagePath}`);
          }
        }
      } catch (urlError) {
        console.log('Pages API - Invalid URL for page:', page.id, page.url, urlError.message);
      }
    } else {
      console.log('Pages API - Page has no URL:', page.id);
    }

    return {
      ...page,
      ga4Metrics
    };
  });
};

module.exports = async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'This endpoint only accepts GET requests',
      success: false
    });
  }

  console.log('Pages API - Processing request');

  // Extract parameters from query (GET)
  const { brandId, ga4: queryGA4, ga4PropertyId, from: queryFrom, to: queryTo, cache: queryCache } = req.query || {};

  // Normalize empty string and "not-set" values to null
  const normalizeParam = (param) => {
    if (!param || param === '' || param === 'not-set' || param === '0') {
      return null;
    }
    return param;
  };

  // Check if GA4 data should be included (GET only)
  const ga4Flag = queryGA4 === '1' || queryGA4 === 1;

  // Fetch GA4 property ID and access token from brand if brandId is provided
  let ga4PropertyIdToUse = normalizeParam(ga4PropertyId);
  let ga4AccessToken = null;
  let ga4RefreshToken = null;

  console.log('Pages API - GA4 initialization:', {
    queryGA4,
    ga4Flag,
    ga4PropertyId,
    ga4PropertyIdToUse,
    brandId
  });

  if (brandId && ga4Flag) {
    try {
      // Use centralized utility to extract GA4 connection
      const ga4Connection = await getBrandConnection(brandId, 'ga4');

      if (ga4Connection) {
        // Use provided property ID or fall back to brand's property ID
        ga4PropertyIdToUse = ga4PropertyIdToUse || ga4Connection.property_id;
        // Always extract access token and refresh token from brand connections
        ga4AccessToken = ga4Connection.access_token;
        ga4RefreshToken = ga4Connection.refresh_token;

        console.log('Pages API - Using GA4 connection from brand:', {
          brandId,
          ga4PropertyIdToUse,
          ga4PropertyIdType: typeof ga4PropertyIdToUse,
          hasAccessToken: !!ga4AccessToken,
          hasRefreshToken: !!ga4RefreshToken,
          source: ga4PropertyId ? 'query_param_with_brand_token' : 'brand_connection'
        });
      } else {
        console.log('Pages API - Brand has no GA4 connection:', {
          brandId,
          ga4PropertyIdToUse
        });
      }
    } catch (brandError) {
      console.error('Pages API - Error fetching GA4 connection:', brandError.message);
    }
  }

  // Validate GA4 property ID is a valid number string
  const isValidPropertyId = ga4PropertyIdToUse && String(ga4PropertyIdToUse).match(/^\d+$/) && ga4PropertyIdToUse !== '0';
  const includeGA4 = ga4Flag && isValidPropertyId;

  // Get date range from query
  const fromDate = queryFrom;
  const toDate = queryTo;

  // Check if cache should be bypassed
  const bypassCache = (queryCache === '0');

  // Use default date range if no dates provided
  const { fromDate: defaultFrom, toDate: defaultTo } = getDefaultDateRange(fromDate, toDate);

  console.log('Pages API - Parameters:', {
    queryGA4,
    ga4Flag,
    ga4PropertyId,
    ga4PropertyIdToUse,
    includeGA4,
    fromDate: fromDate || 'default',
    toDate: toDate || 'default',
    finalDateRange: { from: defaultFrom, to: defaultTo }
  });

  if (!brandId) {
    return res.status(400).json({
      error: 'Missing required parameter: brandId',
      message: 'Please provide brandId as a query parameter',
      success: false
    });
  }

  if (ga4Flag && !isValidPropertyId) {
    return res.status(400).json({
      error: 'Invalid GA4 Property ID',
      message: 'GA4 Property ID must be a valid numeric ID (not 0 or empty)',
      details: {
        ga4PropertyIdToUse,
        ga4PropertyIdType: typeof ga4PropertyIdToUse,
        isValidPropertyId,
        suggestion: 'Ensure the brand has GA4 connected with a valid property_id'
      },
      success: false
    });
  }

  // Validate date format if provided
  if (fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
    return res.status(400).json({
      error: 'Invalid from date format',
      message: 'Please provide from date in YYYY-MM-DD format',
      success: false
    });
  }

  if (toDate && !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return res.status(400).json({
      error: 'Invalid to date format',
      message: 'Please provide to date in YYYY-MM-DD format',
      success: false
    });
  }

  // Validate date range
  if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
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

    console.log('Pages API - Fetching pages for brand:', brandId, {
      includeGA4,
      ga4PropertyId: ga4PropertyIdToUse || 'none',
      dateRange: includeGA4 ? { from: defaultFrom, to: defaultTo } : 'none',
      customDates: fromDate || toDate ? { from: fromDate, to: toDate } : 'none'
    });

    // Generate cache key including GA4 parameters
    const cacheKey = generateCacheKey(brandId, includeGA4, ga4PropertyIdToUse, defaultFrom, defaultTo);

    // Check cache first (unless bypassed)
    if (!bypassCache) {
      const cachedData = getFromCache(cacheKey);
      if (cachedData) {
        const fetchTime = Date.now() - startTime;
        console.log('Pages API - Returning cached data for brand:', brandId, 'with date range:', { from: defaultFrom, to: defaultTo });

        res.setHeader('X-Cache-Status', 'HIT');
        res.setHeader('X-Cache-Age', `${(Date.now() - CACHE.timestamps[cacheKey]) / 1000}s`);

        return res.status(200).json({
          ...cachedData,
          cached: true,
          responseTimeMs: fetchTime,
          timestamp: new Date().toISOString()
        });
      } else {
        console.log('Pages API - Cache miss');
        res.setHeader('X-Cache-Status', 'MISS');
      }
    } else {
      console.log('Pages API - Cache bypassed for testing');
      res.setHeader('X-Cache-Status', 'BYPASS');
    }

    console.log('Pages API - Cache miss, fetching from Firebase...');

    // Fetch pages using Admin SDK (bypasses all security rules)
    // When GA4 is not requested but from/to are provided, filter pages by createdAt between the range
    let pages = await getPagesByBrandId(brandId, idToken, includeGA4 ? null : defaultFrom, includeGA4 ? null : defaultTo);

    // Initialize GA4 top pages data
    let ga4TopPages = [];

    // Fetch GA4 data if requested
    if (includeGA4) {
      try {
        console.log('Pages API - Fetching GA4 data with parameters:', {
          propertyId: ga4PropertyIdToUse,
          fromDate: defaultFrom,
          toDate: defaultTo,
          requestedFrom: fromDate,
          requestedTo: toDate,
          cacheKey: cacheKey.substring(0, 16) + '...',
          bypassCache
        });

        // Prepare options for GA4 service with OAuth token if available
        const ga4Options = ga4AccessToken ? {
          accessToken: ga4AccessToken,
          refreshToken: ga4RefreshToken
        } : {};

        console.log('Pages API - GA4 options prepared:', {
          hasAccessToken: !!ga4Options.accessToken,
          hasRefreshToken: !!ga4Options.refreshToken,
          propertyId: ga4PropertyIdToUse
        });

        const ga4Data = await getGa4TopPages(ga4PropertyIdToUse, defaultFrom, defaultTo, null, 1000, ga4Options);

        console.log('Pages API - GA4 data received:', {
          hasData: !!ga4Data,
          hasRows: !!(ga4Data && ga4Data.rows),
          rowCount: ga4Data && ga4Data.rows ? ga4Data.rows.length : 0,
          firstFewRows: ga4Data && ga4Data.rows ? ga4Data.rows.slice(0, 3).map(row => ({
            pagePath: row.dimensionValues[0].value,
            pageTitle: row.dimensionValues[1].value,
            pageViews: row.metricValues[0].value
          })) : []
        });

        // Process GA4 top pages data
        if (ga4Data && ga4Data.rows) {
          // Map the raw data to a cleaner format
          const rawTopPages = ga4Data.rows.map(row => ({
            path: row.dimensionValues[0].value,
            title: row.dimensionValues[1].value,
            pageViews: parseInt(row.metricValues[0].value) || 0,
            users: parseInt(row.metricValues[1].value) || 0,
            avgDuration: parseFloat(row.metricValues[2].value) || 0
          }));

          // Create a map to aggregate duplicate entries by path
          const pageMap = new Map();
          rawTopPages.forEach(page => {
            const key = page.path;
            if (pageMap.has(key)) {
              const existingPage = pageMap.get(key);
              existingPage.pageViews += page.pageViews;
              const totalUsers = existingPage.users + page.users;
              if (totalUsers > 0) {
                existingPage.avgDuration =
                  ((existingPage.avgDuration * existingPage.users) +
                   (page.avgDuration * page.users)) / totalUsers;
              }
              existingPage.users += page.users;
            } else {
              pageMap.set(key, { ...page });
            }
          });

          // Convert to array and sort by pageViews
          ga4TopPages = Array.from(pageMap.values())
            .sort((a, b) => b.pageViews - a.pageViews)
            .slice(0, 50) // Limit to top 50 pages
            .map(page => ({
              ...page,
              avgDuration: parseFloat((page.avgDuration / 60).toFixed(2)) // Convert to minutes
            }));
        }

        // Enhance pages with GA4 metrics
        pages = enhancePagesWithGA4Data(pages, ga4Data);

        console.log('Pages API - Enhanced pages with GA4 data. Sample page:', {
          url: pages[0]?.url,
          hasGA4Metrics: !!pages[0]?.ga4Metrics,
          ga4Metrics: pages[0]?.ga4Metrics,
          topPagesCount: ga4TopPages.length
        });
      } catch (ga4Error) {
        console.error('Pages API - Error fetching GA4 data:', {
          error: ga4Error.message,
          stack: ga4Error.stack,
          propertyId: ga4PropertyIdToUse
        });
        // Continue without GA4 data but add empty metrics
        ga4TopPages = []; // Initialize empty top pages on error
        pages = pages.map(page => ({
          ...page,
          ga4Metrics: {
            pageViews: 0,
            users: 0,
            averageSessionDuration: 0,
            bounceRate: 0,
            dataAvailable: false,
            error: ga4Error.message
          }
        }));
      }
    }
    
    const fetchTime = Date.now() - startTime;
    
    // Check if any pages were found
    if (!pages || pages.length === 0) {
      return res.status(404).json({
        error: 'No pages found for this brand',
        brandId,
        success: false,
        message: 'Either the brandId does not exist in your pages collection, or the pages do not have a brandId field matching this value'
      });
    }

    // Calculate totals and statistics
    const totals = {
      count: pages.length,
      verified: 0,
      unverified: 0,
      totalFollowers: 0,
      totalPosts: 0,
      platforms: {}
    };

    // Add GA4 totals if GA4 data is included
    if (includeGA4) {
      totals.ga4Totals = {
        totalPageViews: 0,
        totalUsers: 0,
        averageSessionDuration: 0,
        averageBounceRate: 0,
        pagesWithData: 0
      };
    }

    pages.forEach(page => {
      if (page.verified) {
        totals.verified++;
      } else {
        totals.unverified++;
      }

      if (page.followers) {
        totals.totalFollowers += page.followers;
      }

      if (page.posts) {
        totals.totalPosts += page.posts;
      }

      // Count platforms
      const platform = page.platform || 'Unknown';
      totals.platforms[platform] = (totals.platforms[platform] || 0) + 1;

      // Add GA4 metrics to totals if available
      if (includeGA4 && page.ga4Metrics && page.ga4Metrics.dataAvailable) {
        totals.ga4Totals.totalPageViews += page.ga4Metrics.pageViews;
        totals.ga4Totals.totalUsers += page.ga4Metrics.users;
        totals.ga4Totals.averageSessionDuration += page.ga4Metrics.averageSessionDuration;
        totals.ga4Totals.averageBounceRate += page.ga4Metrics.bounceRate;
        totals.ga4Totals.pagesWithData++;
      }
    });

    // Calculate averages for GA4 data
    if (includeGA4 && totals.ga4Totals.pagesWithData > 0) {
      totals.ga4Totals.averageSessionDuration = Math.round((totals.ga4Totals.averageSessionDuration / totals.ga4Totals.pagesWithData) * 100) / 100;
      totals.ga4Totals.averageBounceRate = Math.round((totals.ga4Totals.averageBounceRate / totals.ga4Totals.pagesWithData) * 100) / 100;
    }

    const response = {
      pages,
      brandId,
      totals,
      success: true,
      timestamp: new Date().toISOString(),
      cached: false,
      responseTimeMs: fetchTime,
      ga4Enhanced: includeGA4,
      topPages: includeGA4 ? ga4TopPages : undefined, // Include GA4 top pages data
      dateRange: includeGA4 ? {
        from: defaultFrom,
        to: defaultTo,
        customDatesProvided: !!(fromDate || toDate),
        requestedFrom: fromDate || null,
        requestedTo: toDate || null
      } : null
    };

    // Cache the response data (excluding timestamp and responseTimeMs)
    if (!bypassCache) {
      const dataToCache = {
        pages,
        brandId,
        totals,
        success: true,
        ga4Enhanced: includeGA4,
        topPages: includeGA4 ? ga4TopPages : undefined, // Include top pages in cache
        dateRange: includeGA4 ? {
          from: defaultFrom,
          to: defaultTo,
          customDatesProvided: !!(fromDate || toDate),
          requestedFrom: fromDate || null,
          requestedTo: toDate || null
        } : null
      };
      setCache(cacheKey, dataToCache);
    }

    const logSummary = {
      brandId,
      pagesCount: pages.length,
      verified: totals.verified,
      unverified: totals.unverified,
      totalFollowers: totals.totalFollowers,
      totalPosts: totals.totalPosts,
      platforms: Object.keys(totals.platforms),
      ga4Enhanced: includeGA4,
      cached: false
    };

    // Add GA4 summary if included
    if (includeGA4 && totals.ga4Totals) {
      logSummary.ga4Summary = {
        totalPageViews: totals.ga4Totals.totalPageViews,
        totalUsers: totals.ga4Totals.totalUsers,
        pagesWithGA4Data: totals.ga4Totals.pagesWithData,
        averageSessionDuration: totals.ga4Totals.averageSessionDuration
      };
    }

    console.log('Pages API - Response Summary:', logSummary);

    // Set Vercel cache headers (15 minutes cache, 5 minutes stale-while-revalidate)
    if (bypassCache) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=300');
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Pages API - Error:', error);
    
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      success: false,
      brandId
    });
  }
}
