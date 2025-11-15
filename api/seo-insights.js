/**
 * @fileoverview SEO Insights API - Returns brands for an organization with counts of pages and backlinks in a date range
 * Endpoint: GET /api/seo-insights
 */

import { getBrandsByOrganizationId, getPagesCountByBrandId, getBacklinksCountByBrandId } from '../services/firebase-service.js';
import { getDefaultDateRange } from '../utils/date-utils.js';

// Remove posts, campaigns, and monthly budget from services in responses
const sanitizeServices = (s) => {
  if (!s || typeof s !== 'object') return s || null;
  const { posts, campaigns, monthly_budget, monthlyBudget, newsletter, fee, ...rest } = s;
  return Object.keys(rest).length ? rest : null;
};

export const config = { maxDuration: 60 };
// Simple in-memory cache for brands by organization to reduce Firestore load
const BRANDS_CACHE = { data: {}, timestamps: {}, TTL: 15 * 60 * 1000 };
const getCachedBrands = (orgId) => {
  const now = Date.now();
  const ts = BRANDS_CACHE.timestamps[orgId];
  if (BRANDS_CACHE.data[orgId] && ts && (now - ts < BRANDS_CACHE.TTL)) {
    return BRANDS_CACHE.data[orgId];
  }
  return null;
};
const setCachedBrands = (orgId, brands) => {
  BRANDS_CACHE.data[orgId] = brands;
  BRANDS_CACHE.timestamps[orgId] = Date.now();
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBrandsWithRetry(organizationId, retries = 3) {
  const delays = [200, 600, 1200];
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await getBrandsByOrganizationId(organizationId);
    } catch (e) {
      const msg = e?.message || '';
      if ((msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) && attempt < retries) {
        await sleep(delays[Math.min(attempt, delays.length - 1)]);
        continue;
      }
      throw e;
    }
  }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const debug = (req.query && req.query.debug === '1');

  try {
    const { organizationId, from, to, seo } = req.query || {};
    if (!organizationId) {
      return res.status(400).json({ error: 'Missing required parameter: organizationId' });
    }

    const { fromDate, toDate } = getDefaultDateRange(from, to);

    // Pull brands via Brands API, hardcoding seo=Onpage/Offpage as requested
    let brands = [];
    const seoParam = 'Onpage/Offpage';
    const cacheKey = `${organizationId}:${seoParam}`;
    const cached = getCachedBrands(cacheKey);
    if (cached) {
      brands = cached;
    } else {
      try {
        const protocol = (req.headers['x-forwarded-proto'] || 'https');
        const host = (req.headers['x-forwarded-host'] || req.headers.host);
        const baseUrl = `${protocol}://${host}`;
        const url = `${baseUrl}/api/brands?organizationId=${encodeURIComponent(organizationId)}&seo=${encodeURIComponent(seoParam)}`;
        const resp = await fetch(url);
        if (!resp.ok) {
          throw new Error(`Brands API responded with ${resp.status}`);
        }
        const data = await resp.json();
        const rawBrands = Array.isArray(data?.brands) ? data.brands : [];
        brands = rawBrands.map((b) => ({
          id: b.id,
          name: b.client_name || b.brandName || b.name || b.title || 'Unknown Brand',
          services: sanitizeServices(b.services || null),
          website: b.website || null
        }));
        setCachedBrands(cacheKey, brands);
      } catch (e) {
        if (debug) {
          return res.status(500).json({ error: 'Failed to fetch brands', details: e?.message });
        }
        throw e;
      }
    }

    // For each brand, count pages and backlinks in date range (no GA4)
    const results = await Promise.all(brands.map(async (b) => {
      try {
        const [pagesCount, backlinksCount] = await Promise.all([
          getPagesCountByBrandId(b.id, null, fromDate, toDate),
          getBacklinksCountByBrandId(b.id, null, fromDate, toDate)
        ]);
        return {
          brandId: b.id,
          brandName: b.name,
          pagesCount,
          backlinksCount,
          services: sanitizeServices(b.services || null),
          website: b.website || null
        };
      } catch (e) {
        return {
          brandId: b.id,
          brandName: b.name,
          pagesCount: 0,
          backlinksCount: 0,
          services: sanitizeServices(b.services || null),
          website: b.website || null
        };
      }
    }));

    return res.status(200).json({
      organizationId,
      from: fromDate,
      to: toDate,
      totals: {
        brands: results.length,
        pages: results.reduce((sum, r) => sum + (r.pagesCount || 0), 0),
        backlinks: results.reduce((sum, r) => sum + (r.backlinksCount || 0), 0)
      },
      brands: results
    });
  } catch (err) {
    console.error('SEO Insights API error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to fetch seo insights', details: debug ? (err?.message || String(err)) : undefined });
  }
}

