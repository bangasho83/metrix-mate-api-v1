/**
 * @fileoverview Clear Brand Cache API endpoint
 * Allows clearing the brand cache for a specific brand or all brands
 * 
 * Usage:
 * GET /api/clear-cache?brandId=BRAND_ID - Clear cache for specific brand
 * GET /api/clear-cache - Clear all brand cache
 */

const { clearBrandCache } = require('../services/firebase-service.js');

module.exports = async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET and POST requests
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'This endpoint only accepts GET or POST requests',
      success: false
    });
  }

  try {
    const { brandId } = req.query;

    if (brandId) {
      // Clear cache for specific brand
      clearBrandCache(brandId);
      
      console.log('Clear Cache API - Cleared cache for brand:', brandId);
      
      return res.status(200).json({
        success: true,
        message: `Cache cleared for brand: ${brandId}`,
        brandId,
        timestamp: new Date().toISOString()
      });
    } else {
      // Clear all brand cache
      clearBrandCache();
      
      console.log('Clear Cache API - Cleared all brand cache');
      
      return res.status(200).json({
        success: true,
        message: 'All brand cache cleared',
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Clear Cache API - Error:', error);
    
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      success: false,
      timestamp: new Date().toISOString()
    });
  }
};

