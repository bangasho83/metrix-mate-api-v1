/**
 * Brands API
 * GET /api/brands?organizationId=ORG_ID - Returns brand documents (excludes archived)
 * POST /api/brands - Create a new brand
 * PUT /api/brands - Update brand fields
 * DELETE /api/brands - Soft delete (archive) a brand
 * PATCH /api/brands - Restore an archived brand
 */

import { db } from '../services/firebase-service.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // POST: Create a new brand
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const {
        client_name,
        website,
        industry,
        country,
        tags,
        currency_symbol,
        brand_guidelines,
        services,
        createdBy,
        organizationId
      } = body;

      // Validate required parameters
      if (!client_name || typeof client_name !== 'string') {
        return res.status(400).json({
          error: 'Missing or invalid required field: client_name',
          message: 'client_name must be a valid string'
        });
      }

      if (!organizationId || typeof organizationId !== 'string') {
        return res.status(400).json({
          error: 'Missing or invalid required field: organizationId',
          message: 'organizationId must be a valid string'
        });
      }

      if (!createdBy || typeof createdBy !== 'string') {
        return res.status(400).json({
          error: 'Missing or invalid required field: createdBy',
          message: 'createdBy must be a valid string (user ID)'
        });
      }

      // Validate optional fields
      if (website && typeof website !== 'string') {
        return res.status(400).json({
          error: 'Invalid field: website',
          message: 'website must be a string'
        });
      }

      if (tags && !Array.isArray(tags)) {
        return res.status(400).json({
          error: 'Invalid field: tags',
          message: 'tags must be an array'
        });
      }

      if (services && typeof services !== 'object') {
        return res.status(400).json({
          error: 'Invalid field: services',
          message: 'services must be an object'
        });
      }

      // Create brand document
      const brandRef = db.collection('brands').doc();
      const brandId = brandRef.id;

      const now = new Date();
      const timestamp = db.FieldValue ? db.FieldValue.serverTimestamp() : now;

      const brandData = {
        client_name,
        organizationId,
        createdBy,
        created_at: timestamp,
        updated_at: timestamp,
        archived: false,
        // Optional fields
        ...(website && { website }),
        ...(industry && { industry }),
        ...(country && { country }),
        ...(tags && { tags }),
        ...(currency_symbol && { currency_symbol }),
        ...(brand_guidelines && { brand_guidelines }),
        ...(services && { services })
      };

      await brandRef.set(brandData);

      console.log('Brand created successfully:', {
        brandId,
        client_name,
        organizationId,
        createdBy,
        timestamp: now.toISOString()
      });

      return res.status(201).json({
        success: true,
        message: 'Brand created successfully',
        brand: {
          id: brandId,
          client_name,
          organizationId,
          createdBy,
          created_at: now.toISOString(),
          ...(website && { website }),
          ...(industry && { industry }),
          ...(country && { country }),
          ...(tags && { tags }),
          ...(currency_symbol && { currency_symbol }),
          ...(services && { services })
        }
      });
    } catch (err) {
      console.error('POST brand error:', {
        message: err?.message || err,
        code: err?.code,
        stack: err?.stack,
        body: req.body
      });
      return res.status(500).json({
        error: 'Failed to create brand',
        details: err?.message || 'Unknown error'
      });
    }
  }

  // PUT: Update brand fields
  if (req.method === 'PUT') {
    try {
      const body = req.body || {};
      const { brandId, organizationId, userId, data } = body;

      // Validate required parameters
      if (!brandId || typeof brandId !== 'string') {
        return res.status(400).json({
          error: 'Missing or invalid required field: brandId',
          message: 'brandId must be a valid string'
        });
      }

      if (!organizationId || typeof organizationId !== 'string') {
        return res.status(400).json({
          error: 'Missing or invalid required field: organizationId',
          message: 'organizationId must be a valid string'
        });
      }

      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({
          error: 'Missing or invalid required field: userId',
          message: 'userId must be a valid string (user ID performing the update)'
        });
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return res.status(400).json({
          error: 'Missing or invalid required field: data',
          message: 'data must be an object containing fields to update'
        });
      }

      if (Object.keys(data).length === 0) {
        return res.status(400).json({
          error: 'Invalid data field',
          message: 'data object must contain at least one field to update'
        });
      }

      // Get the brand document
      const brandRef = db.collection('brands').doc(brandId);
      const brandDoc = await brandRef.get();

      if (!brandDoc.exists) {
        return res.status(404).json({
          error: 'Brand not found',
          brandId
        });
      }

      const brandData = brandDoc.data();

      // Verify the brand belongs to the organization
      if (brandData.organizationId !== organizationId) {
        return res.status(403).json({
          error: 'Unauthorized',
          message: 'Brand does not belong to this organization',
          brandId,
          organizationId
        });
      }

      // Prevent updating certain protected fields
      const protectedFields = ['id', 'createdBy', 'created_at', 'archived', 'archivedAt', 'archivedMetadata'];
      const attemptedProtectedFields = Object.keys(data).filter(key => protectedFields.includes(key));

      if (attemptedProtectedFields.length > 0) {
        return res.status(400).json({
          error: 'Cannot update protected fields',
          message: `The following fields cannot be updated: ${attemptedProtectedFields.join(', ')}`,
          protectedFields: attemptedProtectedFields
        });
      }

      // Prepare update data
      const now = new Date();
      const timestamp = db.FieldValue ? db.FieldValue.serverTimestamp() : now;

      const updateData = {
        ...data,
        updated_at: timestamp,
        lastUpdatedBy: userId
      };

      // Perform the update
      await brandRef.update(updateData);

      console.log('Brand updated successfully:', {
        brandId,
        organizationId,
        userId,
        updatedFields: Object.keys(data),
        timestamp: now.toISOString()
      });

      return res.status(200).json({
        success: true,
        message: 'Brand updated successfully',
        brand: {
          id: brandId,
          organizationId,
          updatedFields: Object.keys(data),
          updated_at: now.toISOString(),
          lastUpdatedBy: userId
        }
      });
    } catch (err) {
      console.error('PUT brand error:', {
        message: err?.message || err,
        code: err?.code,
        stack: err?.stack,
        body: req.body
      });
      return res.status(500).json({
        error: 'Failed to update brand',
        details: err?.message || 'Unknown error'
      });
    }
  }

  // DELETE: Soft delete (archive) a brand
  if (req.method === 'DELETE') {
    try {
      const body = req.body || {};
      const { brandId, organizationId, userId } = body;

      // Validate required parameters
      if (!brandId || typeof brandId !== 'string') {
        return res.status(400).json({
          error: 'Missing or invalid required field: brandId',
          message: 'brandId must be a valid string'
        });
      }

      if (!organizationId || typeof organizationId !== 'string') {
        return res.status(400).json({
          error: 'Missing or invalid required field: organizationId',
          message: 'organizationId must be a valid string'
        });
      }

      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({
          error: 'Missing or invalid required field: userId',
          message: 'userId must be a valid string'
        });
      }

      // Get the brand document
      const brandRef = db.collection('brands').doc(brandId);
      const brandDoc = await brandRef.get();

      if (!brandDoc.exists) {
        return res.status(404).json({
          error: 'Brand not found',
          brandId
        });
      }

      const brandData = brandDoc.data();

      // Verify the brand belongs to the organization
      if (brandData.organizationId !== organizationId) {
        return res.status(403).json({
          error: 'Unauthorized',
          message: 'Brand does not belong to this organization',
          brandId,
          organizationId
        });
      }

      // Check if already archived
      if (brandData.archived === true) {
        return res.status(410).json({
          error: 'Brand already archived',
          brandId,
          archivedAt: brandData.archivedAt,
          message: 'This brand has already been archived'
        });
      }

      // Perform soft delete (archive)
      const now = new Date();
      const timestamp = db.FieldValue ? db.FieldValue.serverTimestamp() : now;

      const archiveData = {
        archived: true,
        archivedAt: timestamp,
        updatedAt: timestamp,
        // Preserve original data for audit trail
        archivedMetadata: {
          organizationId: brandData.organizationId || organizationId,
          userId: userId,
          archivedTimestamp: now.toISOString()
        }
      };

      await brandRef.update(archiveData);

      console.log('Brand archived successfully:', {
        brandId,
        organizationId,
        brandName: brandData.name,
        timestamp: now.toISOString()
      });

      return res.status(200).json({
        success: true,
        message: 'Brand archived successfully',
        brand: {
          id: brandId,
          name: brandData.name,
          organizationId,
          archivedAt: now.toISOString()
        }
      });
    } catch (err) {
      console.error('DELETE brand error:', {
        message: err?.message || err,
        code: err?.code,
        stack: err?.stack,
        body: req.body
      });
      return res.status(500).json({
        error: 'Failed to archive brand',
        details: err?.message || 'Unknown error'
      });
    }
  }

  // PATCH: Partial update of brand fields OR restore an archived brand
  if (req.method === 'PATCH') {
    try {
      const body = req.body || {};
      const { brandId, organizationId, userId, data, restore } = body;

      // Validate required parameters
      if (!brandId || typeof brandId !== 'string') {
        return res.status(400).json({
          error: 'Missing or invalid required field: brandId',
          message: 'brandId must be a valid string'
        });
      }

      if (!organizationId || typeof organizationId !== 'string') {
        return res.status(400).json({
          error: 'Missing or invalid required field: organizationId',
          message: 'organizationId must be a valid string'
        });
      }

      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({
          error: 'Missing or invalid required field: userId',
          message: 'userId must be a valid string'
        });
      }

      // Get the brand document
      const brandRef = db.collection('brands').doc(brandId);
      const brandDoc = await brandRef.get();

      if (!brandDoc.exists) {
        return res.status(404).json({
          error: 'Brand not found',
          brandId
        });
      }

      const brandData = brandDoc.data();

      // Verify the brand belongs to the organization
      if (brandData.organizationId !== organizationId) {
        return res.status(403).json({
          error: 'Unauthorized',
          message: 'Brand does not belong to this organization',
          brandId,
          organizationId
        });
      }

      const now = new Date();
      const timestamp = db.FieldValue ? db.FieldValue.serverTimestamp() : now;

      // CASE 1: Restore archived brand (restore=true)
      if (restore === true) {
        // Check if brand is archived
        if (brandData.archived !== true) {
          return res.status(400).json({
            error: 'Brand is not archived',
            brandId,
            message: 'Only archived brands can be restored'
          });
        }

        // Perform restore (unarchive)
        const restoreData = {
          archived: false,
          archivedAt: null,
          updated_at: timestamp
        };

        await brandRef.update(restoreData);

        console.log('Brands API - Brand restored:', {
          brandId,
          organizationId,
          userId,
          restoredAt: now.toISOString()
        });

        return res.status(200).json({
          success: true,
          message: 'Brand restored successfully',
          brand: {
            id: brandId,
            organizationId,
            restoredAt: now.toISOString()
          }
        });
      }

      // CASE 2: Partial update of brand fields (data provided)
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return res.status(400).json({
          error: 'Missing or invalid required field: data',
          message: 'data must be an object containing fields to update'
        });
      }

      if (Object.keys(data).length === 0) {
        return res.status(400).json({
          error: 'Invalid data field',
          message: 'data object must contain at least one field to update'
        });
      }

      // Prevent updating certain protected fields
      const protectedFields = ['id', 'createdBy', 'created_at', 'archived', 'archivedAt', 'archivedMetadata'];
      const attemptedProtectedFields = Object.keys(data).filter(key => protectedFields.includes(key));

      if (attemptedProtectedFields.length > 0) {
        return res.status(400).json({
          error: 'Cannot update protected fields',
          message: `The following fields cannot be updated: ${attemptedProtectedFields.join(', ')}`,
          protectedFields: attemptedProtectedFields
        });
      }

      // Prepare update data
      const updateData = {
        ...data,
        updated_at: timestamp,
        lastUpdatedBy: userId
      };

      // Perform the update
      await brandRef.update(updateData);

      console.log('Brand updated successfully (PATCH):', {
        brandId,
        organizationId,
        userId,
        updatedFields: Object.keys(data),
        timestamp: now.toISOString()
      });

      return res.status(200).json({
        success: true,
        message: 'Brand updated successfully',
        brand: {
          id: brandId,
          organizationId,
          updatedFields: Object.keys(data),
          updated_at: now.toISOString(),
          lastUpdatedBy: userId
        }
      });
    } catch (err) {
      console.error('Brands API - PATCH error:', err?.message || err);
      return res.status(500).json({
        error: 'Failed to update brand',
        details: err?.message || 'Unknown error'
      });
    }
  }

  // GET: Get single brand by brandId OR list brands (excludes archived by default)
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { brandId, organizationId, seo, includeArchived, onlyArchived } = req.query || {};

  // GET single brand by brandId
  if (brandId) {
    try {
      const brandRef = db.collection('brands').doc(brandId);
      const brandDoc = await brandRef.get();

      if (!brandDoc.exists) {
        return res.status(404).json({
          error: 'Brand not found',
          brandId
        });
      }

      const brandData = brandDoc.data();

      // Check if brand is archived and should be hidden
      if (brandData.archived === true && includeArchived !== 'true') {
        return res.status(410).json({
          error: 'Brand is archived',
          brandId,
          archivedAt: brandData.archivedAt,
          message: 'This brand has been archived. Use includeArchived=true to view it.'
        });
      }

      return res.status(200).json({
        success: true,
        brand: {
          id: brandDoc.id,
          ...brandData
        }
      });
    } catch (err) {
      console.error('Brands API - Get single brand error:', err?.message || err);
      return res.status(500).json({
        error: 'Failed to fetch brand',
        details: err?.message || 'Unknown error'
      });
    }
  }

  // GET list of brands
  try {
    let snap;

    if (organizationId && seo) {
      // Filter by both organizationId and seo
      try {
        snap = await db
          .collection('brands')
          .where('organizationId', '==', organizationId)
          .where('services.seo', '==', seo)
          .limit(200)
          .get();
      } catch (e) {
        if ((e?.message || '').includes('index') || e?.code === 9) {
          console.warn('Brands API - Missing composite index for services.seo filter. Falling back to in-memory filtering.');
          snap = await db.collection('brands').where('organizationId', '==', organizationId).limit(500).get();
        } else {
          throw e;
        }
      }
    } else if (organizationId) {
      // Filter by organizationId only
      snap = await db.collection('brands').where('organizationId', '==', organizationId).limit(200).get();
    } else if (seo) {
      // Filter by seo only
      try {
        snap = await db.collection('brands').where('services.seo', '==', seo).limit(200).get();
      } catch (e) {
        if ((e?.message || '').includes('index') || e?.code === 9) {
          console.warn('Brands API - Missing index for services.seo filter. Falling back to all brands.');
          snap = await db.collection('brands').limit(500).get();
        } else {
          throw e;
        }
      }
    } else {
      // Get all brands
      snap = await db.collection('brands').limit(500).get();
    }

    const brands = [];
    snap.forEach(doc => {
      const data = doc.data();

      // Filter archived brands based on query parameters
      if (onlyArchived === 'true') {
        // Only show archived brands
        if (data?.archived !== true) {
          return;
        }
      } else {
        // Skip archived brands unless explicitly requested
        if (data?.archived === true && includeArchived !== 'true') {
          return;
        }
      }

      if (seo) {
        if (data?.services?.seo === seo) brands.push({ id: doc.id, ...data });
      } else {
        brands.push({ id: doc.id, ...data });
      }
    });

    const response = { count: brands.length, brands };
    if (organizationId) {
      response.organizationId = organizationId;
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error('Brands API error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to fetch brands' });
  }
}

