/**
 * @fileoverview Image Prompt API - Generate image generation prompts using OpenAI
 * Endpoint: POST /api/image-prompt

 */

// Vercel function timeout (60s)
module.exports.config = { maxDuration: 60 };


const { generateImagePrompts } = require('../services/image-prompt-service');

const { withLogging } = require('../utils/logging.cjs.js');

module.exports = withLogging(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { creativeGuideline, brandGuideline, noOfCreatives, aspectRatio, model, imageUrl, image_url, userId, organizationId } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Server configuration error: Missing OPENAI_API_KEY' });
    }

    if (!creativeGuideline || !brandGuideline) {
      return res.status(400).json({ error: 'Missing required fields: creativeGuideline, brandGuideline' });
    }

    const result = await generateImagePrompts({ creativeGuideline, brandGuideline, noOfCreatives });
    if (aspectRatio) result.aspectRatio = aspectRatio;
    if (model) result.model = model;
    const imgUrl = imageUrl || image_url;
    if (imgUrl) result.imageUrl = imgUrl;
    if (userId) result.userId = userId;
    if (organizationId) result.organizationId = organizationId;
    // Echo back guidelines for convenience
    result.creativeGuideline = creativeGuideline;
    result.brandGuideline = brandGuideline;
    return res.status(200).json(result);
  } catch (err) {
    console.error('Image Prompt API error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to generate image prompts', details: process.env.NODE_ENV === 'development' ? err?.message : undefined });
  }
});

