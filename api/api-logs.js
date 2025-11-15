/**
 * @fileoverview API Logs fetcher
 * Endpoint: GET /api/api-logs
 * Filters: api, brandId, organizationId, userId
 */

// CJS to be compatible with Vercel serverless default
const admin = require('firebase-admin');

module.exports.config = { maxDuration: 30 };

// In-memory cache (15 minutes)
const crypto = require('crypto');
const CACHE = { data: {}, ts: {}, TTL: 15 * 60 * 1000 };
function makeCacheKey({ api, brandId, organizationId, userId, limit, from, to, cursor }) {
  const keyObj = {
    api: api || null,
    brandId: brandId || null,
    organizationId: organizationId || null,
    userId: userId || null,
    limit: (limit === undefined || limit === null || limit === '') ? null : Number(limit),
    from: from || null,
    to: to || null,
    cursor: cursor || null
  };
  return 'api-logs:' + crypto.createHash('md5').update(JSON.stringify(keyObj)).digest('hex');
}

function parseDateParam(v) {
  if (!v) return null;
  if (typeof v === 'number') return new Date(v);
  const s = String(v);
  if (!s) return null;
  // numeric epoch
  if (/^\d{10,}$/.test(s)) {
    const n = parseInt(s, 10);
    if (Number.isFinite(n)) return new Date(n);
  }
  // ISO
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function encodeCursor(ms) {
  try { return Buffer.from(JSON.stringify({ t: ms }), 'utf8').toString('base64'); } catch (_) { return null; }
}
function decodeCursor(token) {
  try { const o = JSON.parse(Buffer.from(String(token), 'base64').toString('utf8')); return (o && typeof o.t === 'number') ? o.t : null; } catch (_) { return null; }
}


function initFirestore() {
  try {
    if (!admin.apps.length) {
      const b64 = process.env.FIREBASE_ADMIN_CREDENTIALS;
      if (!b64) throw new Error('Missing FIREBASE_ADMIN_CREDENTIALS');
      const serviceAccount = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
    }
    return admin.firestore();
  } catch (e) {
    console.error('api-logs: Firestore init failed:', e?.message || e);
    return null;
  }
}

// Helper function to fetch organization names
async function fetchOrganizationNames(db, organizationIds) {
  if (!organizationIds || organizationIds.length === 0) return {};

  try {
    const orgMap = {};
    const uniqueOrgIds = [...new Set(organizationIds.filter(id => id))];

    // Batch fetch organizations (Firestore limit is 10 per batch)
    const batches = [];
    for (let i = 0; i < uniqueOrgIds.length; i += 10) {
      const batch = uniqueOrgIds.slice(i, i + 10);
      batches.push(batch);
    }

    for (const batch of batches) {
      const orgPromises = batch.map(orgId => db.collection('orgs').doc(orgId).get());
      const orgDocs = await Promise.all(orgPromises);

      orgDocs.forEach((doc, index) => {
        if (doc.exists) {
          const data = doc.data();
          orgMap[batch[index]] = data.organizationName || data.organizationUsername || null;
        }
      });
    }

    return orgMap;
  } catch (error) {
    console.warn('api-logs: Failed to fetch organization names:', error.message);
    return {};
  }
}

// Helper function to fetch user names
async function fetchUserNames(db, userIds) {
  if (!userIds || userIds.length === 0) return {};

  try {
    const userMap = {};
    const uniqueUserIds = [...new Set(userIds.filter(id => id))];

    // Batch fetch users (Firestore limit is 10 per batch)
    const batches = [];
    for (let i = 0; i < uniqueUserIds.length; i += 10) {
      const batch = uniqueUserIds.slice(i, i + 10);
      batches.push(batch);
    }

    for (const batch of batches) {
      const userPromises = batch.map(userId => db.collection('users').doc(userId).get());
      const userDocs = await Promise.all(userPromises);

      userDocs.forEach((doc, index) => {
        if (doc.exists) {
          const data = doc.data();
          userMap[batch[index]] = data.name || data.email || null;
        }
      });
    }

    return userMap;
  } catch (error) {
    console.warn('api-logs: Failed to fetch user names:', error.message);
    return {};
  }
}

function parseLimit(v, max = 500) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return undefined; // no default
  return Math.min(n, max);
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const db = initFirestore();
  if (!db) {
    return res.status(500).json({ error: 'Server configuration error: Firestore not available' });
  }

  try {
    const { api, brandId, organizationId, userId, limit, cache, from, to, cursor } = req.query || {};
    const lim = parseLimit(limit);
    const applyLimit = lim !== undefined;

    // Cache bypass
    const bypass = String(cache || '').toLowerCase() === '0' || cache === 'false';

    if (!bypass) {
      const cacheKey = makeCacheKey({ api, brandId, organizationId, userId, limit: applyLimit ? lim : undefined, from, to, cursor });
      const now = Date.now();
      const ts = CACHE.ts[cacheKey];
      if (CACHE.data[cacheKey] && ts && (now - ts < CACHE.TTL)) {
        return res.status(200).json(CACHE.data[cacheKey]);
      }
    }

    let q = db.collection('api_logs');

    // Apply equality filters if provided
    if (api) q = q.where('api', '==', String(api));
    if (brandId) q = q.where('brandId', '==', String(brandId));
    if (organizationId) q = q.where('organizationId', '==', String(organizationId));
    if (userId) q = q.where('userId', '==', String(userId));

    // Date range filters
    const fromDate = parseDateParam(from);
    const toDate = parseDateParam(to);

    // Pagination with cursor (createdAt ms)
    const cursorMs = decodeCursor(cursor);

    // Try the full query with date filters and ordering
    let snap;
    try {
      // Apply date range filters
      if (fromDate) q = q.where('createdAt', '>=', admin.firestore.Timestamp.fromDate(fromDate));
      if (toDate) q = q.where('createdAt', '<=', admin.firestore.Timestamp.fromDate(toDate));

      // Try to order by createdAt desc
      let ordered = q.orderBy('createdAt', 'desc');
      if (cursorMs) {
        ordered = ordered.startAfter(admin.firestore.Timestamp.fromMillis(cursorMs));
      }
      snap = applyLimit ? await ordered.limit(lim).get() : await ordered.get();

    } catch (e) {
      const msg = e?.message || '';
      const isIndexError = msg.includes('indexes') || msg.includes('index') || e?.code === 9;

      if (isIndexError) {
        console.warn('api-logs: Missing composite index for filters + createdAt. Trying fallback approaches...');

        // Fallback 1: Try without ordering
        try {
          let fallbackQ = db.collection('api_logs');
          if (api) fallbackQ = fallbackQ.where('api', '==', String(api));
          if (brandId) fallbackQ = fallbackQ.where('brandId', '==', String(brandId));
          if (organizationId) fallbackQ = fallbackQ.where('organizationId', '==', String(organizationId));
          if (userId) fallbackQ = fallbackQ.where('userId', '==', String(userId));
          if (fromDate) fallbackQ = fallbackQ.where('createdAt', '>=', admin.firestore.Timestamp.fromDate(fromDate));
          if (toDate) fallbackQ = fallbackQ.where('createdAt', '<=', admin.firestore.Timestamp.fromDate(toDate));

          snap = applyLimit ? await fallbackQ.limit(lim).get() : await fallbackQ.get();
          console.log('api-logs: Fallback 1 (no ordering) succeeded');

        } catch (e2) {
          console.warn('api-logs: Fallback 1 failed, trying without date filters...');

          // Fallback 2: Remove date filters, keep other filters
          try {
            let fallbackQ2 = db.collection('api_logs');
            if (api) fallbackQ2 = fallbackQ2.where('api', '==', String(api));
            if (brandId) fallbackQ2 = fallbackQ2.where('brandId', '==', String(brandId));
            if (organizationId) fallbackQ2 = fallbackQ2.where('organizationId', '==', String(organizationId));
            if (userId) fallbackQ2 = fallbackQ2.where('userId', '==', String(userId));

            snap = applyLimit ? await fallbackQ2.limit(lim).get() : await fallbackQ2.get();
            console.log('api-logs: Fallback 2 (no date filters) succeeded');

          } catch (e3) {
            console.warn('api-logs: All fallbacks failed, using basic query');
            // Fallback 3: Basic query with no filters
            snap = applyLimit ? await db.collection('api_logs').limit(lim).get() : await db.collection('api_logs').get();
          }
        }
      } else {
        throw e;
      }
    }

    const items = snap.docs.map(doc => {
      const d = doc.data() || {};
      const ts = d.createdAt && typeof d.createdAt.toDate === 'function' ? d.createdAt.toDate().toISOString() : null;
      return {
        id: doc.id,
        api: d.api || null,
        method: d.method || null,
        brandId: d.brandId || null,
        organizationId: d.organizationId || null,
        userId: d.userId || null,
        createdAt: ts,
        credits: (d.credits !== undefined && d.credits !== null) ? d.credits : null
      };
    });

    // Extract unique organization and user IDs for batch fetching
    const organizationIds = [...new Set(items.map(item => item.organizationId).filter(id => id))];
    const userIds = [...new Set(items.map(item => item.userId).filter(id => id))];

    // Fetch organization and user names in parallel
    const [organizationNames, userNames] = await Promise.all([
      fetchOrganizationNames(db, organizationIds),
      fetchUserNames(db, userIds)
    ]);

    // Enrich items with organization and user names
    const enrichedItems = items.map(item => ({
      ...item,
      organizationName: item.organizationId ? organizationNames[item.organizationId] || null : null,
      userName: item.userId ? userNames[item.userId] || null : null
    }));

    // If date filters were requested but we had to fall back, filter results in memory
    let filteredItems = enrichedItems;
    let dateFilterApplied = true;

    if ((fromDate || toDate) && enrichedItems.length > 0) {
      // Check if we need to apply date filtering in memory (fallback scenario)
      const needsMemoryFilter = enrichedItems.some(item => {
        if (!item.createdAt) return false;
        const itemDate = new Date(item.createdAt);
        if (fromDate && itemDate < fromDate) return true;
        if (toDate && itemDate > toDate) return true;
        return false;
      });

      if (needsMemoryFilter) {
        console.log('api-logs: Applying date filters in memory due to missing indexes');
        filteredItems = enrichedItems.filter(item => {
          if (!item.createdAt) return false;
          const itemDate = new Date(item.createdAt);
          if (fromDate && itemDate < fromDate) return false;
          if (toDate && itemDate > toDate) return false;
          return true;
        });
        dateFilterApplied = false; // Indicate that DB-level filtering wasn't possible
      }
    }

    // Prepare pagination cursor
    let nextCursor = null;
    const lastDoc = snap.docs[snap.docs.length - 1];
    if (lastDoc) {
      const lastData = lastDoc.data();
      const lastTs = lastData && lastData.createdAt && typeof lastData.createdAt.toMillis === 'function' ? lastData.createdAt.toMillis() : null;
      if (typeof lastTs === 'number') nextCursor = encodeCursor(lastTs);
    }

    const payload = {
      success: true,
      count: filteredItems.length,
      totalBeforeFiltering: enrichedItems.length,
      filters: { api: api || null, brandId: brandId || null, organizationId: organizationId || null, userId: userId || null, from: from || null, to: to || null },
      dateFilterAppliedAtDB: dateFilterApplied,
      enrichmentInfo: {
        organizationsFound: Object.keys(organizationNames).length,
        usersFound: Object.keys(userNames).length,
        totalOrganizationIds: organizationIds.length,
        totalUserIds: userIds.length
      },
      items: filteredItems,
      nextCursor
    };

    // Save to cache if not bypassed
    const bypassSave = String((req.query || {}).cache || '').toLowerCase() === '0' || (req.query || {}).cache === 'false';
    if (!bypassSave) {
      const cacheKey = makeCacheKey({ api, brandId, organizationId, userId, limit: applyLimit ? lim : undefined, from, to, cursor });
      CACHE.data[cacheKey] = payload;
      CACHE.ts[cacheKey] = Date.now();
    }

    return res.status(200).json(payload);
  } catch (err) {
    console.error('api-logs: query failed:', err?.message || err);
    return res.status(500).json({ error: 'Failed to fetch api logs', details: process.env.NODE_ENV === 'development' ? (err?.message || String(err)) : undefined });
  }
};

