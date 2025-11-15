/**
 * @fileoverview Meta Ads Data API endpoint for Vercel Serverless Functions
 * @module api/meta-ads
 */

const { getMetaAdsData } = require('../services/meta-ads-service.js');
const { getDefaultDateRange } = require('../utils/date-utils.js');
const { getBrandInfo, getBrandConnection } = require('../services/firebase-service.js');
const crypto = require('crypto');

// Cache configuration
const CACHE = {
  data: {},
  timestamps: {},
  TTL: 15 * 60 * 1000 // 15 minutes in milliseconds
};

const DEFAULT_RESPONSE = {
  totals: {
    spend: 0,
    impressions: 0,
    clicks: 0,
    reach: 0,
    campaigns: [] // Add campaigns array to default response
  },
  dailyData: []
};

module.exports = async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Generate cache key from request parameters
  const cacheKey = crypto.createHash('md5').update(JSON.stringify(req.query)).digest('hex');
  const now = Date.now();

  // Check if we have a valid cached response
  if (CACHE.data[cacheKey] && (now - CACHE.timestamps[cacheKey] < CACHE.TTL)) {
    console.log('Meta Ads API - Returning cached response for:', {
      cacheKey,
      age: (now - CACHE.timestamps[cacheKey]) / 1000,
      queryParams: req.query
    });

    // Set cache headers to indicate a cache hit
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('X-Cache-Age', `${(now - CACHE.timestamps[cacheKey]) / 1000}s`);
    return res.status(200).json(CACHE.data[cacheKey]);
  }

  // Set cache headers to indicate a cache miss
  res.setHeader('X-Cache', 'MISS');

  try {
    const { brandId, metaAccountId } = req.query;

    // Normalize empty string and "not-set" values to null, also filter out invalid '0'
    const normalizeParam = (param) => {
      if (!param || param === '' || param === 'not-set' || param === '0') {
        return null;
      }
      return param.trim();
    };

    // Get brand info if brandId is provided
    let metaAccessToken = null;
    let metaAccountIdToUse = normalizeParam(metaAccountId);

    if (brandId) {
      try {
        // Use centralized utility to extract Meta Ads connection
        const metaConnection = await getBrandConnection(brandId, 'meta_ads');
        if (metaConnection) {
          metaAccessToken = metaConnection.access_token;
          metaAccountIdToUse = metaAccountIdToUse || metaConnection.ad_account_id;
          console.log('Meta Ads API - Using OAuth token from brand:', {
            brandId,
            hasToken: !!metaAccessToken,
            metaAccountIdToUse,
            source: 'brand_connections'
          });
        }
      } catch (brandError) {
        console.error('Error fetching Meta Ads connection:', brandError.message);
      }
    }

    // Require OAuth token from brand connections (no environment fallback)
    if (!metaAccessToken) {
      console.log('Missing Meta OAuth access token from brand connections');
      return res.status(200).json(DEFAULT_RESPONSE);
    }

    if (!metaAccountIdToUse) {
      console.log('Missing metaAccountId');
      return res.status(200).json(DEFAULT_RESPONSE);
    }

    const { from, to } = req.query || {};
    const { fromDate, toDate } = getDefaultDateRange(from, to);

    console.log('Meta Ads API - Request parameters:', {
      metaAccountId: metaAccountIdToUse,
      from: fromDate,
      to: toDate,
      hasOAuth: !!metaAccessToken,
      queryParams: req.query
    });

    try {
      const options = metaAccessToken ? { accessToken: metaAccessToken } : {};
      const data = await getMetaAdsData(metaAccountIdToUse, from, to, options);
      
      if (!data || !data.data) {
        console.log('No data returned from Meta API');
        return res.status(200).json(DEFAULT_RESPONSE);
      }

      try {
        // Process the data
        const processedData = {
          totals: {
            spend: 0,
            impressions: 0,
            clicks: 0,
            reach: 0,
            campaigns: [] // Add campaigns array to totals
          },
          dailyData: data.data.map(item => ({
            date: item.date_start.replace(/-/g, ''),
            spend: parseFloat(item.spend || 0),
            impressions: parseInt(item.impressions || 0),
            clicks: parseInt(item.clicks || 0),
            reach: parseInt(item.reach || 0)
          }))
        };

        // Calculate totals
        processedData.totals = processedData.dailyData.reduce((acc, day) => ({
          spend: acc.spend + day.spend,
          impressions: acc.impressions + day.impressions,
          clicks: acc.clicks + day.clicks,
          reach: acc.reach + day.reach,
          campaigns: acc.campaigns // Preserve campaigns array
        }), processedData.totals);

        // Add campaigns data to totals if available
        if (data.campaigns) {
          processedData.totals.campaigns = data.campaigns
            .sort((a, b) => b.metrics.spend - a.metrics.spend); // Sort by spend descending
        }

        // Round monetary values
        processedData.totals.spend = parseFloat(processedData.totals.spend.toFixed(2));

        // Cache the response
        CACHE.data[cacheKey] = processedData;
        CACHE.timestamps[cacheKey] = now;

        res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=300'); // 15 minutes cache, 5 minutes stale
        return res.status(200).json(processedData);

      } catch (processError) {
        console.error('Error processing Meta Ads data:', processError);
        return res.status(200).json(DEFAULT_RESPONSE);
      }

    } catch (dataError) {
      console.error('Error fetching Meta Ads data:', {
        message: dataError.message,
        response: dataError.response?.data,
        status: dataError.response?.status
      });
      return res.status(200).json(DEFAULT_RESPONSE);
    }

  } catch (error) {
    console.error('Meta Ads API - Unexpected error:', {
      error: error.message,
      stack: error.stack,
      type: error.name
    });
    return res.status(200).json(DEFAULT_RESPONSE);
  }
}
