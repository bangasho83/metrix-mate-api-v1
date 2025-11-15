/**
 * @fileoverview GA4 Events Data API endpoint for Vercel Serverless Functions
 */

const { getGa4EventsByDay, getGa4EventsData } = require('../services/ga4-service.js');
const { getDefaultDateRange } = require('../utils/date-utils.js');
const { getBrandConnection } = require('../services/firebase-service.js');

const DEFAULT_RESPONSE = {
  totals: {
    total: 0,
    pageView: 0,
    scroll: 0,
    click: 0,
    formSubmit: 0,
    purchase: 0,
    addToCart: 0
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

  console.log('GA4 Events API - Environment Check:', {
    hasGoogleOAuthClientId: !!process.env.GOOGLE_OAUTH_CLIENT_ID,
    hasGoogleOAuthClientSecret: !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    nodeEnv: process.env.NODE_ENV
  });

  try {
    const { brandId, ga4PropertyId, eventName, source } = req.query;

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
          console.log('GA4 Events API - Using OAuth token from brand:', {
            brandId,
            hasToken: !!ga4Token,
            hasRefreshToken: !!ga4RefreshToken,
            ga4PropertyIdToUse,
            source: 'brand_connections'
          });
        }
      } catch (brandError) {
        console.error('Error fetching brand info:', brandError.message);
      }
    }

    // Require OAuth access token from brand connections
    if (!ga4Token) {
      console.log('GA4 Events API - Missing GA4 OAuth access token (no service account fallback)');
      return res.status(200).json(DEFAULT_RESPONSE);
    }

    if (!ga4PropertyIdToUse) {
      console.log('Missing GA4 Property ID');
      return res.status(200).json(DEFAULT_RESPONSE);
    }

    const { from, to } = req.query || {};
    const { fromDate, toDate } = getDefaultDateRange(from, to);

    // Parse eventName to support multiple event names
    const eventNames = eventName ? eventName.split(',').map(name => name.trim()) : null;

    console.log('GA4 Events API - Request parameters:', {
      ga4PropertyId: ga4PropertyIdToUse,
      from: fromDate,
      to: toDate,
      eventNames,
      source,
      hasOAuth: !!ga4Token,
      queryParams: req.query
    });

    try {
      // Prepare options for GA4 service
      const ga4Options = ga4Token ? { accessToken: ga4Token, refreshToken: ga4RefreshToken } : {};

      // Fetch events data by day and with source dimension
      let eventsReport;

      if (source) {
        // If source filter is provided, use getGa4EventsData which includes source dimension
        eventsReport = await getGa4EventsData(ga4PropertyIdToUse, from, to, source, ga4Options);
      } else {
        // Otherwise use the regular events by day function
        eventsReport = await getGa4EventsByDay(ga4PropertyIdToUse, from, to, eventNames, null, ga4Options);
      }

      if (!eventsReport || !eventsReport.rows) {
        console.log('No GA4 events data received');
        return res.status(200).json(DEFAULT_RESPONSE);
      }

      const processedData = {
        totals: {
          total: 0,
          pageView: 0,
          scroll: 0,
          click: 0,
          formSubmit: 0,
          purchase: 0,
          addToCart: 0
        },
        dailyData: []
      };

      // Process events data by day
      const dailyMap = new Map();

      eventsReport.rows.forEach(row => {
        // Handle different data structures based on which API was used
        let date, eventName, eventCount, sourceValue;
        
        if (source) {
          // Data from getGa4EventsData has date, eventName, sessionDefaultChannelGroup, eventCount
          date = row.dimensionValues[0].value;
          eventName = row.dimensionValues[1].value;
          const channelGroup = (row.dimensionValues[2].value || '').toLowerCase();
          eventCount = parseInt(row.metricValues[0].value) || 0;

          // Map sessionDefaultChannelGroup to our source filter format
          // GA4's channel groups: "Organic Search", "Direct", "Referral", "Organic Social", "Paid Social", etc.
          const channelGroupMapping = {
            'organic search': 'organic_search',
            'paid search': 'paid_search',
            'organic social': 'organic_social',
            'paid social': 'paid_social',
            'direct': 'direct',
            'email': 'email',
            'referral': 'referral',
            'display': 'display',
            'video': 'video',
            'affiliate': 'affiliate'
          };

          const normalizedChannelGroup = channelGroupMapping[channelGroup] || channelGroup.replace(/\s+/g, '_');

          // Skip if source filter is applied and doesn't match
          if (source && source.toLowerCase() !== normalizedChannelGroup) {
            return;
          }
        } else {
          // Data from getGa4EventsByDay has date, eventName, eventCount
          date = row.dimensionValues[0].value;
          eventName = row.dimensionValues[1].value;
          eventCount = parseInt(row.metricValues[0].value) || 0;
        }
        
        // Initialize daily data if not exists
        if (!dailyMap.has(date)) {
          dailyMap.set(date, {
            date,
            total: 0,
            events: {} // Only keep the detailed events object
          });
        }
        
        const dayData = dailyMap.get(date);
        
        // Track all events in the events object
        dayData.events[eventName] = (dayData.events[eventName] || 0) + eventCount;
        
        // Update total count
        dayData.total += eventCount;
        
        // Map common event names to our predefined categories for totals only
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
        
        // Update totals if we have a recognized event category
        if (eventCategory) {
          processedData.totals[eventCategory] += eventCount;
        }
        
        // Update total count in totals
        processedData.totals.total += eventCount;
      });
      
      // Convert daily map to array and sort by date
      processedData.dailyData = Array.from(dailyMap.values())
        .sort((a, b) => a.date.localeCompare(b.date));
      
      // Add debug logging
      console.log('GA4 Events API - Processed data summary:', {
        totalEvents: processedData.totals.total,
        uniqueDays: dailyMap.size,
        days: Array.from(dailyMap.keys())
      });
      
      return res.status(200).json(processedData);

    } catch (dataError) {
      console.error('Error fetching GA4 events data:', dataError);
      return res.status(200).json(DEFAULT_RESPONSE);
    }

  } catch (error) {
    console.error('GA4 Events API - Unexpected error:', {
      error: error.message,
      stack: error.stack,
      type: error.name
    });
    return res.status(200).json(DEFAULT_RESPONSE);
  }
}

// Helper function to categorize traffic based on medium and source
// Copy of the function from ga4-users.js to ensure consistency
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
  
  // Display Ads: medium is display
  if (medium === 'display') {
    return 'display';
  }
  
  // Video Ads: medium is video
  if (medium === 'video') {
    return 'video';
  }
  
  // Referral: everything else
  return 'referral';
}
