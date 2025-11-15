/**
 * @fileoverview Prompt Manager Service - Manage prompt templates via environment variables
 * @module services/prompt-manager-service
 */

/**
 * Get a prompt template by name
 * @param {string} promptName - Name of the prompt (e.g., 'keyword', 'ad', 'calendar')
 * @returns {string} The prompt template content
 */
exports.getPrompt = (promptName) => {
  try {
    // Try to get from environment variable first
    const envKey = `PROMPT_${promptName.toUpperCase()}`;
    const envContent = process.env[envKey];
    
    if (envContent) {
      console.log(`Using environment variable for prompt: ${promptName}`);
      return envContent;
    }

    // Fallback to file system (for local development)
    const fs = require('fs');
    const path = require('path');
    
    const filePath = path.join(__dirname, `../prompts/${promptName}-prompt.txt`);
    
    if (fs.existsSync(filePath)) {
      console.log(`Using file system for prompt: ${promptName}`);
      return fs.readFileSync(filePath, 'utf8');
    }

    // Return default template if nothing found
    console.log(`No prompt found for: ${promptName}, using default`);
    return getDefaultPrompt(promptName);
    
  } catch (error) {
    console.error('Error getting prompt:', error);
    return getDefaultPrompt(promptName);
  }
};

/**
 * Update a prompt template
 * @param {Object} params - Parameters for updating the prompt
 * @param {string} params.promptName - Name of the prompt (e.g., 'keyword', 'ad', 'calendar')
 * @param {string} params.content - New content for the prompt
 * @returns {Promise<Object>} Result of the update operation
 */
exports.updatePrompt = async ({ promptName, content }) => {
  try {
    console.log('Updating prompt:', promptName);

    // Validate required fields
    if (!promptName || !content) {
      throw new Error('Prompt name and content are required');
    }

    // In serverless environment, we can't write to files
    // Instead, we return the content that should be set as an environment variable
    const envKey = `PROMPT_${promptName.toUpperCase()}`;
    
    return {
      success: true,
      promptName,
      message: `Prompt content prepared for ${promptName}`,
      environmentVariable: envKey,
      content: content,
      instruction: `Set the environment variable ${envKey} with the provided content to update this prompt in production`
    };

  } catch (error) {
    console.error('Error updating prompt:', error);
    throw error;
  }
};

/**
 * Get default prompt templates
 * @param {string} promptName - Name of the prompt
 * @returns {string} Default prompt template
 */
function getDefaultPrompt(promptName) {
  const defaults = {
    keyword: `Generate SEO keywords for \${name}, a restaurant at \${url}.
Include the following categories:
- Tier 1 Keywords (broad terms)
- Tier 2 Keywords (mid-level terms)
- Tier 3 Keywords (long-tail terms)
- Product Keywords
- Competitors
Format as structured sections with clear headings.`,
    
    ad: `Create compelling ad copy for \${name}, a restaurant at \${url}.
Focus on:
- Unique selling propositions
- Call-to-action phrases
- Emotional triggers
- Local appeal
Format as multiple ad variations.`,
    
    calendar: `Generate content calendar ideas for \${name}, a restaurant at \${url}.
Include:
- Weekly themes
- Content types (posts, stories, reels)
- Engagement strategies
- Seasonal content
Format as a structured calendar.`
  };

  return defaults[promptName] || `Default template for ${promptName} prompt.`;
} 