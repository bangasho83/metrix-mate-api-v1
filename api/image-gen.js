/**
 * @fileoverview Image Generation API using FAL AI (Imagen 4)
 * Endpoint: POST /api/image-gen (generate)
 *           GET  /api/image-gen?organizationId=ORG_ID (list generated images from creativeGen)
 */

// Prepare to load @fal-ai/client (supports both CJS require and ESM dynamic import)
let fal; // will resolve lazily inside handler if needed
const { db } = require('../services/firebase-service');

// Vercel function timeout (180s for high-resolution image generation)
module.exports.config = { maxDuration: 180 };

// Helper: timeout wrapper for long-running external calls
function withTimeout(promise, ms, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms))
  ]);
}

// Helper: persist generated images to Firestore creativeGen
async function saveGeneratedImagesToFirestore({
  db,
  items,
  metadata
}) {
  try {
    const batch = db.batch();
    const col = db.collection('creativeGen');

    const now = new Date();
    const createdAt = (globalThis?.admin && globalThis.admin.firestore?.Timestamp)
      ? globalThis.admin.firestore.Timestamp.fromDate(now)
      : now;

    items.forEach((it, idx) => {
      const docRef = col.doc();
      batch.set(docRef, {
        aspectRatio: metadata.aspectRatio || metadata.aspect_ratio || null,
        brandGuideline: metadata.brandGuideline || '',
        brandId: metadata.brandId || null,
        createdAt,
        creativeGuideline: metadata.creativeGuideline || '',
        imageIndex: typeof it.index === 'number' ? it.index : idx,
        imageUrl: it.url || it.image_url || it.imageUrl || null,
        model: metadata.modelName || null,
        organizationId: metadata.organizationId || null,
        prompt: metadata.prompt || '',
        totalImagesInBatch: metadata.totalImagesInBatch || items.length,
        userId: metadata.userId || null
      });
    });

    await batch.commit();
    return true;
  } catch (e) {
    console.error('Failed to save images to creativeGen:', e.message);
    return false;
  }
}


const { withLogging } = require('../utils/logging.cjs.js');
const metronomeService = require('../services/metronome-service');

// Helper: Get billingCustomerId from organization with caching
const BILLING_CACHE = { data: {}, ts: {}, TTL: 15 * 60 * 1000 };
async function getBillingCustomerId(organizationId) {
  if (!organizationId) return undefined;
  const now = Date.now();
  const cached = BILLING_CACHE.data[organizationId];
  const ts = BILLING_CACHE.ts[organizationId];
  if (cached !== undefined && ts && (now - ts < BILLING_CACHE.TTL)) {
    return cached;
  }
  try {
    const orgDoc = await db.collection('orgs').doc(organizationId).get();
    if (orgDoc.exists) {
      const billingId = orgDoc.data()?.billingCustomerId || null;
      BILLING_CACHE.data[organizationId] = billingId;
      BILLING_CACHE.ts[organizationId] = now;
      return billingId;
    }
    BILLING_CACHE.data[organizationId] = null;
    BILLING_CACHE.ts[organizationId] = now;
    return undefined;
  } catch (e) {
    console.error('[image-gen] Failed to fetch billingCustomerId:', e?.message);
    return undefined;
  }
}

module.exports = withLogging(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // New: GET list of generated images for an organization from Firestore creativeGen
  // Lightweight 1-minute cache for GET responses
  const cacheKey = req.method === 'GET'
    ? `image-gen:${(req.query && (req.query.organizationId || req.query.orgId)) || ''}:${req.query?.brandId || ''}:${req.query?.userId || ''}:${req.query?.model || ''}:${req.query?.from || ''}:${req.query?.to || ''}:${req.query?.page || '1'}:${req.query?.limit || '25'}`
    : null;
  const now = Date.now();
  // Simple in-memory store on module scope
  if (!global.__IMAGE_GEN_CACHE__) global.__IMAGE_GEN_CACHE__ = { data: {}, ts: {}, ttl: 60 * 1000 };

  // Serve cached GET if fresh
  if (req.method === 'GET' && cacheKey) {
    const cached = global.__IMAGE_GEN_CACHE__.data[cacheKey];
    const ts = global.__IMAGE_GEN_CACHE__.ts[cacheKey];
    if (cached && ts && (now - ts < global.__IMAGE_GEN_CACHE__.ttl)) {
      res.setHeader('X-Cache-Status', 'HIT');
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=60');
      return res.status(200).json(cached);
    }
  }

  if (req.method === 'GET') {
    try {
      const {
        organizationId,
        orgId,
        brandId,
        userId,
        model,
        from,
        to
      } = req.query || {};

      const org = organizationId || orgId;
      if (!org) {
        return res.status(400).json({ error: 'Missing required parameter: organizationId' });
      }

      // Build Firestore query with filters
      let queryRef = db.collection('creativeGen').where('organizationId', '==', org);

      // Add optional filters
      if (brandId) {
        queryRef = queryRef.where('brandId', '==', brandId);
      }

      if (userId) {
        queryRef = queryRef.where('userId', '==', userId);
      }

      if (model) {
        queryRef = queryRef.where('model', '==', model);
      }

      const snapshot = await queryRef.get();

      let items = [];
      snapshot.forEach(doc => {
        const data = doc.data() || {};
        // Normalize createdAt to ISO when possible
        const createdAt = (data.createdAt && typeof data.createdAt.toDate === 'function')
          ? data.createdAt.toDate().toISOString()
          : (data.createdAt || null);
        items.push({ id: doc.id, ...data, createdAt });
      });

      // Apply date range filters (in-memory since Firestore composite indexes may not exist)
      if (from || to) {
        const fromDate = from ? new Date(from).getTime() : 0;
        const toDate = to ? new Date(to).getTime() : Infinity;

        items = items.filter(item => {
          if (!item.createdAt) return false;
          const itemDate = new Date(item.createdAt).getTime();
          return itemDate >= fromDate && itemDate <= toDate;
        });
      }

      // Sort newest first if createdAt present
      items.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });

      // Pagination: default latest 25; allow override via ?limit=&page=
      const limitParam = parseInt((req.query && req.query.limit) || '25', 10);
      const pageParam = parseInt((req.query && req.query.page) || '1', 10);
      const pageSize = Math.min(Math.max(isNaN(limitParam) ? 25 : limitParam, 1), 100);
      const page = Math.max(isNaN(pageParam) ? 1 : pageParam, 1);
      const start = (page - 1) * pageSize;
      const pagedItems = items.slice(start, start + pageSize);

      const payload = {
        organizationId: org,
        count: pagedItems.length,
        totalCount: items.length,
        page,
        pageSize,
        filters: {
          brandId: brandId || null,
          userId: userId || null,
          model: model || null,
          from: from || null,
          to: to || null
        },
        items: pagedItems
      };

      // Store in cache
      if (cacheKey) {
        global.__IMAGE_GEN_CACHE__.data[cacheKey] = payload;
        global.__IMAGE_GEN_CACHE__.ts[cacheKey] = now;
        res.setHeader('X-Cache-Status', 'MISS');
        res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=60');
      }

      return res.status(200).json(payload);
    } catch (err) {
      console.error('Image-gen GET error:', err?.message || err);
      return res.status(500).json({ error: 'Failed to fetch generated images', details: process.env.NODE_ENV === 'development' ? err?.message : undefined });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate env
    if (!process.env.FAL_KEY) {
      console.error('Missing FAL_KEY environment variable');
      return res.status(500).json({ error: 'Server configuration error: Missing FAL_KEY' });
    }

    // Lazy-load @fal-ai/client if not already
    if (!fal) {
      try {
        fal = require('@fal-ai/client').fal;
      } catch (e) {
        console.error('Missing dependency @fal-ai/client');
        return res.status(500).json({ error: 'Server configuration error: Missing @fal-ai/client. Please install it.' });
      }
    }

    // Configure client credentials
    fal.config({ credentials: process.env.FAL_KEY });

    // Support both object and array payloads (use first element for arrays)
    const body = Array.isArray(req.body) ? (req.body[0] || {}) : (req.body || {});

    const {
      prompt,
      prompts,
      negative_prompt,
      negativePrompt: negativePromptCamel,
      aspect_ratio,
      aspectRatio,
      num_images,
      numImages,
      seed,
      logs = false,
      model,
      image_url,
      imageUrl,
      image_urls,
      imageUrls,
      output_format,
      outputFormat,
      sync_mode,
      syncMode,
      // Metadata for saving to creativeGen
      brandId: bodyBrandId,
      organizationId: bodyOrgId,
      userId: bodyUserId,
      creativeGuideline: bodyCreativeGuideline,
      brandGuideline: bodyBrandGuideline
    } = body;

    const effectivePrompt = (typeof prompt === 'string' && prompt.trim())
      ? prompt.trim()
      : (Array.isArray(prompts) && typeof prompts[0] === 'string' ? prompts[0].trim() : undefined);

    if (!effectivePrompt) {
      return res.status(400).json({ error: 'Missing required field: prompt (or prompts[0])' });
    }

    const modelKey = (model || 'imagen4').toString().toLowerCase();

    // Coerce/validate common inputs
    // Pass aspect ratio as-is to fal.ai - let the API validate it
    const aspectInput = aspect_ratio ?? aspectRatio ?? '1:1';
    const safeAspect = typeof aspectInput === 'string' ? aspectInput : String(aspectInput);
    const numInput = num_images ?? numImages ?? 1;
    const safeNumImages = Math.min(Math.max(parseInt(numInput, 10) || 1, 1), 4);
    const negativeInput = (negative_prompt ?? negativePromptCamel ?? '');
    const negativePrompt = typeof negativeInput === 'string' ? negativeInput : String(negativeInput);
    const parsedSeed = (seed !== undefined && seed !== null) ? parseInt(seed, 10) : undefined;
    const hasValidSeed = typeof parsedSeed === 'number' && !Number.isNaN(parsedSeed);

    let result;

    if (modelKey === 'flux-kontext') {
      // Flux Kontext LoRA requires an input image URL and a prompt
      const fluxImageUrl = (image_url ?? imageUrl);
      if (!fluxImageUrl || typeof fluxImageUrl !== 'string' || !fluxImageUrl.trim()) {
        return res.status(400).json({ error: 'Missing required field: image_url for Flux-kontext model' });
      }

      // Map aspect ratio to Flux's resolution_mode; allow explicit resolution_mode too
      const resModeInput = body.resolution_mode ?? body.resolutionMode ?? aspectInput;
      const resModeStr = typeof resModeInput === 'string' ? resModeInput : String(resModeInput || '');
      // Pass resolution_mode as-is if provided
      const safeResMode = resModeStr ? resModeStr : undefined;

      const falPayload = {
        input: {
          image_url: fluxImageUrl.trim(),
          prompt: effectivePrompt,
          ...(safeResMode ? { resolution_mode: safeResMode } : {})
        },
        logs: Boolean(logs)
      };

      console.log('\n📤 FAL.AI API REQUEST - Flux Kontext:');
      console.log('=====================================');
      console.log('Model: fal-ai/flux-kontext-lora');
      console.log('Payload:', JSON.stringify(falPayload, null, 2));
      console.log('=====================================\n');

      result = await withTimeout(
        fal.subscribe('fal-ai/flux-kontext-lora', {
          ...falPayload,
          onQueueUpdate: (update) => {
            if (update.status === 'IN_PROGRESS') {
              update.logs?.map((l) => l.message).forEach((m) => console.log('[FAL]', m));
            }
          }
        }), 150000, 'fal flux-kontext'
      );
    } else if (modelKey === 'banana-image' || modelKey === 'nano-banana') {
      // Nano Banana Image to Image editing model
      const urls = Array.isArray(image_urls) ? image_urls : (Array.isArray(imageUrls) ? imageUrls : []);
      const normalizedUrls = urls.filter(u => typeof u === 'string' && u.trim()).map(u => u.trim());
      if (normalizedUrls.length === 0) {
        return res.status(400).json({ error: 'Missing required field: image_urls (array of URLs) for banana-image model' });
      }

      // Validate image URLs are accessible and not placeholder URLs
      for (const url of normalizedUrls) {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          return res.status(400).json({
            error: 'Invalid image URL format. URLs must start with http:// or https://',
            invalidUrl: url
          });
        }
        // Reject placeholder URLs
        if (url.includes('placeholder') || url.includes('text=undefined')) {
          return res.status(400).json({
            error: 'Invalid image URL: placeholder or undefined URLs are not allowed',
            invalidUrl: url,
            message: 'Please provide valid image URLs pointing to actual images'
          });
        }
      }

      const outFmt = (output_format || outputFormat || 'jpeg').toLowerCase();
      const validFmt = outFmt === 'png' ? 'png' : 'jpeg';
      const num = parseInt(num_images ?? numImages ?? 1, 10);
      const safeNum = Math.min(Math.max(isNaN(num) ? 1 : num, 1), 4);
      const sync = Boolean(sync_mode ?? syncMode ?? false);

      const falPayload = {
        input: {
          prompt: effectivePrompt,
          image_urls: normalizedUrls,
          num_images: safeNum,
          output_format: validFmt,
          aspect_ratio: safeAspect,
          ...(sync ? { sync_mode: true } : {})
        },
        logs: Boolean(logs)
      };

      console.log('\n📤 FAL.AI API REQUEST - Nano Banana Edit:');
      console.log('==========================================');
      console.log('Model: fal-ai/nano-banana/edit');
      console.log('Payload:', JSON.stringify(falPayload, null, 2));
      console.log('==========================================\n');

      result = await withTimeout(
        fal.subscribe('fal-ai/nano-banana/edit', {
          ...falPayload,
          onQueueUpdate: (update) => {
            if (update.status === 'IN_PROGRESS') {
              update.logs?.map((l) => l.message).forEach((m) => console.log('[FAL]', m));
            }
          }
        }), 150000, 'fal nano-banana edit'
      );
    } else if (modelKey === 'banana-text') {
      // Nano Banana Text to Image model
      const outFmt = (output_format || outputFormat || 'jpeg').toLowerCase();
      const validFmt = outFmt === 'png' ? 'png' : 'jpeg';
      const num = parseInt(num_images ?? numImages ?? 1, 10);
      const safeNum = Math.min(Math.max(isNaN(num) ? 1 : num, 1), 4);
      const sync = Boolean(sync_mode ?? syncMode ?? false);

      const falPayload = {
        input: {
          prompt: effectivePrompt,
          num_images: safeNum,
          output_format: validFmt,
          aspect_ratio: safeAspect,
          ...(sync ? { sync_mode: true } : {})
        },
        logs: Boolean(logs)
      };

      console.log('\n📤 FAL.AI API REQUEST - Nano Banana Text-to-Image:');
      console.log('===================================================');
      console.log('Model: fal-ai/nano-banana');
      console.log('Payload:', JSON.stringify(falPayload, null, 2));
      console.log('===================================================\n');

      result = await withTimeout(
        fal.subscribe('fal-ai/nano-banana', {
          ...falPayload,
          onQueueUpdate: (update) => {
            if (update.status === 'IN_PROGRESS') {
              update.logs?.map((l) => l.message).forEach((m) => console.log('[FAL]', m));
            }
          }
        }), 150000, 'fal nano-banana t2i'
      );
    } else if (modelKey === 'banana-pro-text') {
      // Nano Banana Pro Text to Image model
      const outFmt = (output_format || outputFormat || 'png').toLowerCase();
      const validFmt = outFmt === 'png' ? 'png' : 'jpeg';
      const num = parseInt(num_images ?? numImages ?? 1, 10);
      const safeNum = Math.min(Math.max(isNaN(num) ? 1 : num, 1), 4);
      const resolution = (body.resolution || '1K').toUpperCase();
      const validResolutions = ['1K', '2K', '4K'];
      const safeResolution = validResolutions.includes(resolution) ? resolution : '1K';

      const falPayload = {
        input: {
          prompt: effectivePrompt,
          num_images: safeNum,
          output_format: validFmt,
          aspect_ratio: safeAspect,
          resolution: safeResolution
        },
        logs: Boolean(logs)
      };

      console.log('\n📤 FAL.AI API REQUEST - Nano Banana Pro Text-to-Image:');
      console.log('========================================================');
      console.log('Model: fal-ai/nano-banana-pro');
      console.log('Payload:', JSON.stringify(falPayload, null, 2));
      console.log('========================================================\n');

      result = await withTimeout(
        fal.subscribe('fal-ai/nano-banana-pro', {
          ...falPayload,
          onQueueUpdate: (update) => {
            if (update.status === 'IN_PROGRESS') {
              update.logs?.map((l) => l.message).forEach((m) => console.log('[FAL]', m));
            }
          }
        }), 150000, 'fal nano-banana-pro t2i'
      );
    } else if (modelKey === 'banana-pro-image') {
      // Nano Banana Pro Image to Image editing model
      const urls = Array.isArray(image_urls) ? image_urls : (Array.isArray(imageUrls) ? imageUrls : []);
      const normalizedUrls = urls.filter(u => typeof u === 'string' && u.trim()).map(u => u.trim());
      if (normalizedUrls.length === 0) {
        return res.status(400).json({ error: 'Missing required field: image_urls (array of URLs) for banana-pro-image model' });
      }

      // Validate image URLs are accessible and not placeholder URLs
      for (const url of normalizedUrls) {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          return res.status(400).json({
            error: 'Invalid image URL format. URLs must start with http:// or https://',
            invalidUrl: url
          });
        }
        // Reject placeholder URLs
        if (url.includes('placeholder') || url.includes('text=undefined')) {
          return res.status(400).json({
            error: 'Invalid image URL: placeholder or undefined URLs are not allowed',
            invalidUrl: url,
            message: 'Please provide valid image URLs pointing to actual images'
          });
        }
      }

      const outFmt = (output_format || outputFormat || 'png').toLowerCase();
      const validFmt = outFmt === 'png' ? 'png' : 'jpeg';
      const num = parseInt(num_images ?? numImages ?? 1, 10);
      const safeNum = Math.min(Math.max(isNaN(num) ? 1 : num, 1), 4);
      const resolution = (body.resolution || '1K').toUpperCase();
      const validResolutions = ['1K', '2K', '4K'];
      const safeResolution = validResolutions.includes(resolution) ? resolution : '1K';

      const falPayload = {
        input: {
          prompt: effectivePrompt,
          image_urls: normalizedUrls,
          num_images: safeNum,
          output_format: validFmt,
          aspect_ratio: safeAspect,
          resolution: safeResolution
        },
        logs: Boolean(logs)
      };

      console.log('\n📤 FAL.AI API REQUEST - Nano Banana Pro Edit:');
      console.log('===============================================');
      console.log('Model: fal-ai/nano-banana-pro/edit');
      console.log('Payload:', JSON.stringify(falPayload, null, 2));
      console.log('===============================================\n');

      result = await withTimeout(
        fal.subscribe('fal-ai/nano-banana-pro/edit', {
          ...falPayload,
          onQueueUpdate: (update) => {
            if (update.status === 'IN_PROGRESS') {
              update.logs?.map((l) => l.message).forEach((m) => console.log('[FAL]', m));
            }
          }
        }), 150000, 'fal nano-banana-pro edit'
      );
    } else {
      // Default to Imagen 4 text-to-image
      // Imagen4 only supports: 1:1, 16:9, 9:16, 3:4, 4:3
      const supportedAspectRatios = ['1:1', '16:9', '9:16', '3:4', '4:3'];
      if (!supportedAspectRatios.includes(safeAspect)) {
        return res.status(400).json({
          error: 'Invalid aspect_ratio for Imagen4',
          message: `Imagen4 only supports aspect ratios: ${supportedAspectRatios.join(', ')}. You provided: ${safeAspect}`,
          supported_aspect_ratios: supportedAspectRatios,
          hint: 'Use 16:9 for wide images, or switch to a different model'
        });
      }

      const falPayload = {
        input: {
          prompt: effectivePrompt,
          negative_prompt: negativePrompt,
          aspect_ratio: safeAspect,
          num_images: safeNumImages,
          ...(hasValidSeed ? { seed: parsedSeed } : {})
        },
        logs: Boolean(logs)
      };

      console.log('\n📤 FAL.AI API REQUEST - Imagen 4:');
      console.log('==================================');
      console.log('Model: fal-ai/imagen4/preview');
      console.log('Payload:', JSON.stringify(falPayload, null, 2));
      console.log('==================================\n');

      result = await withTimeout(
        fal.subscribe('fal-ai/imagen4/preview', {
          ...falPayload,
          onQueueUpdate: (update) => {
            if (update.status === 'IN_PROGRESS') {
              update.logs?.map((l) => l.message).forEach((m) => console.log('[FAL]', m));
            }
          }
        }), 150000, 'fal imagen4'
      );
    }

    const { data, requestId } = result || {};

    console.log('\n📥 FAL.AI API RESPONSE:');
    console.log('=======================');
    console.log('Request ID:', requestId);
    console.log('Response Data:', JSON.stringify(data, null, 2));
    console.log('=======================\n');

    if (!data || !Array.isArray(data.images)) {
      console.error('Unexpected FAL response shape:', result);
      return res.status(502).json({ error: 'Invalid response from image generation service' });
    }

    // Persist to Firestore creativeGen
    const modelNameForSave = (modelKey === 'flux-kontext') ? 'Flux-kontext' :
      (modelKey === 'banana-image' || modelKey === 'nano-banana') ? 'Nano Banana Edit' :
      (modelKey === 'banana-text') ? 'Nano Banana' :
      (modelKey === 'banana-pro-text') ? 'Nano Banana Pro' :
      (modelKey === 'banana-pro-image') ? 'Nano Banana Pro Edit' : 'Imagen4';

    const metaForSave = {
      aspectRatio: aspect_ratio ?? aspectRatio ?? null,
      brandGuideline: bodyBrandGuideline || '',
      brandId: bodyBrandId || null,
      creativeGuideline: bodyCreativeGuideline || '',
      modelName: modelNameForSave,
      organizationId: bodyOrgId || null,
      prompt: effectivePrompt,
      totalImagesInBatch: data.images.length,
      userId: bodyUserId || null
    };

    const itemsForSave = (data.images || []).map((img, idx) => ({ ...img, index: idx }));
    await saveGeneratedImagesToFirestore({ db, items: itemsForSave, metadata: metaForSave });

    // Determine credits based on model type (pro models cost more)
    const isProModel = modelKey === 'banana-pro-text' || modelKey === 'banana-pro-image';
    const creditsPerImage = isProModel ? 50 : 25; // image-gen-pro=50, image-gen=25
    const totalCredits = creditsPerImage * (data.images?.length || 1);

    // 🔍 DETAILED BILLING CALCULATION LOG
    console.log('\n========== IMAGE-GEN BILLING CALCULATION ==========');
    console.log('📊 Model Key:', modelKey);
    console.log('📊 Model Name (for save):', modelNameForSave);
    console.log('📊 Is Pro Model:', isProModel);
    console.log('📊 Credits Per Image:', creditsPerImage);
    console.log('📊 Number of Images Generated:', data.images?.length || 0);
    console.log('📊 Total Credits to Charge:', totalCredits);
    console.log('📊 Event Type:', isProModel ? 'image-gen-pro' : 'image-gen');
    console.log('===================================================\n');

    // Ingest billing event to Metronome if organizationId is present
    if (bodyOrgId && totalCredits > 0) {
      try {
        const billingCustomerId = await getBillingCustomerId(bodyOrgId);
        if (billingCustomerId) {
          const eventType = isProModel ? 'image-gen-pro' : 'image-gen';
          const properties = {
            credits: totalCredits,
            project_id: 'metrixmate',
            organization_id: bodyOrgId
          };
          if (bodyBrandId) properties.brand_id = bodyBrandId;
          if (bodyUserId) properties.user_id = bodyUserId;
          if (modelNameForSave) properties.model = modelNameForSave;
          if (safeNumImages) properties.num_images = safeNumImages;

          console.log('\n========== METRONOME BILLING INGEST ==========');
          console.log('📤 Event Type:', eventType);
          console.log('📤 Customer ID:', billingCustomerId);
          console.log('📤 Organization ID:', bodyOrgId);
          console.log('📤 Total Credits:', totalCredits);
          console.log('📤 Properties:', JSON.stringify(properties, null, 2));
          console.log('==============================================\n');

          await metronomeService.ingestEvent({
            organization_id: bodyOrgId,
            customer_id: billingCustomerId,
            event_type: eventType,
            timestamp: null,
            properties
          });

          console.log(`✅ [image-gen] Successfully ingested ${totalCredits} credits for ${eventType} (model: ${modelNameForSave})`);
        } else {
          console.log('⚠️ [image-gen] No billingCustomerId found, skipping Metronome ingest');
        }
      } catch (billingError) {
        console.error('❌ [image-gen] Failed to ingest billing event:', billingError?.message);
        // Don't fail the request if billing fails
      }
    }

    // Respond with minimal, useful payload
    return res.status(200).json({
      images: data.images, // [{ url }]
      seed: data.seed,
      requestId,
      credits: totalCredits,
      model: modelNameForSave
    });

  } catch (err) {
    // Enhanced error logging for debugging
    console.error('Image-gen API error:', {
      message: err.message || err,
      status: err?.response?.status,
      statusText: err?.response?.statusText,
      data: err?.response?.data,
      stack: err?.stack,
      requestBody: req.body
    });

    const status = err?.response?.status || 500;
    const errorMessage = err?.response?.data?.detail || err?.response?.data?.message || err.message || 'Failed to generate image(s)';

    return res.status(status).json({
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? (err?.response?.data || err.message) : undefined,
      hint: status === 422 || errorMessage.includes('Unprocessable')
        ? 'Check that aspect_ratio, image_urls, and other parameters are valid for the selected model'
        : undefined
    });
  }
});

