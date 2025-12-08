/**
 * @fileoverview Keyword Research API endpoint for Vercel Serverless Functions
 * @module api/keyword-research
 */

import { getKeywordSearchVolume } from '../services/dataforseo-service.js';
import logging from '../utils/logging.cjs.js';
const { withLogging } = logging;

export default withLogging(async function handler(req, res) {
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
    const { keywords, location_code, language_code, cache } = req.body;

    // Validate required fields
    if (!Array.isArray(keywords) || keywords.length === 0 || !location_code || !language_code) {
      return res.status(400).json({
        error: 'Required fields missing. Please provide keywords (array), location_code, and language_code.'
      });
    }

    // Process keywords to handle priority markers (*)
    // Create mapping to preserve original keywords with * prefix
    const keywordMapping = keywords.map(kw => {
      const keywordStr = String(kw).trim();
      const isPriority = keywordStr.startsWith('*');
      const cleanKeyword = isPriority ? keywordStr.substring(1).trim() : keywordStr;

      return {
        original: keywordStr,
        clean: cleanKeyword,
        isPriority: isPriority
      };
    });

    // Extract clean keywords for DataForSEO API
    const cleanKeywords = keywordMapping.map(k => k.clean);

    console.log('[Keyword Research] Processing keywords:', {
      total: keywords.length,
      priority: keywordMapping.filter(k => k.isPriority).length,
      regular: keywordMapping.filter(k => !k.isPriority).length,
      originalKeywords: keywords,
      cleanKeywords: cleanKeywords
    });

    // Call the DataForSEO service with clean keywords
    const result = await getKeywordSearchVolume({
      keywords: cleanKeywords,
      location_code,
      language_code
    });

    // Enhance results with priority information
    if (result && result.result && Array.isArray(result.result)) {
      result.result = result.result.map(item => {
        // Find the mapping for this keyword
        const mapping = keywordMapping.find(k => k.clean === item.keyword);

        return {
          ...item,
          original_keyword: mapping?.original || item.keyword,
          is_priority: mapping?.isPriority || false
        };
      });
    }

    // Set cache headers: 24 hours by default, or no-store if cache=0
    if (cache === 0) {
      res.setHeader('Cache-Control', 'no-store');
    } else {
      res.setHeader('Cache-Control', 'private, max-age=86400'); // 24 hours
    }

    // Return the enhanced result
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in Keyword Research API:', error.message, error.stack);
    return res.status(500).json({
      error: error.message || 'Failed to fetch keyword search volume',
      type: error.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
})