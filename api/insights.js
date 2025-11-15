/**
 * @fileoverview Insights API - Returns brands for an organization with counts of pages and backlinks in a date range
 * Endpoint: POST /api/insights
 */

import { getBrandsByOrganizationId, getPagesCountByBrandId, getBacklinksCountByBrandId } from '../services/firebase-service.js';
import { getDefaultDateRange } from '../utils/date-utils.js';

export const config = { maxDuration: 60 };
// Simple in-memory cache for brands by organization to reduce Firestore load
const BRANDS_CACHE = { data: {}, timestamps: {}, TTL: 10 * 60 * 1000 };
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

async function processInBatches(items, batchSize, handler, startTime, maxMs) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const res = await Promise.all(batch.map(handler));
    results.push(...res);
    if (startTime && maxMs && (Date.now() - startTime > maxMs)) {
      break; // stop early and return partial results
    }
    // small pause to avoid bursts
    await sleep(50);
  }
  return results;
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
    const { organizationId, from, to } = req.query || {};
    if (!organizationId) {
      return res.status(400).json({ error: 'Missing required parameter: organizationId' });
    }

    const { fromDate, toDate } = getDefaultDateRange(from, to);

    // Pull brands for the organization
    let brands = [];
    // Use cache first
    const cached = getCachedBrands(organizationId);
    if (cached) {
      brands = cached;
    } else {
      try {
        brands = await fetchBrandsWithRetry(organizationId, 3);
        setCachedBrands(organizationId, brands);
      } catch (e) {
        if (debug) {
          return res.status(500).json({ error: 'Failed to fetch brands', details: e?.message });
        }
        throw e;
      }
    }

    // For each brand, count pages in date range (no GA4)
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
          services: b.services || null,
          website: b.website || null
        };
      } catch (e) {
        return {
          brandId: b.id,
          brandName: b.name,
          pagesCount: 0,
          backlinksCount: 0,
          services: b.services || null,
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
    console.error('Insights API error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to fetch insights', details: debug ? (err?.message || String(err)) : undefined });
  }
}

