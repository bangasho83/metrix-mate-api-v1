/**
 * @fileoverview Social Insights API - Returns brands for an organization with Facebook/Instagram post counts
 * Endpoint: GET /api/social-insights?organizationId=ORG_ID&from=YYYY-MM-DD&to=YYYY-MM-DD
 */

const { getDefaultDateRange } = require('../utils/date-utils');
const crypto = require('crypto');

const { db, getBrandInfo, getBrandConnection } = require('../services/firebase-service');

// Use the existing meta social service for post counts
const { getFacebookPostsCount, getInstagramPostsCount } = require('../services/meta-social-service');

module.exports.config = { maxDuration: 60 };

// 15-minute in-memory cache
const CACHE = {
  data: {},
  timestamps: {},
  TTL: 15 * 60 * 1000
};

// Fetch brands directly from Firestore (start-from-zero approach)
async function fetchBrandsFromFirestore(organizationId) {
  const snap = await db.collection('brands')
    .where('organizationId', '==', organizationId)
    .limit(500)
    .get();
  const brands = [];
  snap.forEach(doc => {
    const d = doc.data() || {};
    brands.push({ id: doc.id, ...d });
  });
  return brands;
}

// Helper to fetch brands via internal Brands API (keeps auth uniform and leverages its filters)
async function fetchBrands(req, organizationId) {
  const protocol = (req.headers['x-forwarded-proto'] || 'https');
  const host = (req.headers['x-forwarded-host'] || req.headers.host);
  const baseUrl = `${protocol}://${host}`;
  const url = `${baseUrl}/api/brands?organizationId=${encodeURIComponent(organizationId)}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Brands API responded with ${resp.status}`);
  }
  const data = await resp.json();
  return Array.isArray(data?.brands) ? data.brands : [];
}

// Helpers to normalize and extract social IDs from varied brand schemas
const toStrId = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

function extractFromPagesArray(pagesArr, platform) {
  if (!Array.isArray(pagesArr)) return null;
  const match = pagesArr.find(p => ((p.platform || p.type || '') + '').toLowerCase().includes(platform));
  if (!match) return null;
  return toStrId(match.pageId || match.id || match.page_id || match.accountId || match.account_id);
}

function extractSocialIds(b) {
  // PRIORITY: Use connections object (new OAuth-only architecture)
  const connections = b.connections || {};

  // Facebook page ID - prioritize connections.facebook_page
  const fbPageIdFromConnections = connections.facebook_page?.page_id;

  // Instagram account ID - prioritize connections.instagram_page
  const instaPageIdFromConnections = connections.instagram_page?.account_id;

  // Fallback candidates (for backward compatibility with legacy fields)
  const fbCandidates = [
    b.fbPageId, b.facebookPageId, b.facebook_page_id, b.fb_page_id, b.facebookId, b.facebook_id,
    b.facebook?.pageId, b.facebook?.id,
    b.social?.facebook?.pageId, b.social?.facebook?.id,
    b.services?.facebook?.pageId, b.services?.facebook?.id,
    b.meta?.facebook?.pageId, b.meta?.facebook?.id,
    b.accounts?.facebook?.pageId, b.accounts?.facebook?.id
  ];
  const igCandidates = [
    b.instaPageId, b.instagramPageId, b.instagram_page_id, b.insta_page_id, b.instagramId, b.instagram_id,
    b.instagram?.pageId, b.instagram?.id,
    b.social?.instagram?.pageId, b.social?.instagram?.id,
    b.services?.instagram?.pageId, b.services?.instagram?.id,
    b.meta?.instagram?.pageId, b.meta?.instagram?.id,
    b.accounts?.instagram?.pageId, b.accounts?.instagram?.id
  ];
  const fromPagesFb = extractFromPagesArray(b.pages, 'facebook') || extractFromPagesArray(b.socialPages, 'facebook');
  const fromPagesIg = extractFromPagesArray(b.pages, 'instagram') || extractFromPagesArray(b.socialPages, 'instagram');
  const firstTruthy = (arr) => {
    for (const v of arr) { const s = toStrId(v); if (s) return s; }
    return null;
  };
  return {
    fbPageId: fbPageIdFromConnections || firstTruthy([...fbCandidates, fromPagesFb]),
    instaPageId: instaPageIdFromConnections || firstTruthy([...igCandidates, fromPagesIg])
  };

}

function extractMetaGa(b) {
  // PRIORITY: Use connections object (new OAuth-only architecture)
  const connections = b.connections || {};

  // Meta Ads account ID - prioritize connections.meta_ads
  const metaAccountIdFromConnections = connections.meta_ads?.ad_account_id;

  // GA4 property ID - prioritize connections.ga4
  const gaPropertyIdFromConnections = connections.ga4?.property_id;

  // Fallback candidates (for backward compatibility with legacy fields)
  const metaCandidates = [
    b.metaAccountId, b.meta_account_id, b.adAccountId, b.ad_account_id,
    b.meta?.accountId, b.meta?.ads?.accountId, b.accounts?.meta?.accountId,
    b.facebookAdsAccountId, b.facebook_ads_account_id
  ];
  const gaCandidates = [
    b.ga4PropertyId, b.ga_property_id, b.ga4_property_id, b.google_analytics_4_property_id,
    b.ga?.propertyId, b.analytics?.ga4?.propertyId, b.googleAnalytics4PropertyId
  ];
  const firstTruthy = (arr) => {
    for (const v of arr) { const s = toStrId(v); if (s) return s; }
    return null;
  };
  return {
    metaAccountId: metaAccountIdFromConnections || firstTruthy(metaCandidates),
    gaPropertyId: gaPropertyIdFromConnections || firstTruthy(gaCandidates)
  };
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { organizationId, from, to, cache } = req.query || {};
    if (!organizationId) {
      return res.status(400).json({ error: 'Missing required parameter: organizationId' });
    }

    const { fromDate, toDate } = getDefaultDateRange(from, to);

    // Cache key based on org and date range
    const cacheKey = crypto.createHash('md5').update(JSON.stringify({ organizationId, fromDate, toDate })).digest('hex');
    const now = Date.now();

    const bypassCache = (cache === '0');

    if (!bypassCache && CACHE.data[cacheKey] && (now - CACHE.timestamps[cacheKey] < CACHE.TTL)) {
      res.setHeader('X-Cache-Status', 'HIT');
      res.setHeader('X-Cache-Age', `${(now - CACHE.timestamps[cacheKey]) / 1000}s`);
      return res.status(200).json(CACHE.data[cacheKey]);
    } else if (!bypassCache && CACHE.data[cacheKey]) {
      res.setHeader('X-Cache-Status', 'EXPIRED');
    } else if (bypassCache) {
      res.setHeader('X-Cache-Status', 'BYPASS');
    } else {
      res.setHeader('X-Cache-Status', 'MISS');
    }

    // Fetch brands directly from Firestore
    const rawBrands = await fetchBrandsFromFirestore(organizationId);

    // For each brand, try to read fb/insta IDs from many common fields and shapes
    let brands = rawBrands.map((b) => {
      const name = b.client_name || b.brandName || b.name || b.title || 'Unknown Brand';
      const { fbPageId, instaPageId } = extractSocialIds(b);
      const { metaAccountId, gaPropertyId } = extractMetaGa(b);
      const servicesPostsRaw = b?.services?.posts;
      const servicesPosts = (typeof servicesPostsRaw === 'number')
        ? servicesPostsRaw
        : (Number.isFinite(Number(servicesPostsRaw)) ? Number(servicesPostsRaw) : null);
      return {
        id: b.id,
        name,
        fbPageId,
        instaPageId,
        metaAccountId,
        gaPropertyId,
        servicesPosts
      };
    });

    // Remove brands without a Meta Ads account ID
    brands = brands.filter(b => !!b.metaAccountId);

    // Remove brands where services.posts is exactly 0
    brands = brands.filter(b => b.servicesPosts !== 0);


    // Fetch post counts in parallel batches to avoid rate limits
    const results = await Promise.all(brands.map(async (brand) => {
      try {
        // Get brand info to fetch OAuth tokens
        let facebookAccessToken = null;
        let instagramAccessToken = null;

        try {
          // Use centralized utility to extract connections
          const fbConnection = await getBrandConnection(brand.id, 'facebook_page');
          const igConnection = await getBrandConnection(brand.id, 'instagram_page');

          if (fbConnection) {
            facebookAccessToken = fbConnection.access_token;
          }
          if (igConnection) {
            instagramAccessToken = igConnection.access_token;
          }
        } catch (brandError) {
          console.error(`Error fetching brand info for ${brand.id}:`, brandError.message);
        }

        const businessTimezone = brand?.timezone || brand?.services?.timezone || brand?.services?.meta?.timezone || null;
        const [fb, ig] = await Promise.all([
          brand.fbPageId ? getFacebookPostsCount(brand.fbPageId, fromDate, toDate, 0, businessTimezone, { accessToken: facebookAccessToken }) : Promise.resolve({ count: 0 }),
          brand.instaPageId ? getInstagramPostsCount(brand.instaPageId, fromDate, toDate, 0, businessTimezone, { accessToken: instagramAccessToken }) : Promise.resolve({ count: 0 })
        ]);
        return {
          brandId: brand.id,
          brandName: brand.name,
          servicesPosts: brand.servicesPosts,

          data_sources: {
            fb_page_id: brand.fbPageId ? (isNaN(Number(brand.fbPageId)) ? brand.fbPageId : Number(brand.fbPageId)) : null,
            ga_property_id: brand.gaPropertyId || null,
            insta_page_id: brand.instaPageId ? (isNaN(Number(brand.instaPageId)) ? brand.instaPageId : Number(brand.instaPageId)) : null,
            meta_account_id: brand.metaAccountId || null
          },
          facebook: {
            pageId: brand.fbPageId || null,
            posts: fb?.count || 0
          },
          instagram: {
            pageId: brand.instaPageId || null,
            posts: ig?.count || 0
          },
          totalPosts: (fb?.count || 0) + (ig?.count || 0)
        };
      } catch (e) {
        return {
          brandId: brand.id,
          brandName: brand.name,
          facebook: { pageId: brand.fbPageId || null, posts: 0 },
          instagram: { pageId: brand.instaPageId || null, posts: 0 },
          error: e?.message || 'Failed to fetch social posts count'
        };
      }
    }));

    const response = {
      organizationId,
      from: fromDate,
      to: toDate,
      totals: {
        brands: results.length,
        facebookPosts: results.reduce((sum, r) => sum + (r.facebook?.posts || 0), 0),
        instagramPosts: results.reduce((sum, r) => sum + (r.instagram?.posts || 0), 0),
        totalPosts: results.reduce((sum, r) => sum + ((r.facebook?.posts || 0) + (r.instagram?.posts || 0)), 0),
        servicesPosts: results.reduce((sum, r) => sum + (typeof r.servicesPosts === 'number' ? r.servicesPosts : 0), 0)
      },
      brands: results
    };

    if (!bypassCache) {
      CACHE.data[cacheKey] = response;
      CACHE.timestamps[cacheKey] = now;
    }

    // Cache headers (15m, 5m stale)
    if (bypassCache) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=300');
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error('Social Insights API error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to fetch social insights', details: err?.message });
  }
}

