/**
 * @fileoverview Mate's Take - Overview API
 * Endpoint: POST /api/mates-take/overview
 */

module.exports.config = { maxDuration: 60 };

const fs = require('fs').promises;
const path = require('path');
const { withLogging } = require('../../utils/logging.cjs.js');

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getPrompt() {
  const p = path.join(process.cwd(), 'prompts', 'mates-take', 'overview-prompt.txt');
  return fs.readFile(p, 'utf8');
}

function buildPrompt(template, content) {
  return template.replace(/\$content/g, content || '');
}

module.exports = withLogging(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { content } = req.body || {};
    if (!content || typeof content !== 'string' || content.trim().length < 10) {
      return res.status(400).json({ error: 'content is required and should be a non-empty string' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Server configuration error: Missing OPENAI_API_KEY' });
    }

    const template = await getPrompt();
    const userPrompt = buildPrompt(template, content);

    const response = await Promise.race([
      openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are Mate’s Take, an expert digital marketing analyst.' },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 600
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI API timeout')), 30000))
    ]);

    const text = response.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return res.status(500).json({ error: 'Failed to generate analysis' });
    }

    res.status(200).json({ analysis: text });
  } catch (err) {
    console.error("Mate's Take Overview error:", err?.message || err);
    res.status(500).json({ error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? err?.message : undefined });
  }
});

