/**
 * @fileoverview HTML Scraper API endpoint for Vercel Serverless Functions
 * @module api/html-scraper
 */

const { scrapeUrl } = require('../services/html-scraper-service');

// Default response for errors
const DEFAULT_RESPONSE = {
  url: '',
  metaTags: {
    title: '',
    description: '',
    canonical: ''
  },
  ogTags: {
    'og:title': '',
    'og:description': '',
    'og:image': '',
    'og:url': '',
    'og:type': '',
    'og:site_name': ''
  },
  twitterTags: {
    'twitter:title': '',
    'twitter:description': '',
    'twitter:image': '',
    'twitter:card': '',
    'twitter:site': '',
    'twitter:creator': ''
  },
  headings: {
    h1: [],
    h2: [],
    h3: []
  },
  trackingScripts: {
    ga4: { detected: false, id: null, details: [] },
    googleTagManager: { detected: false, id: null, details: [] },
    metaPixel: { detected: false, id: null, details: [] },
    googleAdsConversion: { detected: false, id: null, details: [] }
  },
  structuredData: {
    jsonLd: { detected: false, items: [] },
    microdata: { detected: false, itemTypes: [] },
    rdfa: { detected: false, types: [] }
  },
  error: 'Failed to scrape URL'
};

const { withLogging } = require('../utils/logging.cjs.js');

module.exports = withLogging(async (req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Get URL from query parameters
  const { url } = req.query;
  
  if (!url) {
    console.log('Missing URL parameter');
    return res.status(400).json({
      ...DEFAULT_RESPONSE,
      error: 'URL parameter is required'
    });
  }

  try {
    // Validate URL format
    const urlObj = new URL(url);
    
    console.log('HTML Scraper API - Request parameters:', {
      url: urlObj.toString()
    });

    // Scrape the URL
    const data = await scrapeUrl(urlObj.toString());
    
    console.log('HTML Scraper API - Response Summary:', {
      url: data.url,
      title: data.metaTags.title,
      h1Count: data.headings.h1.length,
      h2Count: data.headings.h2.length,
      h3Count: data.headings.h3.length,
      trackingScripts: {
        ga4: data.trackingScripts.ga4.detected,
        gtm: data.trackingScripts.googleTagManager.detected,
        metaPixel: data.trackingScripts.metaPixel.detected,
        googleAds: data.trackingScripts.googleAdsConversion.detected
      },
      structuredData: {
        jsonLd: data.structuredData.jsonLd.detected,
        microdata: data.structuredData.microdata.detected,
        rdfa: data.structuredData.rdfa.detected
      }
    });

    // Set cache headers
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error in HTML Scraper API:', error.message);
    
    // Return error response
    return res.status(error.code === 'ENOTFOUND' ? 404 : 500).json({
      ...DEFAULT_RESPONSE,
      url: url,
      error: error.message
    });
  }
});
