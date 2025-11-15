/**
 * @fileoverview Keyword Simulation Service - Generate SEO keywords using OpenAI
 * @module services/keyword-sim-service
 */

const { OpenAI } = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});



// Fetch the prompt template from URL
async function getPromptTemplate() {
  try {
    const promptUrl = 'https://raw.githubusercontent.com/tossdownadmin/prompts-repo/refs/heads/main/metrixmate/keyword-planner.txt';
    const response = await fetch(promptUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const promptContent = await response.text();
    return promptContent;
  } catch (error) {
    console.error('Error fetching keyword prompt template from URL:', error.message);
    throw new Error(`Failed to fetch keyword prompt template from GitHub: ${error.message}`);
  }
}

/**
 * Generate SEO keywords for a food/restaurant business
 * @param {Object} params - Parameters for keyword generation
 * @param {string} params.name - Brand name
 * @param {string} params.url - Website URL
 * @param {string|Array} params.catalogue - List of products or menu items
 * @param {string} params.brief - Brand brief
 * @returns {Promise<Object>} Generated SEO keywords
 */
exports.generateKeywords = async ({ name, url, catalogue, brief }) => {
  try {
    console.log('Generating SEO keywords with parameters:', { name, url });

    // Validate required fields
    if (!name || !url) {
      throw new Error('Brand name and website URL are required');
    }

    // Format catalogue if it's an array
    let catalogueText = catalogue;
    if (Array.isArray(catalogue)) {
      catalogueText = catalogue.join('\n');
    }

    // Get prompt template and fill it with values
    const promptTemplate = await getPromptTemplate();
    const prompt = promptTemplate
      .replace(/\${name}/g, name)
      .replace(/\${url}/g, url)
      .replace(/\${catalogueText}/g, catalogueText)
      .replace(/\${brief \|\| 'Not provided'}/g, brief || 'Not provided');

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are an expert SEO strategist for food and restaurant businesses. Provide detailed keyword analysis in the exact format requested." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2500,
      response_format: { type: "text" }
    });

    // Extract the content from the response
    const content = response.choices[0].message.content.trim();

    // Parse the content into structured data
    const result = parseKeywordResponse(content, { name, url, catalogue: catalogueText, brief });

    return result;
  } catch (error) {
    console.error('Keyword Simulation Service - Error generating keywords:', {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Parse the keyword response from OpenAI into structured data
 * @param {string} content - Raw content from OpenAI
 * @param {Object} params - Original parameters
 * @returns {Object} Structured keyword data
 */
function parseKeywordResponse(content, params) {
  try {
    // Initialize result structure
    const result = {
      tier1Keywords: [],
      tier2Keywords: [],
      tier3Keywords: [],
      productKeywords: [],
      competitors: [],
      keywordBlock: '',
      raw: content,
      params
    };

    // Handle case where content has ** formatting instead of plain text headers
    const normalizedContent = content.replace(/\*\*([^*]+)\*\*/g, '$1');

    // Extract Tier 1 Keywords - handle both formats
    let tier1Match = normalizedContent.match(/Tier 1 Keywords:?\s*\n([\s\S]*?)(?=\n\s*Tier 2 Keywords|$)/i);
    if (!tier1Match) {
      // Try alternative format with ** markers
      tier1Match = content.match(/\*\*Tier 1 Keywords:?\*\*\s*\n([\s\S]*?)(?=\n\s*\*\*Tier 2 Keywords|$)/i);
    }
    
    if (tier1Match && tier1Match[1]) {
      result.tier1Keywords = tier1Match[1].split(/,|\n/)
        .map(k => k.trim())
        .filter(k => k && !k.startsWith('[') && !k.endsWith(']'));
    }

    // Extract Tier 2 Keywords - handle both formats
    let tier2Match = normalizedContent.match(/Tier 2 Keywords:?\s*\n([\s\S]*?)(?=\n\s*Tier 3 Keywords|$)/i);
    if (!tier2Match) {
      // Try alternative format with ** markers
      tier2Match = content.match(/\*\*Tier 2 Keywords:?\*\*\s*\n([\s\S]*?)(?=\n\s*\*\*Tier 3 Keywords|$)/i);
    }
    
    if (tier2Match && tier2Match[1]) {
      result.tier2Keywords = tier2Match[1].split(/,|\n/)
        .map(k => k.trim())
        .filter(k => k && !k.startsWith('[') && !k.endsWith(']'));
    }

    // Extract Tier 3 Keywords - handle both formats
    let tier3Match = normalizedContent.match(/Tier 3 Keywords:?\s*\n([\s\S]*?)(?=\n\s*Cleaned Product Keywords|$)/i);
    if (!tier3Match) {
      // Try alternative format with ** markers
      tier3Match = content.match(/\*\*Tier 3 Keywords:?\*\*\s*\n([\s\S]*?)(?=\n\s*\*\*Cleaned Product Keywords|$)/i);
    }
    
    if (tier3Match && tier3Match[1]) {
      result.tier3Keywords = tier3Match[1].split(/,|\n/)
        .map(k => k.trim())
        .filter(k => k && !k.startsWith('[') && !k.endsWith(']'));
    }

    // Extract Cleaned Product Keywords - handle both formats
    let productMatch = normalizedContent.match(/Cleaned Product Keywords:?\s*\n([\s\S]*?)(?=\n\s*Top Local Competitors|$)/i);
    if (!productMatch) {
      // Try alternative format with ** markers
      productMatch = content.match(/\*\*Cleaned Product Keywords:?\*\*\s*\n([\s\S]*?)(?=\n\s*\*\*Top Local Competitors|$)/i);
    }
    
    if (productMatch && productMatch[1]) {
      const productLine = productMatch[1].trim();
      if (productLine.startsWith('[') && productLine.endsWith(']')) {
        // Handle format: [keyword1, keyword2, ...]
        result.productKeywords = productLine.slice(1, -1).split(',').map(k => k.trim());
      } else {
        // Handle format: keyword1, keyword2, ... or line by line
        result.productKeywords = productLine.split(/,|\n/)
          .map(k => k.trim())
          .filter(k => k && !k.startsWith('[') && !k.endsWith(']'));
      }
    }

    // Extract Competitors - handle both formats
    let competitorsMatch = normalizedContent.match(/Top Local Competitors Reviewed:?\s*\n([\s\S]*?)(?=\n\s*Final Keyword Block|$)/i);
    if (!competitorsMatch) {
      // Try alternative format with ** markers
      competitorsMatch = content.match(/\*\*Top Local Competitors Reviewed:?\*\*\s*\n([\s\S]*?)(?=\n\s*\*\*Final Keyword Block|$)/i);
    }
    
    if (competitorsMatch && competitorsMatch[1]) {
      result.competitors = competitorsMatch[1].split('\n')
        .map(c => c.trim().replace(/^-\s*/, ''))
        .filter(c => c && !c.startsWith('[') && !c.endsWith(']'));
    }

    // Extract Final Keyword Block - handle both formats
    let keywordBlockMatch = normalizedContent.match(/Final Keyword Block:?\s*\n([\s\S]*?)(?=$)/i);
    if (!keywordBlockMatch) {
      // Try alternative format with ** markers
      keywordBlockMatch = content.match(/\*\*Final Keyword Block:?\*\*\s*\n([\s\S]*?)(?=$)/i);
    }
    
    if (keywordBlockMatch && keywordBlockMatch[1]) {
      const blockLine = keywordBlockMatch[1].trim();
      if (blockLine.startsWith('[') && blockLine.endsWith(']')) {
        // Handle format: [keyword1, keyword2, ...]
        result.keywordBlock = blockLine.slice(1, -1);
      } else {
        result.keywordBlock = blockLine;
      }
    }

    // If we still have empty arrays but raw content exists, try a more aggressive approach
    if (result.tier1Keywords.length === 0 && result.tier2Keywords.length === 0 && content.length > 100) {
      console.log('Using fallback parsing method for keyword response');
      
      // Split content by double newlines to find sections
      const sections = content.split(/\n\n+/);
      
      for (const section of sections) {
        if (section.includes('Tier 1') || section.includes('**Tier 1')) {
          const lines = section.replace(/\*\*Tier 1[^*]*\*\*:?|\bTier 1[^:]*:/, '').trim().split(/,|\n/);
          result.tier1Keywords = lines.map(k => k.trim()).filter(k => k && !k.startsWith('[') && !k.endsWith(']'));
        } else if (section.includes('Tier 2') || section.includes('**Tier 2')) {
          const lines = section.replace(/\*\*Tier 2[^*]*\*\*:?|\bTier 2[^:]*:/, '').trim().split(/,|\n/);
          result.tier2Keywords = lines.map(k => k.trim()).filter(k => k && !k.startsWith('[') && !k.endsWith(']'));
        } else if (section.includes('Tier 3') || section.includes('**Tier 3')) {
          const lines = section.replace(/\*\*Tier 3[^*]*\*\*:?|\bTier 3[^:]*:/, '').trim().split(/,|\n/);
          result.tier3Keywords = lines.map(k => k.trim()).filter(k => k && !k.startsWith('[') && !k.endsWith(']'));
        } else if (section.includes('Product Keywords') || section.includes('**Product Keywords')) {
          const lines = section.replace(/\*\*[^*]*Product[^*]*\*\*:?|\b[^:]*Product[^:]*:/, '').trim().split(/,|\n/);
          result.productKeywords = lines.map(k => k.trim()).filter(k => k && !k.startsWith('[') && !k.endsWith(']'));
        } else if (section.includes('Competitors') || section.includes('**Competitors')) {
          const lines = section.replace(/\*\*[^*]*Competitors[^*]*\*\*:?|\b[^:]*Competitors[^:]*:/, '').trim().split('\n');
          result.competitors = lines.map(c => c.trim().replace(/^-\s*/, '')).filter(c => c && !c.startsWith('[') && !c.endsWith(']'));
        } else if (section.includes('Keyword Block') || section.includes('**Keyword Block')) {
          result.keywordBlock = section.replace(/\*\*[^*]*Keyword Block[^*]*\*\*:?|\b[^:]*Keyword Block[^:]*:/, '').trim();
        }
      }
    }

    return result;
  } catch (error) {
    console.error('Error parsing keyword response:', error);
    return {
      error: 'Failed to parse keyword response',
      raw: content,
      params
    };
  }
}
