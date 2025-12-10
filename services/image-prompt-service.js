/**
 * @fileoverview Image Prompt Service - Generate image generation prompts using OpenAI
 * Includes both text-to-prompt and image-to-prompt functionality
 */

const { OpenAI } = require('openai');
const fs = require('fs').promises;
const path = require('path');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Get the image-to-prompt template from local file
 * @returns {Promise<string>} The prompt template content
 */
async function getImageToPromptTemplate() {
  const localPromptPath = path.join(process.cwd(), 'prompts', 'image-to-prompt.txt');
  try {
    const promptContent = await fs.readFile(localPromptPath, 'utf8');
    console.log('Using local image-to-prompt template from:', localPromptPath);
    return promptContent;
  } catch (err) {
    console.error('Local image-to-prompt template not found at:', localPromptPath);
    throw new Error('Missing prompts/image-to-prompt.txt. Please add the prompt file to proceed.');
  }
}

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

/**
 * Generate a detailed prompt from an image
 * @param {Object} params
 * @param {string} params.imageUrl - URL of the image to analyze
 * @returns {Promise<{ prompt: string, variables: Object }>} Generated prompt and extracted variables
 */
exports.generatePromptFromImage = async ({ imageUrl }) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY');
  }
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error('imageUrl is required and must be a valid URL string');
  }

  // Get the prompt template
  const promptTemplate = await getImageToPromptTemplate();

  const response = await Promise.race([
    openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert image analyst specializing in creating ultra-detailed, professional image generation prompts. Return only valid JSON.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: promptTemplate
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'high'
              }
            }
          ]
        }
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI API timeout (image-to-prompt)')), 60000))
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

  if (!parsed.prompt || !parsed.variables) {
    throw new Error('Invalid JSON structure: missing prompt or variables');
  }

  return {
    prompt: parsed.prompt,
    variables: parsed.variables
  };
};
