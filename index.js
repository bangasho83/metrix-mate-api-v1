const express = require('express');
const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Validate required environment variables
const requiredEnvVars = [
  'GOOGLE_CLIENT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
  'PROPERTY_ID',
  'META_ACCOUNT_ID',
  'META_ACCESS_TOKEN'
];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars);
  process.exit(1);
}

// Initialize the Analytics Data API client
const analyticsDataClient = new BetaAnalyticsDataClient({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
});

// Meta API configuration
const META_API_VERSION = 'v24.0';
const META_BASE_URL = 'https://graph.facebook.com';

async function getMetaAdsData() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const today = new Date();

    const response = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/act_${process.env.META_ACCOUNT_ID}/insights`, {
      params: {
        access_token: process.env.META_ACCESS_TOKEN,
        level: 'account',
        fields: 'spend,impressions,clicks,reach',
        time_range: JSON.stringify({
          'since': thirtyDaysAgo.toISOString().split('T')[0],
          'until': today.toISOString().split('T')[0]
        }),
        time_increment: 1,
        date_preset: 'last_30d'
      }
    });

    if (!response.data || !response.data.data) {
      throw new Error('Invalid response format from Meta API');
    }

    return response.data;
  } catch (error) {
    console.error('Error fetching Meta Ads data:', error.response?.data || error.message);
    throw error;
  }
}

// Define source categories
const SOCIAL_SOURCES = [
  'facebook',
  'instagram',
  'threads',
  'twitter',
  'linkedin',
  'pinterest',
  'tiktok'
];

function categorizeSource(source) {
  if (!source) return 'referral';

  source = source.toLowerCase();

  if (source === 'google') {
    return 'google';
  }

  if (SOCIAL_SOURCES.some(socialSource => source.includes(socialSource))) {
    return 'social';
  }

  if (source === '(direct)') {
    return 'direct';
  }

  // Everything else (including 'not set', bing, yahoo, duckduckgo, etc) is referral
  return 'referral';
}

async function getGa4DailyUsers() {
  const [response] = await analyticsDataClient.runReport({
    property: `properties/${process.env.PROPERTY_ID}`,
    dateRanges: [
      {
        startDate: '30daysAgo',
        endDate: 'today',
      },
    ],
    dimensions: [
      {
        name: 'date',
      },
      {
        name: 'sessionSource',
      }
    ],
    metrics: [
      {
        name: 'activeUsers',
      },
    ],
  });

  return response;
}

async function getGa4TotalUsers() {
  const [response] = await analyticsDataClient.runReport({
    property: `properties/${process.env.PROPERTY_ID}`,
    dateRanges: [
      {
        startDate: '30daysAgo',
        endDate: 'today',
      },
    ],
    metrics: [
      {
        name: 'activeUsers',
      },
    ],
  });

  return response;
}

async function getGa4SalesData() {
  const [response] = await analyticsDataClient.runReport({
    property: `properties/${process.env.PROPERTY_ID}`,
    dateRanges: [
      {
        startDate: '30daysAgo',
        endDate: 'today',
      },
    ],
    dimensions: [
      {
        name: 'date'
      }
    ],
    metrics: [
      {
        name: 'ecommercePurchases'  // number of transactions
      },
      {
        name: 'purchaseRevenue'     // total revenue
      },
      {
        name: 'itemsViewed'         // number of items viewed
      }
    ],
  });

  return response;
}

// Add a basic root route for testing
app.get('/', (req, res) => {
  res.json({ status: 'Server is running' });
});

app.get('/ga4-users', async (req, res) => {
  try {
    const [report, totalReport] = await Promise.all([
      getGa4DailyUsers(),
      getGa4TotalUsers()
    ]);

    if (!report || !report.rows || !totalReport || !totalReport.rows) {
      console.error('No data received from GA4');
      return res.status(404).json({ error: 'No data available' });
    }

    // Process daily users by source category
    const usersByDate = {};
    const totalsByCategory = {
      total: 0,
      google: 0,
      social: 0,
      referral: 0,
      direct: 0
    };

    report.rows.forEach(row => {
      const date = row.dimensionValues[0].value;
      const source = row.dimensionValues[1].value;
      const users = parseInt(row.metricValues[0].value);
      const category = categorizeSource(source);

      if (!usersByDate[date]) {
        usersByDate[date] = {
          date,
          total: 0,
          google: 0,
          social: 0,
          referral: 0,
          direct: 0,
          details: {} // Keep detailed sources for reference
        };
      }

      usersByDate[date].details[source] = users;
      usersByDate[date][category] += users;
      usersByDate[date].total += users;

      // Update total counts
      totalsByCategory[category] += users;
      totalsByCategory.total += users;
    });

    const response = {
      totals: totalsByCategory,
      dailyData: Object.values(usersByDate)
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching GA4 data:', error);
    res.status(500).json({
      error: 'Failed to fetch GA4 data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Add Meta Ads data endpoint
app.get('/meta-ads', async (req, res) => {
  try {
    console.log('Fetching Meta Ads data...');
    const metricsData = await getMetaAdsData();

    const processedData = {
      totals: {
        spend: 0,
        impressions: 0,
        clicks: 0,
        reach: 0
      },
      dailyData: []
    };

    // Process daily data
    if (metricsData?.data) {
      processedData.dailyData = metricsData.data.map(day => ({
        date: day.date_start,
        spend: parseFloat(day.spend || 0),
        impressions: parseInt(day.impressions || 0),
        clicks: parseInt(day.clicks || 0),
        reach: parseInt(day.reach || 0)
      }));

      // Calculate totals
      processedData.dailyData.forEach(day => {
        processedData.totals.spend += day.spend;
        processedData.totals.impressions += day.impressions;
        processedData.totals.clicks += day.clicks;
        processedData.totals.reach += day.reach;
      });

      // Round the total spend to 2 decimal places
      processedData.totals.spend = parseFloat(processedData.totals.spend.toFixed(2));
    }

    res.json(processedData);
  } catch (error) {
    console.error('Error in /meta-ads endpoint:', {
      message: error.message,
      response: error.response?.data
    });
    res.status(500).json({
      error: 'Failed to fetch Meta Ads data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Add the fetchCreativesData function
async function fetchCreativesData() {
  try {
    const response = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/act_${process.env.META_ACCOUNT_ID}/ads`, {
      params: {
        access_token: process.env.META_ACCESS_TOKEN,
        fields: 'creative{image_url,thumbnail_url},status',
        limit: 100, // Reduced from 1000 to 100
        date_preset: 'last_30d' // Only get recent ads
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error in fetchCreativesData:', error.response?.data || error.message);
    // Return empty data structure instead of throwing
    return { data: [] };
  }
}

// New endpoint for GA4 sales data
app.get('/ga4-sales', async (req, res) => {
  try {
    const report = await getGa4SalesData();

    // Initialize default response structure
    const response = {
      totals: {
        purchases: 0,
        revenue: 0,
        itemsViewed: 0,
        averageOrderValue: 0
      },
      dailyData: []
    };

    // If we have data, process it
    if (report && report.rows && report.rows.length > 0) {
      response.dailyData = report.rows.map(row => {
        const purchases = parseInt(row.metricValues[0].value || 0);
        const revenue = parseFloat(row.metricValues[1].value || 0);
        const itemsViewed = parseInt(row.metricValues[2].value || 0);

        // Update totals
        response.totals.purchases += purchases;
        response.totals.revenue += revenue;
        response.totals.itemsViewed += itemsViewed;

        return {
          date: row.dimensionValues[0].value,
          purchases,
          revenue: parseFloat(revenue.toFixed(2)),
          itemsViewed,
          averageOrderValue: purchases > 0 ? parseFloat((revenue / purchases).toFixed(2)) : 0
        };
      });

      // Calculate total average order value
      response.totals.averageOrderValue = response.totals.purchases > 0
        ? parseFloat((response.totals.revenue / response.totals.purchases).toFixed(2))
        : 0;

      // Round total revenue
      response.totals.revenue = parseFloat(response.totals.revenue.toFixed(2));

      // Sort data by date
      response.dailyData.sort((a, b) => a.date.localeCompare(b.date));
    }

    res.json(response);
  } catch (error) {
    console.error('Error fetching GA4 sales data:', error);
    // Instead of returning an error, return empty data structure
    res.json({
      totals: {
        purchases: 0,
        revenue: 0,
        itemsViewed: 0,
        averageOrderValue: 0
      },
      dailyData: []
    });
  }
});

// Combined endpoint for both GA4 and Meta Ads data
app.get('/combined-analytics', async (req, res) => {
  try {
    // First, get all data in parallel
    const [usersReport, metaData, salesReport] = await Promise.all([
      getGa4DailyUsers().catch(err => {
        console.error('GA4 Users Error:', err);
        return { rows: [] };
      }),
      getMetaAdsData().catch(err => {
        console.error('Meta Ads Error:', err);
        return { data: [] };
      }),
      getGa4SalesData().catch(err => {
        console.error('GA4 Sales Error:', err);
        return { rows: [] };
      })
    ]);

    // Initialize data structure
    const combinedData = {};
    const totals = {
      total: 0,
      google: 0,
      social: 0,
      referral: 0,
      direct: 0,
      meta_ads: {
        spend: 0,
        impressions: 0,
        clicks: 0,
        reach: 0
      },
      sales: {
        revenue: 0,
        transactions: 0,
        averageOrderValue: 0,
        itemsPerPurchase: 0
      }
    };

    // Process GA4 Users data if available
    if (usersReport && usersReport.rows) {
      usersReport.rows.forEach(row => {
        const date = row.dimensionValues[0].value;
        const source = row.dimensionValues[1].value;
        const users = parseInt(row.metricValues[0].value);
        const category = categorizeSource(source);

        if (!combinedData[date]) {
          combinedData[date] = {
            date,
            total: 0,
            google: 0,
            social: 0,
            referral: 0,
            direct: 0,
            meta_ads: {
              spend: 0,
              impressions: 0,
              clicks: 0,
              reach: 0
            },
            sales: {
              revenue: 0,
              transactions: 0,
              averageOrderValue: 0,
              itemsPerPurchase: 0
            }
          };
        }

        combinedData[date][category] += users;
        combinedData[date].total += users;
        totals[category] += users;
        totals.total += users;
      });
    }

    // Process Meta Ads data if available
    if (metaData && metaData.data) {
      metaData.data.forEach(day => {
        const date = day.date_start.replace(/-/g, '');
        if (!combinedData[date]) {
          combinedData[date] = {
            date,
            total: 0,
            google: 0,
            social: 0,
            referral: 0,
            direct: 0,
            meta_ads: {
              spend: 0,
              impressions: 0,
              clicks: 0,
              reach: 0
            },
            sales: {
              revenue: 0,
              transactions: 0,
              averageOrderValue: 0,
              itemsPerPurchase: 0
            }
          };
        }

        const spend = parseFloat(day.spend || 0);
        const impressions = parseInt(day.impressions || 0);
        const clicks = parseInt(day.clicks || 0);
        const reach = parseInt(day.reach || 0);

        combinedData[date].meta_ads = {
          spend,
          impressions,
          clicks,
          reach
        };

        totals.meta_ads.spend += spend;
        totals.meta_ads.impressions += impressions;
        totals.meta_ads.clicks += clicks;
        totals.meta_ads.reach += reach;
      });
    }

    // Process GA4 Sales data if available
    if (salesReport && salesReport.rows) {
      salesReport.rows.forEach(row => {
        const date = row.dimensionValues[0].value;
        if (!combinedData[date]) {
          combinedData[date] = {
            date,
            total: 0,
            google: 0,
            social: 0,
            referral: 0,
            direct: 0,
            meta_ads: {
              spend: 0,
              impressions: 0,
              clicks: 0,
              reach: 0
            },
            sales: {
              revenue: 0,
              transactions: 0,
              averageOrderValue: 0,
              itemsPerPurchase: 0
            }
          };
        }

        const revenue = parseFloat(row.metricValues[0].value || 0);
        const transactions = parseInt(row.metricValues[1].value || 0);
        const averageOrderValue = parseFloat(row.metricValues[2].value || 0);
        const itemsPerPurchase = parseFloat(row.metricValues[3].value || 0);

        combinedData[date].sales = {
          revenue,
          transactions,
          averageOrderValue,
          itemsPerPurchase
        };

        totals.sales.revenue += revenue;
        totals.sales.transactions += transactions;
      });

      // Calculate total averages
      if (totals.sales.transactions > 0) {
        totals.sales.averageOrderValue = totals.sales.revenue / totals.sales.transactions;
        totals.sales.itemsPerPurchase = Object.values(combinedData)
          .reduce((sum, day) => sum + (day.sales.itemsPerPurchase * day.sales.transactions), 0)
          / totals.sales.transactions;
      }
    }

    // Round monetary values
    totals.meta_ads.spend = parseFloat(totals.meta_ads.spend.toFixed(2));
    totals.sales.revenue = parseFloat(totals.sales.revenue.toFixed(2));
    totals.sales.averageOrderValue = parseFloat(totals.sales.averageOrderValue.toFixed(2));
    totals.sales.itemsPerPurchase = parseFloat(totals.sales.itemsPerPurchase.toFixed(2));

    // Sort daily data by date
    const dailyData = Object.values(combinedData).sort((a, b) => a.date.localeCompare(b.date));

    const response = {
      totals,
      dailyData
    };

    res.json(response);
  } catch (error) {
    console.error('Error in /combined-analytics endpoint:', error);
    res.status(500).json({
      error: 'Failed to fetch combined analytics data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

app.use('/api/calendar-sim', require('./api/calendar-sim'));
app.use('/api/image-gen', express.json({ limit: '1mb' }), require('./api/image-gen'));
app.use('/api/image-prompt', express.json({ limit: '1mb' }), require('./api/image-prompt'));
app.use('/api/seo-insights', require('./api/seo-insights').default || require('./api/seo-insights'));
app.use('/api/brands', require('./api/brands').default || require('./api/brands'));





app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Try accessing:`);
  console.log(`  - http://localhost:${PORT}/`);
  console.log(`  - http://localhost:${PORT}/ga4-users`);
  console.log(`  - http://localhost:${PORT}/meta-ads`);
  console.log(`  - http://localhost:${PORT}/combined-analytics`);
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  res.status(500).json({
    error: 'An unexpected error occurred',
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

/**
 * @fileoverview Data processing utilities for GA4 responses
 * @module utils/data-processor
 */

/**
 * Processes raw GA4 sales data into a structured format
 * @param {Object} report - Raw GA4 report data
 * @returns {Object} Processed data with totals and daily breakdown
 */
exports.processGa4SalesData = (report) => {
  if (!report?.rows?.length) return null;

  const response = {
    totals: {
      purchases: 0,
      revenue: 0,
      itemsViewed: 0,
      averageOrderValue: 0
    },
    dailyData: []
  };

  // Process daily data
  response.dailyData = report.rows.map(row => {
    const purchases = parseInt(row.metricValues[0].value || 0);
    const revenue = parseFloat(row.metricValues[1].value || 0);
    const itemsViewed = parseInt(row.metricValues[2].value || 0);

    // Update totals
    response.totals.purchases += purchases;
    response.totals.revenue += revenue;
    response.totals.itemsViewed += itemsViewed;

    return {
      date: row.dimensionValues[0].value,
      purchases,
      revenue: parseFloat(revenue.toFixed(2)),
      itemsViewed,
      averageOrderValue: purchases > 0 ? parseFloat((revenue / purchases).toFixed(2)) : 0
    };
  });

  // Calculate final totals
  response.totals.averageOrderValue = response.totals.purchases > 0
    ? parseFloat((response.totals.revenue / response.totals.purchases).toFixed(2))
    : 0;
  response.totals.revenue = parseFloat(response.totals.revenue.toFixed(2));

  // Sort by date
  response.dailyData.sort((a, b) => a.date.localeCompare(b.date));

  return response;
};
