/**
 * @fileoverview Image to Prompt API - Generate detailed prompts from images using OpenAI Vision
 * Endpoint: POST /api/image-to-prompt
 *
 * This endpoint takes an image URL and generates a comprehensive, ultra-detailed prompt
 * that can be used to recreate the image using AI image generation models.
 *
 * @example
 * POST /api/image-to-prompt
 * {
 *   "imageUrl": "https://example.com/image.jpg",
 *   "userId": "user123",
 *   "organizationId": "org456"
 * }
 */

// Vercel function timeout (60s)
module.exports.config = { maxDuration: 60 };

const { generatePromptFromImage } = require('../services/image-prompt-service');
const { withLogging } = require('../utils/logging.cjs.js');

module.exports = withLogging(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      imageUrl,
      image_url,
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

    // Get the image URL from either parameter
    const imgUrl = imageUrl || image_url;

    // Validate required fields
    if (!imgUrl) {
      return res.status(400).json({
        error: 'Missing required field',
        message: 'Please provide imageUrl in the request body',
        example: {
          imageUrl: 'https://example.com/image.jpg',
          userId: 'Optional: user ID',
          organizationId: 'Optional: organization ID'
        }
      });
    }

    // Validate URL format
    try {
      new URL(imgUrl);
    } catch (e) {
      return res.status(400).json({
        error: 'Invalid imageUrl',
        message: 'imageUrl must be a valid URL',
        provided: imgUrl
      });
    }

    console.log('Image to Prompt API - Request:', {
      imageUrl: imgUrl,
      userId: userId || 'Not provided',
      organizationId: organizationId || 'Not provided'
    });

    // Generate the prompt from the image
    const startTime = Date.now();
    const result = await generatePromptFromImage({ imageUrl: imgUrl });
    const generationTime = Date.now() - startTime;

    console.log('Image to Prompt API - Generated successfully:', {
      promptLength: result.prompt.length,
      variablesCount: Object.keys(result.variables || {}).length,
      generationTimeMs: generationTime
    });

    // Build response
    const response = {
      success: true,
      prompt: result.prompt,
      variables: result.variables,
      imageUrl: imgUrl,
      ...(userId && { userId }),
      ...(organizationId && { organizationId })
    };

    console.log('Image to Prompt API - Response summary:', {
      success: true,
      promptLength: response.prompt.length,
      totalTimeMs: generationTime
    });

    return res.status(200).json(response);

  } catch (error) {
    console.error('Image to Prompt API - Error:', {
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });

    return res.status(500).json({
      error: 'Failed to generate prompt from image',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

