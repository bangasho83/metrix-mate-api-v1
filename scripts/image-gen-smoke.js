// Simple smoke test for api/image-gen without starting Express
const handler = require('../api/image-gen');

async function run() {
  process.env.FAL_KEY = process.env.FAL_KEY || 'REPLACE_ME';
  const req = {
    method: 'POST',
    body: {
      prompt: 'A photorealistic product shot of a vintage flour bag on a 1960s kitchen counter',
      aspect_ratio: '1:1',
      num_images: 1
    },
    query: {}
  };

  const res = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { console.log('STATUS', this.statusCode); console.log(JSON.stringify(payload, null, 2)); },
    end() { console.log('END'); }
  };

  await handler(req, res);
}

run().catch(err => { console.error(err); process.exit(1); });

