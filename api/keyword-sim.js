/**
 * @fileoverview Keyword Simulation API endpoint for Vercel Serverless Functions
 * @module api/keyword-sim
 */

import { generateKeywords } from '../services/keyword-sim-service.js';

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
    // Get request body
    const { 
      name,
      url,
      catalogue,
      brief
    } = req.body;

    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('Missing OPENAI_API_KEY environment variable');
      return res.status(500).json({
        error: 'Server configuration error: Missing API key'
      });
    }

    // Validate required fields
    if (!name || !url) {
      return res.status(400).json({ 
        error: 'Required fields missing. Please provide name and url.' 
      });
    }

    console.log('Keyword Simulation API - Request:', {
      name,
      url,
      catalogueLength: catalogue ? (Array.isArray(catalogue) ? catalogue.length : catalogue.length) : 0,
      briefLength: brief ? brief.length : 0
    });

    // Generate keywords
    const result = await generateKeywords({
      name,
      url,
      catalogue,
      brief
    });

    // Log success
    console.log('Keyword Simulation API - Response generated successfully', {
      tier1Count: result.tier1Keywords?.length || 0,
      tier2Count: result.tier2Keywords?.length || 0,
      tier3Count: result.tier3Keywords?.length || 0,
      productCount: result.productKeywords?.length || 0,
      competitorsCount: result.competitors?.length || 0
    });

    // Set cache headers - longer cache time as SEO keywords don't change frequently
    res.setHeader('Cache-Control', 'private, max-age=86400'); // 24 hours
    
    // Return the result
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in Keyword Simulation API:', error.message, error.stack);
    
    // Return more detailed error response
    return res.status(500).json({
      error: error.message || 'Failed to generate SEO keywords',
      type: error.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
})
