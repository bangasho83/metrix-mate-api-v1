/**
 * @fileoverview Image Prompt Service - Generate image generation prompts using OpenAI
 */

const { OpenAI } = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate image prompts
 * @param {Object} params
 * @param {string} params.creativeGuideline - Overall creative direction
 * @param {string} params.brandGuideline - Brand guidelines and constraints
 * @param {number} params.noOfCreatives - Number of prompts to generate
 * @returns {Promise<{ prompts: string[] }>} Generated prompts
 */
exports.generateImagePrompts = async ({ creativeGuideline, brandGuideline, noOfCreatives }) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY');
  }
  if (!creativeGuideline || !brandGuideline) {
    throw new Error('creativeGuideline and brandGuideline are required');
  }
  const count = Math.min(Math.max(parseInt(noOfCreatives, 10) || 1, 1), 10);

  const system = 'You are a world-class creative director specializing in writing concise, vivid image-generation prompts for professional ad creatives. Return only valid JSON.';

  const user = `Create ${count} distinct, high-quality prompts for an image generation model.

Creative Guideline:
${creativeGuideline}

Brand Guideline:
${brandGuideline}

Constraints:
- Each prompt must be a single paragraph, 1-3 sentences, rich in visual detail.
- Avoid vendor/model-specific tokens; pure descriptive language only.
- Include subject, environment, lighting, composition, and mood cues.
- No camera brand names or copyrighted names unless provided.
- No "logo" unless explicitly instructed.

Output JSON schema:
{
  "prompts": ["string", ...] // exactly ${count} items
}`;

  const response = await Promise.race([
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.7,
      max_tokens: 1200,
      response_format: { type: 'json_object' }
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI API timeout (prompts)')), 45000))
  ]);

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error('Failed to parse JSON response');
  }

  if (!parsed.prompts || !Array.isArray(parsed.prompts)) {
    throw new Error('Invalid JSON structure: missing prompts array');
  }

  // Normalize prompts into strings and trim
  const prompts = parsed.prompts
    .map(p => (typeof p === 'string' ? p : String(p)))
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, count);

  if (prompts.length !== count) {
    // If the model produced fewer, attempt to top up with variations from the last prompt
    const last = prompts[prompts.length - 1] || '';
    while (prompts.length < count) prompts.push(last);
  }

  return { prompts };
};

