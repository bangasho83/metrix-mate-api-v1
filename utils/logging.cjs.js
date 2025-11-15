/**
 * Centralized logging wrapper for serverless API handlers (CommonJS)
 * - Persists minimal logs to Firestore: { method, timestamp }
 * - Avoids logging bodies or PII
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const metronomeService = require('../services/metronome-service');
let db = null;
let warned = false;

// Lazy-loaded rate card map
let RATE_CARD = null;
function loadRateCard() {
  if (RATE_CARD) return RATE_CARD;
  try {
    const p = path.join(process.cwd(), 'settings', 'rate-card.txt');
    const txt = fs.readFileSync(p, 'utf8');
    const map = {};
    txt.split(/\r?\n/).forEach(line => {
      const s = String(line || '').trim();
      if (!s || s.startsWith('#')) return;
      const eq = s.indexOf('=');
      if (eq === -1) return;
      const k = s.slice(0, eq).trim();
      const v = parseFloat(s.slice(eq + 1).trim());
      if (k && Number.isFinite(v)) map[k] = v;
    });
    RATE_CARD = map;
  } catch (e) {
    RATE_CARD = {};
  }
  return RATE_CARD;
}
function getCredits(apiName) {
  try {
    const rc = loadRateCard() || {};
    const v = rc[apiName];
    return Number.isFinite(v) ? v : undefined;
  } catch (_) { return undefined; }
}

// In-memory cache for billingCustomerId lookups (15 minutes TTL)
const BILLING_CACHE = {
  data: {},      // { organizationId: billingCustomerId }
  ts: {},        // { organizationId: timestamp }
  TTL: 15 * 60 * 1000  // 15 minutes
};

/**
 * Fetch billingCustomerId for an organization with caching
 * @param {string} organizationId - The organization ID
 * @returns {Promise<string|undefined>} - The billingCustomerId or undefined
 */
async function getBillingCustomerId(organizationId) {
  if (!organizationId) return undefined;

  const now = Date.now();
  const cached = BILLING_CACHE.data[organizationId];
  const ts = BILLING_CACHE.ts[organizationId];

  // Return cached value if fresh (within 15 minutes)
  if (cached !== undefined && ts && (now - ts < BILLING_CACHE.TTL)) {
    console.log('[API-LOG] billingCustomerId cache HIT for org:', organizationId, '→', cached);
    return cached;
  }

  // Fetch from Firestore
  try {
    if (!db) {
      console.log('[API-LOG] db is null, calling initFirestore()');
      initFirestore();
    }
    if (!db) {
      console.error('[API-LOG] Cannot fetch billingCustomerId: Firestore not initialized after init attempt');
      return undefined;
    }

    console.log('[API-LOG] billingCustomerId cache MISS for org:', organizationId, '- fetching from Firestore');
    console.log('[API-LOG] Firestore db object:', db ? 'initialized' : 'null');

    try {
      const fetchStart = Date.now();
      const orgDoc = await db.collection('orgs').doc(organizationId).get();
      const fetchDuration = Date.now() - fetchStart;
      console.log('[API-LOG] Firestore fetch completed in', fetchDuration, 'ms, exists:', orgDoc.exists);

      if (orgDoc.exists) {
        const orgData = orgDoc.data();
        console.log('[API-LOG] Org data keys:', Object.keys(orgData || {}));
        const billingId = orgData?.billingCustomerId || null;
        console.log('[API-LOG] Found org document, billingCustomerId:', billingId);

        // Cache the result (even if null, to avoid repeated lookups)
        BILLING_CACHE.data[organizationId] = billingId;
        BILLING_CACHE.ts[organizationId] = now;

        return billingId;
      } else {
        console.warn('[API-LOG] Organization not found:', organizationId);
        // Cache null for non-existent orgs
        BILLING_CACHE.data[organizationId] = null;
        BILLING_CACHE.ts[organizationId] = now;
        return undefined;
      }
    } catch (fetchError) {
      console.error('[API-LOG] Firestore fetch error:', fetchError?.message, fetchError?.code, fetchError?.stack);
      throw fetchError;
    }
  } catch (e) {
    console.error('[API-LOG] Failed to fetch billingCustomerId - outer catch:', e?.message || e, e?.code, e?.stack);
    return undefined;
  }
}

function initFirestore() {
  try {
    if (!admin.apps.length) {
      const b64 = process.env.FIREBASE_ADMIN_CREDENTIALS;
      if (!b64) throw new Error('Missing FIREBASE_ADMIN_CREDENTIALS');
      const serviceAccount = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
    }
    db = admin.firestore();
  } catch (e) {
    if (!warned) {
      console.warn('[API-LOG] Firestore not configured for logging:', e?.message || e);
      warned = true;
    }
    db = null;
  }
}

async function logToFirestoreSafe(data) {
  try {
    if (!db) initFirestore();
    if (!db) {
      if (data.api === 'keyword-sim') {
        console.log('[API-LOG] keyword-sim: Firestore not initialized');
      }
      return; // no-op if firestore unavailable
    }

    // If organizationId exists, fetch and add billingCustomerId
    let billingCustomerId = null;

    // Log entry for mates-take/overview
    if (data.api === 'mates-take/overview') {
      console.log(`[API-LOG] ${data.api}: ENTRY - logToFirestoreSafe called with:`, {
        api: data.api,
        organizationId: data.organizationId,
        credits: data.credits,
        method: data.method
      });
    }

    if (data.organizationId) {
      if (data.api === 'keyword-sim' || data.api === 'mates-take/overview' || data.api === 'keyword-research') {
        console.log(`[API-LOG] ${data.api}: Fetching billingCustomerId for org:`, data.organizationId);
      }
      billingCustomerId = await getBillingCustomerId(data.organizationId);
      if (data.api === 'keyword-sim' || data.api === 'mates-take/overview' || data.api === 'keyword-research') {
        console.log(`[API-LOG] ${data.api}: Got billingCustomerId:`, billingCustomerId);
      }
      if (billingCustomerId) {
        data.billingCustomerId = billingCustomerId;
      }
    } else if (data.api === 'mates-take/overview') {
      console.log(`[API-LOG] ${data.api}: NO organizationId in data!`);
    }

    // Save to Firestore
    if (data.api === 'keyword-sim' || data.api === 'mates-take/overview' || data.api === 'keyword-research') {
      console.log(`[API-LOG] ${data.api}: Saving to Firestore:`, data);
    }
    await db.collection('api_logs').add(data);
    if (data.api === 'keyword-sim' || data.api === 'mates-take/overview' || data.api === 'keyword-research') {
      console.log(`[API-LOG] ${data.api}: Saved to Firestore successfully`);
    }

    // Ingest to Metronome if we have billingCustomerId and credits
    if (data.api === 'mates-take/overview' || data.api === 'keyword-research') {
      console.log(`[API-LOG] ${data.api}: Checking Metronome ingest conditions:`, {
        hasBillingCustomerId: !!billingCustomerId,
        billingCustomerId,
        hasCredits: !!data.credits,
        credits: data.credits,
        creditsGreaterThanZero: data.credits > 0
      });
    }

    if (billingCustomerId && data.credits && data.credits > 0) {
      try {
        const properties = {
          credits: data.credits,
          project_id: 'metrixmate',
          organization_id: data.organizationId
        };
        if (data.brandId) properties.brand_id = data.brandId;
        if (data.userId) properties.user_id = data.userId;

        if (data.api === 'mates-take/overview' || data.api === 'keyword-research') {
          console.log(`[API-LOG] ${data.api}: Ingesting to Metronome with event_type:`, data.api, '(will be normalized in metronome-service)');
        }

        await metronomeService.ingestEvent({
          organization_id: data.organizationId,
          customer_id: billingCustomerId,
          event_type: data.api,
          timestamp: null,
          properties
        });

        if (data.api === 'mates-take/overview' || data.api === 'keyword-research') {
          console.log(`[API-LOG] ${data.api}: Metronome ingest successful`);
        }
      } catch (metronomeError) {
        if (data.api === 'mates-take/overview' || data.api === 'keyword-research') {
          console.error(`[API-LOG] ${data.api}: Metronome ingest error:`, metronomeError?.message, metronomeError);
        }
        // Silently fail - logging should not block the API
      }
    } else if (data.api === 'mates-take/overview' || data.api === 'keyword-research') {
      console.log(`[API-LOG] ${data.api}: Skipping Metronome ingest - conditions not met`);
    }
  } catch (err) {
    // swallow logging errors silently
    if (data.api === 'keyword-sim') {
      console.error('[API-LOG] keyword-sim: Exception in logToFirestoreSafe:', err);
    }
    console.error('[API-LOG] Exception in logToFirestoreSafe:', err.message);
  }
}

function getApiName(req) {
  try {
    const urlPath = (req.originalUrl || req.url || '').split('?')[0] || '';
    let name = urlPath.startsWith('/api/') ? urlPath.slice(5) : urlPath.replace(/^\/+/, '');
    if (name.endsWith('/')) name = name.slice(0, -1);
    return name || 'root';
  } catch (_) {
    return 'unknown';
  }
}

function getFirstFrom(obj, keys) {
  for (const k of keys) {
    const v = obj && obj[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function normalizeId(v) {
  try {
    if (typeof v === 'string') return v.trim().slice(0, 128);
    if (typeof v === 'number') return String(v);
    if (typeof v === 'object') return JSON.stringify(v).slice(0, 128);
    return undefined;
  } catch (_) { return undefined; }
}

function extractIds(req) {
  const sources = [req.query || {}, req.body || {}];
  const candidates = (keys) => {
    for (const src of sources) {
      const val = getFirstFrom(src, keys);
      if (val !== undefined && val !== null && val !== '') return normalizeId(val);
    }
    return undefined;
  };
  const org = candidates(['organizationId', 'orgId', 'organization_id', 'organizationid']);
  const brand = candidates(['brandId', 'brand_id', 'brand']);
  const user = candidates(['userId', 'user_id', 'uid']);
  const out = {};
  if (org) out.organizationId = org;
  if (brand) out.brandId = brand;
  if (user) out.userId = user;
  return out;
}


function withLogging(handler) {
  return async function loggedHandler(req, res) {
    const api = getApiName(req);
    const method = String(req.method || '').toUpperCase();

    // Skip logging for specific APIs (all methods)
    const skipApis = [
      'organizations',
      'users',
      'billing/balance',
      'billing/ingest',
      'billing'
    ];
    const isApiSkipped = skipApis.some(skipApi =>
      api === skipApi || api.startsWith(skipApi + '/')
    );

    const skipByApiAndMethod = (api === 'calendar') || (method === 'GET' && (api === 'image-gen' || api === 'site-audit'));
    const isSkippable = method === 'OPTIONS' || method === 'HEAD' || skipByApiAndMethod || isApiSkipped;

    // Debug log for keyword-sim
    if (api === 'keyword-sim') {
      console.log('[API-LOG] keyword-sim request:', { api, method, isSkippable });
    }

    // Pre-log for meta-ad-sim and image-prompt to cover timeouts/early exits
    let preLogged = false;
    if (!isSkippable && (api === 'meta-ad-sim' || api === 'image-prompt')) {
      const ids = extractIds(req);
      const credits = getCredits(api);
      const payload = { method, api, ...ids, createdAt: admin.firestore.FieldValue.serverTimestamp() };
      if (credits !== undefined) payload.credits = credits;
      // Fire and forget (async but don't block)
      logToFirestoreSafe(payload).catch(() => {});
      preLogged = true;
    }

    // Store original res.json and res.status().json to intercept responses
    const originalJson = res.json.bind(res);
    const originalStatus = res.status.bind(res);
    let statusCode = 200;

    // Override res.status to capture status code
    res.status = function(code) {
      statusCode = code;
      return originalStatus(code);
    };

    // Override res.json to log before sending response
    res.json = async function(data) {
      // Log before sending response (only for successful responses or if not skippable)
      if (!isSkippable && !preLogged && statusCode < 500) {
        const ids = extractIds(req);
        const credits = getCredits(api);
        const payload = {
          method,
          api,
          ...ids,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        if (credits !== undefined) payload.credits = credits;

        // Debug log for keyword-sim
        if (api === 'keyword-sim') {
          console.log('[API-LOG] Logging keyword-sim BEFORE response:', { api, method, ids, credits });
        }

        // Log synchronously (await it before sending response)
        try {
          await logToFirestoreSafe(payload);
          if (api === 'keyword-sim') {
            console.log('[API-LOG] keyword-sim logged successfully');
          }
        } catch (err) {
          if (api === 'keyword-sim') {
            console.error('[API-LOG] Failed to log keyword-sim:', err);
          }
        }
      }

      // Send the response
      return originalJson(data);
    };

    try {
      await handler(req, res);
    } catch (err) {
      // Also log an entry even if it errors
      if (!isSkippable && !preLogged) {
        const ids = extractIds(req);
        const credits = getCredits(api);
        const payload = {
          method,
          api,
          ...ids,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        if (credits !== undefined) payload.credits = credits;
        // Fire and forget
        logToFirestoreSafe(payload).catch(() => {});
      }
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  };
}

module.exports = { withLogging };

