/**
 * @fileoverview Edit Prompt Service - Edit prompt files in the prompts folder
 * @module services/edit-prompt-service
 */

const fs = require('fs');
const path = require('path');

/**
 * Edit a prompt file in the prompts folder
 * @param {Object} params - Parameters for editing the prompt
 * @param {string} params.filename - Exact filename of the .txt file to edit (e.g., 'keyword-prompt.txt')
 * @param {string} params.content - New content to write to the file
 * @returns {Promise<Object>} Result of the edit operation
 */
exports.editPrompt = async ({ filename, content }) => {
  try {
    console.log('Editing prompt file:', filename);

    // Validate required fields
    if (!filename || !content) {
      throw new Error('Filename and content are required');
    }

    // Ensure filename ends with .txt
    if (!filename.endsWith('.txt')) {
      throw new Error('Filename must end with .txt');
    }

    // Construct the full path to the prompts folder
    const promptsDir = path.join(__dirname, '../prompts');
    const filePath = path.join(promptsDir, filename);

    // Validate that the file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File ${filename} does not exist in the prompts folder`);
    }

    // Validate that the file is within the prompts directory (security check)
    const resolvedFilePath = path.resolve(filePath);
    const resolvedPromptsDir = path.resolve(promptsDir);
    
    if (!resolvedFilePath.startsWith(resolvedPromptsDir)) {
      throw new Error('Invalid file path - cannot access files outside prompts directory');
    }

    // Try to write the file
    try {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Successfully updated ${filename}`);

      return {
        success: true,
        filename,
        message: `Successfully updated ${filename}`,
        filePath: resolvedFilePath
      };
    } catch (writeError) {
      // If write fails (e.g., read-only file system), try using Vercel's file system API
      if (writeError.code === 'EROFS' || writeError.message.includes('read-only')) {
        console.log('Read-only file system detected, attempting to use Vercel File System API');
        
        // For now, return instructions on how to handle this
        return {
          success: false,
          filename,
          message: 'File system is read-only. To edit prompt files in production, you need to:',
          instructions: [
            '1. Use Vercel CLI to deploy with updated files',
            '2. Or use Vercel\'s File System API (requires additional setup)',
            '3. Or edit files locally and redeploy',
            '4. Or use a database/external storage solution'
          ],
          error: writeError.message,
          note: 'This is a limitation of serverless environments where the file system is immutable'
        };
      }
      throw writeError;
    }

  } catch (error) {
    console.error('Edit Prompt Service - Error editing prompt:', {
      filename,
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}; 