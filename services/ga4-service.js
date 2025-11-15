const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const axios = require('axios');

/**
 * Initialize GA4 client with service account credentials
 * @param {Object} options - Configuration options
 * @param {string} options.clientEmail - Google service account email
 * @param {string} options.privateKey - Google service account private key
 * @returns {BetaAnalyticsDataClient} GA4 client instance
 */
const initializeClient = (options = {}) => {
  const {
    clientEmail = process.env.GOOGLE_CLIENT_EMAIL,
    privateKey = process.env.GOOGLE_PRIVATE_KEY
  } = options;

  return new BetaAnalyticsDataClient({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n')
    }
  });
};

/**
 * Initialize GA4 client with OAuth token
 * @param {string} accessToken - OAuth access token
 * @param {string} refreshToken - OAuth refresh token (optional)
 * @returns {Object} OAuth client configuration
 */
const initializeOAuthClient = (accessToken, refreshToken = null) => {
  return {
    accessToken,
    refreshToken,
    type: 'oauth'
  };
};

/**
 * Refresh OAuth access token using refresh token
 * @param {string} refreshToken - OAuth refresh token
 * @returns {Promise<string>} New access token
 */
const refreshAccessToken = async (refreshToken) => {
  try {
    console.log('GA4 Service - Refreshing access token');

    if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
      throw new Error('Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET environment variables');
    }

    const response = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    console.log('GA4 Service - Token refreshed successfully');
    return response.data.access_token;
  } catch (error) {
    console.error('GA4 Service - Error refreshing token:', {
      message: error.message,
      response: error.response?.data
    });
    throw new Error('Failed to refresh access token: ' + error.message);
  }
};

/**
 * Generic GA4 REST API function for OAuth
 * @param {string} propertyId - GA4 property ID
 * @param {Object} requestBody - GA4 API request body
 * @param {string} accessToken - OAuth access token
 * @param {string} refreshToken - OAuth refresh token (optional, for auto-refresh on 401)
 * @returns {Promise<Object>} GA4 report response
 */
const runGA4ReportViaREST = async (propertyId, requestBody, accessToken, refreshToken = null) => {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

  console.log('GA4 Service - Running report via REST (OAuth):', JSON.stringify(requestBody, null, 2));

  try {
    const response = await axios.post(url, requestBody, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('GA4 Service - REST response:', {
      hasRows: !!response.data.rows,
      rowCount: response.data.rows?.length || 0,
      dimensionHeaders: response.data.dimensionHeaders?.map(h => h.name)
    });

    return response.data;
  } catch (error) {
    // If 401 and we have a refresh token, try to refresh and retry
    if (error.response?.status === 401 && refreshToken) {
      console.log('GA4 Service - Access token expired, refreshing...', {
        hasRefreshToken: !!refreshToken,
        hasClientId: !!process.env.GOOGLE_OAUTH_CLIENT_ID,
        hasClientSecret: !!process.env.GOOGLE_OAUTH_CLIENT_SECRET
      });

      try {
        const newAccessToken = await refreshAccessToken(refreshToken);

        // Retry with new token
        const retryResponse = await axios.post(url, requestBody, {
          headers: {
            'Authorization': `Bearer ${newAccessToken}`,
            'Content-Type': 'application/json'
          }
        });

        console.log('GA4 Service - REST response (after refresh):', {
          hasRows: !!retryResponse.data.rows,
          rowCount: retryResponse.data.rows?.length || 0,
          dimensionHeaders: retryResponse.data.dimensionHeaders?.map(h => h.name)
        });

        return retryResponse.data;
      } catch (refreshError) {
        console.error('GA4 Service - Token refresh failed:', {
          message: refreshError.message,
          hasClientId: !!process.env.GOOGLE_OAUTH_CLIENT_ID,
          hasClientSecret: !!process.env.GOOGLE_OAUTH_CLIENT_SECRET
        });
        throw refreshError;
      }
    } else if (error.response?.status === 401) {
      console.error('GA4 Service - 401 error but cannot refresh:', {
        hasRefreshToken: !!refreshToken,
        errorMessage: error.response?.data?.error?.message
      });
    }

    throw error;
  }
};

/**
 * Fetches GA4 users data
 * @param {string} propertyId - GA4 property ID
 * @param {string} from - Start date
 * @param {string} to - End date
 * @param {Object} options - Configuration (OAuth only)
 * @param {string} options.accessToken - OAuth access token (required in OAuth-only mode)
 * @param {string} options.refreshToken - OAuth refresh token (optional)
 * @returns {Promise<Object>} GA4 report response
 */
const getGa4UsersData = async (propertyId, from, to, options = {}) => {
  try {
    console.log('GA4 Service - Fetching users data:', { propertyId, from, to, hasOAuth: !!options.accessToken });

    if (!options.accessToken) {
      throw new Error('GA4 OAuth access token is required (no service account fallback)');
    }

    const request = {
      dateRanges: [
        {
          startDate: from,
          endDate: to,
        },
      ],
      dimensions: [
        {
          name: 'date'
        },
        {
          name: 'sessionDefaultChannelGroup'
        }
      ],
      metrics: [
        {
          name: 'totalUsers'
        },
        {
          name: 'sessions'
        },
        {
          name: 'engagedSessions'  // Changed from bounces to engagedSessions
        }
      ],
    };

    console.log('GA4 Service - Request configuration:', JSON.stringify(request, null, 2));

    const response = await runGA4ReportViaREST(propertyId, request, options.accessToken, options.refreshToken);

    console.log('GA4 Service - Response received:', {
      hasRows: !!response.rows,
      rowCount: response.rows?.length || 0,
      dimensionHeaders: response.dimensionHeaders?.map(h => h.name) || [],
      metricHeaders: response.metricHeaders?.map(h => h.name) || []
    });

    return response;
  } catch (error) {
    console.error('GA4 Service - Error fetching users data:', {
      message: error.message,
      stack: error.stack,
      details: error.details || 'No additional details'
    });
    throw error;
  }
};

/**
 * Fetches GA4 sales data
 * @param {string} propertyId - GA4 property ID
 * @param {string} from - Start date
 * @param {string} to - End date
 * @param {Object} options - Configuration (OAuth only)
 * @param {string} options.accessToken - OAuth access token (required in OAuth-only mode)
 * @param {string} options.refreshToken - OAuth refresh token (optional)
 * @returns {Promise<Object>} GA4 report response
 */
const getGa4SalesData = async (propertyId, from, to, options = {}) => {
  console.log('Fetching GA4 sales data:', { propertyId, from, to, hasOAuth: !!options.accessToken });

  try {
    if (!options.accessToken) {
      throw new Error('GA4 OAuth access token is required (no service account fallback)');
    }

    const request = {
      dateRanges: [
        {
          startDate: from,
          endDate: to,
        },
      ],
      dimensions: [
        {
          name: 'date'
        }
      ],
      metrics: [
        {
          name: 'ecommercePurchases'  // For transactions count
        },
        {
          name: 'purchaseRevenue'     // For revenue amount
        }
      ],
    };

    const response = await runGA4ReportViaREST(propertyId, request, options.accessToken, options.refreshToken);

    console.log('GA4 Sales Data Response:', {
      hasRows: !!response?.rows,
      rowCount: response?.rows?.length,
      firstRow: response?.rows?.[0]
    });

    return response;
  } catch (error) {
    console.error('GA4 Sales Data Error:', {
      message: error.message,
      code: error.code,
      details: error.details
    });
    throw error;
  }
};

/**
 * Fetches GA4 top pages data with optional source filtering
 * @param {string} propertyId - GA4 property ID
 * @param {string} from - Start date
 * @param {string} to - End date
 * @param {string} source - Optional source filter (google, social, direct, referral)
 * @param {number} limit - Optional limit for the number of results (default: 10)
 * @param {Object} options - Configuration (OAuth only)
 * @param {string} options.accessToken - OAuth access token (required in OAuth-only mode)
 * @param {string} options.refreshToken - OAuth refresh token (optional)
 * @returns {Promise<Object>} GA4 report response
 */
const getGa4TopPages = async (propertyId, from, to, source = null, limit = 10, options = {}) => {
  console.log('GA4 Service - getGa4TopPages called with:', {
    propertyId,
    from,
    to,
    source,
    limit,
    hasOAuth: !!options.accessToken
  });

  if (!options.accessToken) {
    throw new Error('GA4 OAuth access token is required (no service account fallback)');
  }

  // Base request configuration (without 'property' field for REST API)
  const request = {
    dateRanges: [
      {
        startDate: from,
        endDate: to,
      },
    ],
    dimensions: [
      {
        name: 'pagePath'
      },
      {
        name: 'pageTitle'
      },
      {
        name: 'sessionDefaultChannelGroup'
      }
    ],
    metrics: [
      {
        name: 'screenPageViews'
      },
      {
        name: 'activeUsers'
      },
      {
        name: 'averageSessionDuration'
      }
    ],
    orderBys: [
      {
        metric: { metricName: 'screenPageViews' },
        desc: true
      }
    ],
    // Always fetch 1000 rows from GA4 for proper aggregation
    limit: 1000,
  };

  // Add channel group filter if provided
  if (source) {
    let channelGroupFilter;

    // Map source categories to GA4 channel group values
    if (source === 'organic_search') {
      channelGroupFilter = {
        stringFilter: {
          matchType: 'EXACT',
          value: 'Organic Search',
          caseSensitive: false
        }
      };
    } else if (source === 'paid_search') {
      channelGroupFilter = {
        stringFilter: {
          matchType: 'EXACT',
          value: 'Paid Search',
          caseSensitive: false
        }
      };
    } else if (source === 'organic_social') {
      channelGroupFilter = {
        stringFilter: {
          matchType: 'EXACT',
          value: 'Organic Social',
          caseSensitive: false
        }
      };
    } else if (source === 'paid_social') {
      channelGroupFilter = {
        stringFilter: {
          matchType: 'EXACT',
          value: 'Paid Social',
          caseSensitive: false
        }
      };
    } else if (source === 'direct') {
      channelGroupFilter = {
        stringFilter: {
          matchType: 'EXACT',
          value: 'Direct',
          caseSensitive: false
        }
      };
    } else if (source === 'referral') {
      channelGroupFilter = {
        stringFilter: {
          matchType: 'EXACT',
          value: 'Referral',
          caseSensitive: false
        }
      };
    } else if (source === 'unassigned') {
      channelGroupFilter = {
        stringFilter: {
          matchType: 'EXACT',
          value: 'Unassigned',
          caseSensitive: false
        }
      };
    } else if (source === 'paid_other') {
      channelGroupFilter = {
        stringFilter: {
          matchType: 'EXACT',
          value: 'Paid Other',
          caseSensitive: false
        }
      };
    }

    // Only add dimension filter if we have a direct filter match
    if (channelGroupFilter) {
      request.dimensionFilter = {
        filter: {
          fieldName: 'sessionDefaultChannelGroup',
          ...channelGroupFilter
        }
      };
    }
  }

  const response = await runGA4ReportViaREST(propertyId, request, options.accessToken, options.refreshToken);
  return response;
};

/**
 * Fetches GA4 events data with optional source filtering
 * @param {string} propertyId - GA4 property ID
 * @param {string} from - Start date
 * @param {string} to - End date
 * @param {string} source - Optional source filter (google, social, direct, referral)
 * @param {Object} options - Configuration (OAuth only)
 * @param {string} options.accessToken - OAuth access token (required in OAuth-only mode)
 * @param {string} options.refreshToken - OAuth refresh token (optional)
 * @returns {Promise<Object>} GA4 report response
 */
const getGa4EventsData = async (propertyId, from, to, source = null, options = {}) => {
  // Base request configuration (without 'property' field for REST API)
  const request = {
    dateRanges: [
      {
        startDate: from,
        endDate: to,
      },
    ],
    dimensions: [
      {
        name: 'date'  // Add date dimension first
      },
      {
        name: 'eventName'
      },
      {
        name: 'sessionDefaultChannelGroup'  // Use sessionDefaultChannelGroup for consistency
      }
    ],
    metrics: [
      {
        name: 'eventCount'
      }
    ],
    orderBys: [
      {
        dimension: { dimensionName: 'date' },
        desc: false
      }
    ]
  };

  // Add channel group filter if provided
  if (source) {
    let channelGroupFilter;

    // Map source categories to GA4 channel group values
    if (source === 'organic_search') {
      channelGroupFilter = {
        stringFilter: {
          matchType: 'EXACT',
          value: 'Organic Search',
          caseSensitive: false
        }
      };
    } else if (source === 'paid_search') {
      channelGroupFilter = {
        stringFilter: {
          matchType: 'EXACT',
          value: 'Paid Search',
          caseSensitive: false
        }
      };
    } else if (source === 'organic_social') {
      channelGroupFilter = {
        stringFilter: {
          matchType: 'EXACT',
          value: 'Organic Social',
          caseSensitive: false
        }
      };
    } else if (source === 'paid_social') {
      channelGroupFilter = {
        stringFilter: {
          matchType: 'EXACT',
          value: 'Paid Social',
          caseSensitive: false
        }
      };
    } else if (source === 'direct') {
      channelGroupFilter = {
        stringFilter: {
          matchType: 'EXACT',
          value: 'Direct',
          caseSensitive: false
        }
      };
    } else if (source === 'referral') {
      channelGroupFilter = {
        stringFilter: {
          matchType: 'EXACT',
          value: 'Referral',
          caseSensitive: false
        }
      };
    } else if (source === 'unassigned') {
      channelGroupFilter = {
        stringFilter: {
          matchType: 'EXACT',
          value: 'Unassigned',
          caseSensitive: false
        }
      };
    } else if (source === 'paid_other') {
      channelGroupFilter = {
        stringFilter: {
          matchType: 'EXACT',
          value: 'Paid Other',
          caseSensitive: false
        }
      };
    }

    // Only add dimension filter if we have a direct filter match
    if (channelGroupFilter) {
      request.dimensionFilter = {
        filter: {
          fieldName: 'sessionDefaultChannelGroup',
          ...channelGroupFilter
        }
      };
    }
  }

  console.log('GA4 Service - Events data request:', JSON.stringify(request, null, 2));

  if (!options.accessToken) {
    throw new Error('GA4 OAuth access token is required (no service account fallback)');
  }

  const response = await runGA4ReportViaREST(propertyId, request, options.accessToken, options.refreshToken);

  console.log('GA4 Service - Events data response:', {
    hasRows: !!response.rows,
    rowCount: response.rows?.length || 0,
    dimensionHeaders: response.dimensionHeaders?.map(h => h.name) || []
  });

  return response;
};

/**
 * Fetches GA4 events data by day with optional source filtering
 * @param {string} propertyId - GA4 property ID
 * @param {string} from - Start date
 * @param {string} to - End date
 * @param {string[]|string|null} eventName - Optional specific event name(s) to filter
 * @param {string} source - Optional source filter (google, social, direct, referral)
 * @param {Object} options - Configuration (OAuth only)
 * @param {string} options.accessToken - OAuth access token (required in OAuth-only mode)
 * @param {string} options.refreshToken - OAuth refresh token (optional)
 * @returns {Promise<Object>} GA4 report response
 */
const getGa4EventsByDay = async (propertyId, from, to, eventName = null, source = null, options = {}) => {
  try {
    console.log('GA4 Service - Fetching events by day:', { propertyId, from, to, eventName, source, hasOAuth: !!options.accessToken });

    // Base request configuration (without 'property' field for REST API)
    const request = {
      dateRanges: [
        {
          startDate: from,
          endDate: to,
        },
      ],
      dimensions: [
        {
          name: 'date'
        },
        {
          name: 'eventName'
        }
      ],
      metrics: [
        {
          name: 'eventCount'
        }
      ],
      orderBys: [
        {
          dimension: { dimensionName: 'date' },
          desc: false
        }
      ]
    };
    
    // Add event name filter if specified
    if (eventName) {
      // Handle both string and array formats
      const eventNames = Array.isArray(eventName) ? eventName : [eventName];
      
      if (eventNames.length === 1) {
        // Single event name - use simple filter
        request.dimensionFilter = {
          filter: {
            fieldName: 'eventName',
            stringFilter: {
              matchType: 'EXACT',
              value: eventNames[0]
            }
          }
        };
      } else if (eventNames.length > 1) {
        // Multiple event names - use OR filter
        request.dimensionFilter = {
          filter: {
            fieldName: 'eventName',
            inListFilter: {
              values: eventNames,
              caseSensitive: false
            }
          }
        };
      }
    }
    
    // If source filtering is needed, use getGa4EventsData instead
    // as it includes the sessionSource dimension
    if (source) {
      return getGa4EventsData(propertyId, from, to, source, options);
    }

    console.log('GA4 Service - Events by day request:', JSON.stringify(request, null, 2));

    if (!options.accessToken) {
      throw new Error('GA4 OAuth access token is required (no service account fallback)');
    }

    const response = await runGA4ReportViaREST(propertyId, request, options.accessToken, options.refreshToken);

    console.log('GA4 Service - Events by day response:', {
      hasRows: !!response.rows,
      rowCount: response.rows?.length || 0
    });
    
    return response;
  } catch (error) {
    console.error('GA4 Service - Error fetching events by day:', error);
    throw error;
  }
};

/**
 * Fetches GA4 users data using brandId
 * @param {string} brandId - Brand ID to fetch GA4 data from
 * @param {string} from - Start date
 * @param {string} to - End date
 * @returns {Promise<Object>} GA4 report response
 */
const getGa4UsersDataByBrand = async (brandId, from, to) => {
  const { getBrandConnection } = require('./firebase-service.js');

  try {
    // Use centralized utility to extract GA4 connection
    const ga4Connection = await getBrandConnection(brandId, 'ga4');

    if (!ga4Connection || !ga4Connection.property_id) {
      throw new Error(`GA4 connection not found for brand ${brandId}`);
    }

    const propertyId = ga4Connection.property_id;
    const accessToken = ga4Connection.access_token;
    const refreshToken = ga4Connection.refresh_token;

    console.log('GA4 Service - Fetching users data by brand:', { brandId, propertyId, from, to });

    return await getGa4UsersData(propertyId, from, to, { accessToken, refreshToken });
  } catch (error) {
    console.error('GA4 Service - Error fetching users data by brand:', error.message);
    throw error;
  }
};

/**
 * Fetches GA4 sales data using brandId
 * @param {string} brandId - Brand ID to fetch GA4 data from
 * @param {string} from - Start date
 * @param {string} to - End date
 * @returns {Promise<Object>} GA4 report response
 */
const getGa4SalesDataByBrand = async (brandId, from, to) => {
  const { getBrandConnection } = require('./firebase-service.js');

  try {
    // Use centralized utility to extract GA4 connection
    const ga4Connection = await getBrandConnection(brandId, 'ga4');

    if (!ga4Connection || !ga4Connection.property_id) {
      throw new Error(`GA4 connection not found for brand ${brandId}`);
    }

    const propertyId = ga4Connection.property_id;
    const accessToken = ga4Connection.access_token;
    const refreshToken = ga4Connection.refresh_token;

    console.log('GA4 Service - Fetching sales data by brand:', { brandId, propertyId, from, to });

    return await getGa4SalesData(propertyId, from, to, { accessToken, refreshToken });
  } catch (error) {
    console.error('GA4 Service - Error fetching sales data by brand:', error.message);
    throw error;
  }
};

/**
 * Fetches GA4 events data using brandId
 * @param {string} brandId - Brand ID to fetch GA4 data from
 * @param {string} from - Start date
 * @param {string} to - End date
 * @param {string} eventName - Event name to filter by (optional)
 * @param {string} source - Source to filter by (optional)
 * @returns {Promise<Object>} GA4 report response
 */
const getGa4EventsDataByBrand = async (brandId, from, to, eventName = null, source = null) => {
  const { getBrandConnection } = require('./firebase-service.js');

  try {
    // Use centralized utility to extract GA4 connection
    const ga4Connection = await getBrandConnection(brandId, 'ga4');

    if (!ga4Connection || !ga4Connection.property_id) {
      throw new Error(`GA4 connection not found for brand ${brandId}`);
    }

    const propertyId = ga4Connection.property_id;
    const accessToken = ga4Connection.access_token;
    const refreshToken = ga4Connection.refresh_token;

    console.log('GA4 Service - Fetching events data by brand:', { brandId, propertyId, from, to, eventName, source });

    return await getGa4EventsData(propertyId, from, to, source, { accessToken, refreshToken });
  } catch (error) {
    console.error('GA4 Service - Error fetching events data by brand:', error.message);
    throw error;
  }
};

/**
 * Fetches GA4 top pages using brandId
 * @param {string} brandId - Brand ID to fetch GA4 data from
 * @param {string} from - Start date
 * @param {string} to - End date
 * @param {string} source - Source to filter by (optional)
 * @param {number} limit - Number of top pages to return (default: 10)
 * @returns {Promise<Object>} GA4 report response
 */
const getGa4TopPagesByBrand = async (brandId, from, to, source = null, limit = 10) => {
  const { getBrandConnection } = require('./firebase-service.js');

  try {
    // Use centralized utility to extract GA4 connection
    const ga4Connection = await getBrandConnection(brandId, 'ga4');

    if (!ga4Connection || !ga4Connection.property_id) {
      throw new Error(`GA4 connection not found for brand ${brandId}`);
    }

    const propertyId = ga4Connection.property_id;
    const accessToken = ga4Connection.access_token;
    const refreshToken = ga4Connection.refresh_token;

    console.log('GA4 Service - Fetching top pages by brand:', { brandId, propertyId, from, to, source, limit });

    return await getGa4TopPages(propertyId, from, to, source, limit, { accessToken, refreshToken });
  } catch (error) {
    console.error('GA4 Service - Error fetching top pages by brand:', error.message);
    throw error;
  }
};

module.exports = {
  getGa4UsersData,
  getGa4SalesData,
  getGa4EventsData,
  getGa4EventsByDay,
  initializeClient,
  initializeOAuthClient,
  getGa4TopPages,
  getGa4UsersDataByBrand,
  getGa4SalesDataByBrand,
  getGa4EventsDataByBrand,
  getGa4TopPagesByBrand
};
