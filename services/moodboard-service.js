/**
 * @fileoverview Moodboard Service - CRUD operations for moodboard collection
 * @module services/moodboard-service
 */

const { db } = require('./firebase-service.js');

/**
 * Create a new moodboard item
 * @param {Object} data - Moodboard item data
 * @returns {Promise<Object>} Created moodboard item with ID
 */
exports.createMoodboardItem = async (data) => {
  try {
    const {
      aspectRatio,
      brandId,
      creativeGuideline,
      imageUrl,
      model,
      organizationId,
      userId
    } = data;

    // Validate required fields
    if (!imageUrl || !organizationId) {
      throw new Error('Missing required fields: imageUrl and organizationId are required');
    }

    console.log('Moodboard Service - Creating moodboard item:', {
      organizationId,
      brandId: brandId || 'not provided',
      userId: userId || 'not provided',
      model: model || 'not provided'
    });

    // Create timestamp
    const timestamp = db.FieldValue ? db.FieldValue.serverTimestamp() : new Date();

    // Create document
    const moodboardRef = db.collection('moodboard');
    const docRef = await moodboardRef.add({
      aspectRatio: aspectRatio || null,
      brandId: brandId || null,
      createdAt: timestamp,
      creativeGuideline: creativeGuideline || '',
      imageUrl,
      model: model || null,
      organizationId,
      userId: userId || null
    });

    console.log('Moodboard Service - Item created successfully:', docRef.id);

    // Return the created item with ID
    const doc = await docRef.get();
    return {
      id: docRef.id,
      ...doc.data()
    };

  } catch (error) {
    console.error('Moodboard Service - Error creating item:', error.message);
    throw error;
  }
};

/**
 * Get moodboard items with optional filters
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} Array of moodboard items
 */
exports.getMoodboardItems = async (filters = {}) => {
  try {
    const {
      organizationId,
      brandId,
      userId,
      model,
      limit = 100
    } = filters;

    console.log('Moodboard Service - Fetching items with filters:', filters);

    let query = db.collection('moodboard');

    // Apply filters
    if (organizationId) {
      query = query.where('organizationId', '==', organizationId);
    }

    if (brandId) {
      query = query.where('brandId', '==', brandId);
    }

    if (userId) {
      query = query.where('userId', '==', userId);
    }

    if (model) {
      query = query.where('model', '==', model);
    }

    // Order by createdAt descending and limit
    query = query.orderBy('createdAt', 'desc').limit(limit);

    const snapshot = await query.get();

    const items = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      // Convert Firestore timestamp to ISO string
      const createdAt = data.createdAt && typeof data.createdAt.toDate === 'function'
        ? data.createdAt.toDate().toISOString()
        : data.createdAt;

      items.push({
        id: doc.id,
        ...data,
        createdAt
      });
    });

    console.log('Moodboard Service - Found items:', items.length);
    return items;

  } catch (error) {
    console.error('Moodboard Service - Error fetching items:', error.message);
    throw error;
  }
};

/**
 * Get a single moodboard item by ID
 * @param {string} itemId - Moodboard item ID
 * @returns {Promise<Object|null>} Moodboard item or null if not found
 */
exports.getMoodboardItemById = async (itemId) => {
  try {
    console.log('Moodboard Service - Fetching item by ID:', itemId);

    const docRef = db.collection('moodboard').doc(itemId);
    const doc = await docRef.get();

    if (!doc.exists) {
      console.log('Moodboard Service - Item not found:', itemId);
      return null;
    }

    const data = doc.data();
    const createdAt = data.createdAt && typeof data.createdAt.toDate === 'function'
      ? data.createdAt.toDate().toISOString()
      : data.createdAt;

    return {
      id: doc.id,
      ...data,
      createdAt
    };

  } catch (error) {
    console.error('Moodboard Service - Error fetching item by ID:', error.message);
    throw error;
  }
};

/**
 * Update a moodboard item
 * @param {string} itemId - Moodboard item ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated moodboard item
 */
exports.updateMoodboardItem = async (itemId, updates) => {
  try {
    console.log('Moodboard Service - Updating item:', itemId, updates);

    const docRef = db.collection('moodboard').doc(itemId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error(`Moodboard item not found: ${itemId}`);
    }

    // Remove fields that shouldn't be updated
    const { id, createdAt, ...allowedUpdates } = updates;

    // Add updatedAt timestamp
    const timestamp = db.FieldValue ? db.FieldValue.serverTimestamp() : new Date();
    allowedUpdates.updatedAt = timestamp;

    await docRef.update(allowedUpdates);

    console.log('Moodboard Service - Item updated successfully:', itemId);

    // Return updated item
    const updatedDoc = await docRef.get();
    const data = updatedDoc.data();
    const createdAtISO = data.createdAt && typeof data.createdAt.toDate === 'function'
      ? data.createdAt.toDate().toISOString()
      : data.createdAt;
    const updatedAtISO = data.updatedAt && typeof data.updatedAt.toDate === 'function'
      ? data.updatedAt.toDate().toISOString()
      : data.updatedAt;

    return {
      id: updatedDoc.id,
      ...data,
      createdAt: createdAtISO,
      updatedAt: updatedAtISO
    };

  } catch (error) {
    console.error('Moodboard Service - Error updating item:', error.message);
    throw error;
  }
};

/**
 * Delete a moodboard item
 * @param {string} itemId - Moodboard item ID
 * @param {string} organizationId - Organization ID for verification (optional)
 * @returns {Promise<Object>} Deletion result
 */
exports.deleteMoodboardItem = async (itemId, organizationId = null) => {
  try {
    console.log('Moodboard Service - Deleting item:', itemId);

    const docRef = db.collection('moodboard').doc(itemId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error(`Moodboard item not found: ${itemId}`);
    }

    // Optional: Verify organization ownership
    if (organizationId) {
      const data = doc.data();
      if (data.organizationId !== organizationId) {
        throw new Error('Unauthorized: Item does not belong to this organization');
      }
    }

    await docRef.delete();

    console.log('Moodboard Service - Item deleted successfully:', itemId);

    return {
      success: true,
      message: 'Moodboard item deleted successfully',
      itemId
    };

  } catch (error) {
    console.error('Moodboard Service - Error deleting item:', error.message);
    throw error;
  }
};

/**
 * Delete multiple moodboard items
 * @param {Array<string>} itemIds - Array of moodboard item IDs
 * @param {string} organizationId - Organization ID for verification (optional)
 * @returns {Promise<Object>} Deletion result
 */
exports.deleteMoodboardItems = async (itemIds, organizationId = null) => {
  try {
    console.log('Moodboard Service - Deleting multiple items:', itemIds.length);

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      throw new Error('itemIds must be a non-empty array');
    }

    const batch = db.batch();
    const deletedIds = [];
    const errors = [];

    for (const itemId of itemIds) {
      try {
        const docRef = db.collection('moodboard').doc(itemId);
        const doc = await docRef.get();

        if (!doc.exists) {
          errors.push({ itemId, error: 'Item not found' });
          continue;
        }

        // Optional: Verify organization ownership
        if (organizationId) {
          const data = doc.data();
          if (data.organizationId !== organizationId) {
            errors.push({ itemId, error: 'Unauthorized' });
            continue;
          }
        }

        batch.delete(docRef);
        deletedIds.push(itemId);

      } catch (error) {
        errors.push({ itemId, error: error.message });
      }
    }

    await batch.commit();

    console.log('Moodboard Service - Batch delete completed:', {
      deleted: deletedIds.length,
      errors: errors.length
    });

    return {
      success: true,
      message: `Deleted ${deletedIds.length} items`,
      deleted: deletedIds.length,
      deletedIds,
      errors: errors.length > 0 ? errors : undefined
    };

  } catch (error) {
    console.error('Moodboard Service - Error deleting items:', error.message);
    throw error;
  }
};

/**
 * Get moodboard items count
 * @param {Object} filters - Filter options
 * @returns {Promise<number>} Count of items
 */
exports.getMoodboardItemsCount = async (filters = {}) => {
  try {
    const {
      organizationId,
      brandId,
      userId,
      model
    } = filters;

    console.log('Moodboard Service - Counting items with filters:', filters);

    let query = db.collection('moodboard');

    // Apply filters
    if (organizationId) {
      query = query.where('organizationId', '==', organizationId);
    }

    if (brandId) {
      query = query.where('brandId', '==', brandId);
    }

    if (userId) {
      query = query.where('userId', '==', userId);
    }

    if (model) {
      query = query.where('model', '==', model);
    }

    const snapshot = await query.get();
    const count = snapshot.size;

    console.log('Moodboard Service - Items count:', count);
    return count;

  } catch (error) {
    console.error('Moodboard Service - Error counting items:', error.message);
    throw error;
  }
};

