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