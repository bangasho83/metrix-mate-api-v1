/**
 * @fileoverview Meta Ad Simulation API endpoint for Vercel Serverless Functions
 * @module api/meta-ad-sim
 */

const { generateAdCampaign, generateAdCreatives, generateStructuredAdCampaign } = require('../services/meta-ad-sim-service');
// Increase Vercel Serverless Function max duration to reduce 504 timeouts




// Helpers: sanitize large HTML briefs to keep prompts small and fast
function sanitizeText(input, maxLen = 2000) {
  if (!input) return '';
  let s = String(input);
  // Strip HTML tags
  s = s.replace(/<[^>]*>/g, ' ');
  // Decode common entities
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  // Truncate
  if (s.length > maxLen) s = s.slice(0, maxLen) + '…';
  return s;
}

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

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Normalize and extract request body (accept multiple casing variants)
    const body = req.body || {};
    const lc = {}; Object.keys(body || {}).forEach(k => { lc[k.toLowerCase()] = body[k]; });
    const pick = (...names) => {
      for (const n of names) { const v = body[n]; if (v !== undefined && v !== null && v !== '') return v; }
      for (const n of names) { const v = lc[n.toLowerCase()]; if (v !== undefined && v !== null && v !== '') return v; }
      return undefined;
    };

    const action = pick('action') || 'generateCampaign';
    const format = pick('format');
    const variations = pick('variations');
    const includeCarousel = pick('includeCarousel', 'includecarousel');

    const businessName = pick('businessName', 'business_name', 'brandName', 'brand_name', 'businessname');
    const industry = pick('industry');
    const objective = pick('objective'); // can be lowercase, pass through
    const budget = pick('budget');
    const callToAction = pick('callToAction', 'call_to_action', 'calltoaction');
    const landingPage = pick('landingPage', 'landing_page', 'landingpage');
    let clientBrief = pick('clientBrief', 'client_brief', 'clientbrief');
    let campaignBrief = pick('campaignBrief', 'campaign_brief', 'campaignbrief');

    // Sanitize and trim large briefs (HTML -> text, collapse whitespace, truncate)
    clientBrief = sanitizeText(clientBrief, 2000);
    campaignBrief = sanitizeText(campaignBrief, 1200);
    const age = pick('age');
    const gender = pick('gender');
    const location = pick('location');
    const adSetCountRaw = pick('adSetCount', 'adsetcount');
    const adsPerAdSetRaw = pick('adsPerAdSet', 'adsperadset');

    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('Missing OPENAI_API_KEY environment variable');
      return res.status(500).json({ error: 'Server configuration error: Missing API key' });
    }

    // Parse numbers (but also validate below as required)
    const adSetCount = adSetCountRaw !== undefined ? parseInt(adSetCountRaw, 10) : undefined;
    const adsPerAdSet = adsPerAdSetRaw !== undefined ? parseInt(adsPerAdSetRaw, 10) : undefined;

    // Validate required fields per request
    const required = [
      ['businessName', businessName],
      ['objective', objective],
      ['budget', budget],
      ['callToAction', callToAction],
      ['adSetCount', adSetCount],
      ['adsPerAdSet', adsPerAdSet]
    ];
    const missing = required.filter(([_, v]) => v === undefined || v === null || v === '' || (typeof v === 'number' && !Number.isFinite(v))).map(([k]) => k);
    if (missing.length) {
      return res.status(400).json({
        error: 'Required fields missing',
        missing,
        note: 'Provide businessName, objective, budget, callToAction, adSetCount, adsPerAdSet'
      });
    }

    // Construct the brief object from normalized parameters
    const brief = {
      businessName,
      industry,
      objective,
      budget,
      callToAction,
      landingPage,
      clientBrief,
      campaignBrief,
      adSetCount,
      adsPerAdSet,
      age,
      gender,
      location
    };

    console.log('Meta Ad Simulation API - Request:', {
      action: action || 'generateCampaign',
      format: format || 'yaml',
      brief: {
        businessName: brief.businessName,
        industry: brief.industry,
        objective: brief.objective,
        adSetCount: brief.adSetCount,
        adsPerAdSet: brief.adsPerAdSet
      }
    });

    let result;

    // Determine which action to perform
    switch (action) {
      case 'generateCreatives':
        // Generate ad creatives
        result = await generateAdCreatives(
          brief,
          parseInt(variations) || 3,
          includeCarousel !== false
        );
        break;

      case 'generateCampaign':
      default:
        // Check if structured JSON format is requested
        if (format === 'json') {
          result = await generateStructuredAdCampaign(brief);
        } else {
          // Default to YAML format
          result = await generateAdCampaign(brief);
        }
        break;
    }

    // Log success
    console.log('Meta Ad Simulation API - Response generated successfully');

    // Set cache headers - short cache time as these are personalized responses
    res.setHeader('Cache-Control', 'private, max-age=0');

    // Return the result
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in Meta Ad Simulation API:', error.message, error.stack);

    // Return more detailed error response
    return res.status(500).json({
      error: error.message || 'Failed to generate Meta Ad simulation',
      type: error.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Vercel/Node function config (CJS)
module.exports.config = { maxDuration: 60 };
