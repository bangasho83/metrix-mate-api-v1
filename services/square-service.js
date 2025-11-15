/**
 * @fileoverview Square POS API service
 * @module services/square-service
 */

const { Client, Environment } = require('square');
const { validateEnvironment } = require('../utils/environment');

// Initialize Square client
const initializeSquareClient = () => {
  validateEnvironment(['SQUARE_ACCESS_TOKEN', 'SQUARE_ENVIRONMENT']);
  
  const environment = process.env.SQUARE_ENVIRONMENT === 'production' 
    ? Environment.Production 
    : Environment.Sandbox;
  
  return new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN,
    environment
  });
};

/**
 * Fetches Square sales data for the specified date range
 * @param {string} from - Start date in YYYY-MM-DD format
 * @param {string} to - End date in YYYY-MM-DD format
 * @param {string} locationId - Optional Square location ID
 * @returns {Promise<Object>} Square sales report response
 */
const getSquareSalesData = async (from, to, locationId = null) => {
  try {
    console.log('Fetching Square sales data:', { from, to, locationId });
    
    // Validate dates
    if (!from || !to) {
      throw new Error('Start and end dates are required');
    }
    
    // Log environment variables (redacted for security)
    console.log('Environment check:', { 
      hasSquareToken: !!process.env.SQUARE_ACCESS_TOKEN,
      squareEnv: process.env.SQUARE_ENVIRONMENT
    });
    
    const client = initializeSquareClient();
    const { ordersApi } = client;
    
    // Build the search query based on the curl example
    const searchQuery = {
      locationIds: locationId ? [locationId] : undefined,
      query: {
        filter: {
          dateTimeFilter: {
            createdAt: {
              startAt: `${from}T00:00:00Z`,
              endAt: `${to}T23:59:59Z`
            }
          },
          stateFilter: {
            states: ["COMPLETED"]
          }
        }
      },
      limit: 100
    };
    
    console.log('Search query:', JSON.stringify(searchQuery));
    
    // Get all orders for the date range
    const orders = await getAllOrders(ordersApi, searchQuery);
    
    // Process the orders into daily sales data
    return processOrdersData(orders, from, to);
  } catch (error) {
    console.error('Square Service - Error fetching sales data:', {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Recursively fetches all orders using pagination
 * @param {Object} ordersApi - Square Orders API instance
 * @param {Object} searchQuery - Search query parameters
 * @param {string} cursor - Pagination cursor
 * @returns {Promise<Array>} All orders
 */
const getAllOrders = async (ordersApi, searchQuery, cursor = null) => {
  try {
    if (cursor) {
      searchQuery.cursor = cursor;
    }
    
    console.log('Calling Square API with query:', JSON.stringify(searchQuery, null, 2));
    
    // Use searchOrders with the updated query structure
    const response = await ordersApi.searchOrders(searchQuery);
    console.log('Square API response status:', response.statusCode);
    
    if (!response?.result?.orders) {
      console.log('No orders found in response');
      return [];
    }
    
    const orders = response.result.orders;
    console.log(`Found ${orders.length} orders`);
    
    // If there are more orders, fetch them recursively
    if (response.result.cursor) {
      console.log('Pagination cursor found, fetching next page');
      const nextOrders = await getAllOrders(ordersApi, searchQuery, response.result.cursor);
      return [...orders, ...nextOrders];
    }
    
    return orders;
  } catch (error) {
    console.error('Error fetching orders:', {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      errors: error.errors
    });
    return [];
  }
};

/**
 * Process orders data into daily sales format
 * @param {Array} orders - Square orders
 * @param {string} from - Start date
 * @param {string} to - End date
 * @returns {Object} Processed sales data
 */
const processOrdersData = (orders, from, to) => {
  // Initialize result structure
  const result = {
    totals: {
      purchases: 0,
      revenue: 0,
      averageOrderValue: 0
    },
    dailyData: []
  };
  
  // Create a map for daily data
  const dailyMap = {};
  
  // Process each order
  orders.forEach(order => {
    console.log('Processing order:', {
      id: order.id,
      createdAt: order.createdAt,
      hasNetAmount: !!order.netAmountDueMoney,
      hasTotalMoney: !!order.totalMoney,
      hasNetMoney: !!order.netMoney,
      tenders: order.tenders?.length || 0
    });
    
    // Extract date from createdAt timestamp (YYYY-MM-DD)
    const date = order.createdAt.split('T')[0];
    
    // Try different money fields in order of preference
    let amount = 0;
    
    if (order.netAmountDueMoney?.amount) {
      amount = parseFloat(order.netAmountDueMoney.amount) / 100;
      console.log(`Using netAmountDueMoney: ${amount}`);
    } else if (order.totalMoney?.amount) {
      amount = parseFloat(order.totalMoney.amount) / 100;
      console.log(`Using totalMoney: ${amount}`);
    } else if (order.netMoney?.amount) {
      amount = parseFloat(order.netMoney.amount) / 100;
      console.log(`Using netMoney: ${amount}`);
    } else if (order.tenders && order.tenders.length > 0) {
      // Sum up all tender amounts
      amount = order.tenders.reduce((sum, tender) => {
        return sum + (parseFloat(tender.amountMoney?.amount || 0) / 100);
      }, 0);
      console.log(`Using tenders sum: ${amount}`);
    } else {
      console.log('No money fields found in order');
      
      // Log the entire order structure for debugging
      console.log('Order structure:', JSON.stringify(order, null, 2));
      
      // Try to find any money fields
      const orderStr = JSON.stringify(order);
      if (orderStr.includes('amount')) {
        console.log('Order contains amount field but not in expected location');
      }
    }
    
    // Initialize daily data if not exists
    if (!dailyMap[date]) {
      dailyMap[date] = {
        date,
        purchases: 0,
        revenue: 0,
        averageOrderValue: 0
      };
    }
    
    // Update daily data
    dailyMap[date].purchases += 1;
    dailyMap[date].revenue += amount;
    
    // Update totals
    result.totals.purchases += 1;
    result.totals.revenue += amount;
  });
  
  // Calculate average order values and convert daily map to array
  Object.values(dailyMap).forEach(day => {
    day.averageOrderValue = day.purchases > 0 
      ? parseFloat((day.revenue / day.purchases).toFixed(2)) 
      : 0;
    day.revenue = parseFloat(day.revenue.toFixed(2));
    result.dailyData.push(day);
  });
  
  // Calculate total average order value
  result.totals.averageOrderValue = result.totals.purchases > 0 
    ? parseFloat((result.totals.revenue / result.totals.purchases).toFixed(2)) 
    : 0;
  
  // Round total revenue
  result.totals.revenue = parseFloat(result.totals.revenue.toFixed(2));
  
  // Sort daily data by date
  result.dailyData.sort((a, b) => a.date.localeCompare(b.date));
  
  return result;
};

/**
 * Fetches Square locations
 * @returns {Promise<Array>} Square locations
 */
const getSquareLocations = async () => {
  try {
    const client = initializeSquareClient();
    const { locationsApi } = client;
    
    const { result } = await locationsApi.listLocations();
    
    return result?.locations || [];
  } catch (error) {
    console.error('Square Service - Error fetching locations:', error);
    throw error;
  }
};

module.exports = {
  initializeSquareClient,
  getSquareSalesData,
  getSquareLocations
};
