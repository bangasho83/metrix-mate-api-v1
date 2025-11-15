/**
 * @fileoverview Meta Ad Simulation Service - Generate ad campaign structures using OpenAI
 * @module services/meta-ad-sim-service
 */

const { OpenAI } = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Get the prompt template strictly from local file (no remote fallback)
async function getPromptTemplate() {
  const fs = require('fs').promises;
  const path = require('path');
  const localPromptPath = path.join(process.cwd(), 'prompts', 'meta-ad-prompt.txt');
  try {
    const promptContent = await fs.readFile(localPromptPath, 'utf8');
    console.log('Using local prompt template from:', localPromptPath);
    return promptContent;
  } catch (err) {
    console.error('Local prompt template not found at:', localPromptPath);
    throw new Error('Missing prompts/meta-ad-prompt.txt. Please add the prompt file to proceed.');
  }
}

// Fill template with values
function fillPromptTemplate(template, adBrief) {
  return template
    .replace(/\$\{adBrief\.businessName\}/g, adBrief.businessName || 'Not specified')
    .replace(/\$\{adBrief\.industry\}/g, adBrief.industry || 'Not specified')
    .replace(/\$\{adBrief\.objective\}/g, adBrief.objective || 'Not specified')
    .replace(/\$\{adBrief\.budget \|\| 'Not specified'\}/g, adBrief.budget || 'Not specified')
    .replace(/\$\{adBrief\.callToAction \|\| 'Not specified'\}/g, adBrief.callToAction || 'Not specified')
    .replace(/\$\{adBrief\.landingPage \|\| 'Not specified'\}/g, adBrief.landingPage || 'Not specified')
    .replace(/\$\{adBrief\.website \|\| 'Not provided'\}/g, adBrief.website || 'Not provided')
    .replace(/\$\{adBrief\.clientBrief \|\| 'Not specified'\}/g, adBrief.clientBrief || 'Not specified')
    .replace(/\$\{adBrief\.campaignBrief \|\| 'Not specified'\}/g, adBrief.campaignBrief || 'Not specified')
    .replace(/\$\{adBrief\.adSetCount \|\| 2\}/g, adBrief.adSetCount || 2)
    .replace(/\$\{adBrief\.adsPerAdSet \|\| 3\}/g, adBrief.adsPerAdSet || 3)
    .replace(/\$\{adBrief\.age \|\| 'Not specified'\}/g, adBrief.age || 'Not specified')
    .replace(/\$\{adBrief\.gender \|\| 'Not specified'\}/g, adBrief.gender || 'Not specified')
    .replace(/\$\{adBrief\.location \|\| 'Not specified'\}/g, adBrief.location || 'Not specified');
}

// Helper: sanitize model output into stricter JSON text
function sanitizeToJSON(text) {
  if (!text) return '';
  let s = String(text).trim();
  // Strip markdown code fences
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  // Normalize quotes and dashes and NBSP
  s = s
    .replace(/[\u201C\u201D]/g, '"') // curly double quotes → straight
    .replace(/[\u2018\u2019]/g, "'") // curly single quotes → straight
    .replace(/[\u2013\u2014]/g, '-')   // en/em dashes → hyphen
    .replace(/\u00A0/g, ' ')           // non-breaking space → normal space
    .replace(/[\u2028\u2029]/g, '');  // line separators → remove
  return s.trim();
}

// Helper: extract the first top-level JSON object by balancing braces
function extractFirstJSONObject(text) {
  if (!text) return null;
  const s = String(text);
  const start = s.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = false; }
      continue;
    } else {
      if (ch === '"') { inString = true; continue; }
      if (ch === '{') { depth++; }
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return s.slice(start, i + 1);
        }
      }
    }
  }
  return null;
}


/**
 * Generate a Meta Ads campaign structure based on user input
 * @param {Object} adBrief - The ad brief from the user
 * @param {string} adBrief.businessName - Name of the business
 * @param {string} [adBrief.industry] - Industry or business category (optional)
 * @param {string} adBrief.objective - Campaign objective (awareness, consideration, conversion)
 * @param {string} adBrief.budget - Budget information
 * @param {string} adBrief.callToAction - Desired call to action
 * @param {string} adBrief.landingPage - Landing page URL or description
 * @param {string} adBrief.clientBrief - Additional details or requirements from the client
 * @param {string} adBrief.campaignBrief - Campaign-specific brief and requirements
 * @param {number} adBrief.adSetCount - Number of ad sets to generate
 * @param {number} adBrief.adsPerAdSet - Number of ads to generate per ad set
 * @returns {Promise<Object>} Generated ad campaign structure in YAML format
 */
exports.generateAdCampaign = async (adBrief) => {
  try {
    console.log('Generating Meta Ad campaign with brief:', adBrief);

    // Validate required fields
    const requiredFields = ['businessName', 'objective'];
    for (const field of requiredFields) {
      if (!adBrief[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Set defaults for optional numeric parameters
    const adSetCount = adBrief.adSetCount || 2;
    const adsPerAdSet = adBrief.adsPerAdSet || 3;

    // Get prompt template and fill it with values
    const promptTemplate = await getPromptTemplate();
    const prompt = fillPromptTemplate(promptTemplate, {
      ...adBrief,
      adSetCount,
      adsPerAdSet
    });

    // Call OpenAI API with timeout protection (45s)
    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are an expert Meta Ads campaign strategist. Output only YAML following the provided structure. Keep content concise." },
          { role: "user", content: prompt }
        ],
        temperature: 0.25,
        max_tokens: 1800,
        response_format: { type: "text" }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI API timeout (campaign)')), 45000))
    ]);

    // Extract the YAML from the response and clean it
    let yamlContent = response.choices[0].message.content.trim();

    // Remove any markdown code block indicators if they exist
    yamlContent = yamlContent.replace(/^```yaml\n/, '').replace(/\n```$/, '');

    // Log success
    console.log('Successfully generated Meta Ad campaign YAML');

    // Return the YAML content
    return {
      yaml: yamlContent,
      brief: adBrief
    };
  } catch (error) {
    console.error('Error generating Meta Ad campaign:', error.message);
    throw error;
  }
};

/**
 * Generate ad creative variations based on campaign brief
 * @param {Object} campaignBrief - The campaign brief
 * @param {number} variations - Number of variations to generate (default: 3)
 * @param {boolean} includeCarousel - Whether to include carousel ad format (default: true)
 * @returns {Promise<Object>} Generated ad creative variations
 */
exports.generateAdCreatives = async (campaignBrief, variations = 3, includeCarousel = true) => {
  try {
    console.log('Generating Meta Ad creatives with brief:', campaignBrief);

    // Get prompt template and fill it with values
    const promptTemplate = await getPromptTemplate();
    const prompt = fillPromptTemplate(promptTemplate, {
      ...campaignBrief,
      variations,
      includeCarousel
    });

    // Call OpenAI API with timeout protection (45s)
    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are an expert Meta Ads creative designer. Output only YAML. Keep content concise." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1600,
        response_format: { type: "text" }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI API timeout (creatives)')), 45000))
    ]);

    // Extract the YAML from the response
    const yamlContent = response.choices[0].message.content.trim();

    // Log success
    console.log('Successfully generated Meta Ad creatives YAML');

    // Return the YAML content
    return {
      yaml: yamlContent,
      brief: campaignBrief
    };
  } catch (error) {
    console.error('Error generating Meta Ad creatives:', error.message);
    throw error;
  }
};

/**
 * Generate a structured Meta Ads campaign using OpenAI's structured output feature
 * @param {Object} adBrief - The ad brief from the user
 * @returns {Promise<Object>} Generated ad campaign structure as a JSON object
 */
exports.generateStructuredAdCampaign = async (adBrief) => {
  try {
    console.log('Generating structured Meta Ad campaign with brief:', adBrief);

    // Validate required fields
    const requiredFields = ['businessName', 'objective'];
    for (const field of requiredFields) {
      if (!adBrief[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Set defaults for optional numeric parameters
    const adSetCount = Math.min(adBrief.adSetCount || 2, 2); // Limit to max 2 ad sets
    const adsPerAdSet = Math.min(adBrief.adsPerAdSet || 2, 2); // Limit to max 2 ads per set

    // Get prompt template and fill it with values
    const promptTemplate = await getPromptTemplate();
    const prompt = fillPromptTemplate(promptTemplate, {
      ...adBrief,
      adSetCount,
      adsPerAdSet
    });

    // Call OpenAI API with minimal settings and timeout protection (45s)
    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o", // Use GPT-4.0 for better quality
        messages: [
          {
            role: "system",
            content: `You are a Meta Ads expert. You MUST create exactly ${adSetCount} ad sets with exactly ${adsPerAdSet} ads per set. Follow the user's instructions precisely. Output only valid JSON.`
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.25,
        max_tokens: 1800,
        response_format: { type: "json_object" }
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI API timeout (structured)')), 45000))
    ]);

    // Extract and sanitize JSON from the response
    let raw = response.choices[0].message.content;
    raw = sanitizeToJSON(raw);

    // Try parsing directly; if it fails, attempt to extract the first JSON object
    let campaignStructure;
    try {
      campaignStructure = JSON.parse(raw);
    } catch (e) {
      const extracted = extractFirstJSONObject(raw);
      if (!extracted) throw e;
      campaignStructure = JSON.parse(extracted);
    }

    // Defensive: ensure arrays present
    if (campaignStructure && campaignStructure.ad_sets) {
      campaignStructure.ad_sets = campaignStructure.ad_sets.filter(Boolean);
      for (const set of campaignStructure.ad_sets) {
        if (set && Array.isArray(set.ads)) {
          set.ads = set.ads.filter(Boolean);
        }
      }
    }


    // Log success
    console.log('Successfully generated structured Meta Ad campaign');

    // Return the structured campaign
    return {
      campaign: campaignStructure,
      brief: adBrief
    };
  } catch (error) {
    console.error('Error generating structured Meta Ad campaign:', error.message);

    throw error;
  }
};


