/**
 * @fileoverview Generate Image Prompt API - Generate detailed design briefs from simple campaign ideas
 * Endpoint: POST /api/gen-image-prompt
 *
 * This endpoint takes a simple campaign idea text and expands it into a comprehensive design brief
 * suitable for briefing a creative team or generating image prompts.
 *
 * @example
 * POST /api/gen-image-prompt
 * {
 *   "text": "Need a highly creative post for halloween for mcdonalds"
 * }
 */

// Vercel function timeout (60s)
module.exports.config = { maxDuration: 60 };

const { generateCampaignBrief, generateImagePromptFromBrief } = require('../services/campaign-brief-service');
const { withLogging } = require('../utils/logging.cjs.js');

module.exports = withLogging(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      message: 'This endpoint only accepts POST requests'
    });
  }

  try {
    const {
      text,
      campaignIdea,
      existing_guide,
      existingGuide,
      userId,
      organizationId
    } = req.body || {};

    // Check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: 'Server configuration error',
        message: 'Missing OPENAI_API_KEY'
      });
    }

    // Get the campaign idea from either 'text' or 'campaignIdea'
    const idea = text || campaignIdea;
    const existingPrompt = existing_guide || existingGuide;

    // Validate required fields
    if (!idea) {
      return res.status(400).json({
        error: 'Missing required field',
        message: 'Please provide text in the request body',
        example: {
          text: 'Need a highly creative post for halloween for mcdonalds',
          existing_guide: 'Optional: existing prompt to apply feedback to'
        }
      });
    }

    console.log('Generate Image Prompt API - Request:', {
      text: idea,
      hasExistingGuide: !!existingPrompt,
      userId: userId || 'Not provided',
      organizationId: organizationId || 'Not provided'
    });

    // Generate the campaign brief
    const startTime = Date.now();
    const result = await generateCampaignBrief({
      campaignIdea: idea,
      brandName: null,
      industry: null,
      existingGuide: existingPrompt
    });

    const briefGenerationTime = Date.now() - startTime;

    console.log('Generate Image Prompt API - Brief generated successfully:', {
      briefLength: result.brief.length,
      generationTimeMs: briefGenerationTime
    });

    // Build response - return prompt and success
    const response = {
      success: true,
      prompt: result.brief
    };

    console.log('Generate Image Prompt API - Response summary:', {
      success: true,
      promptLength: response.prompt.length,
      totalTimeMs: briefGenerationTime
    });

    console.log('Generate Image Prompt API - Full Response:', JSON.stringify(response, null, 2));

    return res.status(200).json(response);

  } catch (error) {
    console.error('Generate Image Prompt API - Error:', {
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });

    return res.status(500).json({
      error: 'Failed to generate image prompt brief',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

