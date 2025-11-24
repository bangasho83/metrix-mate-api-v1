/**
 * @fileoverview Summary Statistics API endpoint for Vercel Serverless Functions
 * Provides aggregated metrics across GA4, Meta Ads, and social media platforms
 */

const { getGa4UsersData, getGa4SalesData } = require('../services/ga4-service.js');
const { getMetaAdsData } = require('../services/meta-ads-service.js');
const { getDefaultDateRange } = require('../utils/date-utils.js');
const { getBrandConnection } = require('../services/firebase-service.js');
const axios = require('axios');
const crypto = require('crypto');
const { getFacebookPostsCount, getInstagramPostsCount } = require('../services/meta-social-service');
const { getTossdownSalesData } = require('../services/tossdown-service');

const META_BASE_URL = 'https://graph.facebook.com';
const META_API_VERSION = 'v24.0';

// Cache configuration
const CACHE = {
  data: {},
  timestamps: {},
  TTL: 15 * 60 * 1000 // 15 minutes cache TTL
};

const DEFAULT_RESPONSE = {
  visitors: {
    total: 0,
    organic_search: 0,
    paid_search: 0,
    organic_social: 0,
    paid_social: 0,
    direct: 0,
    email: 0,
    affiliate: 0,
    display: 0,
    video: 0,
    referral: 0,
    sessions: 0,
    engagedSessions: 0,
    bounceRate: 0
  },
  social: {
    spend: 0,
    impressions: 0,
    clicks: 0,
    reach: 0,
    cpc: 0,
    cpm: 0,
    ctr: 0,
    posts: {
      facebook: {
        count: 0,
        items: []
      },
      instagram: {
        count: 0,
        items: []
      }
    },
    followers: {
      facebook: 0,
      instagram: 0
    }
  },
  ga_sales: {
    revenue: 0,
    transactions: 0,
    averageOrderValue: 0
  },
  sales: {
    revenue: 0,
    orders: 0,
    averageOrderValue: 0,
    source: null
  }
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

  // Get query parameters
  const { brandId, ga4PropertyId, metaAccountId, fbPageId, instaPageId, cache, limit, sales_source, sales_source_id } = req.query;

  // Normalize empty string and "not-set" values to null, also filter out invalid '0'
  const normalizeParam = (param) => {
    if (!param || param === '' || param === 'not-set' || param === '0') {
      return null;
    }
    return param;
  };

  // Get brand info if brandId is provided
  let ga4Token = null;
  let ga4RefreshToken = null;
  let metaAccessToken = null;
  let facebookAccessToken = null;
  let instagramAccessToken = null;
  let tossdownIdToUse = normalizeParam(sales_source_id);
  let ga4PropertyIdToUse = normalizeParam(ga4PropertyId);
  let metaAccountIdToUse = normalizeParam(metaAccountId);
  let fbPageIdToUse = normalizeParam(fbPageId);
  let instaPageIdToUse = normalizeParam(instaPageId);

  if (brandId) {
    try {
      // Use centralized utility to extract connections
      const ga4Connection = await getBrandConnection(brandId, 'ga4');
      const metaConnection = await getBrandConnection(brandId, 'meta_ads');
      const fbConnection = await getBrandConnection(brandId, 'facebook_page');

      if (ga4Connection) {
        ga4Token = ga4Connection.access_token;
        ga4RefreshToken = ga4Connection.refresh_token;
        ga4PropertyIdToUse = ga4PropertyId || ga4Connection.property_id;
      }
      if (metaConnection) {
        metaAccessToken = metaConnection.access_token;
        metaAccountIdToUse = metaAccountId || metaConnection.ad_account_id;
      }
      if (fbConnection) {
        facebookAccessToken = fbConnection.access_token;
        fbPageIdToUse = fbPageId || fbConnection.page_id;
      }
      const instaConnection = await getBrandConnection(brandId, 'instagram_page');
      if (instaConnection) {
        instagramAccessToken = instaConnection.access_token;
        instaPageIdToUse = instaPageId || instaConnection.account_id;
      }
      const tossdownConnection = await getBrandConnection(brandId, 'tossdown');
      if (tossdownConnection && tossdownConnection.tossdown_id && sales_source === 'tossdown') {
        tossdownIdToUse = sales_source_id || tossdownConnection.tossdown_id;
      }
        console.log('Summary Stats API - Using OAuth tokens from brand:', {
          brandId,
          hasGa4Token: !!ga4Token,
          hasGa4RefreshToken: !!ga4RefreshToken,
          hasMetaToken: !!metaAccessToken,
          hasFacebookToken: !!facebookAccessToken,
          hasInstagramToken: !!instagramAccessToken,
          hasTossdownId: !!tossdownIdToUse
        });
      }
    } catch (brandError) {
      console.error('Error fetching brand info:', brandError.message);
    }
  }

  // Fall back to environment variables if no OAuth tokens
  ga4Token = ga4Token || null;
  metaAccessToken = metaAccessToken || process.env.META_ACCESS_TOKEN;
  facebookAccessToken = facebookAccessToken || process.env.META_ACCESS_TOKEN;
  instagramAccessToken = instagramAccessToken || process.env.META_ACCESS_TOKEN;

  // Parse limit with a default of 25 and a maximum of 100
  const postsLimit = Math.min(parseInt(limit) || 25, 100);

  // Check if cache should be bypassed
  const bypassCache = cache === '0';

  // Generate cache key from request parameters
  const cacheKey = crypto.createHash('md5').update(JSON.stringify(req.query)).digest('hex');
  const now = Date.now();
  
  // Check if we have a valid cached response and cache is not bypassed
  if (!bypassCache && CACHE.data[cacheKey] && (now - CACHE.timestamps[cacheKey] < CACHE.TTL)) {
    console.log('Summary Stats API - Returning cached response for:', {
      cacheKey,
      age: (now - CACHE.timestamps[cacheKey]) / 1000,
      queryParams: req.query
    });
    
    // Set cache headers to indicate a cache hit
    res.setHeader('X-Cache', 'HIT');
    res.setHeader('X-Cache-Age', `${(now - CACHE.timestamps[cacheKey]) / 1000}s`);
    return res.status(200).json(CACHE.data[cacheKey]);
  }
  
  // If cache is bypassed, log it
  if (bypassCache) {
    console.log('Summary Stats API - Cache bypass requested');
    res.setHeader('X-Cache', 'BYPASS');
  } else {
    // Set cache headers to indicate a cache miss
    res.setHeader('X-Cache', 'MISS');
  }

  console.log('Summary Stats API - Environment Check:', {
    hasGoogleCredentials: !!process.env.GOOGLE_CLIENT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY,
    hasMetaToken: !!process.env.META_ACCESS_TOKEN,
    nodeEnv: process.env.NODE_ENV
  });

  try {
    // Check for required credentials
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      console.log('Missing required Google credentials');
      return res.status(200).json(DEFAULT_RESPONSE);
    }

    if (!ga4PropertyIdToUse || !metaAccountIdToUse) {
      console.log('Missing required parameters');
      return res.status(200).json(DEFAULT_RESPONSE);
    }

    // Get date range
    const { from, to } = req.query || {};
    const { fromDate, toDate } = getDefaultDateRange(from, to);

    console.log('Summary Stats API - Request parameters:', {
      ga4PropertyId: ga4PropertyIdToUse,
      metaAccountId: metaAccountIdToUse,
      fbPageId: fbPageIdToUse,
      instaPageId: instaPageIdToUse,
      from: fromDate,
      to: toDate,
      cacheBypass: bypassCache,
      salesSource: sales_source,
      salesSourceId: sales_source_id
    });

    // Prepare sales data promise based on sales_source
    let salesDataPromise = Promise.resolve(null);
    if (sales_source === 'tossdown' && tossdownIdToUse) {
      salesDataPromise = getTossdownSalesData(fromDate, toDate, parseInt(tossdownIdToUse), bypassCache);
    }

    // Prepare options for GA4 and Meta services
    const ga4Options = ga4Token ? { accessToken: ga4Token, refreshToken: ga4RefreshToken } : {};
    const metaOptions = metaAccessToken ? { accessToken: metaAccessToken } : {};

    // Fetch all data in parallel
    const [ga4Data, metaAdsData, fbPostsData, igPostsData, fbFollowersData, igFollowersData, ga4SalesData, salesData] = await Promise.allSettled([
      // GA4 visitors data with sessions and engagedSessions metrics
      getGa4UsersData(ga4PropertyIdToUse, from, to, ga4Options, ['activeUsers', 'sessions', 'engagedSessions']),

      // Meta Ads spend data
      getMetaAdsData(metaAccountIdToUse, from, to, metaOptions),

      // Facebook posts count (only if fbPageId is provided)
      fbPageIdToUse ? getFacebookPostsCount(fbPageIdToUse, from, to, postsLimit, null, { accessToken: facebookAccessToken }) : Promise.resolve({ count: 0, details: [] }),

      // Instagram posts count (only if instaPageId is provided)
      instaPageIdToUse ? getInstagramPostsCount(instaPageIdToUse, from, to, postsLimit, null, { accessToken: instagramAccessToken }) : Promise.resolve({ count: 0, details: [] }),

      // Facebook followers count (only if fbPageId is provided)
      fbPageIdToUse ? getFacebookFollowers(fbPageIdToUse, { accessToken: facebookAccessToken }) : Promise.resolve(0),

      // Instagram followers count (only if instaPageId is provided)
      instaPageIdToUse ? getInstagramFollowers(instaPageIdToUse, { accessToken: instagramAccessToken }) : Promise.resolve(0),

      // GA4 sales data
      getGa4SalesData(ga4PropertyIdToUse, from, to, ga4Options),

      // Sales data from specified source
      salesDataPromise
    ]);

    console.log('API data fetch results:', {
      ga4Data: ga4Data.status,
      metaAdsData: metaAdsData.status,
      fbPostsData: fbPostsData.status,
      igPostsData: igPostsData.status,
      fbFollowersData: fbFollowersData.status,
      igFollowersData: igFollowersData.status,
      ga4SalesData: ga4SalesData.status,
      salesData: salesData.status
    });

    // Initialize response structure
    const response = {
      visitors: {
        total: 0,
        organic_search: 0,
        paid_search: 0,
        organic_social: 0,
        paid_social: 0,
        direct: 0,
        email: 0,
        affiliate: 0,
        display: 0,
        video: 0,
        referral: 0,
        sessions: 0,
        engagedSessions: 0,
        bounceRate: 0
      },
      social: {
        spend: 0,
        impressions: 0,
        clicks: 0,
        reach: 0,
        cpc: 0,
        cpm: 0,
        ctr: 0,
        posts: {
          facebook: {
            count: 0,
            items: []
          },
          instagram: {
            count: 0,
            items: []
          }
        },
        followers: {
          facebook: 0,
          instagram: 0
        }
      },
      ga_sales: {
        revenue: 0,
        transactions: 0,
        averageOrderValue: 0
      },
      sales: {
        revenue: 0,
        orders: 0,
        averageOrderValue: 0,
        source: sales_source || null
      }
    };

    // Process GA4 visitors data
    if (ga4Data.status === 'fulfilled' && ga4Data.value?.rows) {
      ga4Data.value.rows.forEach(row => {
        const sourceValue = (row.dimensionValues[1].value || '').toLowerCase();
        const mediumValue = (row.dimensionValues[2].value || '').toLowerCase();
        const users = parseInt(row.metricValues[0].value) || 0;
        const sessions = parseInt(row.metricValues[1]?.value || 0);
        const engagedSessions = parseInt(row.metricValues[2]?.value || 0);
        
        // Get traffic category using the same function as ga4-users.js
        const category = getTrafficCategory(mediumValue, sourceValue);
        
        // Add to the specific category
        response.visitors[category] += users;
        
        // Add to total
        response.visitors.total += users;
        
        // Track sessions and engagedSessions
        response.visitors.sessions += sessions;
        response.visitors.engagedSessions += engagedSessions;
      });
    }

    // Process Meta Ads data
    if (metaAdsData.status === 'fulfilled' && metaAdsData.value?.data) {
      // Sum up metrics from daily data
      metaAdsData.value.data.forEach(day => {
        response.social.spend += parseFloat(day.spend || 0);
        response.social.impressions += parseInt(day.impressions || 0);
        response.social.clicks += parseInt(day.clicks || 0);
        response.social.reach += parseInt(day.reach || 0);
      });
      
      // Round spend to 2 decimal places
      response.social.spend = parseFloat(response.social.spend.toFixed(2));
      
      // Calculate ad performance metrics
      if (response.social.spend > 0) {
        // CPC (Cost Per Click) = Total Spend / Total Clicks
        response.social.cpc = response.social.clicks > 0 
          ? parseFloat((response.social.spend / response.social.clicks).toFixed(2)) 
          : 0;
        
        // CPM (Cost Per Mille/1000 Impressions) = (Total Spend / Total Impressions) * 1000
        response.social.cpm = response.social.impressions > 0 
          ? parseFloat(((response.social.spend / response.social.impressions) * 1000).toFixed(2)) 
          : 0;
        
        // CTR (Click-Through Rate) = (Total Clicks / Total Impressions) * 100
        response.social.ctr = response.social.impressions > 0 
          ? parseFloat(((response.social.clicks / response.social.impressions) * 100).toFixed(2)) 
          : 0;
      }
    }

    // Calculate bounce rate from GA4 data
    if (ga4Data.status === 'fulfilled' && ga4Data.value?.rows) {
      let totalSessions = 0;
      let totalEngagedSessions = 0;
      
      ga4Data.value.rows.forEach(row => {
        // Check if we have sessions and engagedSessions data in the metrics
        if (row.metricValues.length >= 3) {
          const sessions = parseInt(row.metricValues[1].value || 0);
          const engagedSessions = parseInt(row.metricValues[2].value || 0);
          
          totalSessions += sessions;
          totalEngagedSessions += engagedSessions;
        }
      });
      
      // Calculate bounce rate using the formula: ((sessions - engagedSessions) / sessions) * 100
      response.visitors.bounceRate = totalSessions > 0 
        ? parseFloat((((totalSessions - totalEngagedSessions) / totalSessions) * 100).toFixed(2)) 
        : 0;
      
      console.log('Bounce rate calculation:', {
        totalSessions,
        totalEngagedSessions,
        bounceRate: response.visitors.bounceRate
      });
    }

    // Process Facebook posts data
    if (fbPostsData.status === 'fulfilled' && fbPostsData.value) {
      response.social.posts.facebook.count = fbPostsData.value.count || 0;
      response.social.posts.facebook.items = fbPostsData.value.details || [];
      console.log(`Processed ${response.social.posts.facebook.count} Facebook posts`);
    } else if (fbPostsData.status === 'rejected') {
      console.error('Failed to fetch Facebook posts count:', fbPostsData.reason);
      response.social.posts.facebook.count = 0;
    }

    // Process Instagram posts data
    if (igPostsData.status === 'fulfilled' && igPostsData.value) {
      response.social.posts.instagram.count = igPostsData.value.count || 0;
      response.social.posts.instagram.items = igPostsData.value.details || [];
      console.log(`Processed ${response.social.posts.instagram.count} Instagram posts`);
    } else if (igPostsData.status === 'rejected') {
      console.error('Failed to fetch Instagram posts count:', igPostsData.reason);
      response.social.posts.instagram.count = 0;
    }

    // Process Facebook followers count
    if (fbFollowersData.status === 'fulfilled') {
      response.social.followers.facebook = fbFollowersData.value;
    }

    // Process Instagram followers count
    if (igFollowersData.status === 'fulfilled') {
      response.social.followers.instagram = igFollowersData.value;
      console.log(`Instagram followers count: ${igFollowersData.value}`);
    } else if (igFollowersData.status === 'rejected') {
      console.error('Failed to fetch Instagram followers count:', igFollowersData.reason);
      response.social.followers.instagram = 0;
    }

    // Process GA4 sales data
    if (ga4SalesData.status === 'fulfilled' && ga4SalesData.value?.rows) {
      let totalRevenue = 0;
      let totalTransactions = 0;

      ga4SalesData.value.rows.forEach(row => {
        // GA4 sales data has ecommercePurchases and purchaseRevenue metrics
        const transactions = parseInt(row.metricValues[0].value || 0);
        const revenue = parseFloat(row.metricValues[1].value || 0);

        totalTransactions += transactions;
        totalRevenue += revenue;
      });

      // Update response with sales data
      response.ga_sales.transactions = totalTransactions;
      response.ga_sales.revenue = parseFloat(totalRevenue.toFixed(2));

      // Calculate average order value
      response.ga_sales.averageOrderValue = totalTransactions > 0
        ? parseFloat((totalRevenue / totalTransactions).toFixed(2))
        : 0;
    }

    // Process sales data from specified source (e.g., Tossdown)
    if (salesData.status === 'fulfilled' && salesData.value) {
      const salesResult = salesData.value;

      if (sales_source === 'tossdown' && salesResult.totals) {
        // Extract Tossdown sales data
        response.sales.revenue = parseFloat(salesResult.totals.revenue || 0);
        response.sales.orders = parseInt(salesResult.totals.purchases || 0);
        response.sales.averageOrderValue = parseFloat(salesResult.totals.averageOrderValue || 0);
        response.sales.source = 'tossdown';

        console.log('Processed Tossdown sales data:', {
          revenue: response.sales.revenue,
          orders: response.sales.orders,
          averageOrderValue: response.sales.averageOrderValue
        });
      }
    } else if (salesData.status === 'rejected') {
      console.error('Failed to fetch sales data:', salesData.reason);
    }

    console.log('Summary Stats API - Response:', {
      totalVisitors: response.visitors.total,
      socialSpend: response.social.spend,
      facebookPosts: response.social.posts.facebook,
      instagramPosts: response.social.posts.instagram,
      facebookFollowers: response.social.followers.facebook,
      instagramFollowers: response.social.followers.instagram,
      salesRevenue: response.ga_sales.revenue,
      salesTransactions: response.ga_sales.transactions,
      salesSourceRevenue: response.sales.revenue,
      salesSourceOrders: response.sales.orders,
      salesSource: response.sales.source
    });

    // Store the response in cache
    CACHE.data[cacheKey] = response;
    CACHE.timestamps[cacheKey] = now;
    
    console.log('Summary Stats API - Cached response with key:', {
      cacheKey,
      queryParams: req.query
    });

    // Set Vercel cache headers (15 minutes cache, 5 minutes stale-while-revalidate)
    if (bypassCache) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=300');
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Summary Stats API - Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Helper function to categorize traffic - copied from ga4-users.js for consistency
function getTrafficCategory(medium, source) {
  medium = medium.toLowerCase();
  source = source.toLowerCase();
  
  // App Stores should be referral
  const appStoreDomains = [
    'play.google.com',
    'play.app.goo.gl',
    'apps.apple.com',
    'itunes.apple.com',
    'appstore',
    'googleplay',
    'google play',
    'app store',
    'google-play'
  ];
  
  if (appStoreDomains.some(domain => source.includes(domain))) {
    return 'referral';
  }
  
  // Organic Search: source is a search engine AND medium is organic
  if ((medium === 'organic' || medium === '') && 
      ['google', 'bing', 'yahoo', 'duckduckgo', 'baidu', 'yandex'].some(s => source.includes(s)) &&
      !appStoreDomains.some(domain => source.includes(domain))) {  // Exclude app stores
    return 'organic_search';
  }
  
  // Paid Search: source is a search engine AND medium indicates paid
  if ((['cpc', 'ppc', 'paid_search', 'paidsearch', 'cpv', 'cpa', 'cpm'].includes(medium) || medium === '') && 
      ['google', 'bing', 'yahoo', 'adwords', 'search'].some(s => source.includes(s)) &&
      source.includes('ads')) {
    return 'paid_search';
  }
  
  // Organic Social: specific social domains or platforms
  const organicSocialDomains = [
    'l.instagram.com',
    'm.facebook.com',
    'l.facebook.com',
    'instagram.com',
    'facebook.com',
    't.co',
    'twitter.com',
    'linkedin.com',
    'pinterest.com',
    'tiktok.com',
    'snapchat.com',
    'youtube.com',
    'reddit.com'
  ];
  
  if (organicSocialDomains.some(domain => source.includes(domain)) || 
      (medium === 'referral' || medium === '') && 
      ['facebook', 'instagram', 'twitter', 'linkedin', 'pinterest', 'tiktok', 'snapchat', 'youtube'].some(s => source.includes(s))) {
    return 'organic_social';
  }
  
  // Paid Social: source is social platform AND medium indicates paid
  const socialPlatforms = ['facebook', 'instagram', 'twitter', 'linkedin', 'pinterest', 'tiktok', 'snapchat', 'youtube'];
  if (socialPlatforms.some(s => source.includes(s)) && 
      (medium !== 'referral' && !['organic', '(none)', ''].includes(medium))) {
    return 'paid_social';
  }
  
  // Direct: source is (direct) AND medium is (none)
  if ((source === '(direct)' || source === 'direct') && 
      (medium === '(none)' || medium === 'none' || medium === '')) {
    return 'direct';
  }
  
  // Email: medium is email
  if (medium === 'email') {
    return 'email';
  }
  
  // Affiliate: medium is affiliate
  if (medium === 'affiliate') {
    return 'affiliate';
  }
  
  // Display: medium is display
  if (medium === 'display') {
    return 'display';
  }
  
  // Video: medium is video
  if (medium === 'video') {
    return 'video';
  }
  
  // Default to referral for everything else
  return 'referral';
}

/**
 * Fallback method to get Facebook posts count using a different API endpoint
 * @param {string} pageId - Facebook page ID
 * @param {string} from - Start date (YYYYMMDD)
 * @param {string} to - End date (YYYYMMDD)
 * @returns {Promise<number>} Count of posts
 */
async function getFacebookPostsCountFallback(pageId, from, to) {
  try {
    // Format dates for Meta API (YYYY-MM-DD)
    const fromDate = from.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
    const toDate = to.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
    
    // Convert to Unix timestamps for Meta API
    const since = Math.floor(new Date(fromDate).getTime() / 1000);
    const until = Math.floor(new Date(toDate).getTime() / 1000);
    
    // Use the page_posts edge which is specifically for posts created by the page
    const response = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${pageId}`, {
      params: {
        access_token: process.env.META_ACCESS_TOKEN,
        fields: `posts.since(${since}).until(${until}).limit(100){id,created_time}`,
      }
    });
    
    // Check if we have posts data
    if (response.data && response.data.posts && response.data.posts.data) {
      return response.data.posts.data.length;
    }
    
    return 0;
  } catch (error) {
    console.error('Error in fallback Facebook posts count:', error.message);
    return 0;
  }
}

/**
 * Gets the followers count for a Facebook page
 * @param {string} pageId - Facebook page ID
 * @param {Object} [options={}] - Additional options
 * @param {string} [options.accessToken] - OAuth access token (optional, uses process.env.META_ACCESS_TOKEN if not provided)
 * @returns {Promise<number>} Followers count
 */
async function getFacebookFollowers(pageId, options = {}) {
  try {
    const { accessToken } = options;
    const pageAccessToken = accessToken || process.env.META_ACCESS_TOKEN;

    if (!pageAccessToken) {
      throw new Error('Facebook access token not provided and META_ACCESS_TOKEN environment variable not set');
    }

    const response = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${pageId}`, {
      params: {
        access_token: pageAccessToken,
        fields: 'followers_count,fan_count'
      }
    });

    // Use followers_count if available, otherwise fall back to fan_count (page likes)
    return response.data.followers_count || response.data.fan_count || 0;
  } catch (error) {
    console.error('Error fetching Facebook followers:', error.message);
    return 0;
  }
}

/**
 * Gets the followers count for an Instagram business account
 * @param {string} instagramId - Instagram business account ID
 * @param {Object} [options={}] - Additional options
 * @param {string} [options.accessToken] - OAuth access token (optional, uses process.env.META_ACCESS_TOKEN if not provided)
 * @returns {Promise<number>} Followers count
 */
async function getInstagramFollowers(instagramId, options = {}) {
  try {
    console.log(`Fetching Instagram followers for account ${instagramId}`);

    const { accessToken } = options;
    const instagramAccessToken = accessToken || process.env.META_ACCESS_TOKEN;

    if (!instagramAccessToken) {
      throw new Error('Instagram access token not provided and META_ACCESS_TOKEN environment variable not set');
    }

    const response = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${instagramId}`, {
      params: {
        access_token: instagramAccessToken,
        fields: 'followers_count,username'
      }
    });

    console.log(`Instagram followers for ${response.data.username || instagramId}: ${response.data.followers_count || 0}`);
    return response.data.followers_count || 0;
  } catch (error) {
    console.error('Error fetching Instagram followers:', error.message);

    // Log detailed error information
    if (error.response) {
      console.error('Instagram API error details:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: JSON.stringify(error.response.data)
      });
    }

    return 0;
  }
}
