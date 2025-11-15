/**
 * @fileoverview Edit Prompt API endpoint for Vercel Serverless Functions
 * @module api/edit-prompt
 */

import { editPrompt } from '../services/edit-prompt-service.js';

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get request body
    const { 
      filename,
      content
    } = req.body;

    // Validate required fields
    if (!filename || !content) {
      return res.status(400).json({ 
        error: 'Required fields missing. Please provide filename and content.' 
      });
    }

    console.log('Edit Prompt API - Request:', {
      filename,
      contentLength: content.length
    });

    // Edit the prompt file
    const result = await editPrompt({
      filename,
      content
    });

    // Log success
    console.log('Edit Prompt API - File updated successfully', {
      filename: result.filename,
      success: result.success
    });

    // Return the result
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in Edit Prompt API:', error.message, error.stack);
    
    // Return more detailed error response
    return res.status(500).json({
      error: error.message || 'Failed to edit prompt file',
      type: error.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
} 