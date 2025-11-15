/**
 * @fileoverview Tossdown API service
 * @module services/tossdown-service
 */

const axios = require('axios');
const querystring = require('querystring');
const FormData = require('form-data');
const crypto = require('crypto');

// Tossdown API endpoint
const TOSSDOWN_API_URL = 'https://tossdown.com/api/order_get';

// Cache configuration
const CACHE = {
  data: {},
  timestamps: {},
  TTL: 15 * 60 * 1000 // 15 minutes cache TTL
};

/**
 * Fetches Tossdown sales data for the specified date range
 * @param {string} from - Start date in YYYY-MM-DD format
 * @param {string} to - End date in YYYY-MM-DD format
 * @param {number} tossdownId - Tossdown business ID
 * @param {boolean} bypassCache - Whether to bypass the cache
 * @param {boolean} includeRawData - Whether to include raw data in the response
 * @returns {Promise<Object>} Processed Tossdown sales data
 */
const getTossdownSalesData = async (from, to, tossdownId, bypassCache = false, includeRawData = false) => {
  try {
    console.log('Fetching Tossdown sales data:', { from, to, tossdownId, bypassCache, includeRawData });
    
    // Validate dates and business ID
    if (!from || !to) {
      throw new Error('Start and end dates are required');
    }
    
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(from) || !dateRegex.test(to)) {
      console.error('Invalid date format:', { from, to });
      throw new Error('Dates must be in YYYY-MM-DD format');
    }
    
    if (!tossdownId) {
      throw new Error('Tossdown ID is required');
    }
    
    // Generate cache key
    const cacheKey = crypto.createHash('md5').update(
      JSON.stringify({ from, to, tossdownId })
    ).digest('hex');
    
    // Check cache if not bypassing
    if (!bypassCache && CACHE.data[cacheKey] && 
        (Date.now() - CACHE.timestamps[cacheKey] < CACHE.TTL)) {
      console.log('Returning cached Tossdown data for:', { from, to, tossdownId });
      return CACHE.data[cacheKey];
    }
    
    // Prepare form data - exactly matching Postman
    const formData = {
      from_date: from,
      to_date: to,
      eatout_id: tossdownId,
      source: 'biz',
      limit: 1000
    };
    
    console.log('Tossdown API request payload:', formData);
    
    // Make API request with x-www-form-urlencoded format
    const response = await axios({
      method: 'post',
      url: TOSSDOWN_API_URL,
      data: querystring.stringify(formData),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 55000
    });
    
    console.log('Tossdown API response status:', response.status);
    
    // Parse JSON string if needed
    let responseData = response.data;
    if (typeof response.data === 'string') {
      try {
        responseData = JSON.parse(response.data);
        console.log('Successfully parsed JSON string response');
      } catch (parseError) {
        console.error('Failed to parse response as JSON:', parseError.message);
      }
    }
    
    // Process the data to extract sales information
    const processedData = processTossdownData(responseData, from, to, includeRawData);
    
    // Store in cache
    CACHE.data[cacheKey] = processedData;
    CACHE.timestamps[cacheKey] = Date.now();
    console.log('Cached Tossdown data with key:', cacheKey);
    
    // Return the processed data
    return processedData;
  } catch (error) {
    console.error('Tossdown Service - Error fetching sales data:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status
    });
    
    // Throw a more descriptive error
    if (error.response) {
      throw new Error(`Tossdown API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      throw new Error(`Tossdown API request failed: ${error.message}`);
    } else {
      throw error;
    }
  }
};

/**
 * Process Tossdown API response into standardized sales data format
 * @param {Object} responseData - Raw Tossdown API response
 * @param {string} from - Start date in YYYY-MM-DD format
 * @param {string} to - End date in YYYY-MM-DD format
 * @param {boolean} includeRawData - Whether to include raw data in the response
 * @returns {Object} Processed sales data
 */
const processTossdownData = (responseData, from, to, includeRawData = false) => {
  console.log('Processing Tossdown data');
  
  // Initialize result structure
  const result = {
    totals: {
      purchases: 0,
      revenue: 0,
      averageOrderValue: 0,
      sources: {} // Add source tracking to totals
    },
    dailyData: [],
    productData: {}, // Add product data tracking
    products: [], // Will store the final products array
    categoryData: {}, // Add category data tracking
    categories: [] // Will store the final categories array
  };
  
  // Check if we have orders data
  if (!responseData || !responseData.result || !Array.isArray(responseData.result)) {
    console.log('No orders found in Tossdown response');
    // Add raw data only if requested
    if (includeRawData) {
      result.tossdownRawData = responseData;
    }
    return result;
  }
  
  const orders = responseData.result;
  console.log(`Found ${orders.length} orders in Tossdown response`);
  
  // Log a sample order to see its structure
  if (orders.length > 0) {
    console.log('Sample order structure:', JSON.stringify(orders[0], null, 2));
  }
  
  // Create a map for daily data
  const dailyMap = {};
  
  // Process each order
  orders.forEach(order => {
    // Extract order date from the date field (format might be different)
    const orderDateRaw = order.date;
    if (!orderDateRaw) {
      console.warn('Order missing date field:', order.id || 'unknown');
      return;
    }
    
    // Format date to ensure YYYY-MM-DD format (extract only the date part)
    let dateKey;
    try {
      // Try to parse the date and extract only the date part
      const dateObj = new Date(orderDateRaw);
      dateKey = dateObj.toISOString().split('T')[0];
    } catch (e) {
      console.warn('Failed to parse date:', orderDateRaw);
      return;
    }
    
    // Extract order amount from grand_total
    const amount = parseFloat(order.grand_total || 0);
    
    // Extract source information
    const source = order.source || 'unknown';
    
    // Initialize daily data if not exists
    if (!dailyMap[dateKey]) {
      dailyMap[dateKey] = {
        date: dateKey,
        purchases: 0,
        revenue: 0,
        sources: {} // Track sources per day
      };
    }
    
    // Update daily data
    dailyMap[dateKey].purchases += 1;
    dailyMap[dateKey].revenue += amount;
    
    // Update source counts for this day
    if (!dailyMap[dateKey].sources[source]) {
      dailyMap[dateKey].sources[source] = 0;
    }
    dailyMap[dateKey].sources[source] += 1;
    
    // Update totals
    result.totals.purchases += 1;
    result.totals.revenue += amount;
    
    // Update total source counts
    if (!result.totals.sources[source]) {
      result.totals.sources[source] = 0;
    }
    result.totals.sources[source] += 1;
    
    // Process order details if available
    if (order.order_detail && Array.isArray(order.order_detail)) {
      order.order_detail.forEach(item => {
        // Process product data
        const itemName = item.item_name || 'Unknown Product';
        const itemId = item.item_id || itemName;
        const quantity = parseInt(item.quantity || 1);
        const price = parseFloat(item.price || 0);
        const total = parseFloat(item.total || (price * quantity) || 0);
        
        // Initialize product data if not exists
        if (!result.productData[itemId]) {
          result.productData[itemId] = {
            item_id: itemId,
            item_name: itemName,
            quantity: 0,
            total: 0,
            price: price
          };
        }
        
        // Update product data
        result.productData[itemId].quantity += quantity;
        result.productData[itemId].total += total;
        
        // Process category data
        const catName = item.item_cat_name || 'Uncategorized';
        const catId = item.item_cat_id || catName;
        
        // Initialize category data if not exists
        if (!result.categoryData[catId]) {
          result.categoryData[catId] = {
            category_id: catId,
            category_name: catName,
            quantity: 0,
            total: 0
          };
        }
        
        // Update category data
        result.categoryData[catId].quantity += quantity;
        result.categoryData[catId].total += total;
      });
    }
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
  
  // Convert product data to array with the required format
  result.products = Object.values(result.productData).map(product => ({
    item_name: product.item_name,
    quantity: product.quantity,
    total: parseFloat(product.total.toFixed(2)),
    item_id: product.item_id,
    price: parseFloat(product.price.toFixed(2)) // Add the price field
  }));
  
  // Sort products by total revenue (highest first)
  result.products.sort((a, b) => b.total - a.total);
  
  // Convert category data to array with the required format
  result.categories = Object.values(result.categoryData).map(category => ({
    category_name: category.category_name,
    quantity: category.quantity,
    total: parseFloat(category.total.toFixed(2)),
    category_id: category.category_id,
    avg_price: category.quantity > 0 
      ? parseFloat((category.total / category.quantity).toFixed(2)) 
      : 0
  }));
  
  // Sort categories by total revenue (highest first)
  result.categories.sort((a, b) => b.total - a.total);
  
  // Remove the temporary data objects
  delete result.productData;
  delete result.categoryData;
  
  // Sort daily data by date
  result.dailyData.sort((a, b) => a.date.localeCompare(b.date));
  
  console.log('Processed Tossdown data:', {
    totalPurchases: result.totals.purchases,
    totalRevenue: result.totals.revenue,
    averageOrderValue: result.totals.averageOrderValue,
    dailyDataCount: result.dailyData.length,
    productCount: result.products?.length || 0,
    categoryCount: result.categories?.length || 0,
    sourcesCount: Object.keys(result.totals.sources).length
  });
  
  // Add raw data at the end of the response only if requested
  if (includeRawData) {
    result.tossdownRawData = responseData;
  }
  
  return result;
};

/**
 * Alternative method to fetch Tossdown sales data using FormData
 * @param {string} from - Start date in YYYY-MM-DD format
 * @param {string} to - End date in YYYY-MM-DD format
 * @param {number} tossdownId - Tossdown business ID
 * @param {boolean} bypassCache - Whether to bypass the cache
 * @param {boolean} includeRawData - Whether to include raw data in the response
 * @returns {Promise<Object>} Processed Tossdown sales data
 */
const getTossdownSalesDataAlt = async (from, to, tossdownId, bypassCache = false, includeRawData = false) => {
  try {
    console.log('Fetching Tossdown sales data (alt method):', { from, to, tossdownId, bypassCache, includeRawData });
    
    // Validate dates and business ID
    if (!from || !to) {
      throw new Error('Start and end dates are required');
    }
    
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(from) || !dateRegex.test(to)) {
      console.error('Invalid date format:', { from, to });
      throw new Error('Dates must be in YYYY-MM-DD format');
    }
    
    if (!tossdownId) {
      throw new Error('Tossdown ID is required');
    }
    
    // Generate cache key
    const cacheKey = crypto.createHash('md5').update(
      JSON.stringify({ from, to, tossdownId, method: 'alt' })
    ).digest('hex');
    
    // Check cache if not bypassing
    if (!bypassCache && CACHE.data[cacheKey] && 
        (Date.now() - CACHE.timestamps[cacheKey] < CACHE.TTL)) {
      console.log('Returning cached Tossdown data (alt) for:', { from, to, tossdownId });
      return CACHE.data[cacheKey];
    }
    
    // Create form data
    const form = new FormData();
    form.append('from_date', from);
    form.append('to_date', to);
    form.append('eatout_id', tossdownId);
    form.append('source', 'biz');
    form.append('limit', '1000');
    
    console.log('Tossdown API request payload (alt):', {
      from_date: from,
      to_date: to,
      eatout_id: tossdownId,
      source: 'biz',
      limit: 1000
    });
    
    // Make API request with form-data
    const response = await axios.post(TOSSDOWN_API_URL, form, {
      headers: form.getHeaders(),
      timeout: 55000
    });
    
    console.log('Tossdown API response status (alt):', response.status);
    
    // Parse JSON string if needed
    let responseData = response.data;
    if (typeof response.data === 'string') {
      try {
        responseData = JSON.parse(response.data);
        console.log('Successfully parsed JSON string response (alt)');
      } catch (parseError) {
        console.error('Failed to parse response as JSON (alt):', parseError.message);
      }
    }
    
    // Process the data to extract sales information
    const processedData = processTossdownData(responseData, from, to, includeRawData);
    
    // Store in cache
    CACHE.data[cacheKey] = processedData;
    CACHE.timestamps[cacheKey] = Date.now();
    console.log('Cached Tossdown data (alt) with key:', cacheKey);
    
    // Return the processed data
    return processedData;
  } catch (error) {
    console.error('Tossdown Service - Error fetching sales data (alt):', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status
    });
    
    // Throw a more descriptive error
    if (error.response) {
      throw new Error(`Tossdown API error (alt) (${error.response.status}): ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      throw new Error(`Tossdown API request failed (alt): ${error.message}`);
    } else {
      throw error;
    }
  }
};

/**
 * Extracts daily product sales trends from Tossdown data
 * @param {string} from - Start date in YYYY-MM-DD format
 * @param {string} to - End date in YYYY-MM-DD format
 * @param {number} tossdownId - Tossdown business ID
 * @param {boolean} bypassCache - Whether to bypass the cache
 * @returns {Promise<Object>} Daily product sales trends
 */
const getTossdownProductTrends = async (from, to, tossdownId, bypassCache = false) => {
  try {
    // Fetch the full sales data first
    const salesData = await getTossdownSalesData(from, to, tossdownId, bypassCache, true);
    
    // Initialize result structure with empty arrays
    const result = {
      products: [],
      categories: []
    };
    
    // Check if we have raw data to work with
    if (!salesData.tossdownRawData || !salesData.tossdownRawData.result) {
      console.log('No raw data available for product trends analysis');
      return result;
    }
    
    const orders = salesData.tossdownRawData.result;
    
    // Create maps for products and categories
    const productsMap = {};
    const categoriesMap = {};
    const dailyProductMap = {};
    
    // Process each order
    orders.forEach(order => {
      // Extract order date
      const orderDateRaw = order.date;
      if (!orderDateRaw) {
        return;
      }
      
      // Format date to ensure YYYY-MM-DD format
      let dateKey;
      try {
        const dateObj = new Date(orderDateRaw);
        dateKey = dateObj.toISOString().split('T')[0];
      } catch (e) {
        console.warn('Failed to parse date:', orderDateRaw);
        return;
      }
      
      // Initialize daily data if not exists
      if (!dailyProductMap[dateKey]) {
        dailyProductMap[dateKey] = {
          date: dateKey,
          products: {},
          categories: {}
        };
      }
      
      // Process order details if available
      if (order.order_detail && Array.isArray(order.order_detail)) {
        order.order_detail.forEach(item => {
          // Process product data
          const itemName = item.item_name || 'Unknown Product';
          const itemId = item.item_id || itemName;
          const quantity = parseInt(item.quantity || 1);
          const total = parseFloat(item.total || 0);
          
          // Update daily product data
          if (!dailyProductMap[dateKey].products[itemId]) {
            dailyProductMap[dateKey].products[itemId] = {
              item_id: itemId,
              item_name: itemName,
              quantity: 0,
              total: 0
            };
          }
          
          dailyProductMap[dateKey].products[itemId].quantity += quantity;
          dailyProductMap[dateKey].products[itemId].total += total;
          
          // Process category data
          const catName = item.item_cat_name || 'Uncategorized';
          const catId = item.item_cat_id || catName;
          
          // Update daily category data
          if (!dailyProductMap[dateKey].categories[catId]) {
            dailyProductMap[dateKey].categories[catId] = {
              category_id: catId,
              category_name: catName,
              quantity: 0,
              total: 0
            };
          }
          
          dailyProductMap[dateKey].categories[catId].quantity += quantity;
          dailyProductMap[dateKey].categories[catId].total += total;
          
          // Update overall product data
          if (!productsMap[itemId]) {
            productsMap[itemId] = {
              item_id: itemId,
              item_name: itemName,
              quantity: 0,
              total: 0,
              daily: {}
            };
          }
          
          productsMap[itemId].quantity += quantity;
          productsMap[itemId].total += total;
          
          // Update overall category data
          if (!categoriesMap[catId]) {
            categoriesMap[catId] = {
              category_id: catId,
              category_name: catName,
              quantity: 0,
              total: 0,
              daily: {}
            };
          }
          
          categoriesMap[catId].quantity += quantity;
          categoriesMap[catId].total += total;
        });
      }
    });
    
    // Process daily data for products and categories
    const dates = Object.keys(dailyProductMap).sort();
    
    dates.forEach(date => {
      const dayData = dailyProductMap[date];
      
      // Update daily data in overall products
      Object.values(dayData.products).forEach(product => {
        if (productsMap[product.item_id]) {
          productsMap[product.item_id].daily[date] = {
            quantity: product.quantity,
            total: parseFloat(product.total.toFixed(2))
          };
        }
      });
      
      // Update daily data in overall categories
      Object.values(dayData.categories).forEach(category => {
        if (categoriesMap[category.category_id]) {
          categoriesMap[category.category_id].daily[date] = {
            quantity: category.quantity,
            total: parseFloat(category.total.toFixed(2))
          };
        }
      });
    });
    
    // Convert products and categories to arrays
    result.products = Object.values(productsMap)
      .sort((a, b) => b.total - a.total)
      .map(product => ({
        item_id: product.item_id,
        item_name: product.item_name,
        quantity: product.quantity,
        total: parseFloat(product.total.toFixed(2)),
        daily: product.daily
      }));
    
    result.categories = Object.values(categoriesMap)
      .sort((a, b) => b.total - a.total)
      .map(category => ({
        category_id: category.category_id,
        category_name: category.category_name,
        quantity: category.quantity,
        total: parseFloat(category.total.toFixed(2)),
        daily: category.daily
      }));
    
    console.log('Processed Tossdown product trends:', {
      dateRange: { from, to },
      productsCount: result.products.length,
      categoriesCount: result.categories.length
    });
    
    return result;
  } catch (error) {
    console.error('Tossdown Service - Error fetching product trends:', {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Fetches Tossdown sales data using brandId
 * @param {string} brandId - Brand ID to fetch Tossdown data from
 * @param {string} from - Start date in YYYY-MM-DD format
 * @param {string} to - End date in YYYY-MM-DD format
 * @param {boolean} bypassCache - Whether to bypass the cache
 * @param {boolean} includeRawData - Whether to include raw data in the response
 * @returns {Promise<Object>} Processed Tossdown sales data
 */
const getTossdownSalesDataByBrand = async (brandId, from, to, bypassCache = false, includeRawData = false) => {
  const { getBrandInfo } = require('./firebase-service.js');

  try {
    const brand = await getBrandInfo(brandId);
    const connections = brand?.connections || {};

    if (!connections.tossdown || !connections.tossdown.tossdown_id) {
      throw new Error(`Tossdown connection not found for brand ${brandId}`);
    }

    const tossdownId = connections.tossdown.tossdown_id;

    console.log('Tossdown Service - Fetching sales data by brand:', { brandId, tossdownId, from, to });

    return await getTossdownSalesData(from, to, tossdownId, bypassCache, includeRawData);
  } catch (error) {
    console.error('Tossdown Service - Error fetching sales data by brand:', error.message);
    throw error;
  }
};

/**
 * Fetches Tossdown product trends using brandId
 * @param {string} brandId - Brand ID to fetch Tossdown data from
 * @param {string} from - Start date in YYYY-MM-DD format
 * @param {string} to - End date in YYYY-MM-DD format
 * @param {boolean} bypassCache - Whether to bypass the cache
 * @returns {Promise<Object>} Product trends data
 */
const getTossdownProductTrendsByBrand = async (brandId, from, to, bypassCache = false) => {
  const { getBrandInfo } = require('./firebase-service.js');

  try {
    const brand = await getBrandInfo(brandId);
    const connections = brand?.connections || {};

    if (!connections.tossdown || !connections.tossdown.tossdown_id) {
      throw new Error(`Tossdown connection not found for brand ${brandId}`);
    }

    const tossdownId = connections.tossdown.tossdown_id;

    console.log('Tossdown Service - Fetching product trends by brand:', { brandId, tossdownId, from, to });

    return await getTossdownProductTrends(from, to, tossdownId, bypassCache);
  } catch (error) {
    console.error('Tossdown Service - Error fetching product trends by brand:', error.message);
    throw error;
  }
};

module.exports = {
  getTossdownSalesData,
  getTossdownSalesDataAlt,
  getTossdownProductTrends,
  getTossdownSalesDataByBrand,
  getTossdownProductTrendsByBrand
};
