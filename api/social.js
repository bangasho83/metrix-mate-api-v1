/**
 * @fileoverview Social API endpoint to fetch Facebook and Instagram page details and posts
 */

const { getFacebookPosts, getInstagramPostsCount, getFacebookFollowers, getInstagramFollowers } = require('../services/meta-social-service.js');
const { getBrandInfo, getBrandConnection } = require('../services/firebase-service.js');
const crypto = require('crypto');
const axios = require('axios');

const META_BASE_URL = 'https://graph.facebook.com';
const META_API_VERSION = 'v21.0';

// Copy the working fetchInstagramInsights function from meta-stats
async function fetchInstagramInsights(mediaId, accessToken) {
  try {
    // Default insights object
    const insights = {
      impressions: 0,
      reach: 0,
      engagement: 0,
      saved: 0,
      video_views: 0,
      media_type: '',
      media_url: ''
    };

    // Try to get media details first
    try {
      const mediaResponse = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${mediaId}`, {
        params: {
          fields: 'media_type,media_url,thumbnail_url,like_count,comments_count',
          access_token: accessToken
        },
        timeout: 5000
      });

      if (mediaResponse.data) {
        insights.media_type = mediaResponse.data.media_type || '';
        insights.media_url = mediaResponse.data.media_url || mediaResponse.data.thumbnail_url || '';

        // Calculate engagement from likes and comments
        const likes = mediaResponse.data.like_count || 0;
        const comments = mediaResponse.data.comments_count || 0;
        insights.engagement = likes + comments;

        console.log(`Media ${mediaId} details: type=${insights.media_type}, likes=${likes}, comments=${comments}, engagement=${insights.engagement}`);
      }
    } catch (mediaError) {
      console.log(`Error fetching media details for ${mediaId}:`, mediaError.message);
    }

    // Define metrics based on media type
    let metrics = ['impressions', 'reach', 'saved'];

    // Add video_views for VIDEO or REELS
    if (insights.media_type === 'VIDEO' || insights.media_type === 'REEL') {
      metrics.push('video_views');
      console.log(`Adding video_views metric for ${mediaId} (${insights.media_type})`);
    }

    // Try to get all metrics in a single request
    try {
      console.log(`Fetching Instagram insights for ${mediaId} with metrics: ${metrics.join(',')}`);

      const response = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${mediaId}/insights`, {
        params: {
          metric: metrics.join(','),
          access_token: accessToken
        },
        timeout: 8000
      });

      if (response.data && response.data.data) {
        console.log(`Successfully received insights for ${mediaId}:`,
          response.data.data.map(d => `${d.name}=${d.values[0]?.value || 0}`).join(', '));

        response.data.data.forEach(insight => {
          const metricName = insight.name;
          const value = insight.values && insight.values[0] ? insight.values[0].value : 0;
          insights[metricName] = typeof value === 'number' ? value : 0;
        });

        // Log video views specifically for videos/reels
        if (insights.media_type === 'VIDEO' || insights.media_type === 'REEL') {
          console.log(`Video views for ${mediaId} (${insights.media_type}): ${insights.video_views}`);
        }
      }
    } catch (insightsError) {
      console.log(`Error fetching insights for ${mediaId}:`, insightsError.message);
    }

    return insights;
  } catch (error) {
    console.error(`Error in fetchInstagramInsights for ${mediaId}:`, error.message);
    return {
      impressions: 0,
      reach: 0,
      engagement: 0,
      saved: 0,
      video_views: 0
    };
  }
}

// Cache configuration
const CACHE = {
  data: {},
  timestamps: {},
  TTL: 15 * 60 * 1000 // 15 minutes in milliseconds
};

/**
 * Generates a cache key from parameters
 * @param {string} metaAccountId - Meta account ID
 * @param {string} fbPageId - Facebook page ID
 * @param {string} instaPageId - Instagram page ID
 * @param {string} from - Start date
 * @param {string} to - End date
 * @returns {string} Cache key
 */
const generateCacheKey = (metaAccountId, fbPageId, instaPageId, from, to) => {
  const keyString = `social_${metaAccountId}_${fbPageId || 'none'}_${instaPageId || 'none'}_${from}_${to}`;
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
    console.log('Social API - Cache hit for key:', cacheKey);
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
  console.log('Social API - Data cached with key:', cacheKey);
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

  console.log('Social API - Processing request');

  // Extract parameters from query string
  const { brandId, metaAccountId, fbPageId, instaPageId, from, to } = req.query;

  // Normalize empty string and "not-set" values to null, also filter out invalid '0'
  const normalizeParam = (param) => {
    if (!param || param === '' || param === 'not-set' || param === '0') {
      return null;
    }
    return param;
  };

  // Get brand info if brandId is provided
  let facebookAccessToken = null;
  let instagramAccessToken = null;
  let fbPageIdToUse = normalizeParam(fbPageId);
  let instaPageIdToUse = normalizeParam(instaPageId);

  if (brandId) {
    try {
      // Use centralized utility to extract connections
      // Bypass cache if requested via query parameter
      const bypassBrandCache = req.query.brandCache === '0';
      const fbConnection = await getBrandConnection(brandId, 'facebook_page', { useCache: !bypassBrandCache });
      const igConnection = await getBrandConnection(brandId, 'instagram_page', { useCache: !bypassBrandCache });

      console.log('Social API - Brand connections check:', {
        brandId,
        hasFacebookConnection: !!fbConnection,
        hasInstagramConnection: !!igConnection,
        fbPageIdFromQuery: fbPageId,
        instaPageIdFromQuery: instaPageId
      });

      if (fbConnection) {
        facebookAccessToken = fbConnection.access_token;
        fbPageIdToUse = fbPageIdToUse || fbConnection.page_id;
        console.log('Social API - Facebook page configured from brand:', {
          brandId,
          fbPageIdToUse,
          hasFacebookToken: !!facebookAccessToken
        });
      }
      if (igConnection) {
        instagramAccessToken = igConnection.access_token;
        instaPageIdToUse = instaPageIdToUse || igConnection.account_id;
        console.log('Social API - Instagram page configured from brand:', {
          brandId,
          instaPageIdToUse,
          hasInstagramToken: !!instagramAccessToken
        });
      }
      console.log('Social API - Using OAuth tokens from brand:', {
        brandId,
        hasFacebookToken: !!facebookAccessToken,
        hasInstagramToken: !!instagramAccessToken,
        fbPageIdToUse,
        instaPageIdToUse
      });
    } catch (brandError) {
      console.error('Error fetching brand connections:', brandError.message);
    }
  }

  // OAuth tokens are required from brand connections (no environment fallback)
  // Validate that we have required tokens and IDs
  if (!brandId) {
    return res.status(400).json({
      error: 'Missing required parameter: brandId',
      message: 'Please provide brandId in the query parameters (OAuth tokens are fetched from brand connections)',
      success: false
    });
  }

  if (!fbPageIdToUse && !instaPageIdToUse) {
    return res.status(400).json({
      error: 'No social pages configured',
      message: 'This brand does not have Facebook or Instagram pages connected. Please connect at least one social page to this brand.',
      details: {
        brandId,
        hasFacebookConnection: !!facebookAccessToken,
        hasInstagramConnection: !!instagramAccessToken,
        queryParams: {
          fbPageId: fbPageId || 'not provided',
          instaPageId: instaPageId || 'not provided'
        }
      },
      success: false
    });
  }

  // Validate that we have OAuth tokens for the requested pages
  if (fbPageIdToUse && !facebookAccessToken) {
    return res.status(400).json({
      error: 'Missing Facebook OAuth token',
      message: 'Facebook page is not connected to this brand. Please connect your Facebook page first.',
      details: {
        brandId,
        fbPageIdRequested: fbPageIdToUse,
        hasFacebookConnection: false
      },
      success: false
    });
  }

  if (instaPageIdToUse && !instagramAccessToken) {
    return res.status(400).json({
      error: 'Missing Instagram OAuth token',
      message: 'Instagram page is not connected to this brand. Please connect your Instagram page first.',
      details: {
        brandId,
        instaPageIdRequested: instaPageIdToUse,
        hasInstagramConnection: false
      },
      success: false
    });
  }

  if (!from || !to) {
    return res.status(400).json({
      error: 'Missing date parameters',
      message: 'Please provide both from and to dates in YYYY-MM-DD format',
      success: false
    });
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(from) || !dateRegex.test(to)) {
    return res.status(400).json({
      error: 'Invalid date format',
      message: 'Dates must be in YYYY-MM-DD format',
      success: false
    });
  }

  // Validate date range
  if (new Date(from) > new Date(to)) {
    return res.status(400).json({
      error: 'Invalid date range',
      message: 'from date must be before or equal to to date',
      success: false
    });
  }

  try {
    const startTime = Date.now();

    console.log('Social API - Fetching social data:', {
      metaAccountId,
      fbPageId: fbPageIdToUse || 'NOT_PROVIDED',
      instaPageId: instaPageIdToUse || 'NOT_PROVIDED',
      from,
      to
    });

    // Generate cache key
    const cacheKey = generateCacheKey(metaAccountId, fbPageIdToUse, instaPageIdToUse, from, to);

    // Check for cache bypass
    const bypassCache = req.query.cache === '0';

    if (bypassCache) {
      console.log('Social API - Cache bypassed');
      res.setHeader('X-Cache-Status', 'BYPASS');
    } else {
      // Check cache first
      const cachedData = getFromCache(cacheKey);
      if (cachedData) {
        const fetchTime = Date.now() - startTime;
        console.log('Social API - Returning cached data');

        res.setHeader('X-Cache-Status', 'HIT');
        res.setHeader('X-Cache-Age', `${(Date.now() - CACHE.timestamps[cacheKey]) / 1000}s`);

        return res.status(200).json({
          ...cachedData,
          cached: true,
          responseTimeMs: fetchTime,
          timestamp: new Date().toISOString()
        });
      } else {
        console.log('Social API - Cache miss');
        res.setHeader('X-Cache-Status', 'MISS');
      }
    }

    console.log('Social API - Cache miss, fetching from Meta APIs...');

    // Prepare promises for parallel execution
    const promises = [];
    const promiseMap = {};

    // Facebook data
    if (fbPageIdToUse) {
      promises.push(getFacebookPosts(fbPageIdToUse, from, to, 25, null, { accessToken: facebookAccessToken }));
      promiseMap.facebookPosts = promises.length - 1;

      promises.push(getFacebookFollowers(fbPageIdToUse, { accessToken: facebookAccessToken }));
      promiseMap.facebookFollowers = promises.length - 1;
    }

    // Instagram data
    if (instaPageIdToUse) {
      promises.push(getInstagramPostsCount(instaPageIdToUse, from, to, 25, null, { accessToken: instagramAccessToken }));
      promiseMap.instagramPosts = promises.length - 1;

      promises.push(getInstagramFollowers(instaPageIdToUse, { accessToken: instagramAccessToken }));
      promiseMap.instagramFollowers = promises.length - 1;
    }

    // Execute all promises
    const results = await Promise.allSettled(promises);

    // Process results
    const response = {
      metaAccountId,
      dateRange: { from, to },
      facebook: null,
      instagram: null,
      success: true,
      timestamp: new Date().toISOString(),
      cached: false,
      responseTimeMs: Date.now() - startTime
    };

    // Process Facebook results
    if (fbPageIdToUse) {
      const facebookPostsResult = results[promiseMap.facebookPosts];
      const facebookFollowersResult = results[promiseMap.facebookFollowers];

      response.facebook = {
        pageId: fbPageIdToUse,
        followers: facebookFollowersResult.status === 'fulfilled' ? facebookFollowersResult.value : 0,
        posts: {
          count: 0,
          details: []
        }
      };

      if (facebookPostsResult.status === 'fulfilled') {
        response.facebook.posts = facebookPostsResult.value;
      } else {
        console.error('Facebook posts error:', facebookPostsResult.reason);
      }

      if (facebookFollowersResult.status === 'rejected') {
        console.error('Facebook followers error:', facebookFollowersResult.reason);
      }
    }

    // Process Instagram results
    if (instaPageIdToUse) {
      const instagramPostsResult = results[promiseMap.instagramPosts];
      const instagramFollowersResult = results[promiseMap.instagramFollowers];

      response.instagram = {
        pageId: instaPageIdToUse,
        followers: instagramFollowersResult.status === 'fulfilled' ? instagramFollowersResult.value : 0,
        posts: {
          count: 0,
          details: []
        }
      };

      if (instagramPostsResult.status === 'fulfilled') {
        const postsData = instagramPostsResult.value;
        response.instagram.posts = postsData;

        // Get page access token and enhance posts with insights using the same method as meta-stats
        if (postsData.details && postsData.details.length > 0) {
          try {
            // Use Instagram access token from brand connections (OAuth-only)
            if (!instagramAccessToken) {
              console.log('Social API - Skipping Instagram insights (no access token available)');
            } else {
              console.log('Social API - Enhancing Instagram posts with insights using OAuth token');

              // Process each post to get insights
              for (let post of postsData.details) {
                try {
                  // Calculate basic engagement
                  if (post.likes || post.comments) {
                    post.insights = post.insights || {};
                    post.insights.engagement = (post.likes || 0) + (post.comments || 0);
                  }

                  // Get insights using the same method as meta-stats
                  let insights = await fetchInstagramInsights(post.id, instagramAccessToken);

                  if (insights) {
                    post.insights = insights;
                    console.log(`Enhanced post ${post.id} with insights:`, insights);
                  }
                } catch (postError) {
                  console.error(`Error enhancing post ${post.id}:`, postError.message);
                }
              }
            }
          } catch (tokenError) {
            console.error('Error processing Instagram insights:', tokenError.message);
          }
        }
      } else {
        console.error('Instagram posts error:', instagramPostsResult.reason);
      }
    }

    // Cache the response data (excluding timestamp and responseTimeMs)
    if (!bypassCache) {
      const dataToCache = {
        metaAccountId,
        dateRange: { from, to },
        facebook: response.facebook,
        instagram: response.instagram,
        success: true
      };
      setCache(cacheKey, dataToCache);
    }

    console.log('Social API - Response Summary:', {
      metaAccountId,
      facebookPosts: response.facebook?.posts?.count || 0,
      facebookFollowers: response.facebook?.followers || 0,
      instagramPosts: response.instagram?.posts?.count || 0,
      instagramFollowers: response.instagram?.followers || 0,
      dateRange: { from, to },
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
    console.error('Social API - Error:', error);
    
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      success: false,
      metaAccountId,
      dateRange: { from, to }
    });
  }
}
