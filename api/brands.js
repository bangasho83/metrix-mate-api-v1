/**
 * Simple Brands API
 * GET /api/brands?organizationId=ORG_ID
 * Returns raw brand documents from the brands collection for the given organizationId.
 */

import { db } from '../services/firebase-service.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { organizationId, seo } = req.query || {};

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

