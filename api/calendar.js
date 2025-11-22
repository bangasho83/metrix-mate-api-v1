// Vercel function config (CJS)
module.exports.config = { maxDuration: 60 };

const { withLogging } = require('../utils/logging.cjs.js');
const { db, getBrandInfo, getOrganizationInfo } = require('../services/firebase-service');

module.exports = withLogging(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: list calendars by brandId or organizationId (aliases supported)
  if (req.method === 'GET') {
    try {
      const q = req.query || {};
      // Support case-insensitive parameter names
      const brand = q.brandId || q.brand_id || q.brand || q.brandid || q.brand_ID;
      const organization = q.organizationId || q.organization_id || q.org || q.organizationid || q.organization_ID;
      const fromDate = q.from || q.fromDate || q.start || q.fromdate || q.from_date;
      const toDate = q.to || q.toDate || q.end || q.todate || q.to_date;
      const status = q.status;
      const category = q.category;
      const minAdspend = (q.minAdspend || q.minadspend || q.min_adspend) ? parseInt(q.minAdspend || q.minadspend || q.min_adspend, 10) : null;
      const maxAdspend = (q.maxAdspend || q.maxadspend || q.max_adspend) ? parseInt(q.maxAdspend || q.maxadspend || q.max_adspend, 10) : null;

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

      // Build query with filters
      if (brand) {
        queryRef = db.collection('calendar').where('brandId', '==', brand);
      } else {
        queryRef = db.collection('calendar').where('organizationId', '==', organization);
      }

      // Apply AND filters at query time (not OR filters)
      if (!q.orFilters || (q.orFilters !== 'true' && q.orfilters !== 'true')) {
        // AND logic: apply equality filters at query time
        if (status) {
          queryRef = queryRef.where('status', '==', status);
        }
        if (category) {
          queryRef = queryRef.where('category', '==', category);
        }
      }

      snapshot = await queryRef.get();
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
          channels: d.channels || '',
          contentFormat: d.contentFormat || '',
          status: d.status || 'draft',
          statusHistory: d.statusHistory || [],
          adspend: d.adspend || 0,
          media: d.media || [],
          organizationId: d.organizationId || null,
          brandId: d.brandId || null,
          userId: d.userId || null,
          createdAt: d.createdAt || null
        };

        let includeItem = true;

        // Apply date filtering (always in memory)
        if (fromDate && item.date && item.date < fromDate) {
          includeItem = false;
        }
        if (toDate && item.date && item.date > toDate) {
          includeItem = false;
        }

        // Apply status filtering (always in memory when orFilters is true)
        if (includeItem && (q.orFilters === 'true' || q.orfilters === 'true')) {
          if (status && item.status !== status) {
            includeItem = false;
          }
        }

        // Apply OR filters if specified (category OR adspend)
        if (includeItem && (q.orFilters === 'true' || q.orfilters === 'true')) {
          let matchesOrFilter = false;

          // Check if matches category OR adspend filter
          if (category && item.category === category) {
            matchesOrFilter = true;
          }
          if (minAdspend !== null && item.adspend >= minAdspend) {
            matchesOrFilter = true;
          }
          if (maxAdspend !== null && item.adspend <= maxAdspend) {
            matchesOrFilter = true;
          }

          // If orFilters is enabled, only include if matches OR condition
          if (!matchesOrFilter) {
            includeItem = false;
          }
        } else if (includeItem) {
          // For AND logic, apply adspend filters here (status and category are in query)
          if (minAdspend !== null && item.adspend < minAdspend) {
            includeItem = false;
          }
          if (maxAdspend !== null && item.adspend > maxAdspend) {
            includeItem = false;
          }
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
          // Get organization details using cached function
          const orgInfo = await getOrganizationInfo(organization, { useCache: true });

          // Get unique brand IDs from the calendar posts
          const brandIds = [...new Set(items.map(item => item.brandId).filter(Boolean))];

          // Fetch brand details for all brands using cached function
          const brandPromises = brandIds.map(brandId =>
            getBrandInfo(brandId, { useCache: true }).catch(err => {
              console.warn(`Failed to fetch brand ${brandId}:`, err.message);
              return null;
            })
          );
          const brandInfos = await Promise.all(brandPromises);

          // Create brand lookup map
          const brandMap = {};
          brandInfos.forEach((brandInfo, index) => {
            const brandId = brandIds[index];
            if (brandInfo) {
              brandMap[brandId] = {
                name: brandInfo.name || 'Unknown Brand',
                website: brandInfo.website || null
              };
            } else {
              console.warn(`Brand ${brandId} not found or failed to fetch`);
              brandMap[brandId] = {
                name: 'Unknown Brand',
                website: null
              };
            }
          });

          // Add organization and brand info to response
          response.organizationName = orgInfo?.name || 'Unknown Organization';

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

  // PATCH: Update calendar status only
  if (req.method === 'PATCH') {
    try {
      const body = req.body || {};
      const docId = body.id || body.docId || (req.query && (req.query.id || req.query.docId));
      const status = body.status;
      const changedBy = body.changedBy || body.userId;
      const comment = body.comment || '';

      if (!docId) {
        return res.status(400).json({ error: 'Missing required parameter: id' });
      }
      if (!status || typeof status !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid required parameter: status (string)' });
      }
      if (!changedBy || typeof changedBy !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid required parameter: changedBy (userId)' });
      }

      const docRef = db.collection('calendar').doc(String(docId));
      const existing = await docRef.get();

      if (!existing.exists) {
        return res.status(404).json({ error: 'Calendar post not found', id: docId });
      }

      const existingData = existing.data() || {};
      const previousStatus = existingData.status || 'draft';
      const now = new Date();

      // Get existing status history or initialize empty array
      const existingHistory = Array.isArray(existingData.statusHistory) ? existingData.statusHistory : [];
      let updatedHistory = existingHistory;
      let statusHistoryEntry = null;

      // Only add to statusHistory if status is not 'assigned'
      if (status !== 'assigned') {
        statusHistoryEntry = {
          from: previousStatus,
          to: status,
          changedBy: changedBy,
          changedAt: now.toISOString(),
          comment: comment
        };
        updatedHistory = [...existingHistory, statusHistoryEntry];
      }

      // Update status and add to history (if not 'assigned')
      await docRef.update({
        status: status,
        statusHistory: updatedHistory,
        updatedAt: now
      });

      const response = {
        ok: true,
        id: String(docId),
        status: status,
        previousStatus: previousStatus,
        updatedAt: now.toISOString()
      };

      // Only include statusHistoryEntry if it was created (status !== 'assigned')
      if (statusHistoryEntry) {
        response.statusHistoryEntry = statusHistoryEntry;
      }

      return res.status(200).json(response);
    } catch (err) {
      console.error('calendar PATCH error:', err?.message || err);
      return res.status(500).json({ error: 'Failed to update calendar status' });
    }
  }

  // PUT: update specific fields of a calendar document by id (merge mode)
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

      // Set/update updatedAt timestamp
      data.updatedAt = new Date();

      // Use merge: true to only update provided fields, preserving all other fields
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
        channels: item.channels || '',
        contentFormat: item.contentFormat || '',
        status: item.status || 'draft',
        statusHistory: item.statusHistory || [],
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

