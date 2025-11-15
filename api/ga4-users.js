/**
 * @fileoverview GA4 Users Data API endpoint for Vercel Serverless Functions
 */

const { getGa4UsersData, getGa4TopPages, getGa4EventsData } = require('../services/ga4-service.js');
const { getDefaultDateRange } = require('../utils/date-utils.js');
const { getBrandConnection } = require('../services/firebase-service.js');
const crypto = require('crypto');

// Cache configuration
const CACHE = {
  data: {},
  timestamps: {},
  TTL: 15 * 60 * 1000 // 15 minutes in milliseconds
};

const DEFAULT_RESPONSE = {
  totals: {
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
  topPages: [],
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
    console.log('GA4 Users API - Returning cached response for:', {
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

  console.log('GA4 Users API - Environment Check:', {
    hasGoogleOAuthClientId: !!process.env.GOOGLE_OAUTH_CLIENT_ID,
    hasGoogleOAuthClientSecret: !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    nodeEnv: process.env.NODE_ENV
  });

  try {
    const { brandId, ga4PropertyId, source, limit } = req.query;
    const parsedLimit = limit !== undefined ? parseInt(limit, 10) : 10;

    // Normalize empty string and "not-set" values to null, also filter out invalid '0'
    const normalizeParam = (param) => {
      if (!param || param === '' || param === 'not-set' || param === '0') {
        return null;
      }
      return param.trim();
    };

    // Get brand info if brandId is provided
    let ga4Token = null;
    let ga4RefreshToken = null;
    let ga4PropertyIdToUse = normalizeParam(ga4PropertyId);

    if (brandId) {
      try {
        // Use centralized utility to extract GA4 connection
        const ga4Connection = await getBrandConnection(brandId, 'ga4');
        if (ga4Connection) {
          ga4Token = ga4Connection.access_token;
          ga4RefreshToken = ga4Connection.refresh_token;
          ga4PropertyIdToUse = ga4PropertyIdToUse || ga4Connection.property_id;
          console.log('GA4 Users API - Using OAuth token from brand:', {
            brandId,
            hasToken: !!ga4Token,
            hasRefreshToken: !!ga4RefreshToken,
            ga4PropertyIdToUse,
            source: 'brand_connections'
          });
        }
      } catch (brandError) {
        console.error('Error fetching brand info:', brandError.message);
        // Fall back to environment variables if brand fetch fails
      }
    }

    // Require OAuth access token from brand connections
    if (!ga4Token) {
      console.log('GA4 Users API - Missing GA4 OAuth access token (no service account fallback)');
      return res.status(200).json(DEFAULT_RESPONSE);
    }

    if (!ga4PropertyIdToUse) {
      console.log('Missing GA4 Property ID');
      return res.status(200).json(DEFAULT_RESPONSE);
    }

    // Get date range
    const { from, to } = req.query || {};
    const { fromDate, toDate } = getDefaultDateRange(from, to);

    console.log('GA4 Users API - Request parameters:', {
      ga4PropertyId: ga4PropertyIdToUse,
      from: fromDate,
      to: toDate,
      source,
      hasOAuth: !!ga4Token,
      queryParams: req.query
    });

    try {
      // Prepare options for GA4 service
      const ga4Options = ga4Token ? { accessToken: ga4Token, refreshToken: ga4RefreshToken } : {};

      // Fetch user data, top pages, and events data in parallel
      const [usersReport, topPagesReport, eventsReport] = await Promise.all([
        getGa4UsersData(ga4PropertyIdToUse, from, to, ga4Options),
        getGa4TopPages(ga4PropertyIdToUse, from, to, source, parsedLimit, ga4Options),
        getGa4EventsData(ga4PropertyIdToUse, from, to, source, ga4Options) // Pass source parameter
      ]);

      if (!usersReport || !usersReport.rows) {
        console.log('No GA4 data received');
        return res.status(200).json(DEFAULT_RESPONSE);
      }

      const processedData = {
        totals: {
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
        events: {
          total: 0,
          pageView: 0,
          scroll: 0,
          click: 0,
          formSubmit: 0,
          purchase: 0,
          addToCart: 0,
          bySource: {}
        },
        topPages: [],
        dailyData: []
      };

      // Process top pages data - now properly filtered by source
      if (topPagesReport && topPagesReport.rows) {
        // First map the raw data
        const rawTopPages = topPagesReport.rows.map(row => ({
          path: row.dimensionValues[0].value,
          title: row.dimensionValues[1].value,
          pageViews: parseInt(row.metricValues[0].value) || 0,
          users: parseInt(row.metricValues[1].value) || 0,
          avgDuration: parseFloat(row.metricValues[2].value) || 0
        }));
        
        // Create a map to aggregate duplicate entries by path only
        const pageMap = new Map();
        // Aggregate duplicate entries by path only
        rawTopPages.forEach(page => {
          const key = page.path;
          if (pageMap.has(key)) {
            const existingPage = pageMap.get(key);
            // Sum pageViews and users
            existingPage.pageViews += page.pageViews;
            // Calculate weighted average for avgDuration
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
        
        // Convert map values to array and sort by pageViews (descending)
        processedData.topPages = Array.from(pageMap.values())
          .sort((a, b) => b.pageViews - a.pageViews)
          .slice(0, parsedLimit > 0 ? parsedLimit : undefined)
          .map(page => ({
            ...page,
            avgDuration: parseFloat((page.avgDuration / 60).toFixed(2)) // Convert to minutes and format
          }));
      }

      // Process daily data
      try {
        const dailyMap = new Map();
        
        usersReport.rows.forEach(row => {
          const date = row.dimensionValues[0].value;
          const channelGroup = row.dimensionValues[1].value || '';
          const users = parseInt(row.metricValues[0].value) || 0;
          const sessions = parseInt(row.metricValues[1].value) || 0;
          const engagedSessions = parseInt(row.metricValues[2].value) || 0;

          // Map GA4 channel group to API category
          const trafficCategory = mapChannelGroupToCategory(channelGroup);

          // Skip if source filter is applied and doesn't match
          if (source && source.toLowerCase() !== trafficCategory) {
            return;
          }

          // Initialize daily data if not exists
          if (!dailyMap.has(date)) {
            dailyMap.set(date, {
              date,
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
              channel_group_details: {}
            });
          }

          const dayData = dailyMap.get(date);
          
          // Track detailed traffic data (channel group)
          const trafficKey = channelGroup || 'Unassigned';
          if (!dayData.channel_group_details[trafficKey]) {
            dayData.channel_group_details[trafficKey] = {
              channel_group: channelGroup,
              users: 0,
              category: trafficCategory
            };
          }
          dayData.channel_group_details[trafficKey].users += users;

          // Update aggregated data using the new categories
          if (!dayData[trafficCategory]) {
            dayData[trafficCategory] = 0;
          }
          dayData[trafficCategory] += users;
          dayData.total += users;
          
          // Track sessions and engaged sessions
          dayData.sessions += sessions;
          dayData.engagedSessions += engagedSessions;
          
          // Update totals with the new categories
          if (!processedData.totals[trafficCategory]) {
            processedData.totals[trafficCategory] = 0;
          }
          processedData.totals[trafficCategory] += users;
          processedData.totals.total += users;
          processedData.totals.sessions += sessions;
          processedData.totals.engagedSessions += engagedSessions;
        });

        // Calculate bounce rates for each day using the new formula
        dailyMap.forEach(day => {
          // Calculate bounce rate using the formula: ((sessions - engagedSessions) / sessions) * 100
          day.bounceRate = day.sessions > 0 
            ? parseFloat((((day.sessions - day.engagedSessions) / day.sessions) * 100).toFixed(2)) 
            : 0;
        });

        // Calculate overall bounce rate using the new formula
        processedData.totals.bounceRate = processedData.totals.sessions > 0
          ? parseFloat((((processedData.totals.sessions - processedData.totals.engagedSessions) / processedData.totals.sessions) * 100).toFixed(2))
          : 0;
        
        // Calculate engagement rate for each day using the new formula
        dailyMap.forEach(day => {
          // Calculate engagement rate using the formula: (engagedSessions / sessions) * 100
          day.engagementRate = day.sessions > 0
            ? parseFloat(((day.engagedSessions / day.sessions) * 100).toFixed(2))
            : 0;
        });

        // Calculate overall engagement rate using the new formula
        processedData.totals.engagementRate = processedData.totals.sessions > 0
          ? parseFloat(((processedData.totals.engagedSessions / processedData.totals.sessions) * 100).toFixed(2))
          : 0;
        
        // Process daily data for final output
        processedData.dailyData = Array.from(dailyMap.values())
          .sort((a, b) => a.date.localeCompare(b.date))
          .map(day => {
            // Convert channel_group_details object to array and sort by users (descending)
            const trafficDetailsArray = Object.values(day.channel_group_details || {})
              .sort((a, b) => b.users - a.users);
            
            // Group channel groups by category
            const channelGroupsByCategory = {};

            trafficDetailsArray.forEach(detail => {
              const category = detail.category;

              // Group channel groups by category
              if (!channelGroupsByCategory[category]) {
                channelGroupsByCategory[category] = {};
              }

              // Track users by channel group
              if (!channelGroupsByCategory[category][detail.channel_group]) {
                channelGroupsByCategory[category][detail.channel_group] = 0;
              }
              channelGroupsByCategory[category][detail.channel_group] += detail.users;
            });
            
            return {
              ...day,
              sessions: day.sessions,
              engagedSessions: day.engagedSessions,
              bounceRate: day.bounceRate,
              engagementRate: day.engagementRate,
              channel_group_details: channelGroupsByCategory
            };
          });

        // Also update the totals calculation for the entire dataset
        const categoryTotals = {
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
          referral: 0
        };

        Array.from(dailyMap.values()).forEach(day => {
          Object.values(day.channel_group_details || {}).forEach(detail => {
            if (categoryTotals[detail.category] !== undefined) {
              categoryTotals[detail.category] += detail.users;
              categoryTotals.total += detail.users;
            }
          });
        });

        // Add category totals to the overall totals
        processedData.totals = {
          ...processedData.totals,
          ...categoryTotals,
          // Keep the existing engagedSessions and bounceRate
          engagedSessions: processedData.totals.engagedSessions,
          bounceRate: processedData.totals.bounceRate,
          engagementRate: processedData.totals.engagementRate
        };
      } catch (processError) {
        console.error('Error processing GA4 data:', processError);
        return res.status(200).json(DEFAULT_RESPONSE);
      }

      // Process events data with structure similar to medium_source_details
      if (eventsReport && eventsReport.rows) {
        // Create a map to track events by source category
        const eventsByCategory = {};
        
        eventsReport.rows.forEach(row => {
          const eventName = row.dimensionValues[1].value;
          const channelGroup = row.dimensionValues[2].value || '';
          const eventCount = parseInt(row.metricValues[0].value) || 0;

          // Map GA4 channel group to API category
          const trafficCategory = mapChannelGroupToCategory(channelGroup);
          
          // Skip if source filter is applied and doesn't match
          if (source && source.toLowerCase() !== trafficCategory) {
            return;
          }
          
          // Initialize category if not exists
          if (!eventsByCategory[trafficCategory]) {
            eventsByCategory[trafficCategory] = {
              total: 0,
              pageView: 0,
              scroll: 0,
              click: 0,
              formSubmit: 0,
              purchase: 0,
              addToCart: 0
            };
          }
          
          // Add to total events count
          processedData.events.total += eventCount;
          eventsByCategory[trafficCategory].total += eventCount;
          
          // Map common event names to our predefined categories
          let eventCategory = '';
          switch(eventName.toLowerCase()) {
            case 'page_view':
              eventCategory = 'pageView';
              break;
            case 'scroll':
              eventCategory = 'scroll';
              break;
            case 'click':
              eventCategory = 'click';
              break;
            case 'form_submit':
            case 'form_submission':
              eventCategory = 'formSubmit';
              break;
            case 'purchase':
              eventCategory = 'purchase';
              break;
            case 'add_to_cart':
              eventCategory = 'addToCart';
              break;
            default:
              eventCategory = '';
          }
          
          // Update event counts if we have a recognized event category
          if (eventCategory) {
            processedData.events[eventCategory] += eventCount;
            eventsByCategory[trafficCategory][eventCategory] += eventCount;
          }
        });
        
        // Add the events breakdown to the processed data
        processedData.events.bySource = eventsByCategory;
      }

      // After processing all data, if source filter is applied, ensure events data only includes events from that source
      if (source) {
        const sourceCategory = source.toLowerCase();
        
        // Reset event totals
        processedData.events.total = 0;
        processedData.events.pageView = 0;
        processedData.events.scroll = 0;
        processedData.events.click = 0;
        processedData.events.formSubmit = 0;
        processedData.events.purchase = 0;
        processedData.events.addToCart = 0;
        
        // Only keep events from the filtered source category
        if (processedData.events.bySource[sourceCategory]) {
          // Update totals from the filtered category
          const categoryData = processedData.events.bySource[sourceCategory];
          processedData.events.total = categoryData.total || 0;
          processedData.events.pageView = categoryData.pageView || 0;
          processedData.events.scroll = categoryData.scroll || 0;
          processedData.events.click = categoryData.click || 0;
          processedData.events.formSubmit = categoryData.formSubmit || 0;
          processedData.events.purchase = categoryData.purchase || 0;
          processedData.events.addToCart = categoryData.addToCart || 0;
          
          // Keep only the filtered source category in bySource
          const filteredBySource = {};
          filteredBySource[sourceCategory] = processedData.events.bySource[sourceCategory];
          processedData.events.bySource = filteredBySource;
        } else {
          // If no events for the filtered source, clear bySource
          processedData.events.bySource = {};
        }
      }

      // Cache the response
      CACHE.data[cacheKey] = processedData;
      CACHE.timestamps[cacheKey] = now;

      // Set Vercel cache headers (15 minutes cache, 5 minutes stale-while-revalidate)
      res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=300');

      return res.status(200).json(processedData);

    } catch (dataError) {
      console.error('Error fetching GA4 data:', dataError);
      return res.status(200).json(DEFAULT_RESPONSE);
    }

  } catch (error) {
    console.error('GA4 Users API - Unexpected error:', {
      error: error.message,
      stack: error.stack,
      type: error.name
    });
    return res.status(200).json(DEFAULT_RESPONSE);
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
