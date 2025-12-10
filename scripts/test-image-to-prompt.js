/**
 * Test script for image-to-prompt API endpoint
 * Usage: node scripts/test-image-to-prompt.js
 */

const handler = require('../api/image-to-prompt');

async function run() {
  // Ensure OpenAI API key is set
  if (!process.env.OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY environment variable is not set');
    process.exit(1);
  }

  // Test image URL - using a sample product image
  const testImageUrl = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800';

  console.log('=== Testing Image-to-Prompt API ===');
  console.log('Image URL:', testImageUrl);
  console.log('');

  const req = {
    method: 'POST',
    body: {
      imageUrl: testImageUrl,
      userId: 'test-user-123',
      organizationId: 'test-org-456'
    }
  };

  const res = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      console.log('=== RESPONSE ===');
      console.log('Status Code:', this.statusCode);
      console.log('');
      
      if (payload.error) {
        console.error('ERROR:', payload.error);
        console.error('Message:', payload.message);
        if (payload.details) {
          console.error('Details:', payload.details);
        }
      } else {
        console.log('Success:', payload.success);
        console.log('');
        console.log('Generated Prompt:');
        console.log('─'.repeat(80));
        console.log(payload.prompt);
        console.log('─'.repeat(80));
        console.log('');
        console.log('Extracted Variables:');
        console.log(JSON.stringify(payload.variables, null, 2));
        console.log('');
        console.log('Prompt Length:', payload.prompt.length, 'characters');
      }
    },
    end() {
      console.log('Request completed');
    }
  };

  try {
    await handler(req, res);
  } catch (err) {
    console.error('Unhandled error:', err);
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

