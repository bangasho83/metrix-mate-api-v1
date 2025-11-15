/**
 * @fileoverview Combined Analytics API endpoint
 */

const { getGa4UsersData, getGa4SalesData } = require('../services/ga4-service.js');
const { getMetaAdsData } = require('../services/meta-ads-service.js');
const { getDefaultDateRange } = require('../utils/date-utils.js');
const { getBrandConnection } = require('../services/firebase-service.js');
const crypto = require('crypto');

const DEFAULT_RESPONSE = {
  dailyData: [],
  totals: {
    users: {
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
      paid_other: 0
    },
    meta_ads: {
      spend: 0,
      impressions: 0,
      clicks: 0,
      reach: 0,
      campaigns: [],
      spend_by_objective: {}
    },
    sales: {
      revenue: 0,
      transactions: 0,
      averageOrderValue: 0
    }
  }
};

const OBJECTIVE_MAPPING = {
  // User-friendly values mapped to API values
  'ENGAGEMENT': 'OUTCOME_ENGAGEMENT',
  'REACH': 'OUTCOME_AWARENESS',
  'AWARENESS': 'OUTCOME_AWARENESS',
  'TRAFFIC': 'OUTCOME_TRAFFIC',
  'LEADS': 'OUTCOME_LEADS',
  'CONVERSIONS': 'OUTCOME_CONVERSIONS',
  'SALES': 'OUTCOME_SALES',
  'APP_PROMOTION': 'OUTCOME_APP_PROMOTION',
  'STORE_TRAFFIC': 'OUTCOME_STORE_TRAFFIC',
  // Include API values mapping to themselves
  'OUTCOME_ENGAGEMENT': 'OUTCOME_ENGAGEMENT',
  'OUTCOME_AWARENESS': 'OUTCOME_AWARENESS',
  'OUTCOME_TRAFFIC': 'OUTCOME_TRAFFIC',
  'OUTCOME_LEADS': 'OUTCOME_LEADS',
  'OUTCOME_CONVERSIONS': 'OUTCOME_CONVERSIONS',
  'OUTCOME_SALES': 'OUTCOME_SALES',
  'OUTCOME_APP_PROMOTION': 'OUTCOME_APP_PROMOTION',
  'OUTCOME_STORE_TRAFFIC': 'OUTCOME_STORE_TRAFFIC'
};

const CACHE = {
  data: {},
  timestamps: {},
  TTL: 5 * 60 * 1000 // 5 minutes cache TTL
};

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
    console.log('Combined Analytics API - Returning cached response for:', {
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

    const { brandId, ga4PropertyId, metaAccountId, status, objective } = req.query;

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
    let ga4PropertyIdToUse = normalizeParam(ga4PropertyId);
    let metaAccountIdToUse = normalizeParam(metaAccountId);

    if (brandId) {
      try {
        // Use centralized utility to extract connections
        const ga4Connection = await getBrandConnection(brandId, 'ga4');
        const metaConnection = await getBrandConnection(brandId, 'meta_ads');

        if (ga4Connection) {
          ga4Token = ga4Connection.access_token;
          ga4RefreshToken = ga4Connection.refresh_token;
          ga4PropertyIdToUse = ga4PropertyIdToUse || ga4Connection.property_id;
        }
        if (metaConnection) {
          metaAccessToken = metaConnection.access_token;
          metaAccountIdToUse = metaAccountIdToUse || metaConnection.ad_account_id;
        }
        console.log('Combined Analytics API - Using OAuth tokens from brand:', {
          brandId,
          hasGa4Token: !!ga4Token,
          hasGa4RefreshToken: !!ga4RefreshToken,
          hasMetaToken: !!metaAccessToken,
          ga4PropertyIdToUse,
          metaAccountIdToUse
        });
      } catch (brandError) {
        console.error('Error fetching brand info:', brandError.message);
      }
    }

    // OAuth tokens are required from brand connections (no environment fallback)

    // Check if at least one data source is provided
    if (!ga4PropertyIdToUse && !metaAccountIdToUse) {
      console.log('Missing data sources - need at least ga4PropertyId or metaAccountId');
      return res.status(400).json({
        error: 'Missing data sources',
        message: 'Please provide at least ga4PropertyId or metaAccountId',
        success: false
      });
    }

    // Log which data sources are available
    console.log('Combined Analytics API - Data sources:', {
      ga4Available: !!ga4PropertyIdToUse,
      metaAvailable: !!metaAccountIdToUse,
      ga4PropertyId: ga4PropertyIdToUse || 'NOT_PROVIDED',
      metaAccountId: metaAccountIdToUse || 'NOT_PROVIDED'
    });

    // Get date range
    const { from, to } = req.query || {};
    const { fromDate, toDate } = getDefaultDateRange(from, to);

    console.log('Combined Analytics API - Request parameters:', {
      ga4PropertyId: ga4PropertyIdToUse,
      metaAccountId: metaAccountIdToUse,
      from: fromDate,
      to: toDate,
      status,
      objective,
      queryParams: req.query
    });

    // Prepare promises for parallel execution
    const promises = [];
    const promiseMap = {};

    // Prepare options for GA4 and Meta services
    const ga4Options = ga4Token ? { accessToken: ga4Token, refreshToken: ga4RefreshToken } : {};
    const metaOptions = metaAccessToken ? { accessToken: metaAccessToken } : {};

    // GA4 data promises (only if GA4 property is provided)
    if (ga4PropertyIdToUse) {
      console.log('Combined Analytics API - Adding GA4 data sources');

      promises.push(getGa4UsersData(ga4PropertyIdToUse, fromDate, toDate, ga4Options));
      promiseMap.usersData = promises.length - 1;

      promises.push(getGa4SalesData(ga4PropertyIdToUse, fromDate, toDate, ga4Options));
      promiseMap.salesData = promises.length - 1;
    } else {
      console.log('Combined Analytics API - Skipping GA4 data (no property ID provided)');
    }

    // Meta data promises (only if Meta account is provided)
    if (metaAccountIdToUse) {
      console.log('Combined Analytics API - Adding Meta data sources');

      promises.push(getMetaAdsData(metaAccountIdToUse, fromDate, toDate, metaOptions));
      promiseMap.metaAdsData = promises.length - 1;
    } else {
      console.log('Combined Analytics API - Skipping Meta data (no account ID provided)');
    }

    // Execute all promises
    const results = await Promise.allSettled(promises);

    // Initialize response structure
    const response = {
      dailyData: {},
      totals: {
        users: {
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
          paid_other: 0
        },
        meta_ads: {
          spend: 0,
          impressions: 0,
          clicks: 0,
          reach: 0,
          campaigns: [], // Initialize empty campaigns array
          spend_by_objective: {} // Add new object for spend by objective
        },
        sales: {
          revenue: 0,
          transactions: 0,
          averageOrderValue: 0
        }
      }
    };

    // Extract results using promise map
    const usersData = ga4PropertyIdToUse && promiseMap.usersData !== undefined ? results[promiseMap.usersData] : null;
    const metaAdsData = metaAccountIdToUse && promiseMap.metaAdsData !== undefined ? results[promiseMap.metaAdsData] : null;
    const salesData = ga4PropertyIdToUse && promiseMap.salesData !== undefined ? results[promiseMap.salesData] : null;

    // Process GA4 Users data (only if GA4 property was provided)
    if (usersData && usersData.status === 'fulfilled' && usersData.value?.rows) {
      usersData.value.rows.forEach(row => {
        const date = row.dimensionValues[0].value;
        const channelGroup = row.dimensionValues[1].value || '';
        const users = parseInt(row.metricValues[0].value) || 0;

        // Map GA4 channel group to API category
        const category = mapChannelGroupToCategory(channelGroup);

        if (!response.dailyData[date]) {
          response.dailyData[date] = {
            date,
            users: {
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
              paid_other: 0
            },
            meta_ads: {
              spend: 0,
              impressions: 0,
              clicks: 0,
              reach: 0
            },
            sales: {
              revenue: 0,
              transactions: 0,
              averageOrderValue: 0
            }
          };
        }

        response.dailyData[date].users[category] += users;
        response.dailyData[date].users.total += users;
        response.totals.users[category] += users;
        response.totals.users.total += users;
      });
    }

    // Process Meta Ads data with status and objective filtering (only if Meta account was provided)
    if (metaAdsData && metaAdsData.status === 'fulfilled' && metaAdsData.value?.data) {
      // Get campaign IDs that match our filters
      let filteredCampaigns = metaAdsData.value.campaigns || [];
      let filteredCampaignIds = new Set();
      
      // Apply status filter if provided and not empty
      if (status && status.trim()) {
        const statusFilters = status.toUpperCase().split(',').map(s => s.trim());
        filteredCampaigns = filteredCampaigns.filter(campaign => 
          statusFilters.includes(campaign.status.toUpperCase())
        );
      }

      // Apply objective filter if provided and not empty
      if (objective && objective.trim()) {
        const objectiveFilters = objective.toUpperCase().split(',').map(o => o.trim());
        filteredCampaigns = filteredCampaigns.filter(campaign => {
          return objectiveFilters.some(filter => {
            const mappedObjective = OBJECTIVE_MAPPING[filter] || filter;
            return campaign.objective === mappedObjective;
          });
        });
      }

      // Create a set of filtered campaign IDs
      filteredCampaignIds = new Set(filteredCampaigns.map(campaign => campaign.id));

      console.log('Filtering results:', {
        totalCampaigns: metaAdsData.value.campaigns?.length || 0,
        filteredCampaigns: filteredCampaigns.length,
        appliedStatus: status || 'none',
        appliedObjective: objective || 'none',
        providedObjective: objective,
        mappedObjective: objective ? OBJECTIVE_MAPPING[objective.toUpperCase()] : 'none',
        campaignObjectives: filteredCampaigns.map(c => c.objective),
        campaignStatuses: filteredCampaigns.map(c => c.status),
        filteredCampaignIds: Array.from(filteredCampaignIds)
      });

      // Calculate spend by objective for the filtered campaigns
      const spendByObjective = filteredCampaigns.reduce((acc, campaign) => {
        const objective = campaign.objective;
        // Find user-friendly name from mapping
        const userFriendlyObjective = Object.entries(OBJECTIVE_MAPPING).find(
          ([key, value]) => value === objective && !key.startsWith('OUTCOME_')
        )?.[0] || objective;
        
        if (!acc[userFriendlyObjective]) {
          acc[userFriendlyObjective] = {
            spend: 0,
            campaign_count: 0,
            impressions: 0,
            clicks: 0,
            reach: 0
          };
        }
        
        // Add metrics from the campaign
        acc[userFriendlyObjective].spend += parseFloat(campaign.metrics.spend || 0);
        acc[userFriendlyObjective].campaign_count += 1;
        acc[userFriendlyObjective].impressions += parseInt(campaign.metrics.impressions || 0);
        acc[userFriendlyObjective].clicks += parseInt(campaign.metrics.clicks || 0);
        acc[userFriendlyObjective].reach += parseInt(campaign.metrics.reach || 0);
        
        // Round the spend to 2 decimal places
        acc[userFriendlyObjective].spend = parseFloat(acc[userFriendlyObjective].spend.toFixed(2));
        return acc;
      }, {});

      // Sort objectives by spend (descending)
      response.totals.meta_ads.spend_by_objective = Object.fromEntries(
        Object.entries(spendByObjective)
          .sort(([,a], [,b]) => b.spend - a.spend)
      );

      // Add filtered campaigns to response
      response.totals.meta_ads.campaigns = filteredCampaigns
        .sort((a, b) => b.metrics.spend - a.metrics.spend); // Sort by spend descending

      // Calculate totals based on filtered campaigns
      response.totals.meta_ads.spend = parseFloat(
        filteredCampaigns.reduce((sum, campaign) => sum + parseFloat(campaign.metrics.spend || 0), 0).toFixed(2)
      );
      response.totals.meta_ads.impressions = 
        filteredCampaigns.reduce((sum, campaign) => sum + parseInt(campaign.metrics.impressions || 0), 0);
      response.totals.meta_ads.clicks = 
        filteredCampaigns.reduce((sum, campaign) => sum + parseInt(campaign.metrics.clicks || 0), 0);
      response.totals.meta_ads.reach = 
        filteredCampaigns.reduce((sum, campaign) => sum + parseInt(campaign.metrics.reach || 0), 0);

      // If we have campaign-level daily data, use that for daily metrics
      if (metaAdsData.value.campaignDailyData) {
        // Filter daily data by campaign IDs
        const filteredDailyData = metaAdsData.value.campaignDailyData.filter(
          item => filteredCampaignIds.has(item.campaign_id)
        );

        // Group by date
        const dailyMetricsByDate = {};
        filteredDailyData.forEach(item => {
          const date = item.date_start.replace(/-/g, '');
          if (!dailyMetricsByDate[date]) {
            dailyMetricsByDate[date] = {
              spend: 0,
              impressions: 0,
              clicks: 0,
              reach: 0
            };
          }
          dailyMetricsByDate[date].spend += parseFloat(item.spend || 0);
          dailyMetricsByDate[date].impressions += parseInt(item.impressions || 0);
          dailyMetricsByDate[date].clicks += parseInt(item.clicks || 0);
          dailyMetricsByDate[date].reach += parseInt(item.reach || 0);
        });

        // Update response with filtered daily data
        Object.entries(dailyMetricsByDate).forEach(([date, metrics]) => {
          if (!response.dailyData[date]) {
            response.dailyData[date] = {
              date,
              users: {
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
                paid_other: 0
              },
              meta_ads: {
                spend: 0,
                impressions: 0,
                clicks: 0,
                reach: 0
              },
              sales: {
                revenue: 0,
                transactions: 0,
                averageOrderValue: 0
              }
            };
          }
          response.dailyData[date].meta_ads = {
            spend: parseFloat(metrics.spend.toFixed(2)),
            impressions: metrics.impressions,
            clicks: metrics.clicks,
            reach: metrics.reach
          };
        });
      } else {
        // If we don't have campaign-level daily data, use account-level data
        // but adjust it proportionally based on filtered campaign spend
        const totalAccountSpend = metaAdsData.value.campaigns.reduce(
          (sum, campaign) => sum + parseFloat(campaign.metrics.spend || 0), 0
        );
        
        const filteredSpend = response.totals.meta_ads.spend;
        const spendRatio = totalAccountSpend > 0 ? filteredSpend / totalAccountSpend : 0;
        
        // Process daily data with ratio adjustment
        metaAdsData.value.data.forEach(day => {
          const date = day.date_start.replace(/-/g, '');
          const spend = parseFloat(day.spend || 0) * spendRatio;
          const impressions = Math.round(parseInt(day.impressions || 0) * spendRatio);
          const clicks = Math.round(parseInt(day.clicks || 0) * spendRatio);
          const reach = Math.round(parseInt(day.reach || 0) * spendRatio);

          if (!response.dailyData[date]) {
            response.dailyData[date] = {
              date,
              users: {
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
                paid_other: 0
              },
              meta_ads: {
                spend: 0,
                impressions: 0,
                clicks: 0,
                reach: 0
              },
              sales: {
                revenue: 0,
                transactions: 0,
                averageOrderValue: 0
              }
            };
          }

          response.dailyData[date].meta_ads = { 
            spend: parseFloat(spend.toFixed(2)), 
            impressions, 
            clicks, 
            reach 
          };
        });
      }

      console.log('Meta Ads processing complete:', {
        filteredCampaignsCount: filteredCampaigns.length,
        totalSpend: response.totals.meta_ads.spend,
        spendByObjectiveCount: Object.keys(response.totals.meta_ads.spend_by_objective).length
      });
    }

    // Process GA4 Sales data (only if GA4 property was provided)
    if (salesData && salesData.status === 'fulfilled' && salesData.value?.rows) {
      salesData.value.rows.forEach(row => {
        const date = row.dimensionValues[0].value;
        const transactions = parseInt(row.metricValues[0].value || 0); // ecommercePurchases
        const revenue = parseFloat(row.metricValues[1].value || 0);   // purchaseRevenue

        if (!response.dailyData[date]) {
          response.dailyData[date] = {
            date,
            users: {
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
              paid_other: 0
            },
            meta_ads: {
              spend: 0,
              impressions: 0,
              clicks: 0,
              reach: 0
            },
            sales: {
              revenue: 0,
              transactions: 0,
              averageOrderValue: 0
            }
          };
        }

        response.dailyData[date].sales = {
          revenue: parseFloat(revenue.toFixed(2)),
          transactions,
          averageOrderValue: transactions > 0 ? parseFloat((revenue / transactions).toFixed(2)) : 0
        };

        response.totals.sales.revenue += revenue;
        response.totals.sales.transactions += transactions;
      });

      // Calculate total average order value
      response.totals.sales.averageOrderValue = 
        response.totals.sales.transactions > 0 
          ? parseFloat((response.totals.sales.revenue / response.totals.sales.transactions).toFixed(2)) 
          : 0;
      
      // Round total revenue
      response.totals.sales.revenue = parseFloat(response.totals.sales.revenue.toFixed(2));
    }

    // Convert dailyData from object to sorted array
    response.dailyData = Object.values(response.dailyData)
      .sort((a, b) => a.date.localeCompare(b.date));

    // Add data source information to response
    response.dataSources = {
      ga4: {
        enabled: !!ga4PropertyIdToUse,
        propertyId: ga4PropertyIdToUse || null,
        usersDataAvailable: !!(usersData && usersData.status === 'fulfilled'),
        salesDataAvailable: !!(salesData && salesData.status === 'fulfilled')
      },
      meta: {
        enabled: !!metaAccountIdToUse,
        accountId: metaAccountIdToUse || null,
        adsDataAvailable: !!(metaAdsData && metaAdsData.status === 'fulfilled')
      }
    };

    // Enhanced debug logging
    console.log('Combined Analytics API - Response Summary:', {
      totalDays: response.dailyData.length,
      totalUsers: response.totals.users.total,
      totalSpend: response.totals.meta_ads.spend,
      totalRevenue: response.totals.sales.revenue,
      totalTransactions: response.totals.sales.transactions,
      campaignsCount: response.totals.meta_ads.campaigns?.length,
      appliedStatusFilter: status || 'none',
      appliedObjectiveFilter: objective || 'none',
      dataSources: response.dataSources,
      dateRange: { from, to }
    });

    // Before returning the response, store it in cache
    CACHE.data[cacheKey] = response;
    CACHE.timestamps[cacheKey] = now;
    
    console.log('Combined Analytics API - Cached response with key:', {
      cacheKey,
      queryParams: req.query
    });
    
    // We can still set these headers for debugging, but the actual caching is done in memory
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).json(response);

  } catch (error) {
    console.error('Combined Analytics API - Unexpected error:', {
      error: error.message,
      stack: error.stack,
      type: error.name
    });
    return res.status(200).json(DEFAULT_RESPONSE);
  }
}
