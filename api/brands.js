/**
 * Brands API
 * GET /api/brands?organizationId=ORG_ID - Returns brand documents (excludes archived)
 * DELETE /api/brands - Soft delete (archive) a brand
 */

import { db } from '../services/firebase-service.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

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
          brandName: brandData.name || 'Unknown',
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

  // GET: List brands (excludes archived)
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { organizationId, seo, includeArchived } = req.query || {};

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

      // Skip archived brands unless explicitly requested
      if (data?.archived === true && includeArchived !== 'true') {
        return;
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

