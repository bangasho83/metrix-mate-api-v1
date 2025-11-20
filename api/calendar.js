// Vercel function config (CJS)
module.exports.config = { maxDuration: 60 };

const { withLogging } = require('../utils/logging.cjs.js');
const { db } = require('../services/firebase-service');

module.exports = withLogging(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: list calendars by brandId or organizationId (aliases supported)
  if (req.method === 'GET') {
    try {
      const q = req.query || {};
      const brand = q.brandId || q.brand_id || q.brand;
      const organization = q.organizationId || q.organization_id || q.org;
      const fromDate = q.from || q.fromDate || q.start;
      const toDate = q.to || q.toDate || q.end;

      // Must provide either brandId or organizationId
      if (!brand && !organization) {
        return res.status(400).json({ error: 'Missing required parameter: brandId or organizationId' });
      }

      const limitParam = parseInt(q.limit, 10);
      const lim = Math.min(Math.max(isNaN(limitParam) ? 500 : limitParam, 1), 500);

      let queryRef;
      let filterType;
      let filterValue;

      let snapshot;

      if (brand) {
        // Filter by specific brand
        filterType = 'brandId';
        filterValue = brand;
        queryRef = db.collection('calendar').where('brandId', '==', brand);
        snapshot = await queryRef.get();
      } else {
        // Filter by organization (all brands in the organization)
        filterType = 'organizationId';
        filterValue = organization;
        queryRef = db.collection('calendar').where('organizationId', '==', organization);
        snapshot = await queryRef.get();
      }
      let items = [];
      snapshot.forEach(doc => {
        const d = doc.data() || {};
        const item = {
          id: doc.id,
          date: d.date || null,
          title: d.title || '',
          caption: d.caption || '',
          designBrief: d.designBrief || '',
          type: d.type || '',
          category: d.category || '',
          contentFormat: d.contentFormat || '',
          adspend: d.adspend || 0,
          media: d.media || [],
          organizationId: d.organizationId || null,
          brandId: d.brandId || null,
          userId: d.userId || null,
          createdAt: d.createdAt || null
        };

        // Apply date filtering in memory
        let includeItem = true;
        if (fromDate && item.date && item.date < fromDate) {
          includeItem = false;
        }
        if (toDate && item.date && item.date > toDate) {
          includeItem = false;
        }

        if (includeItem) {
          items.push(item);
        }
      });

      // Sort by date (ascending)
      items.sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        return dateA.localeCompare(dateB);
      });

      // Apply limit after filtering and sorting
      if (lim && items.length > lim) {
        items = items.slice(0, lim);
      }

      // If querying by organizationId, fetch organization and brand details
      let response = { count: items.length, items };
      response[filterType] = filterValue;

      // Add date range to response if provided
      if (fromDate) response.fromDate = fromDate;
      if (toDate) response.toDate = toDate;

      if (filterType === 'organizationId' && items.length > 0) {
        try {
          // Get organization details
          const orgDoc = await db.collection('organizations').doc(organization).get();
          const orgData = orgDoc.exists ? orgDoc.data() : null;

          // Get unique brand IDs from the calendar posts
          const brandIds = [...new Set(items.map(item => item.brandId).filter(Boolean))];

          // Fetch brand details for all brands
          const brandPromises = brandIds.map(brandId =>
            db.collection('brands').doc(brandId).get()
          );
          const brandDocs = await Promise.all(brandPromises);

          // Create brand lookup map
          const brandMap = {};
          brandDocs.forEach((doc, index) => {
            const brandId = brandIds[index];
            if (doc.exists) {
              const brandData = doc.data();

              // Use client_name as the brand name field
              const brandName = brandData.client_name || 'Unknown Brand';

              brandMap[brandId] = {
                name: brandName,
                website: brandData.website || brandData.url || null
              };
            } else {
              console.warn(`Brand document ${brandId} does not exist in brands collection`);
              brandMap[brandId] = {
                name: 'Unknown Brand',
                website: null
              };
            }
          });

          // Add organization and brand info to response
          response.organizationName = orgData?.name || 'Unknown Organization';

          // Add brand names to each item
          response.items = items.map(item => ({
            ...item,
            brandName: item.brandId ? (brandMap[item.brandId]?.name || 'Unknown Brand') : null
          }));

        } catch (brandError) {
          console.warn('Failed to fetch brand/organization details:', brandError.message);
          // Continue with original response if brand fetching fails
        }
      }

      return res.status(200).json(response);
    } catch (err) {
      console.error('calendar GET error:', {
        message: err?.message || err,
        code: err?.code,
        stack: err?.stack,
        filterType,
        filterValue,
        fromDate,
        toDate,
        query: req.query
      });
      return res.status(500).json({
        error: 'Failed to fetch calendars',
        details: err?.message || 'Unknown error',
        code: err?.code
      });
    }
  }

  // PUT: update a specific calendar document by id (merge mode)
  if (req.method === 'PUT') {
    try {
      const body = req.body || {};
      const docId = body.id || body.docId || (req.query && (req.query.id || req.query.docId));
      const data = body.data;

      if (!docId) {
        return res.status(400).json({ error: 'Missing required parameter: id' });
      }
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Missing required parameter: data (object)' });
      }

      const docRef = db.collection('calendar').doc(String(docId));

      // Preserve createdAt if not provided
      if (data.createdAt === undefined) {
        const existing = await docRef.get();
        if (existing.exists) {
          const ex = existing.data() || {};
          if (ex.createdAt) data.createdAt = ex.createdAt;
        }
      }

      // Set/update updatedAt timestamp
      data.updatedAt = new Date();

      // Use merge: true to update only provided fields
      await docRef.set(data, { merge: true });
      return res.status(200).json({ ok: true, id: String(docId) });
    } catch (err) {
      console.error('calendar PUT error:', err?.message || err);
      return res.status(500).json({ error: 'Failed to update calendar document' });
    }
  }

  // DELETE: delete a specific calendar document by id
  if (req.method === 'DELETE') {
    try {
      const q = req.query || {};
      const body = (req.body && typeof req.body === 'object') ? req.body : {};
      const docId = body.id || body.docId || q.id || q.docId;
      if (!docId) {
        return res.status(400).json({ error: 'Missing required parameter: id' });
      }
      await db.collection('calendar').doc(String(docId)).delete();
      return res.status(200).json({ ok: true, id: String(docId) });
    } catch (err) {
      console.error('calendar DELETE error:', err?.message || err);
      return res.status(500).json({ error: 'Failed to delete calendar document' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;

    if (!Array.isArray(body) || body.length === 0) {
      return res.status(400).json({ error: 'Body must be a non-empty array of posts' });
    }

    const batch = db.batch();
    const col = db.collection('calendar');
    const createdIds = [];
    const updatedIds = [];
    const now = new Date();

    for (const item of body) {
      if (!item || typeof item !== 'object') continue;

      // Validate and process media array
      let processedMedia = [];
      if (item.media && Array.isArray(item.media)) {
        processedMedia = item.media
          .filter(url => typeof url === 'string' && url.trim() !== '')
          .map(url => url.trim())
          .slice(0, 10); // Limit to 10 media files max
      }

      const basePayload = {
        date: item.date || null,
        title: item.title || '',
        caption: item.caption || '',
        designBrief: item.designBrief || '',
        type: item.type || '',
        category: item.category || '',
        contentFormat: item.contentFormat || '',
        adspend: parseInt(item.adspend, 10) || 0,
        media: processedMedia,
        organizationId: item.organizationId || null,
        brandId: item.brandId || null,
        userId: item.userId || null
      };

      if (item.id) {
        // Update existing document (replace)
        const docRef = col.doc(String(item.id));
        const payload = { ...basePayload };
        // Preserve createdAt if not provided
        if (item.createdAt !== undefined) {
          payload.createdAt = item.createdAt;
        } else {
          const existing = await docRef.get();
          if (existing.exists) {
            const ex = existing.data() || {};
            if (ex.createdAt) payload.createdAt = ex.createdAt;
          }
        }
        payload.updatedAt = now;
        batch.set(docRef, payload, { merge: false });
        updatedIds.push(String(item.id));
      } else {
        // Create new document
        const docRef = col.doc();
        const payload = { ...basePayload, createdAt: now };
        batch.set(docRef, payload);
        createdIds.push(docRef.id);
      }
    }

    await batch.commit();

    const count = createdIds.length + updatedIds.length;
    return res.status(200).json({ ok: true, count, createdCount: createdIds.length, updatedCount: updatedIds.length, createdIds, updatedIds });
  } catch (err) {
    console.error('calendar API error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to save calendar' });
  }
});

