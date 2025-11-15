/**
 * @fileoverview Debug endpoint to check brand data structure
 */

const { getBrandInfo } = require('../services/firebase-service.js');

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
    const { brandId } = req.query;

    if (!brandId) {
      return res.status(400).json({
        error: 'brandId is required',
        example: '/api/debug-brand?brandId=mpFDuQyuBdjqmdiQzq2B'
      });
    }

    console.log('Debug Brand API - Fetching brand:', brandId);

    const brand = await getBrandInfo(brandId);

    if (!brand) {
      return res.status(404).json({
        error: 'Brand not found',
        brandId
      });
    }

    // Return the full brand object with all fields
    return res.status(200).json({
      success: true,
      brandId,
      brand: {
        id: brand.id,
        name: brand.name,
        organizationId: brand.organizationId,
        website: brand.website,
        ga4: brand.ga4 || null,
        meta_ads: brand.meta_ads || null,
        facebook_page: brand.facebook_page || null,
        instagram_page: brand.instagram_page || null,
        allKeys: Object.keys(brand)
      }
    });

  } catch (error) {
    console.error('Debug Brand API - Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

