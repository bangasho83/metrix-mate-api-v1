/**
 * @fileoverview Campaign Brief Service - Generate detailed design briefs from simple campaign ideas
 */

const { OpenAI } = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate a detailed campaign brief from a simple idea
 * @param {Object} params
 * @param {string} params.campaignIdea - Simple campaign idea or brief description
 * @param {string} params.brandName - Optional brand name
 * @param {string} params.industry - Optional industry/category
 * @param {string} params.existingGuide - Optional existing guide to apply feedback to
 * @returns {Promise<{ brief: string, sections: Object }>} Generated campaign brief
 */
exports.generateCampaignBrief = async ({ campaignIdea, brandName, industry, existingGuide }) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY');
  }
  if (!campaignIdea) {
    throw new Error('campaignIdea is required');
  }

  // If there's an existing guide, use a different prompt for applying feedback
  if (existingGuide) {
    const systemPrompt = `You are a creative strategist. Update the design brief based on feedback while maintaining structure.
Include: Campaign Title, Objective, Key Message, Visual Direction, Design Elements, Text Layout, Tone & Emotion, Designer Notes.
Return as markdown with clear headers.`;

    const userPrompt = `Here is the existing design brief:

${existingGuide}

Please apply the following feedback/changes:
${campaignIdea}

Return the updated brief with all sections, incorporating the requested changes.`;

    try {
      const response = await Promise.race([
        openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 1500
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('OpenAI API timeout (campaign brief update)')), 45000)
        )
      ]);

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      // Parse the content into sections
      const sections = parseBriefSections(content);

      return {
        brief: content,
        sections,
        metadata: {
          campaignIdea,
          brandName: brandName || null,
          industry: industry || null,
          updatedFromExisting: true,
          generatedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('Error updating campaign brief:', error);
      throw error;
    }
  }

  // Original flow for creating a new brief
  const systemPrompt = `You are a creative director. Expand the campaign idea into a design brief with: Campaign Title, Objective, Key Message, Visual Direction, Design Elements, Text Layout, Tone & Emotion, Designer Notes.
Be strategic and actionable. Return as markdown with clear headers.`;

  let userPrompt = `Campaign Idea: ${campaignIdea}`;

  if (brandName) {
    userPrompt += `\nBrand: ${brandName}`;
  }

  if (industry) {
    userPrompt += `\nIndustry: ${industry}`;
  }

  userPrompt += `\n\nPlease create a comprehensive design brief for this campaign.`;

  try {
    const response = await Promise.race([
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1500
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('OpenAI API timeout (campaign brief)')), 45000)
      )
    ]);

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    // Parse the content into sections
    const sections = parseBriefSections(content);

    return {
      brief: content,
      sections,
      metadata: {
        campaignIdea,
        brandName: brandName || null,
        industry: industry || null,
        generatedAt: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error('Error generating campaign brief:', error);
    throw error;
  }
};

/**
 * Parse the brief content into structured sections
 * @param {string} content - The full brief content
 * @returns {Object} Parsed sections
 */
function parseBriefSections(content) {
  const sections = {
    campaignTitle: '',
    objective: '',
    keyMessage: '',
    visualDirection: '',
    designElements: '',
    textLayoutGuidance: '',
    toneAndEmotion: '',
    designerNotes: ''
  };

  // Extract sections using regex patterns
  const patterns = {
    campaignTitle: /\*\*Campaign Title\*\*[:\s—-]*(.+?)(?=\n\*\*|$)/is,
    objective: /\*\*Objective\*\*[:\s—-]*(.+?)(?=\n\*\*|$)/is,
    keyMessage: /\*\*Key Message\*\*[:\s—-]*(.+?)(?=\n\*\*|$)/is,
    visualDirection: /\*\*Visual Direction\*\*[:\s—-]*(.+?)(?=\n\*\*|$)/is,
    designElements: /\*\*Design Elements\*\*[:\s—-]*(.+?)(?=\n\*\*|$)/is,
    textLayoutGuidance: /\*\*Text Layout Guidance\*\*[:\s—-]*(.+?)(?=\n\*\*|$)/is,
    toneAndEmotion: /\*\*Tone & Emotion\*\*[:\s—-]*(.+?)(?=\n\*\*|$)/is,
    designerNotes: /\*\*Optional Notes for Designer\*\*[:\s—-]*(.+?)(?=\n\*\*|$)/is
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = content.match(pattern);
    if (match && match[1]) {
      sections[key] = match[1].trim();
    }
  }

  return sections;
}

/**
 * Generate a concise image prompt from the campaign brief
 * @param {Object} params
 * @param {string} params.brief - The full campaign brief
 * @param {Object} params.sections - Parsed sections from the brief
 * @returns {Promise<{ prompt: string }>} Generated image prompt
 */
exports.generateImagePromptFromBrief = async ({ brief, sections }) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY');
  }
  if (!brief && !sections) {
    throw new Error('Either brief or sections is required');
  }

  const systemPrompt = `You are a world-class creative director specializing in writing concise, vivid image-generation prompts for professional ad creatives.

Take the detailed campaign brief provided and distill it into a single, powerful image generation prompt.

The prompt should:
- Be 2-4 sentences maximum
- Include key visual elements, composition, lighting, mood, and color palette
- Be rich in descriptive detail but concise
- Focus on what should be visible in the image
- Avoid vendor-specific tokens or camera brand names
- Use pure descriptive language

Return only the image prompt, nothing else.`;

  const userPrompt = brief || `
Campaign Title: ${sections.campaignTitle || 'N/A'}
Visual Direction: ${sections.visualDirection || 'N/A'}
Design Elements: ${sections.designElements || 'N/A'}
Tone & Emotion: ${sections.toneAndEmotion || 'N/A'}

Create a concise image generation prompt from this brief.`;

  try {
    const response = await Promise.race([
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 300
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('OpenAI API timeout (image prompt)')), 30000)
      )
    ]);

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    return {
      prompt: content.trim()
    };

  } catch (error) {
    console.error('Error generating image prompt from brief:', error);
    throw error;
  }
};

