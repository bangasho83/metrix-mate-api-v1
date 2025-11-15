
const { OpenAI } = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Helpers: sanitize large text inputs (strip HTML, collapse whitespace, truncate)
function sanitizeText(input, maxLen = 1500) {
  if (!input) return '';
  let s = String(input);
  s = s.replace(/<[^>]*>/g, ' ');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > maxLen) s = s.slice(0, maxLen) + '…';
  return s;
}


// Get the prompt template strictly from local file (no remote fetch)
async function getPromptTemplate() {
  const fs = require('fs').promises;
  const path = require('path');
  const localPromptPath = path.join(process.cwd(), 'prompts', 'calendar-sim-prompt.txt');
  try {
    const promptContent = await fs.readFile(localPromptPath, 'utf8');
    console.log('Using local calendar prompt template from:', localPromptPath);
    return promptContent;
  } catch (error) {
    console.error('Local calendar prompt template not found at:', localPromptPath);
    throw new Error('Missing prompts/calendar-sim-prompt.txt. Please add the prompt file to proceed.');
  }
}

// Fill the prompt template with actual values (supports nested like contentDistribution.productPercentage)
function fillPromptTemplate(template, vars) {
  return template.replace(/\$\{([^}]+)\}/g, (_, expr) => {
    try {
      const path = expr.trim().split('.');
      let val = vars;
      for (const p of path) {
        if (val == null) return '';
        val = val[p];
      }
      return val !== undefined && val !== null ? String(val) : '';
    } catch {
      return '';
    }
  });
}

/**
 * Generate a social media calendar using OpenAI
 * @param {Object} params - Calendar generation parameters
 * @returns {Promise<string}} Generated calendar table as a string
 */
exports.generateCalendar = async function({
  brandName,
  website,
  productsInFocus,
  events,
  brandBrief,
  noOfPosts,
  postsPerWeek,
  startingDate,
  contentDistribution
}) {
  try {
    console.log('Starting calendar generation for:', brandName, 'with', noOfPosts, 'posts');

    // Get prompt template from local file
      // Sanitize potentially large inputs to keep the prompt small and fast
      const safeBrandBrief = sanitizeText(brandBrief, 2000);
      const safeEvents = sanitizeText(events, 1200);

    const promptTemplate = await getPromptTemplate();

    if (!promptTemplate || promptTemplate.trim() === '') {
      throw new Error('Failed to load calendar prompt template');
    }

    console.log('Prompt template loaded, length:', promptTemplate.length);
    console.log('Prompt template preview:', promptTemplate.substring(0, 200));

    // Calculate calendar duration based on posts and posts per week
    const postsPerWeekNum = postsPerWeek || 7;
    const finalNoOfPosts = Math.min(12, Math.max(1, parseInt(noOfPosts, 10) || 3)); // Use provided noOfPosts (1..12), fallback to 3 if invalid
    const calendarDuration = Math.ceil(finalNoOfPosts / postsPerWeekNum) * 7; // Convert to days

    // Fill the prompt template with variables mapped to expected template variables
    const prompt = fillPromptTemplate(promptTemplate, {
      brandName,
      website,
      productsInFocus: productsInFocus || 'General products and services',
      brandBrief: safeBrandBrief || 'Professional brand focused on quality and customer satisfaction',
      noOfPosts: finalNoOfPosts,
      postsPerWeek: postsPerWeekNum,
      startingDate: startingDate || new Date().toISOString().split('T')[0],
      contentDistribution, // pass as object to support nested placeholders
      events: safeEvents
    });

    console.log('Final prompt length:', prompt.length);
    console.log('Final prompt preview:', prompt.substring(0, 300));

    // Add explicit instructions for formatting (align with local prompt columns)
    const systemPrompt = `You are a Social Media Strategist and AI assistant.
Output ONLY a markdown table with these columns, in order:
Date | Platform (use "Meta" for Facebook & Instagram) | Content Format | Type (Product | Engagement | Sale) | Title | Caption | Hashtags | Design Brief / Visual Concept | Ad Spend | Newsletter (Y/N).
Include a header row and a separator row using --- under each column. Do not include any prose before or after the table.
Produce exactly ${finalNoOfPosts} rows (not counting the header).
Hard constraints per cell:
- Single line per cell (no line breaks). Never output raw pipe characters inside cells; use the character ¦ instead of | when needed
- Caption: maximum 220 characters, avoid filler and corporate boilerplate; write crisp, vivid copy.
- Hashtags: thoughtful mix of branded/niche/trending; keep concise (<= 8 hashtags).
- Design Brief / Visual Concept: maximum 180 characters; specify subject, composition, mood, palette, and lighting concisely.
- Push originality: strong hooks, sensory language, vivid specifics; avoid clichés and repetition across rows.
Do NOT wrap the table in code fences.`;


    // Formatter: build a clean, parseable markdown table with 10 columns and exactly expectedRows rows when possible
    function buildCleanTable(raw, expectedRows) {
      try {
        let s = (raw || '').replace(/```(?:markdown|md)?/gi, '').trim();
        s = s.replace(/\r/g, '');
        const HEADER = '| Date | Platform | Content Format | Type | Title | Caption | Hashtags | Design Brief / Visual Concept | Ad Spend | Newsletter (Y/N) |';
        const SEP = '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';
        const lines = s.split('\n').map(l => l.trim()).filter(Boolean);
        const rows = [];
        for (const line of lines) {
          // Skip separator rows
          if (/^\|?\s*-{3,}\s*(\|\s*-{3,}\s*)+\|?$/.test(line)) continue;
          // Skip any header line
          if (/^(\|\s*)?date\s*\|/i.test(line)) continue;
          if (line.includes('|')) {
            // Parse cells by pipe and clean
            let parts = line.split('|').map(t => t.trim());
            if (parts.length && parts[0] === '') parts.shift();
            if (parts.length && parts[parts.length - 1] === '') parts.pop();
            parts = parts.map(cell => cell.replace(/\|/g, '¦').replace(/\s+/g, ' ').trim());
            if (parts.length < 10) {
              while (parts.length < 10) parts.push('');
            } else if (parts.length > 10) {
              const head = parts.slice(0, 9);
              const tail = parts.slice(9).join(' ');
              parts = [...head, tail];
            }
            // Enforce concise, valid cells
            const clamp = (s, n) => {
              s = (s || '').toString().trim();
              return s.length > n ? s.slice(0, n).trim() : s;
            };
            // Defaults & normalization
            if (!parts[1]) parts[1] = 'Meta';
            if (!parts[2]) parts[2] = 'Image';
            const allowedTypes = new Set(['Product','Engagement','Sale']);
            const t = (parts[3] || '').toString().trim();
            parts[3] = allowedTypes.has(t) ? t : 'Engagement';
            // Title (<=100 chars)
            parts[4] = clamp(parts[4], 100);
            // Caption (<=220 chars)
            parts[5] = clamp(parts[5], 220);
            // Hashtags: keep first 8 tokens
            const tags = (parts[6] || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 8);
            parts[6] = tags.join(' ');
            // Design Brief (<=180 chars)
            parts[7] = clamp(parts[7], 180);
            // Ad Spend (integer, default 0)
            const adSpend = parseInt((parts[8] || '0').toString().replace(/[^\d]/g, ''), 10);
            parts[8] = isNaN(adSpend) ? '0' : adSpend.toString();
            // Normalize Newsletter cell to Y/N
            const lastIdx = 9;
            const yn = (parts[lastIdx] || '').toString().trim().toUpperCase();
            parts[lastIdx] = /^Y/.test(yn) ? 'Y' : 'N';
            rows.push(parts);
            if (rows.length >= expectedRows) break;
          }
        }
        if (rows.length === 0) return s; // fallback to raw if parsing failed
        // If the model returned fewer rows than requested, pad with sensible variations
        if (rows.length < expectedRows) {
          const last = rows[rows.length - 1] || ['', 'Meta', 'Image', 'Engagement', 'Placeholder title', 'Placeholder caption', '#brand', 'Placeholder visual concept', '0', 'N'];
          const clamp = (s, n) => {
            s = (s || '').toString().trim();
            return s.length > n ? s.slice(0, n).trim() : s;
          };
          for (let i = rows.length; i < expectedRows; i++) {
            const clone = [...last];
            const altIndex = i - rows.length + 1;
            // Tweak title to avoid identical rows and clamp
            clone[4] = clamp(((clone[4] || 'Title') + ` (Alt ${altIndex})`), 100);
            // Tweak caption to avoid identical rows and clamp
            clone[5] = clamp(((clone[5] || 'Caption') + ` (Alt ${altIndex})`), 220);
            // Limit hashtags to first 8 tokens
            const tags = (clone[6] || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 8);
            clone[6] = tags.join(' ');
            // Clamp design brief
            clone[7] = clamp(clone[7], 180);
            // Ensure ad spend is valid integer
            const adSpend = parseInt((clone[8] || '0').toString().replace(/[^\d]/g, ''), 10);
            clone[8] = isNaN(adSpend) ? '0' : adSpend.toString();
            // Ensure newsletter normalized
            const yn = (clone[9] || '').toString().trim().toUpperCase();
            clone[9] = /^Y/.test(yn) ? 'Y' : 'N';
            rows.push(clone);
          }
        }
        const table = [HEADER, SEP, ...rows.map(c => `| ${c.join(' | ')} |`)].join('\n');
        return table;
      } catch (e) {
        return raw; // on any failure, return original content
      }
    }

    // Smaller token budget and retry strategy for timeouts
    const completionCall = () => openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.65,
      top_p: 0.9,
      presence_penalty: 0.6,
      frequency_penalty: 0.4,
      max_tokens: 1100,
      response_format: { type: 'text' }
    });

    async function callWithTimeout(ms) {
      return Promise.race([
        completionCall(),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`OpenAI API timeout after ${ms} ms`)), ms))
      ]);
    }

    let response;
    try {
      // First attempt: generous timeout for high-creativity, high-token generation
      response = await callWithTimeout(200000); // 200s
    } catch (e) {
      if (/timeout/i.test(e.message)) {
        console.warn('Calendar generation: first attempt timed out. Retrying with reduced tokens...');
        // Reduce tokens further for retry
        const completionCallSmaller = () => openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          temperature: 0.50,
          top_p: 0.85,
          presence_penalty: 0.4,
          frequency_penalty: 0.3,
          max_tokens: 900,
          response_format: { type: 'text' }
        });
        response = await Promise.race([
          completionCallSmaller(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI API timeout after 80 seconds (retry)')), 80000))
        ]);
      } else {
        throw e;
      }
    }


    console.log('Calling OpenAI API for calendar generation...');

    // Call OpenAI API with timeout handling
    // Use the response produced by the earlier call/ retry logic (response is already set)
    // This block is no longer needed and is removed to avoid double calls.

    // Get the response content
    const content = response.choices[0].message.content.trim();

    // Pass through formatter to enforce clean table with exactly finalNoOfPosts rows
    const cleaned = buildCleanTable(content, finalNoOfPosts);

    // Validate that the response contains a markdown table (after cleaning)
    if (!cleaned.includes('|') || !cleaned.includes('---')) {
      console.error('Invalid calendar format received from OpenAI');
      throw new Error('Generated calendar is not in the expected markdown table format');
    }

    // Return the generated table (as string)

    // Normalize common markdown variations
    let normalized = cleaned
      .replace(/```(?:markdown|md)?/gi, '')
      .trim();

    // If the model omitted the --- row but included pipes, try to add a minimal separator under header
    if (normalized.includes('|') && !normalized.includes('---')) {
      const lines = normalized.split('\n');
      if (lines.length > 1) {
        const header = lines[0];
        const colCount = (header.match(/\|/g) || []).length - 1; // exclude edges
        const sepCells = Array.from({ length: colCount }, () => '---');
        const sepRow = `| ${sepCells.join(' | ')} |`;
        if (!lines[1] || !/\|/.test(lines[1])) {
          lines.splice(1, 0, sepRow);
          normalized = lines.join('\n');
        }
      }
    }

    // Use normalized output for validation and return
    const output = normalized;

    // Validate that the response contains a markdown table
    if (!output.includes('|') || !output.includes('---')) {
      console.error('Invalid calendar format received from OpenAI');
      throw new Error('Generated calendar is not in the expected markdown table format');
    }

    // Return the generated table (as string)
    return output;
  } catch (error) {
    console.error('Calendar generation error:', error.message);
    throw new Error(`Failed to generate calendar: ${error.message}`);
  }
};
