/**
 * @fileoverview Sales Data API endpoint for Vercel Serverless Functions
 * @module api/sales
 */

const { getSquareSalesData, getSquareLocations } = require('../services/square-service');
const { getGa4SalesData } = require('../services/ga4-service');
const { getTossdownSalesData, getTossdownSalesDataAlt } = require('../services/tossdown-service');
const { validateEnvironment } = require('../utils/environment');
const { getDefaultDateRange } = require('../utils/date-utils');
const { getBrandInfo } = require('../services/firebase-service');


// Allow longer execution for slower upstreams (e.g., Tossdown)
const config = { maxDuration: 60 };

// Default response for error cases
const DEFAULT_RESPONSE = {
  totals: {
    purchases: 0,
    revenue: 0,
    averageOrderValue: 0
  },
  dailyData: []
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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get query parameters
    const { source, from, to, locationId, tossdownId, brandId, raw } = req.query;

    console.log('Sales API request:', { source, from, to, locationId, tossdownId, brandId, raw });

    // Get brand info if brandId is provided
    let brand = null;
    let sourceToUse = source;
    let tossdownIdToUse = tossdownId;
    let ga4PropertyIdToUse = null;
    let ga4TokenToUse = null;

    if (brandId) {
      try {
        brand = await getBrandInfo(brandId);
        const connections = brand?.connections || {};
        console.log('Sales API - Brand fetched:', {
          brandId,
          hasTossdown: !!connections.tossdown,
          hasGa4: !!connections.ga4
        });

        // If no source specified, auto-detect from brand connections
        if (!sourceToUse) {
          if (connections.tossdown && connections.tossdown.tossdown_id) {
            sourceToUse = 'tossdown';
            console.log('Sales API - Auto-detected source: tossdown');
          } else if (connections.ga4 && connections.ga4.property_id) {
            sourceToUse = 'ga4';
            console.log('Sales API - Auto-detected source: ga4');
          }
        }

        // Extract connection data based on source
        if (sourceToUse === 'tossdown' && connections.tossdown && connections.tossdown.tossdown_id) {
          tossdownIdToUse = connections.tossdown.tossdown_id;
          console.log('Sales API - Using tossdown_id from brand:', { brandId, tossdownIdToUse });
        }

        if (sourceToUse === 'ga4' && connections.ga4) {
          ga4PropertyIdToUse = connections.ga4.property_id;
          ga4TokenToUse = connections.ga4.access_token;
          console.log('Sales API - Using GA4 from brand:', { brandId, ga4PropertyIdToUse, hasToken: !!ga4TokenToUse });
        }
      } catch (brandError) {
        console.error('Error fetching brand info:', brandError.message);
        // Fall back to provided parameters if brand fetch fails
      }
    }

    try {
      // Validate required environment variables based on source
      // Only validate if not using brand connections
      if (sourceToUse === 'square') {
        validateEnvironment(['SQUARE_ACCESS_TOKEN', 'SQUARE_ENVIRONMENT']);
      } else if (sourceToUse === 'ga4' && !ga4TokenToUse) {
        // Only validate env vars if not using brand token
        validateEnvironment(['GA4_PROPERTY_ID', 'GA4_CLIENT_EMAIL', 'GA4_PRIVATE_KEY']);
      } else if (sourceToUse === 'tossdown') {
        // No environment variables needed for Tossdown
      } else if (!sourceToUse) {
        // Default to Square if no source specified and no brand connections
        validateEnvironment(['SQUARE_ACCESS_TOKEN', 'SQUARE_ENVIRONMENT']);
        sourceToUse = 'square';
      }
    } catch (envError) {
      console.error('Environment validation error:', envError.message);
      return res.status(500).json({
        error: 'Server configuration error',
        message: envError.message,
        ...DEFAULT_RESPONSE
      });
    }

    // Get date range (default to last 30 days if not specified)
    const { fromDate, toDate } = getDefaultDateRange(from, to);

    console.log('Using date range:', { fromDate, toDate });

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(fromDate) || !dateRegex.test(toDate)) {
      console.error('Invalid date format:', { fromDate, toDate });
      return res.status(400).json({
        error: 'Invalid date format',
        message: 'Dates must be in YYYY-MM-DD format',
        ...DEFAULT_RESPONSE
      });
    }

    // Determine which data source to use
    let salesData;

    try {
      if (sourceToUse === 'ga4') {
        // Get GA4 sales data
        const propertyId = ga4PropertyIdToUse || process.env.GA4_PROPERTY_ID;
        console.log('Calling GA4 service with:', { propertyId, fromDate, toDate, hasToken: !!ga4TokenToUse });
        salesData = await getGa4SalesData(propertyId, fromDate, toDate, { accessToken: ga4TokenToUse });
      } else if (sourceToUse === 'tossdown') {
        // Get Tossdown sales data
        console.log('Calling Tossdown service with:', { fromDate, toDate, tossdownIdToUse, raw });
        if (!tossdownIdToUse) {
          throw new Error('Tossdown ID is required for Tossdown data source (provide tossdownId or brandId with tossdown connection)');
        }

        // Check if cache should be bypassed
        const bypassCache = req.query.cache === '0';

        // Check if raw data should be included
        const includeRawData = req.query.raw === '1';

        // Use the alternative method if specified
        if (req.query.method === 'alt') {
          salesData = await getTossdownSalesDataAlt(fromDate, toDate, tossdownIdToUse, bypassCache, includeRawData);
        } else {
          salesData = await getTossdownSalesData(fromDate, toDate, tossdownIdToUse, bypassCache, includeRawData);
        }

        console.log('Tossdown service returned data successfully');
      } else if (sourceToUse === 'square') {
        // Get Square data
        salesData = await getSquareSalesData(fromDate, toDate, locationId);
      } else {
        throw new Error('No valid data source found. Provide source parameter or brandId with connections.');
      }
    } catch (dataError) {
      console.error('Data retrieval error:', dataError);
      return res.status(200).json({
        error: `Failed to fetch ${sourceToUse || 'sales'} data`,
        message: dataError.message,
        ...DEFAULT_RESPONSE
      });
    }

    console.log('Sales data retrieved:', {
      source: sourceToUse || 'unknown',
      from: fromDate,
      to: toDate,
      totalPurchases: salesData.totals.purchases,
      totalRevenue: salesData.totals.revenue
    });

    return res.status(200).json(salesData);

  } catch (error) {
    console.error('Sales API Error:', error);
    return res.status(200).json({
      error: 'Failed to fetch sales data',
      message: error.message,
      ...DEFAULT_RESPONSE
    });
  }
}
