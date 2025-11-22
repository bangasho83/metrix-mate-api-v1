/**
 * @fileoverview Firebase service for Firestore operations using Admin SDK
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK with service account credentials
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_ADMIN_CREDENTIALS, 'base64').toString('utf8')
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
}

const db = admin.firestore();

/**
 * Verifies Firebase ID token using Admin SDK
 * @param {string} idToken - Firebase ID token from client
 * @returns {Promise<Object>} Decoded token with user info
 */
const verifyIdToken = async (idToken) => {
  try {
    console.log('Firebase Service - Verifying ID token with Admin SDK...');

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log('Firebase Service - Token verified for user:', decodedToken.uid);

    return decodedToken;
  } catch (error) {
    console.error('Firebase Service - Token verification failed:', error);
    throw new Error(`Token verification failed: ${error.message}`);
  }
};

/**
 * Fetches all places data for a specific brand
 * @param {string} brandId - The brand ID to fetch places for
 * @param {string} idToken - Firebase ID token for authentication (optional)
 * @returns {Promise<Array>} Array of places data
 */
const getPlacesByBrandId = async (brandId, idToken = null) => {
  try {
    console.log('Firebase Service - Fetching places for brand:', brandId);

    if (!brandId) {
      throw new Error('Brand ID is required');
    }

    // Verify token if provided (for logging/audit purposes)
    if (idToken) {
      await verifyIdToken(idToken);
    }

    // Use Admin SDK to query places - bypasses all security rules
    const placesRef = db.collection('places');
    const querySnapshot = await placesRef.where('brandId', '==', brandId).get();

    // Process the results
    const places = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      places.push({
        id: doc.id,
        ...data,
        // Ensure we have the required fields
        name: data.name || 'Unknown Place',
        address: data.address || 'No address provided',
        verified: data.verified || false,
        rating: data.rating || 0,
        reviewCount: data.reviewCount || 0
      });
    });

    console.log('Firebase Service - Found places:', {
      brandId,
      count: places.length,
      placeIds: places.map(p => p.id)
    });

    return places;
  } catch (error) {
    console.error('Firebase Service - Error fetching places:', {
      brandId,
      error: error.message,
      stack: error.stack
    });
    throw new Error(`Failed to fetch places: ${error.message}`);
  }
};

/**
 * Fetches a specific place by its ID
 * @param {string} placeId - The place ID to fetch
 * @param {string} idToken - Firebase ID token for authentication (optional)
 * @returns {Promise<Object|null>} Place data or null if not found
 */
const getPlaceById = async (placeId, idToken = null) => {
  try {
    console.log('Firebase Service - Fetching place by ID:', placeId);

    if (!placeId) {
      throw new Error('Place ID is required');
    }

    // Verify token if provided
    if (idToken) {
      await verifyIdToken(idToken);
    }

    // Use Admin SDK to get document - bypasses security rules
    const placeRef = db.collection('places').doc(placeId);
    const placeSnap = await placeRef.get();

    if (placeSnap.exists) {
      const placeData = {
        id: placeSnap.id,
        ...placeSnap.data()
      };

      console.log('Firebase Service - Found place:', {
        placeId,
        brandId: placeData.brandId
      });

      return placeData;
    } else {
      console.log('Firebase Service - Place not found:', placeId);
      return null;
    }
  } catch (error) {
    console.error('Firebase Service - Error fetching place by ID:', {
      placeId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Fetches brand information by brand ID
 * @param {string} brandId - The brand ID to fetch
 * @param {string} idToken - Firebase ID token for authentication (optional)
 * @returns {Promise<Object|null>} Brand data or null if not found
 */
const getBrandById = async (brandId, idToken = null) => {
  try {
    console.log('Firebase Service - Fetching brand by ID:', brandId);

    if (!brandId) {
      throw new Error('Brand ID is required');
    }

    // Verify token if provided
    if (idToken) {
      await verifyIdToken(idToken);
    }

    // Use Admin SDK to get document - bypasses security rules
    const brandRef = db.collection('brands').doc(brandId);
    const brandSnap = await brandRef.get();

    if (brandSnap.exists) {
      const brandData = {
        id: brandSnap.id,
        ...brandSnap.data()
      };

      console.log('Firebase Service - Found brand:', {
        brandId,
        name: brandData.name,
        organizationId: brandData.organizationId
      });

      return brandData;
    } else {
      console.log('Firebase Service - Brand not found:', brandId);
      return null;
    }
  } catch (error) {
    console.error('Firebase Service - Error fetching brand by ID:', {
      brandId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Fetches all pages data for a specific brand
 * @param {string} brandId - The brand ID to fetch pages for
 * @param {string} idToken - Firebase ID token for authentication (optional)
 * @returns {Promise<Array>} Array of pages data
 */
const getPagesByBrandId = async (brandId, idToken = null, fromDate = null, toDate = null) => {
  try {
    console.log('Firebase Service - Fetching pages for brand:', brandId, { fromDate, toDate });

    if (!brandId) {
      throw new Error('Brand ID is required');
    }

    // Verify token if provided (for logging/audit purposes)
    if (idToken) {
      await verifyIdToken(idToken);
    }

    // Use Admin SDK to query pages - bypasses all security rules
    const pagesRef = db.collection('pages');

    // Build query with optional date filters
    let query = pagesRef.where('brandId', '==', brandId);
    let querySnapshot;
    try {
      if (fromDate) {
        const fromTs = admin.firestore.Timestamp.fromDate(new Date(fromDate + 'T00:00:00.000Z'));
        query = query.where('createdAt', '>=', fromTs);
      }
      if (toDate) {
        const toTs = admin.firestore.Timestamp.fromDate(new Date(toDate + 'T23:59:59.999Z'));
        query = query.where('createdAt', '<=', toTs);
      }
      querySnapshot = await query.get();
    } catch (indexErr) {
      if ((fromDate || toDate) && (indexErr.message?.includes('index') || indexErr.code === 9)) {
        console.warn('Firebase Service - Missing index for pages date filter; falling back to brandId-only and in-memory filtering');
        // Fallback to brandId only
        querySnapshot = await pagesRef.where('brandId', '==', brandId).get();
      } else {
        throw indexErr;
      }
    }

    // Process the results
    const pages = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();

      // If we had to fallback (or even when indexed), enforce in-memory filtering to be safe
      if (fromDate || toDate) {
        const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : (data.createdAt ? new Date(data.createdAt) : null);
        if (fromDate) {
          const fromDT = new Date(fromDate + 'T00:00:00.000Z');
          if (!createdAt || createdAt < fromDT) return;
        }
        if (toDate) {
          const toDT = new Date(toDate + 'T23:59:59.999Z');
          if (!createdAt || createdAt > toDT) return;
        }
      }

      pages.push({
        id: doc.id,
        ...data,
        // Ensure we have the required fields
        name: data.name || data.title || 'Unknown Page',
        url: data.url || data.link || 'No URL provided',
        platform: data.platform || 'Unknown Platform',
        verified: data.verified || false,
        followers: data.followers || data.followerCount || 0,
        posts: data.posts || data.postCount || 0
      });
    });

    console.log('Firebase Service - Found pages:', {
      brandId,
      count: pages.length,
      pageIds: pages.map(p => p.id)
    });

    return pages;
  } catch (error) {
    console.error('Firebase Service - Error fetching pages:', {
      brandId,
      error: error.message,
      stack: error.stack
    });
    throw new Error(`Failed to fetch pages: ${error.message}`);
  }
};

/**
 * Fetches all backlinks data for a specific brand with optional date filtering
 * @param {string} brandId - The brand ID to fetch backlinks for
 * @param {string} idToken - Firebase ID token for authentication (optional)
 * @param {string} fromDate - Start date in YYYY-MM-DD format (optional)
 * @param {string} toDate - End date in YYYY-MM-DD format (optional)
 * @returns {Promise<Array>} Array of backlinks data
 */
const getBacklinksByBrandId = async (brandId, idToken = null, fromDate = null, toDate = null) => {
  try {
    console.log('Firebase Service - Fetching backlinks for brand:', brandId, {
      fromDate,
      toDate
    });

    if (!brandId) {
      throw new Error('Brand ID is required');
    }

    // Verify token if provided (for logging/audit purposes)
    if (idToken) {
      await verifyIdToken(idToken);
    }

    // Use Admin SDK to query backlinks - bypasses all security rules
    const backlinksRef = db.collection('backlinks');
    let querySnapshot;

    try {
      let query = backlinksRef.where('brandId', '==', brandId);

      // Add date filtering if provided
      if (fromDate || toDate) {
        // Convert date strings to Firestore Timestamps
        if (fromDate) {
          const fromTimestamp = admin.firestore.Timestamp.fromDate(new Date(fromDate + 'T00:00:00.000Z'));
          query = query.where('createdAt', '>=', fromTimestamp);
          console.log('Firebase Service - Added from date filter:', fromDate);
        }

        if (toDate) {
          const toTimestamp = admin.firestore.Timestamp.fromDate(new Date(toDate + 'T23:59:59.999Z'));
          query = query.where('createdAt', '<=', toTimestamp);
          console.log('Firebase Service - Added to date filter:', toDate);
        }
      }

      querySnapshot = await query.get();
    } catch (indexError) {
      if (indexError.message.includes('index') || indexError.code === 9) {
        console.warn('Firebase Service - Missing Firestore index for date filtering, falling back to brandId only query');
        console.warn('Please create a composite index for: brandId (Ascending), createdAt (Ascending)');

        // Fallback to simple brandId query
        const simpleQuery = backlinksRef.where('brandId', '==', brandId);
        querySnapshot = await simpleQuery.get();

        // Note: We'll filter by date in memory if needed
        console.log('Firebase Service - Using fallback query without date filters');
      } else {
        throw indexError;
      }
    }

    // Process the results
    const backlinks = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();

      // Client-side date filtering if we had to use fallback query
      if ((fromDate || toDate) && data.createdAt) {
        const createdAt = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);

        if (fromDate) {
          const fromDateTime = new Date(fromDate + 'T00:00:00.000Z');
          if (createdAt < fromDateTime) {
            return; // Skip this document
          }
        }

        if (toDate) {
          const toDateTime = new Date(toDate + 'T23:59:59.999Z');
          if (createdAt > toDateTime) {
            return; // Skip this document
          }
        }
      }

      backlinks.push({
        id: doc.id,
        ...data,
        // Ensure we have the required fields
        url: data.url || data.link || 'No URL provided',
        sourceUrl: data.sourceUrl || data.source || 'No source URL',
        anchorText: data.anchorText || data.anchor || 'No anchor text',
        domain: data.domain || 'Unknown Domain',
        status: data.status || 'Unknown',
        domainAuthority: data.domainAuthority || data.da || 0,
        pageAuthority: data.pageAuthority || data.pa || 0,
        isDoFollow: data.isDoFollow !== undefined ? data.isDoFollow : true
      });
    });

    console.log('Firebase Service - Found backlinks:', {
      brandId,
      count: backlinks.length,
      backlinkIds: backlinks.map(b => b.id)
    });

    return backlinks;
  } catch (error) {
    console.error('Firebase Service - Error fetching backlinks:', {
      brandId,
      error: error.message,
      stack: error.stack
    });
    throw new Error(`Failed to fetch backlinks: ${error.message}`);
  }
};

/**
 * Fetches all keywords data for a specific brand from the brands collection
 * @param {string} brandId - The brand ID to fetch keywords for
 * @param {string} idToken - Firebase ID token for authentication (optional)
 * @returns {Promise<Array>} Array of keywords data
 */
const getKeywordsByBrandId = async (brandId, idToken = null) => {
  try {
    console.log('Firebase Service - Fetching keywords for brand:', brandId);

    if (!brandId) {
      throw new Error('Brand ID is required');
    }

    // Verify token if provided (for logging/audit purposes)
    if (idToken) {
      await verifyIdToken(idToken);
    }

    // Use Admin SDK to get brand document - bypasses all security rules
    const brandRef = db.collection('brands').doc(brandId);
    const brandSnap = await brandRef.get();

    if (!brandSnap.exists) {
      console.log('Firebase Service - Brand not found:', brandId);
      return [];
    }

    const brandData = brandSnap.data();
    const keywords = brandData.keywords || [];

    console.log('Firebase Service - Found keywords in brand document:', {
      brandId,
      keywordsFieldType: typeof keywords,
      isArray: Array.isArray(keywords),
      count: Array.isArray(keywords) ? keywords.length : 0
    });

    return keywords;
  } catch (error) {
    console.error('Firebase Service - Error fetching keywords from brand:', {
      brandId,
      error: error.message,
      stack: error.stack
    });
    throw new Error(`Failed to fetch keywords: ${error.message}`);
  }
};

/**
 * Validates if a brand exists and returns basic info
 * @param {string} brandId - The brand ID to validate
 * @param {string} idToken - Firebase ID token for authentication
 * @returns {Promise<boolean>} True if brand exists, false otherwise
 */
const validateBrandExists = async (brandId, idToken = null) => {
  try {
    const brand = await getBrandById(brandId, idToken);
    return brand !== null;
  } catch (error) {
    console.error('Firebase Service - Error validating brand:', {
      brandId,
      error: error.message
    });
    return false;
  }
};

// New helpers: brands by organization and pages count with optional date filter
const getBrandsByOrganizationId = async (organizationId, idToken = null, seoFilter = null) => {
  try {
    console.log('Firebase Service - Fetching brands for organization:', organizationId, { seoFilter });
    if (!organizationId) throw new Error('Organization ID is required');
    if (idToken) await verifyIdToken(idToken);

    const brandsRef = db.collection('brands');

    let snap;
    if (seoFilter) {
      try {
        // Filter only brands with services.seo == seoFilter
        snap = await brandsRef
          .where('organizationId', '==', organizationId)
          .where('services.seo', '==', seoFilter)
          .get();
      } catch (indexErr) {
        if (indexErr.message?.includes('index') || indexErr.code === 9) {
          console.warn('Firebase Service - Missing index for services.seo filter; falling back to in-memory filter');
          snap = await brandsRef.where('organizationId', '==', organizationId).get();
        } else {
          throw indexErr;
        }
      }
    } else {
      snap = await brandsRef.where('organizationId', '==', organizationId).get();
    }

    const brands = [];
    snap.forEach(doc => {
      const data = doc.data();
      if (seoFilter && data?.services?.seo !== seoFilter) return; // in-memory filter if fallback
      const brandName = data.client_name || data.brandName || data.name || data.title || 'Unknown Brand';
      brands.push({
        id: doc.id,
        name: brandName,
        organizationId: data.organizationId || organizationId,
        website: data.website || null,
        services: data.services || null
      });
    });
    console.log('Firebase Service - Found brands:', { organizationId, seoFilter: seoFilter || 'any', count: brands.length });
    return brands;
  } catch (error) {
    console.error('Firebase Service - Error fetching brands by organization:', { organizationId, error: error.message });
    throw new Error(`Failed to fetch brands: ${error.message}`);
  }
};

const getPagesCountByBrandId = async (brandId, idToken = null, fromDate = null, toDate = null) => {
  try {
    if (!brandId) throw new Error('Brand ID is required');
    if (idToken) await verifyIdToken(idToken);

    const pagesRef = db.collection('pages');
    const baseQuery = pagesRef.where('brandId', '==', brandId);

    // If no date filters, return count directly
    if (!fromDate && !toDate) {
      const snap = await baseQuery.get();
      return snap.size;
    }

    // Try server-side date filtering first (requires composite index)
    try {
      let rangedQuery = baseQuery;
      if (fromDate) {
        const fromTs = admin.firestore.Timestamp.fromDate(new Date(fromDate + 'T00:00:00.000Z'));
        rangedQuery = rangedQuery.where('createdAt', '>=', fromTs);
      }
      if (toDate) {
        const toTs = admin.firestore.Timestamp.fromDate(new Date(toDate + 'T23:59:59.999Z'));
        rangedQuery = rangedQuery.where('createdAt', '<=', toTs);
      }
      const rangedSnap = await rangedQuery.get();
      return rangedSnap.size;
    } catch (indexErr) {
      if (!(indexErr?.message?.includes('index') || indexErr?.code === 9)) throw indexErr;
      console.warn('Firebase Service - Missing Firestore index for pages date filtering; falling back to client-side scan');
    }

    // Fallback: fetch by brandId only and filter in memory by createdAt
    const snap = await baseQuery.get();
    let count = 0;
    snap.forEach(doc => {
      const data = doc.data();
      // If no createdAt, include by default
      if (!data.createdAt) { count++; return; }
      const createdAt = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
      if (fromDate) {
        const fromDT = new Date(fromDate + 'T00:00:00.000Z');
        if (createdAt < fromDT) return;
      }
      if (toDate) {
        const toDT = new Date(toDate + 'T23:59:59.999Z');
        if (createdAt > toDT) return;
      }
      count++;
    });
    return count;
  } catch (error) {
    console.error('Firebase Service - Error counting pages:', { brandId, error: error.message });
    throw new Error(`Failed to count pages: ${error.message}`);
  }
};

/**
 * Count backlinks for brand in date range efficiently (returns count only)
 */
const getBacklinksCountByBrandId = async (brandId, idToken = null, fromDate = null, toDate = null) => {
  const arr = await getBacklinksByBrandId(brandId, idToken, fromDate, toDate);
  return Array.isArray(arr) ? arr.length : 0;
};

/**
 * In-memory cache for brand information
 * @private
 */
const BRAND_CACHE = {
  data: {},
  timestamps: {},
  TTL: 1 * 60 * 1000 // 1 minute cache TTL
};

/**
 * In-memory cache for organization information
 * @private
 */
const ORG_CACHE = {
  data: {},
  timestamps: {},
  TTL: 15 * 60 * 1000 // 15 minutes cache TTL
};

/**
 * Utility function to get comprehensive brand information with caching
 * This is the recommended function for all services to fetch brand data
 *
 * @param {string} brandId - The brand ID to fetch
 * @param {Object} options - Optional configuration
 * @param {string} options.idToken - Firebase ID token for authentication (optional)
 * @param {boolean} options.useCache - Whether to use cache (default: true)
 * @param {boolean} options.throwOnNotFound - Whether to throw error if brand not found (default: false)
 * @returns {Promise<Object|null>} Brand information object or null if not found
 *
 * @example
 * // Basic usage
 * const brand = await getBrandInfo('brand_123');
 *
 * @example
 * // With authentication
 * const brand = await getBrandInfo('brand_123', { idToken: 'firebase_token' });
 *
 * @example
 * // Without cache
 * const brand = await getBrandInfo('brand_123', { useCache: false });
 *
 * @example
 * // Throw error if not found
 * try {
 *   const brand = await getBrandInfo('brand_123', { throwOnNotFound: true });
 * } catch (error) {
 *   console.error('Brand not found:', error);
 * }
 *
 * Returned brand object includes:
 * - id: Brand ID
 * - name: Brand name (normalized from client_name, brandName, name, or title)
 * - organizationId: Associated organization ID
 * - website: Brand website URL
 * - services: Services configuration object (seo, posts, campaigns, etc.)
 * - keywords: Array of keywords
 * - createdAt: Creation timestamp
 * - All other fields from the brand document
 */
const getBrandInfo = async (brandId, options = {}) => {
  const {
    idToken = null,
    useCache = true,
    throwOnNotFound = false
  } = options;

  try {
    console.log('Brand Utility - Fetching brand info:', { brandId, useCache });

    if (!brandId) {
      throw new Error('Brand ID is required');
    }

    // Check cache first if enabled
    if (useCache) {
      const now = Date.now();
      const cachedData = BRAND_CACHE.data[brandId];
      const cachedTime = BRAND_CACHE.timestamps[brandId];

      if (cachedData && cachedTime && (now - cachedTime) < BRAND_CACHE.TTL) {
        console.log('Brand Utility - Cache hit:', brandId);
        return cachedData;
      }
    }

    // Verify token if provided
    if (idToken) {
      await verifyIdToken(idToken);
    }

    // Fetch from Firestore using Admin SDK
    const brandRef = db.collection('brands').doc(brandId);
    const brandSnap = await brandRef.get();

    if (!brandSnap.exists) {
      console.log('Brand Utility - Brand not found:', brandId);

      if (throwOnNotFound) {
        throw new Error(`Brand not found: ${brandId}`);
      }

      return null;
    }

    const rawData = brandSnap.data();

    // Normalize brand data with common field mappings
    const brandInfo = {
      id: brandSnap.id,
      ...rawData,
      // Normalize name field from various possible sources
      name: rawData.client_name || rawData.brandName || rawData.name || rawData.title || 'Unknown Brand',
      // Ensure common fields are present
      organizationId: rawData.organizationId || null,
      website: rawData.website || rawData.url || null,
      services: rawData.services || null,
      keywords: rawData.keywords || [],
      createdAt: rawData.createdAt || null,
      // Explicitly preserve connections object from raw data
      connections: rawData.connections || {}
    };

    console.log('Brand Utility - Brand fetched successfully:', {
      brandId,
      name: brandInfo.name,
      organizationId: brandInfo.organizationId,
      hasServices: !!brandInfo.services,
      keywordsCount: Array.isArray(brandInfo.keywords) ? brandInfo.keywords.length : 0,
      hasConnections: !!brandInfo.connections,
      connectionTypes: brandInfo.connections ? Object.keys(brandInfo.connections) : []
    });

    // Cache the result
    if (useCache) {
      BRAND_CACHE.data[brandId] = brandInfo;
      BRAND_CACHE.timestamps[brandId] = Date.now();
    }

    return brandInfo;

  } catch (error) {
    console.error('Brand Utility - Error fetching brand info:', {
      brandId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Clear brand cache for a specific brand or all brands
 * @param {string} brandId - Optional brand ID to clear. If not provided, clears all cache
 */
const clearBrandCache = (brandId = null) => {
  if (brandId) {
    delete BRAND_CACHE.data[brandId];
    delete BRAND_CACHE.timestamps[brandId];
    console.log('Brand Utility - Cache cleared for brand:', brandId);
  } else {
    BRAND_CACHE.data = {};
    BRAND_CACHE.timestamps = {};
    console.log('Brand Utility - All brand cache cleared');
  }
};

/**
 * Extracts OAuth connections data from a brand
 * @param {string} brandId - Brand ID to fetch connections for
 * @param {Object} options - Configuration options
 * @param {string} options.idToken - Firebase ID token (optional)
 * @param {boolean} options.useCache - Use cached brand data (default: true)
 * @returns {Promise<Object>} Connections object with all OAuth tokens and IDs
 *
 * @example
 * const connections = await getBrandConnections('brand_123');
 * // Returns:
 * // {
 * //   facebook_page: { page_id, access_token, refresh_token, expires_at },
 * //   instagram_page: { account_id, access_token, expires_at },
 * //   meta_ads: { ad_account_id, access_token, expires_at },
 * //   ga4: { property_id, access_token, refresh_token, expires_at },
 * //   tossdown: { tossdown_id, ... }
 * // }
 */
const getBrandConnections = async (brandId, options = {}) => {
  try {
    const brand = await getBrandInfo(brandId, options);

    if (!brand) {
      console.log('Brand Utility - Brand not found:', { brandId });
      return {};
    }

    const connections = brand.connections || {};

    console.log('Brand Utility - Connections extracted:', {
      brandId,
      brandHasConnectionsField: 'connections' in brand,
      connectionsType: typeof connections,
      connectionsIsObject: connections && typeof connections === 'object',
      hasFacebookPage: !!connections.facebook_page,
      hasInstagramPage: !!connections.instagram_page,
      hasMetaAds: !!connections.meta_ads,
      hasGA4: !!connections.ga4,
      hasTossdown: !!connections.tossdown,
      allConnectionKeys: Object.keys(connections)
    });

    return connections;
  } catch (error) {
    console.error('Brand Utility - Error extracting connections:', {
      brandId,
      error: error.message
    });
    throw error;
  }
};

/**
 * Extracts specific connection data from a brand
 * @param {string} brandId - Brand ID
 * @param {string} connectionType - Type of connection (facebook_page, instagram_page, meta_ads, ga4, tossdown)
 * @param {Object} options - Configuration options
 * @returns {Promise<Object|null>} Connection data or null if not found
 *
 * @example
 * const fbConnection = await getBrandConnection('brand_123', 'facebook_page');
 * // Returns: { page_id, access_token, refresh_token, expires_at, ... }
 */
const getBrandConnection = async (brandId, connectionType, options = {}) => {
  try {
    const connections = await getBrandConnections(brandId, options);
    const connection = connections[connectionType];

    if (!connection) {
      console.log('Brand Utility - Connection not found:', { brandId, connectionType });
      return null;
    }

    console.log('Brand Utility - Connection extracted:', {
      brandId,
      connectionType,
      hasAccessToken: !!connection.access_token,
      hasRefreshToken: !!connection.refresh_token
    });

    return connection;
  } catch (error) {
    console.error('Brand Utility - Error extracting connection:', {
      brandId,
      connectionType,
      error: error.message
    });
    throw error;
  }
};

/**
 * Utility function to get comprehensive organization information with caching
 * @param {string} organizationId - The organization ID to fetch
 * @param {Object} options - Optional configuration
 * @param {string} options.idToken - Firebase ID token for authentication (optional)
 * @param {boolean} options.useCache - Whether to use cache (default: true)
 * @returns {Promise<Object|null>} Organization information object or null if not found
 */
const getOrganizationInfo = async (organizationId, options = {}) => {
  const {
    idToken = null,
    useCache = true
  } = options;

  try {
    console.log('Organization Utility - Fetching organization info:', { organizationId, useCache });

    if (!organizationId) {
      throw new Error('Organization ID is required');
    }

    // Check cache first if enabled
    if (useCache) {
      const now = Date.now();
      const cachedData = ORG_CACHE.data[organizationId];
      const cachedTime = ORG_CACHE.timestamps[organizationId];

      if (cachedData && cachedTime && (now - cachedTime) < ORG_CACHE.TTL) {
        console.log('Organization Utility - Cache hit:', organizationId);
        return cachedData;
      }
    }

    // Verify token if provided
    if (idToken) {
      await verifyIdToken(idToken);
    }

    // Fetch from Firestore
    const orgRef = db.collection('orgs').doc(organizationId);
    const orgSnap = await orgRef.get();

    if (!orgSnap.exists) {
      console.log('Organization Utility - Organization not found:', organizationId);
      return null;
    }

    const rawData = orgSnap.data();

    // Normalize organization data
    const orgInfo = {
      id: orgSnap.id,
      ...rawData,
      name: rawData.name || rawData.organizationName || 'Unknown Organization',
      createdAt: rawData.createdAt || null
    };

    console.log('Organization Utility - Organization fetched successfully:', {
      organizationId,
      name: orgInfo.name
    });

    // Cache the result
    if (useCache) {
      ORG_CACHE.data[organizationId] = orgInfo;
      ORG_CACHE.timestamps[organizationId] = Date.now();
    }

    return orgInfo;

  } catch (error) {
    console.error('Organization Utility - Error fetching organization info:', {
      organizationId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

module.exports = {
  getPlacesByBrandId,
  getPlaceById,
  getBrandById,
  getPagesByBrandId,
  getBacklinksByBrandId,
  getKeywordsByBrandId,
  validateBrandExists,
  getBrandsByOrganizationId,
  getPagesCountByBrandId,
  getBacklinksCountByBrandId,
  getBrandInfo,
  getBrandConnections,
  getBrandConnection,
  clearBrandCache,
  getOrganizationInfo,
  db
};
