/**
 * @fileoverview Sales Trends API endpoint for Vercel Serverless Functions
 * @module api/sales-trends
 */

const { getTossdownProductTrends } = require('../services/tossdown-service');
const { getDefaultDateRange } = require('../utils/date-utils');
const { getBrandInfo } = require('../services/firebase-service');

// Default response for error cases
const DEFAULT_RESPONSE = {
  products: [],
  categories: []
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
    const { source, from, to, tossdownId, brandId } = req.query;

    console.log('Sales Trends API request:', { source, from, to, tossdownId, brandId });

    // Auto-detect source from brand connections if brandId is provided
    let sourceToUse = source;
    let tossdownIdToUse = tossdownId;

    if (brandId) {
      try {
        const brand = await getBrandInfo(brandId);
        const connections = brand?.connections || {};
        console.log('Sales Trends API - Brand fetched:', {
          brandId,
          hasTossdown: !!connections.tossdown
        });

        // If no source specified, auto-detect from brand connections
        if (!sourceToUse) {
          if (connections.tossdown && connections.tossdown.tossdown_id) {
            sourceToUse = 'tossdown';
            console.log('Sales Trends API - Auto-detected source: tossdown');
          }
        }

        // Extract connection data based on source
        if (sourceToUse === 'tossdown' && connections.tossdown && connections.tossdown.tossdown_id) {
          tossdownIdToUse = connections.tossdown.tossdown_id;
          console.log('Sales Trends API - Using tossdown_id from brand:', { brandId, tossdownIdToUse });
        }
      } catch (brandError) {
        console.error('Error fetching brand info:', brandError.message);
        // Fall back to provided parameters if brand fetch fails
      }
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
    let trendsData;

    try {
      if (sourceToUse === 'tossdown') {
        // Get Tossdown sales trends
        console.log('Calling Tossdown service for trends with:', { fromDate, toDate, tossdownIdToUse });
        if (!tossdownIdToUse) {
          throw new Error('Tossdown ID is required for Tossdown data source (provide tossdownId or brandId with tossdown connection)');
        }

        // Check if cache should be bypassed
        const bypassCache = req.query.cache === '0';

        trendsData = await getTossdownProductTrends(fromDate, toDate, tossdownIdToUse, bypassCache);

        console.log('Tossdown service returned trends data successfully');
      } else if (!sourceToUse) {
        // No source specified and no auto-detection available
        return res.status(400).json({
          error: 'Data source required',
          message: 'Please provide either source parameter or brandId with tossdown connection',
          ...DEFAULT_RESPONSE
        });
      } else {
        // Unsupported source
        return res.status(400).json({
          error: 'Unsupported data source',
          message: `The source '${sourceToUse}' is not supported yet. Currently only 'tossdown' is available.`,
          ...DEFAULT_RESPONSE
        });
      }
    } catch (dataError) {
      console.error('Data retrieval error:', dataError);
      return res.status(200).json({
        error: `Failed to fetch ${sourceToUse} sales trends`,
        message: dataError.message,
        ...DEFAULT_RESPONSE
      });
    }
    
    console.log('Sales trends data retrieved:', {
      source: source,
      from: fromDate,
      to: toDate,
      productsCount: trendsData.products?.length || 0,
      categoriesCount: trendsData.categories?.length || 0
    });

    return res.status(200).json(trendsData);

  } catch (error) {
    console.error('Sales Trends API Error:', error);
    return res.status(200).json({
      error: 'Failed to fetch sales trends data',
      message: error.message,
      ...DEFAULT_RESPONSE
    });
  }
}
