/**
 * @fileoverview GA4 Sales Data API endpoint for Vercel Serverless Functions
 * @module api/ga4-sales
 */

const { getGa4SalesData } = require('../services/ga4-service.js');
const { getDefaultDateRange } = require('../utils/date-utils.js');
const { getBrandConnection } = require('../services/firebase-service.js');

const DEFAULT_RESPONSE = {
  totals: {
    purchases: 0,
    revenue: 0,
    averageOrderValue: 0
  },
  dailyData: []
};

/**
 * GA4 Sales Data API endpoint
 */
module.exports = async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { brandId, ga4PropertyId } = req.query;

    // Normalize empty string and "not-set" values to null
    const normalizeParam = (param) => {
      if (!param || param === '' || param === 'not-set') {
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
          console.log('GA4 Sales API - Using OAuth token from brand:', {
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

    // Fall back to environment variables if no OAuth token
    if (!ga4Token && (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY)) {
      return res.status(400).json({
        error: 'GA4 credentials not available (OAuth token or service account)'
      });
    }

    if (!ga4PropertyIdToUse) {
      return res.status(400).json({
        error: 'GA4 Property ID is required'
      });
    }

    // Get date range
    const { from, to } = req.query || {};
    const { fromDate, toDate } = getDefaultDateRange(from, to);

    console.log('Fetching GA4 sales data:', { ga4PropertyId: ga4PropertyIdToUse, from: fromDate, to: toDate, hasOAuth: !!ga4Token });

    // Prepare options for GA4 service
    const ga4Options = ga4Token ? { accessToken: ga4Token, refreshToken: ga4RefreshToken } : {};

    const response = await getGa4SalesData(ga4PropertyIdToUse, from, to, ga4Options);

    if (!response?.rows?.length) {
      console.log('No GA4 data found');
      return res.status(200).json(DEFAULT_RESPONSE);
    }

    const result = {
      totals: {
        purchases: 0,
        revenue: 0,
        averageOrderValue: 0
      },
      dailyData: []
    };

    // Process the response data
    response.rows.forEach(row => {
      const date = row.dimensionValues[0].value;
      const purchases = parseInt(row.metricValues[0].value) || 0;
      const revenue = parseFloat(row.metricValues[1].value) || 0;
      const averageOrderValue = purchases > 0 ? parseFloat((revenue / purchases).toFixed(2)) : 0;

      // Add to totals
      result.totals.purchases += purchases;
      result.totals.revenue += revenue;

      // Add to daily data
      result.dailyData.push({
        date,
        purchases,
        revenue: parseFloat(revenue.toFixed(2)),
        averageOrderValue
      });
    });

    // Calculate total average order value
    result.totals.averageOrderValue = 
      result.totals.purchases > 0 
        ? parseFloat((result.totals.revenue / result.totals.purchases).toFixed(2)) 
        : 0;

    // Round total revenue
    result.totals.revenue = parseFloat(result.totals.revenue.toFixed(2));

    // Sort daily data by date
    result.dailyData.sort((a, b) => a.date.localeCompare(b.date));

    console.log('GA4 sales data processed:', {
      totalPurchases: result.totals.purchases,
      totalRevenue: result.totals.revenue,
      averageOrderValue: result.totals.averageOrderValue,
      daysOfData: result.dailyData.length
    });

    return res.status(200).json(result);

  } catch (error) {
    console.error('GA4 Sales API Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch GA4 sales data',
      message: error.message
    });
  }
};
