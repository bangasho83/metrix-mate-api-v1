/**
 * @fileoverview Overview API endpoint - Daily analytics data
 */

const { getGa4UsersData, getGa4SalesData } = require('../services/ga4-service.js');
const { getMetaAdsData } = require('../services/meta-ads-service.js');
const { getDefaultDateRange } = require('../utils/date-utils.js');
const { getBrandInfo, getBrandConnections } = require('../services/firebase-service.js');
const crypto = require('crypto');

const { getTossdownSalesData } = require('../services/tossdown-service');
const { getSquareSalesData } = require('../services/square-service');

const DEFAULT_RESPONSE = {
  totals: {
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
      unassigned: 0,
      paid_other: 0,
      sessions: 0,
      engagedSessions: 0,
      bounceRate: 0,
      engagementRate: 0
    },
    meta_ads: {
      spend: 0,
      impressions: 0,
      clicks: 0,
      reach: 0,
      ctr: 0,
      cpc: 0,
      cpm: 0
    }
  },
  dailyData: []
};

const CACHE = {
  data: {},
  timestamps: {},
  TTL: 15 * 60 * 1000 // 15 minutes cache TTL
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

  // Check for cache bypass
  const bypassCache = req.query.cache === '0';

  if (bypassCache) {
    console.log('Overview API - Cache bypassed');
    res.setHeader('X-Cache-Status', 'BYPASS');
  } else {
    // Check if we have a valid cached response
    if (CACHE.data[cacheKey] && (now - CACHE.timestamps[cacheKey] < CACHE.TTL)) {
      console.log('Overview API - Returning cached response for:', {
        cacheKey,
        age: (now - CACHE.timestamps[cacheKey]) / 1000,
        queryParams: req.query
      });

      // Set cache headers to indicate a cache hit
      res.setHeader('X-Cache-Status', 'HIT');
      res.setHeader('X-Cache-Age', `${(now - CACHE.timestamps[cacheKey]) / 1000}s`);
      return res.status(200).json(CACHE.data[cacheKey]);
    } else if (CACHE.data[cacheKey]) {
      // Cache exists but is expired
      console.log('Overview API - Cache expired, refreshing');
      res.setHeader('X-Cache-Status', 'EXPIRED');
    } else {
      // No cache found
      console.log('Overview API - No cache found');
      res.setHeader('X-Cache-Status', 'MISS');
    }
  }



  try {
    const { brandId, ga4PropertyId, metaAccountId, sales_source, sales_source_id } = req.query;

    // Get brand info if brandId is provided
    let ga4Token = null;
    let ga4RefreshToken = null;
    let metaAccessToken = null;
    let salesSourceToUse = sales_source;
    let tossdownIdToUse = sales_source_id;
    // Only use query params if they're not empty strings and not invalid values like '0'
    let ga4PropertyIdToUse = ga4PropertyId && ga4PropertyId.trim() && ga4PropertyId !== '0' ? ga4PropertyId : null;
    let metaAccountIdToUse = metaAccountId && metaAccountId.trim() && metaAccountId !== '0' ? metaAccountId : null;

    if (brandId) {
      try {
        // Use centralized utility to extract all connections
        const connections = await getBrandConnections(brandId);

        console.log('Overview API - Brand connections fetched:', {
          brandId,
          hasConnections: !!connections,
          hasGa4: !!connections?.ga4,
          hasMetaAds: !!connections?.meta_ads,
          hasTossdown: !!connections?.tossdown,
          ga4PropertyId: connections?.ga4?.property_id,
          metaAdAccountId: connections?.meta_ads?.ad_account_id,
          tossdownId: connections?.tossdown?.tossdown_id
        });

        if (connections) {
          // Extract GA4 connection details
          if (connections.ga4 && connections.ga4.property_id) {
            ga4Token = connections.ga4.access_token;
            ga4RefreshToken = connections.ga4.refresh_token;
            ga4PropertyIdToUse = ga4PropertyIdToUse || connections.ga4.property_id;
            console.log('Overview API - GA4 OAuth configured:', { ga4PropertyIdToUse, hasToken: !!ga4Token });
          }

          // Extract Meta Ads connection details
          if (connections.meta_ads && connections.meta_ads.ad_account_id) {
            metaAccessToken = connections.meta_ads.access_token;
            metaAccountIdToUse = metaAccountIdToUse || connections.meta_ads.ad_account_id;
            console.log('Overview API - Meta Ads OAuth configured:', { metaAccountIdToUse, hasToken: !!metaAccessToken });
          }

          // Auto-detect sales source from brand connections if not provided
          if (!salesSourceToUse) {
            if (connections.tossdown && connections.tossdown.tossdown_id) {
              salesSourceToUse = 'tossdown';
              tossdownIdToUse = connections.tossdown.tossdown_id;
              console.log('Overview API - Auto-detected sales source: tossdown');
            } else if (connections.ga4 && connections.ga4.property_id) {
              // Use GA4 for sales data if available
              salesSourceToUse = 'ga4';
              console.log('Overview API - Auto-detected sales source: ga4');
            }
          } else if (salesSourceToUse === 'tossdown' && connections.tossdown && connections.tossdown.tossdown_id) {
            tossdownIdToUse = tossdownIdToUse || connections.tossdown.tossdown_id;
            console.log('Overview API - Using Tossdown from brand connections:', { tossdownIdToUse });
          }
        }
      } catch (brandError) {
        console.error('Overview API - Error fetching brand connections:', brandError.message);
      }
    }

    // OAuth tokens are required from brand connections (no environment fallback)

    // Check if we have at least one data source available
    if (!ga4PropertyIdToUse && !metaAccountIdToUse && !salesSourceToUse) {
      console.log('Overview API - No data sources available - missing all required parameters');
      return res.status(200).json(DEFAULT_RESPONSE);
    }

    // Get date range
    const { from, to } = req.query || {};
    const { fromDate, toDate } = getDefaultDateRange(from, to);

    console.log('Overview API - Request parameters:', {
      brandId: brandId || 'NOT_PROVIDED',
      ga4PropertyId: ga4PropertyIdToUse || 'NOT_PROVIDED',
      metaAccountId: metaAccountIdToUse || 'NOT_PROVIDED',
      from: fromDate,
      to: toDate,
      sales_source: salesSourceToUse || 'NOT_PROVIDED',
      sales_source_id: tossdownIdToUse || 'NOT_PROVIDED',
      dataSources: {
        ga4: !!ga4PropertyIdToUse,
        metaAds: !!metaAccountIdToUse,
        sales: !!salesSourceToUse
      },
      hasOAuthTokens: {
        ga4: !!ga4Token,
        metaAds: !!metaAccessToken
      },
      autoDetected: {
        salesSource: salesSourceToUse && !sales_source
      },
      queryParams: req.query
    });

    // Prepare data promises based on available parameters
    const dataPromises = [];
    const promiseMap = {};

    // GA4 Users data
    if (ga4PropertyIdToUse) {
      const ga4Options = ga4Token ? { accessToken: ga4Token, refreshToken: ga4RefreshToken } : {};
      dataPromises.push(getGa4UsersData(ga4PropertyIdToUse, fromDate, toDate, ga4Options));
      promiseMap.usersData = dataPromises.length - 1;
    } else {
      console.log('Overview API - Skipping GA4 users data (no ga4PropertyId provided)');
    }

    // Meta Ads data
    if (metaAccountIdToUse) {
      const metaOptions = metaAccessToken ? { accessToken: metaAccessToken } : {};
      dataPromises.push(getMetaAdsData(metaAccountIdToUse, fromDate, toDate, metaOptions));
      promiseMap.metaAdsData = dataPromises.length - 1;
    } else {
      console.log('Overview API - Skipping Meta Ads data (no metaAccountId provided)');
    }

    // Sales data - improved logic with auto-detection
    if (salesSourceToUse) {
      if (salesSourceToUse === 'tossdown' && tossdownIdToUse) {
        dataPromises.push(getTossdownSalesData(fromDate, toDate, tossdownIdToUse));
        promiseMap.salesData = dataPromises.length - 1;
        console.log('Overview API - Fetching Tossdown sales data:', { tossdownIdToUse });
      } else if (salesSourceToUse === 'ga4' && ga4PropertyIdToUse) {
        const ga4Options = ga4Token ? { accessToken: ga4Token, refreshToken: ga4RefreshToken } : {};
        dataPromises.push(getGa4SalesData(ga4PropertyIdToUse, fromDate, toDate, ga4Options));
        promiseMap.salesData = dataPromises.length - 1;
        console.log('Overview API - Fetching GA4 sales data:', { ga4PropertyIdToUse });
      } else if (salesSourceToUse === 'square' && tossdownIdToUse) {
        dataPromises.push(getSquareSalesData(fromDate, toDate, tossdownIdToUse));
        promiseMap.salesData = dataPromises.length - 1;
        console.log('Overview API - Fetching Square sales data:', { locationId: tossdownIdToUse });
      } else {
        console.log('Overview API - Sales source configured but missing required ID:', {
          salesSourceToUse,
          tossdownIdToUse,
          ga4PropertyIdToUse
        });
      }
    } else {
      console.log('Overview API - Skipping sales data (no sales source available)');
    }

    // Fetch all available data in parallel
    const results = await Promise.allSettled(dataPromises);

    // Extract results based on promise map
    const usersData = promiseMap.usersData !== undefined ? results[promiseMap.usersData] : { status: 'rejected', reason: 'No GA4 property ID provided' };
    const metaAdsData = promiseMap.metaAdsData !== undefined ? results[promiseMap.metaAdsData] : { status: 'rejected', reason: 'No Meta account ID provided' };
    const salesData = promiseMap.salesData !== undefined ? results[promiseMap.salesData] : { status: 'rejected', reason: 'No sales source provided' };

    // Initialize response structure
    const response = {
      totals: {
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
          unassigned: 0,
          paid_other: 0,
          sessions: 0,
          engagedSessions: 0,
          bounceRate: 0,
          engagementRate: 0
        },
        meta_ads: {
          spend: 0,
          impressions: 0,
          clicks: 0,
          reach: 0,
          ctr: 0,
          cpc: 0,
          cpm: 0
        }
      },
      dailyData: {}
    };

    // Add sales totals if sales source is available
    if (salesSourceToUse) {
      response.totals.sales = {
        revenue: 0,
        transactions: 0,
        averageOrderValue: 0,
        topProducts: []
      };
    }

    // Process GA4 Users data
    if (usersData.status === 'fulfilled' && usersData.value?.rows) {
      usersData.value.rows.forEach(row => {
        const date = row.dimensionValues[0].value;
        const channelGroup = row.dimensionValues[1].value || '';
        const users = parseInt(row.metricValues[0].value) || 0;
        const sessions = parseInt(row.metricValues[1].value) || 0;
        const engagedSessions = parseInt(row.metricValues[2].value) || 0;

        // Map GA4 channel group to API category
        const trafficCategory = mapChannelGroupToCategory(channelGroup);

        if (!response.dailyData[date]) {
          response.dailyData[date] = {
            date,
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
              unassigned: 0,
              paid_other: 0,
              sessions: 0,
              engagedSessions: 0,
              bounceRate: 0,
              engagementRate: 0,
              medium_source_details: {}
            },
            meta_ads: {
              spend: 0,
              impressions: 0,
              clicks: 0,
              reach: 0,
              ctr: 0,
              cpc: 0,
              cpm: 0
            }
          };

          // Only add sales object if sales source is available
          if (salesSourceToUse) {
            response.dailyData[date].sales = {
              revenue: 0,
              transactions: 0,
              averageOrderValue: 0
            };
          }
        }

        // Track detailed traffic data (channel group)
        const trafficKey = channelGroup || 'Unassigned';
        if (!response.dailyData[date].visitors.medium_source_details[trafficCategory]) {
          response.dailyData[date].visitors.medium_source_details[trafficCategory] = {};
        }
        if (!response.dailyData[date].visitors.medium_source_details[trafficCategory][trafficKey]) {
          response.dailyData[date].visitors.medium_source_details[trafficCategory][trafficKey] = 0;
        }
        response.dailyData[date].visitors.medium_source_details[trafficCategory][trafficKey] += users;

        // Update daily data using the new categories
        response.dailyData[date].visitors[trafficCategory] += users;
        response.dailyData[date].visitors.total += users;
        response.dailyData[date].visitors.sessions += sessions;
        response.dailyData[date].visitors.engagedSessions += engagedSessions;

        // Update totals with the new categories
        response.totals.visitors[trafficCategory] += users;
        response.totals.visitors.total += users;
        response.totals.visitors.sessions += sessions;
        response.totals.visitors.engagedSessions += engagedSessions;
      });
    }

    // Process Meta Ads data
    if (metaAdsData.status === 'fulfilled' && metaAdsData.value?.data) {
      metaAdsData.value.data.forEach(day => {
        const date = day.date_start.replace(/-/g, '');
        const spend = parseFloat(day.spend || 0);
        const impressions = parseInt(day.impressions || 0);
        const clicks = parseInt(day.clicks || 0);
        const reach = parseInt(day.reach || 0);

        if (!response.dailyData[date]) {
          response.dailyData[date] = {
            date,
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
              bounceRate: 0,
              engagementRate: 0,
              medium_source_details: {}
            },
            meta_ads: {
              spend: 0,
              impressions: 0,
              clicks: 0,
              reach: 0,
              ctr: 0,
              cpc: 0,
              cpm: 0
            }
          };
          
          // Only add sales object if sales source is available
          if (salesSourceToUse) {
            response.dailyData[date].sales = {
              revenue: 0,
              transactions: 0,
              averageOrderValue: 0
            };
          }
        }

        // Calculate metrics
        const ctr = impressions > 0 ? parseFloat(((clicks / impressions) * 100).toFixed(2)) : 0;
        const cpc = clicks > 0 ? parseFloat((spend / clicks).toFixed(2)) : 0;
        const cpm = impressions > 0 ? parseFloat((spend / impressions * 1000).toFixed(2)) : 0;

        response.dailyData[date].meta_ads = {
          spend: parseFloat(spend.toFixed(2)),
          impressions,
          clicks,
          reach,
          ctr,
          cpc,
          cpm
        };

        // Update totals
        response.totals.meta_ads.spend += spend;
        response.totals.meta_ads.impressions += impressions;
        response.totals.meta_ads.clicks += clicks;
        response.totals.meta_ads.reach += reach;
      });
    }

    // Process Sales data if available
    if (salesSourceToUse && salesData.status === 'fulfilled' && salesData.value) {
      const salesResult = salesData.value;

      if (salesResult.dailyData && Array.isArray(salesResult.dailyData)) {
        salesResult.dailyData.forEach(day => {
          const date = day.date.replace(/-/g, '');
          const revenue = parseFloat(day.revenue || 0);
          const transactions = parseInt(day.purchases || day.transactions || 0);
          const averageOrderValue = transactions > 0 ? parseFloat((revenue / transactions).toFixed(2)) : 0;

          if (!response.dailyData[date]) {
            response.dailyData[date] = {
              date,
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
                bounceRate: 0,
                engagementRate: 0,
                medium_source_details: {}
              },
              meta_ads: {
                spend: 0,
                impressions: 0,
                clicks: 0,
                reach: 0,
                ctr: 0,
                cpc: 0,
                cpm: 0
              }
            };
          }

          response.dailyData[date].sales = {
            revenue: parseFloat(revenue.toFixed(2)),
            transactions,
            averageOrderValue
          };

          // Update totals
          response.totals.sales.revenue += revenue;
          response.totals.sales.transactions += transactions;
        });
      }

      // Process products data from the top level of sales result
      if (salesResult.products && Array.isArray(salesResult.products)) {
        // Get top 3 products by quantity sold
        const topProductsByQuantity = salesResult.products
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 3)
          .map(product => ({
            name: product.item_name || product.name || 'Unknown Product',
            count: product.quantity || 0,
            totalSale: parseFloat((product.total || 0).toFixed(2))
          }));

        response.totals.sales.topProducts = topProductsByQuantity;

        console.log('Overview API - Top Products:', {
          totalProducts: salesResult.products.length,
          topProducts: topProductsByQuantity
        });
      } else {
        console.log('Overview API - No products data found in sales result');
        response.totals.sales.topProducts = [];
      }
    }

    // Calculate bounce rates and engagement rates for each day
    Object.values(response.dailyData).forEach(day => {
      // Calculate bounce rate using the formula: ((sessions - engagedSessions) / sessions) * 100
      day.visitors.bounceRate = day.visitors.sessions > 0
        ? parseFloat((((day.visitors.sessions - day.visitors.engagedSessions) / day.visitors.sessions) * 100).toFixed(2))
        : 0;

      // Calculate engagement rate using the formula: (engagedSessions / sessions) * 100
      day.visitors.engagementRate = day.visitors.sessions > 0
        ? parseFloat(((day.visitors.engagedSessions / day.visitors.sessions) * 100).toFixed(2))
        : 0;
    });

    // Calculate overall bounce rate and engagement rate
    response.totals.visitors.bounceRate = response.totals.visitors.sessions > 0
      ? parseFloat((((response.totals.visitors.sessions - response.totals.visitors.engagedSessions) / response.totals.visitors.sessions) * 100).toFixed(2))
      : 0;

    response.totals.visitors.engagementRate = response.totals.visitors.sessions > 0
      ? parseFloat(((response.totals.visitors.engagedSessions / response.totals.visitors.sessions) * 100).toFixed(2))
      : 0;

    // Convert dailyData from object to sorted array
    response.dailyData = Object.values(response.dailyData)
      .sort((a, b) => a.date.localeCompare(b.date));

    // Round totals and calculate final values
    response.totals.meta_ads.spend = parseFloat(response.totals.meta_ads.spend.toFixed(2));

    // Calculate overall CTR, CPC, and CPM for totals
    response.totals.meta_ads.ctr = response.totals.meta_ads.impressions > 0
      ? parseFloat(((response.totals.meta_ads.clicks / response.totals.meta_ads.impressions) * 100).toFixed(2))
      : 0;
    response.totals.meta_ads.cpc = response.totals.meta_ads.clicks > 0
      ? parseFloat((response.totals.meta_ads.spend / response.totals.meta_ads.clicks).toFixed(2))
      : 0;
    response.totals.meta_ads.cpm = response.totals.meta_ads.impressions > 0
      ? parseFloat((response.totals.meta_ads.spend / response.totals.meta_ads.impressions * 1000).toFixed(2))
      : 0;

    if (response.totals.sales) {
      response.totals.sales.revenue = parseFloat(response.totals.sales.revenue.toFixed(2));
      response.totals.sales.averageOrderValue = response.totals.sales.transactions > 0
        ? parseFloat((response.totals.sales.revenue / response.totals.sales.transactions).toFixed(2))
        : 0;
    }

    console.log('Overview API - Response Summary:', {
      totalDays: response.dailyData.length,
      totalVisitors: response.totals.visitors.total,
      totalSpend: response.totals.meta_ads.spend,
      totalCTR: response.totals.meta_ads.ctr,
      totalCPC: response.totals.meta_ads.cpc,
      totalCPM: response.totals.meta_ads.cpm,
      totalRevenue: response.totals.sales?.revenue || 0,
      totalTransactions: response.totals.sales?.transactions || 0,
      topProductsCount: response.totals.sales?.topProducts?.length || 0,
      hasSalesData: response.dailyData.some(day => day.sales),
      salesSource: salesSourceToUse || 'none',
      salesSourceAutoDetected: salesSourceToUse && !sales_source
    });

    // Cache the response (unless bypassed)
    if (!bypassCache) {
      CACHE.data[cacheKey] = response;
      CACHE.timestamps[cacheKey] = now;
    }

    // Set Vercel cache headers (15 minutes cache, 5 minutes stale-while-revalidate)
    if (bypassCache) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=300');
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Overview API - Error:', {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

// Helper function to map GA4 sessionDefaultChannelGroup to API field names
function mapChannelGroupToCategory(channelGroup) {
  if (!channelGroup) {
    return 'unassigned';
  }

  const channelGroupLower = channelGroup.toLowerCase();

  // Map GA4 channel groups to API categories - exact mapping to match GA4 reports
  const channelMapping = {
    'organic search': 'organic_search',
    'paid search': 'paid_search',
    'organic social': 'organic_social',
    'paid social': 'paid_social',
    'direct': 'direct',
    'email': 'email',
    'affiliates': 'affiliate',
    'display': 'display',
    'video': 'video',
    'referral': 'referral',
    'unassigned': 'unassigned',
    'paid other': 'paid_other',
    '(other)': 'referral'
  };

  return channelMapping[channelGroupLower] || 'referral';
}
