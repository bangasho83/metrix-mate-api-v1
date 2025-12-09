/**
 * @fileoverview Moodboard API endpoint - CRUD operations for moodboard collection
 * @module api/moodboard
 * 
 * Endpoints:
 * - POST /api/moodboard - Create new moodboard item
 * - GET /api/moodboard - Get moodboard items with filters
 * - GET /api/moodboard?itemId=ID - Get single moodboard item
 * - PUT /api/moodboard - Update moodboard item
 * - DELETE /api/moodboard - Delete moodboard item(s)
 */

const {
  createMoodboardItem,
  getMoodboardItems,
  getMoodboardItemById,
  updateMoodboardItem,
  deleteMoodboardItem,
  deleteMoodboardItems,
  getMoodboardItemsCount
} = require('../services/moodboard-service.js');

const { withLogging } = require('../utils/logging.cjs.js');

module.exports = withLogging(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // POST: Create new moodboard item
    if (req.method === 'POST') {
      const {
        aspectRatio,
        brandId,
        creativeGuideline,
        imageUrl,
        model,
        note,
        organizationId,
        userId
      } = req.body;

      // Validate required fields
      if (!imageUrl || !organizationId) {
        return res.status(400).json({
          error: 'Missing required fields',
          message: 'imageUrl and organizationId are required',
          success: false
        });
      }

      const item = await createMoodboardItem({
        aspectRatio,
        brandId,
        creativeGuideline,
        imageUrl,
        model,
        note,
        organizationId,
        userId
      });

      return res.status(201).json({
        success: true,
        message: 'Moodboard item created successfully',
        item
      });
    }

    // GET: Get moodboard items or single item
    if (req.method === 'GET') {
      const {
        itemId,
        organizationId,
        brandId,
        userId,
        model,
        limit,
        count
      } = req.query;

      // Get single item by ID
      if (itemId) {
        const item = await getMoodboardItemById(itemId);

        if (!item) {
          return res.status(404).json({
            error: 'Moodboard item not found',
            itemId,
            success: false
          });
        }

        return res.status(200).json({
          success: true,
          item
        });
      }

      // Get count only
      if (count === '1' || count === 'true') {
        const totalCount = await getMoodboardItemsCount({
          organizationId,
          brandId,
          userId,
          model
        });

        return res.status(200).json({
          success: true,
          count: totalCount
        });
      }

      // Get list of items with filters
      const items = await getMoodboardItems({
        organizationId,
        brandId,
        userId,
        model,
        limit: limit ? parseInt(limit) : 100
      });

      return res.status(200).json({
        success: true,
        total: items.length,
        items
      });
    }

    // PUT: Update moodboard item
    if (req.method === 'PUT') {
      const { itemId, ...updates } = req.body;

      if (!itemId) {
        return res.status(400).json({
          error: 'Missing required field: itemId',
          success: false
        });
      }

      const item = await updateMoodboardItem(itemId, updates);

      return res.status(200).json({
        success: true,
        message: 'Moodboard item updated successfully',
        item
      });
    }

    // DELETE: Delete moodboard item(s)
    if (req.method === 'DELETE') {
      const { itemId, itemIds, organizationId } = req.body;

      // Delete multiple items
      if (itemIds && Array.isArray(itemIds)) {
        const result = await deleteMoodboardItems(itemIds, organizationId);
        return res.status(200).json(result);
      }

      // Delete single item
      if (itemId) {
        const result = await deleteMoodboardItem(itemId, organizationId);
        return res.status(200).json(result);
      }

      return res.status(400).json({
        error: 'Missing required field',
        message: 'Provide either itemId or itemIds array',
        success: false
      });
    }

    // Method not allowed
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'Allowed methods: GET, POST, PUT, DELETE',
      success: false
    });

  } catch (error) {
    console.error('Moodboard API - Error:', error.message);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      success: false
    });
  }
});

