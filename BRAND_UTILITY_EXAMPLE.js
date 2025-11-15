/**
 * Example API Endpoint demonstrating getBrandInfo() utility usage
 * This file shows various ways to use the brand utility function
 */

import { getBrandInfo, clearBrandCache } from './services/firebase-service.js';

// ============================================================================
// EXAMPLE 1: Simple API endpoint to get brand information
// ============================================================================
export async function exampleGetBrand(req, res) {
  const { brandId } = req.query;

  try {
    // Simple usage - with caching enabled by default
    const brand = await getBrandInfo(brandId);

    if (!brand) {
      return res.status(404).json({
        success: false,
        error: 'Brand not found'
      });
    }

    return res.status(200).json({
      success: true,
      brand: {
        id: brand.id,
        name: brand.name,
        website: brand.website,
        organizationId: brand.organizationId,
        services: brand.services
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================================================================
// EXAMPLE 2: Authenticated endpoint with token verification
// ============================================================================
export async function exampleGetBrandAuthenticated(req, res) {
  const { brandId } = req.body;
  const idToken = req.headers.authorization?.replace('Bearer ', '');

  if (!idToken) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  try {
    // Usage with authentication
    const brand = await getBrandInfo(brandId, { idToken });

    if (!brand) {
      return res.status(404).json({
        success: false,
        error: 'Brand not found'
      });
    }

    return res.status(200).json({
      success: true,
      brand
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ============================================================================
// EXAMPLE 3: Service function that processes brand data
// ============================================================================
export async function generateBrandReport(brandId) {
  try {
    // Get brand info with error throwing enabled
    const brand = await getBrandInfo(brandId, { throwOnNotFound: true });

    // Process brand data
    const report = {
      brandId: brand.id,
      brandName: brand.name,
      website: brand.website,
      organizationId: brand.organizationId,
      hasKeywords: brand.keywords && brand.keywords.length > 0,
      keywordsCount: brand.keywords ? brand.keywords.length : 0,
      services: {
        hasSEO: brand.services?.seo ? true : false,
        hasPosts: brand.services?.posts ? true : false,
        hasCampaigns: brand.services?.campaigns ? true : false
      },
      createdAt: brand.createdAt
    };

    return report;
  } catch (error) {
    console.error('Error generating brand report:', error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 4: Batch processing multiple brands
// ============================================================================
export async function getBrandsInfoBatch(brandIds) {
  try {
    // Fetch all brands in parallel using Promise.all
    const brandPromises = brandIds.map(id => getBrandInfo(id));
    const brands = await Promise.all(brandPromises);

    // Filter out null values (brands not found)
    const validBrands = brands.filter(brand => brand !== null);

    return {
      total: brandIds.length,
      found: validBrands.length,
      notFound: brandIds.length - validBrands.length,
      brands: validBrands.map(brand => ({
        id: brand.id,
        name: brand.name,
        website: brand.website,
        organizationId: brand.organizationId
      }))
    };
  } catch (error) {
    console.error('Error fetching brands batch:', error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 5: Force fresh data (bypass cache)
// ============================================================================
export async function getBrandFreshData(brandId) {
  try {
    // Bypass cache to get fresh data from Firestore
    const brand = await getBrandInfo(brandId, { useCache: false });

    if (!brand) {
      throw new Error('Brand not found');
    }

    return brand;
  } catch (error) {
    console.error('Error fetching fresh brand data:', error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 6: Cache management
// ============================================================================
export async function refreshBrandCache(brandId) {
  try {
    // Clear cache for specific brand
    clearBrandCache(brandId);

    // Fetch fresh data (will be cached)
    const brand = await getBrandInfo(brandId);

    return {
      success: true,
      message: 'Brand cache refreshed',
      brand
    };
  } catch (error) {
    console.error('Error refreshing brand cache:', error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 7: Using brand info in a calendar service
// ============================================================================
export async function generateCalendarForBrand(brandId, calendarParams) {
  try {
    // Get brand information
    const brand = await getBrandInfo(brandId, { throwOnNotFound: true });

    // Use brand data in calendar generation
    const calendarData = {
      brandName: brand.name,
      website: brand.website,
      productsInFocus: calendarParams.productsInFocus || [],
      events: calendarParams.events || [],
      brandBrief: calendarParams.brandBrief || `Calendar for ${brand.name}`,
      noOfPosts: calendarParams.noOfPosts || 10,
      postsPerWeek: calendarParams.postsPerWeek || 3,
      contentDistribution: calendarParams.contentDistribution || {
        productPercentage: 40,
        engagementPercentage: 40,
        salePercentage: 20
      }
    };

   
    return {
      success: true,
      brandId: brand.id,
      brandName: brand.name,
      calendarData
    };
  } catch (error) {
    console.error('Error generating calendar:', error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 8: Using brand info in an ad campaign service
// ============================================================================
export async function generateAdCampaignForBrand(brandId, campaignParams) {
  try {
    // Get brand information
    const brand = await getBrandInfo(brandId);

    if (!brand) {
      throw new Error(`Brand ${brandId} not found`);
    }

    // Check if brand has ad campaigns service enabled
    if (!brand.services?.campaigns) {
      throw new Error(`Brand ${brand.name} does not have campaigns service enabled`);
    }

    // Use brand data in campaign generation
    const campaignData = {
      brandId: brand.id,
      brandName: brand.name,
      website: brand.website,
      keywords: brand.keywords || [],
      campaignBrief: campaignParams.campaignBrief || `Campaign for ${brand.name}`,
      targetAudience: campaignParams.targetAudience || 'General',
      budget: brand.services.monthly_budget || campaignParams.budget || 1000
    };

   
    return {
      success: true,
      campaign: campaignData
    };
  } catch (error) {
    console.error('Error generating ad campaign:', error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE 9: Validation helper
// ============================================================================
export async function validateBrandAccess(brandId, organizationId) {
  try {
    const brand = await getBrandInfo(brandId);

    if (!brand) {
      return {
        valid: false,
        error: 'Brand not found'
      };
    }

    if (brand.organizationId !== organizationId) {
      return {
        valid: false,
        error: 'Brand does not belong to this organization'
      };
    }

    return {
      valid: true,
      brand
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

// ============================================================================
// EXAMPLE 10: Complete API endpoint with all features
// ============================================================================
export async function completeExampleEndpoint(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { brandId, organizationId, forceRefresh } = req.body;
  const idToken = req.headers.authorization?.replace('Bearer ', '');

  try {
    // Validate inputs
    if (!brandId) {
      return res.status(400).json({
        success: false,
        error: 'brandId is required'
      });
    }

    // Get brand info with optional cache bypass
    const brand = await getBrandInfo(brandId, {
      idToken,
      useCache: !forceRefresh,
      throwOnNotFound: true
    });

    // Validate organization access if provided
    if (organizationId && brand.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: Brand does not belong to this organization'
      });
    }

    // Return comprehensive brand information
    return res.status(200).json({
      success: true,
      brand: {
        id: brand.id,
        name: brand.name,
        organizationId: brand.organizationId,
        website: brand.website,
        services: brand.services,
        keywords: brand.keywords,
        createdAt: brand.createdAt
      },
      metadata: {
        cached: !forceRefresh,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Complete example endpoint error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Brand not found'
      });
    }

    if (error.message.includes('Token verification')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication failed'
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

