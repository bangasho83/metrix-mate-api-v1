/**
 * @fileoverview Meta Social Service - Functions for fetching Facebook and Instagram posts data
 * @module services/meta-social-service
 */

const axios = require('axios');
const { convertToBusinessTimezone } = require('../utils/date-utils');

const META_API_VERSION = 'v19.0';
const META_BASE_URL = 'https://graph.facebook.com';

/**
 * Fetches insights for Facebook posts using batch requests
 * @param {Array} posts - Array of post objects
 * @param {string} pageAccessToken - Page access token
 * @returns {Promise<Array>} Posts with insights data
 */
async function fetchPostInsights(posts, pageAccessToken) {
  if (!posts || posts.length === 0) {
    return posts;
  }

  try {
    // Define the metrics we want to fetch
    const metrics = [
      'post_impressions',
      'post_impressions_unique',
      'post_engaged_users',
      'post_reactions_by_type_total',
      'post_clicks',
      'post_video_avg_time_watched',
      'post_reach'
    ];

    // Batch posts in groups of 50 (Facebook's limit)
    const batchSize = 50;
    const batches = [];

    for (let i = 0; i < posts.length; i += batchSize) {
      const batch = posts.slice(i, i + batchSize);
      batches.push(batch);
    }

    const postsWithInsights = [];

    for (const batch of batches) {
      // Create comma-separated list of post IDs (outside try block so it's available in catch)
      const postIds = batch.map(post => post.id).join(',');

      try {
        // Use page token provided by brand connection (no environment fallback)
        const token = pageAccessToken;

        if (!token) {
          console.error('No Facebook page access token available for insights (expected from brand connections)');
          return batch;
        }

        console.log(`Fetching insights for ${batch.length} posts in batch`);

        const insightsResponse = await axios.get(`${META_BASE_URL}/${META_API_VERSION}`, {
          params: {
            ids: postIds,
            fields: `insights.metric(${metrics.join(',')})`,
            access_token: token
          },
          timeout: 15000
        });

        console.log(`Insights response received for ${batch.length} posts`);

        // Process the insights response
        batch.forEach(post => {
          const postInsights = insightsResponse.data[post.id];

          // Initialize empty insights object
          const insights = {};

          // Parse insights data if available
          if (postInsights && postInsights.insights && postInsights.insights.data) {
            postInsights.insights.data.forEach(insight => {
              const metricName = insight.name;
              const value = insight.values && insight.values[0] ? insight.values[0].value : null;

              // Add metrics that have values (including 0)
              if (value !== null && value !== undefined) {
                if (metricName === 'post_reactions_by_type_total') {
                  insights[metricName] = value || {};
                } else {
                  insights[metricName] = typeof value === 'number' ? value : (value || 0);
                }
              }
            });
          }

          // Add insights to post object
          postsWithInsights.push({
            ...post,
            insights
          });
        });

      } catch (batchError) {
        console.error('Error fetching insights for batch:', {
          message: batchError.message,
          status: batchError.response?.status,
          errorCode: batchError.response?.data?.error?.code,
          errorMessage: batchError.response?.data?.error?.message,
          errorType: batchError.response?.data?.error?.type,
          requestedMetrics: metrics,
          postCount: batch.length,
          postIds: postIds.split(',').slice(0, 3).join(',') + (batch.length > 3 ? '...' : '')
        });

        // Add posts without insights if batch fails
        batch.forEach(post => {
          postsWithInsights.push({
            ...post,
            insights: {} // Empty insights object when batch fails
          });
        });
      }
    }

    console.log(`Successfully fetched insights for ${postsWithInsights.length} posts`);
    return postsWithInsights;

  } catch (error) {
    console.error('Error in fetchPostInsights:', {
      message: error.message,
      stack: error.stack
    });
    
    // Return posts without insights if function fails
    return posts.map(post => ({
      ...post,
      insights: {
        post_impressions: 0,
        post_impressions_unique: 0,
        post_engaged_users: 0,
        post_reactions_by_type_total: {},
        post_clicks: 0,
        post_video_avg_time_watched: 0,
        post_reach: 0
      }
    }));
  }
}

/**
 * Fetches insights for Instagram posts using batch requests
 * @param {Array} posts - Array of Instagram post objects
 * @param {string} instagramAccessToken - Instagram access token (page or user token)
 * @returns {Promise<Array>} Posts with insights data
 */
async function fetchInstagramInsights(posts, instagramAccessToken) {
  if (!posts || posts.length === 0) {
    return posts;
  }

  // Use provided token from brand connection (no environment fallback)
  const token = instagramAccessToken;
  if (!token) {
    console.error('No Instagram access token available for insights (expected from brand connections)');
    return posts;
  }

  try {
    // Define the base metrics we want to fetch for Instagram
    // These are the valid Instagram insights metrics
    const baseMetrics = [
      'impressions',
      'reach',
      'total_interactions',
      'saved',
      'likes',
      'comments',
      'shares'
    ];

    // Video-specific metrics - ONLY video_views is valid for Instagram batch insights
    // Note: 'plays' and 'video_play_actions' are NOT valid Instagram insights metrics
    const videoMetrics = [
      'video_views'
    ];

    // Batch posts in groups of 25 (smaller batch for Instagram)
    const batchSize = 25;
    const batches = [];

    for (let i = 0; i < posts.length; i += batchSize) {
      const batch = posts.slice(i, i + batchSize);
      batches.push(batch);
    }

    const postsWithInsights = [];

    for (const batch of batches) {
      // Define these outside try block so they're available in catch block
      let metricsArray = [];
      let videoPostsInBatch = [];

      try {
        // Create comma-separated list of post IDs
        const postIds = batch.map(post => post.id).join(',');

        console.log(`Fetching Instagram insights for ${batch.length} posts in batch`);

        // Create dynamic metrics based on post types in this batch
        const batchMetrics = new Set(baseMetrics);
        videoPostsInBatch = [];

        batch.forEach(post => {
          if (post.media_type === 'VIDEO' || post.media_type === 'REELS') {
            videoMetrics.forEach(metric => batchMetrics.add(metric));
            videoPostsInBatch.push(post.id);
          }
        });

        metricsArray = Array.from(batchMetrics);
        console.log(`Requesting Instagram insights for batch:`, {
          postIds,
          videoPostsInBatch,
          metrics: metricsArray
        });

        const insightsResponse = await axios.get(`${META_BASE_URL}/${META_API_VERSION}`, {
          params: {
            ids: postIds,
            fields: `insights.metric(${metricsArray.join(',')})`,
            access_token: token
          },
          timeout: 15000
        });

        // Process the insights response
        batch.forEach(post => {
          const postInsights = insightsResponse.data[post.id];

          // Initialize empty insights object
          const insights = {};

          // Parse insights data if available
          if (postInsights && postInsights.insights && postInsights.insights.data) {
            console.log(`Instagram insights for post ${post.id} (${post.media_type}):`,
              postInsights.insights.data.map(insight => ({
                name: insight.name,
                value: insight.values && insight.values[0] ? insight.values[0].value : 0
              }))
            );

            postInsights.insights.data.forEach(insight => {
              const metricName = insight.name;
              const value = insight.values && insight.values[0] ? insight.values[0].value : null;
              // Add metrics that have values (including 0)
              if (value !== null && value !== undefined) {
                insights[metricName] = typeof value === 'number' ? value : (value || 0);
              }
            });
          } else {
            console.log(`No insights data found for post ${post.id} (${post.media_type})`);
          }

          // Add insights to post object
          postsWithInsights.push({
            ...post,
            insights
          });
        });

      } catch (batchError) {
        console.error('Error fetching Instagram insights for batch:', {
          message: batchError.message,
          status: batchError.response?.status,
          errorCode: batchError.response?.data?.error?.code,
          errorMessage: batchError.response?.data?.error?.message,
          requestedMetrics: metricsArray,
          postCount: batch.length,
          videoPostsCount: videoPostsInBatch.length
        });
        // Add posts without insights if batch fails
        batch.forEach(post => {
          postsWithInsights.push({
            ...post,
            insights: {} // Empty insights object when batch fails
          });
        });
      }
    }

    console.log(`Successfully fetched Instagram insights for ${postsWithInsights.length} posts`);
    return postsWithInsights;

  } catch (error) {
    console.error('Error in fetchInstagramInsights:', error.message);
    // Return posts without insights if function fails
    return posts.map(post => ({
      ...post,
      insights: {
        impressions: 0,
        reach: 0,
        total_interactions: 0,
        saved: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        video_views: 0
      }
    }));
  }
}

/**
 * Gets the count and details of Facebook posts for a page within a date range
 * @param {string} pageId - Facebook page ID
 * @param {string} from - Start date (YYYY-MM-DD)
 * @param {string} to - End date (YYYY-MM-DD)
 * @param {number} [limit=25] - Maximum number of post details to return
 * @param {string} [businessTimezone] - Business timezone for timestamp conversion
 * @returns {Promise<Object>} Count of posts and post details
 */
exports.getFacebookPosts = async function(pageId, from, to, limit = 25, businessTimezone = null, options = {}) {
  try {
    // Convert dates to Unix timestamps for Meta API
    const since = Math.floor(new Date(from).getTime() / 1000);
    const until = Math.floor(new Date(to).getTime() / 1000) + (24 * 60 * 60); // Add 24 hours to include the end date

    console.log(`Fetching Facebook posts for page ${pageId} from ${from} to ${to}`);

    // Get page access token from options (brand connection)
    const { accessToken } = options;
    let pageAccessToken = accessToken;

    if (!pageAccessToken) {
      throw new Error('Facebook page access token is required (no META_ACCESS_TOKEN fallback)');
    }

    // Using OAuth token from brand connections - no need to fetch page-specific token
    console.log(`Using Facebook page access token from brand connections for page ${pageId}`);
    console.log(`Token validation: Token length=${pageAccessToken?.length || 0}, starts with=${pageAccessToken?.substring(0, 10) || 'N/A'}...`);

    // Helper function to normalize permalinks for deduplication
    const normalizePermalink = (url) => {
      if (!url) return null;
      return url.replace(/\?.*$/, '').toLowerCase();
    };
    
    // Track unique posts
    const postIds = new Set();
    const permalinks = new Map(); // Map of permalink to created_time
    const reelIds = new Set();
    const postDetails = [];
    let uniquePostsCount = 0;
    
    // Process a post and add it to the tracking sets if it's unique
    const processPost = (post, source) => {
      if (!post || !post.id) return false;
      
      // Skip if we already have this ID
      if (postIds.has(post.id)) return false;
      
      // Extract message and created time
      const message = post.message || post.description || post.title || '';
      const createdTime = post.created_time;
      
      // Skip if no created_time or outside date range
      if (!createdTime) return false;
      
      const postDate = new Date(createdTime);
      const toEnd = new Date(to); toEnd.setHours(23, 59, 59, 999);
      if (postDate < new Date(from) || postDate > toEnd) return false;
      
      // Check for duplicate permalinks
      const originalPermalink = post.permalink_url;
      const permalink = normalizePermalink(originalPermalink);
      
      if (permalink && permalinks.has(permalink)) {
        // If we have this permalink already, only keep the newer post
        const existingTime = permalinks.get(permalink);
        if (new Date(existingTime) >= new Date(createdTime)) {
          return false;
        }
      }
      
      // Check if this is a reel ID (numeric only ID)
      if (/^\d+$/.test(post.id) && reelIds.has(post.id)) {
        return false;
      }
      
      // Add to tracking sets
      postIds.add(post.id);
      if (permalink) permalinks.set(permalink, createdTime);
      if (/^\d+$/.test(post.id)) reelIds.add(post.id);
      
      // Add post details
      postDetails.push({
        id: post.id,
        message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
        created_time: convertToBusinessTimezone(createdTime, businessTimezone),
        permalink_url: originalPermalink,
        picture: post.full_picture || post.thumbnail_url || null,
        likes: post.likes?.summary?.total_count || 0,
        comments: post.comments?.summary?.total_count || 0,
        shares: post.shares?.count || 0
      });
      
      return true;
    };
    
    // Use Promise.all to fetch from multiple endpoints in parallel
    // Note: Insights and visitor_posts endpoints are blocked by OAuth restrictions (Meta 2024)
    const [postsResponse, feedResponse, publishedResponse] = await Promise.allSettled([
      // 1. Posts edge
      axios.get(`${META_BASE_URL}/${META_API_VERSION}/${pageId}`, {
        params: {
          access_token: pageAccessToken,
          fields: `posts.since(${since}).until(${until}).limit(100){id,message,created_time,permalink_url,full_picture,likes.summary(true),comments.summary(true),shares}`,
        }
      }),

      // 2. Feed endpoint
      axios.get(`${META_BASE_URL}/${META_API_VERSION}/${pageId}/feed`, {
        params: {
          access_token: pageAccessToken,
          fields: 'id,message,created_time,permalink_url,full_picture,likes.summary(true),comments.summary(true),shares',
          since,
          until,
          limit: 100
        }
      }),

      // 3. Published posts endpoint
      axios.get(`${META_BASE_URL}/${META_API_VERSION}/${pageId}/published_posts`, {
        params: {
          access_token: pageAccessToken,
          fields: 'id,message,created_time,permalink_url,full_picture,likes.summary(true),comments.summary(true),shares',
          since,
          until,
          limit: 100
        }
      })
    ]);
    
    // Process posts edge response
    if (postsResponse.status === 'fulfilled' && postsResponse.value.data?.posts?.data) {
      const posts = postsResponse.value.data.posts.data;
      console.log(`Found ${posts.length} posts using posts edge`);

      posts.forEach(post => {
        if (processPost(post, 'posts edge')) uniquePostsCount++;
      });
    }

    // Process feed endpoint
    if (feedResponse.status === 'fulfilled' && feedResponse.value.data?.data) {
      const feed = feedResponse.value.data.data;
      console.log(`Found ${feed.length} posts using feed endpoint`);

      feed.forEach(post => {
        if (processPost(post, 'feed endpoint')) uniquePostsCount++;
      });
    }

    // Process published posts endpoint
    if (publishedResponse.status === 'fulfilled' && publishedResponse.value.data?.data) {
      const published = publishedResponse.value.data.data;
      console.log(`Found ${published.length} posts using published_posts endpoint`);

      published.forEach(post => {
        if (processPost(post, 'published_posts endpoint')) uniquePostsCount++;
      });
    }
    
    // Note: visitor_posts endpoint is blocked by OAuth restrictions (Meta 2024)

    console.log(`Total unique Facebook posts found: ${uniquePostsCount}`);
    
    // Sort posts by date (newest first)
    postDetails.sort((a, b) => new Date(b.created_time) - new Date(a.created_time));

    // Limit to specified number of most recent posts for the details
    const limitedDetails = postDetails.slice(0, limit);

    console.log(`Total unique Facebook posts found: ${uniquePostsCount}, returning ${limitedDetails.length} in details (limit: ${limit})`);

    // Fetch insights for the limited posts
    const postsWithInsights = await fetchPostInsights(limitedDetails, pageAccessToken);

    return { count: uniquePostsCount, details: postsWithInsights };
  } catch (error) {
    console.error('Error fetching Facebook posts:', error.message);
    if (error.response?.data) {
      console.error('Facebook API error details:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
};

/**
 * Gets Instagram posts for a business account within a date range
 * @param {string} instagramId - Instagram business account ID
 * @param {string} from - Start date (YYYY-MM-DD)
 * @param {string} to - End date (YYYY-MM-DD)
 * @param {number} [limit=25] - Maximum number of post details to return
 * @param {string} [businessTimezone] - Business timezone for timestamp conversion
 * @param {Object} [options={}] - Additional options
 * @param {string} [options.accessToken] - OAuth access token (required; provided from brand.connections.instagram_page.access_token)
 * @returns {Promise<Object>} Count of posts and post details
 */
exports.getInstagramPosts = async function(instagramId, from, to, limit = 25, businessTimezone = null, options = {}) {
  try {
    const { accessToken } = options;
    const instagramAccessToken = accessToken;

    if (!instagramAccessToken) {
      throw new Error('Instagram access token is required for getInstagramPosts (no META_ACCESS_TOKEN fallback)');
    }

    console.log(`Fetching Instagram posts for account ${instagramId} from ${from} to ${to}`);

    // First, verify the Instagram account exists and is accessible
    let username = instagramId;
    try {
      const accountResponse = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${instagramId}`, {
        params: {
          access_token: instagramAccessToken,
          fields: 'id,username,followers_count'
        }
      });

      username = accountResponse.data.username;
      console.log(`Instagram account verified: ${username} (ID: ${accountResponse.data.id})`);
    } catch (accountError) {
      console.error(`Error verifying Instagram account ${instagramId}:`, accountError.message);
    }

    // Fetch media from Instagram API
    const response = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${instagramId}/media`, {
      params: {
        access_token: instagramAccessToken,
        fields: 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username,like_count,comments_count,children{media_type,media_url,thumbnail_url}',
        limit: 100 // Maximum limit to reduce pagination
      }
    });
    
    console.log(`Instagram media API response received with ${response.data?.data?.length || 0} items`);
    
    if (!response.data || !response.data.data) {
      return { count: 0, details: [] };
    }
    
    // Filter posts within the date range
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999); // Include the entire end date
    
    const postsInRange = response.data.data.filter(post => {
      const postDate = new Date(post.timestamp);
      return postDate >= fromDate && postDate <= toDate;
    });
    
    console.log(`Found ${postsInRange.length} Instagram posts within date range`);
    
    // Process posts to extract details
    const postDetails = postsInRange.map(post => {
      // For carousel posts, get the first child's thumbnail
      let thumbnailUrl = post.thumbnail_url || post.media_url;
      if (post.media_type === 'CAROUSEL_ALBUM' && post.children && post.children.data && post.children.data.length > 0) {
        const firstChild = post.children.data[0];
        thumbnailUrl = firstChild.thumbnail_url || firstChild.media_url || thumbnailUrl;
      }
      
      return {
        id: post.id,
        caption: post.caption ? (post.caption.substring(0, 100) + (post.caption.length > 100 ? '...' : '')) : '',
        media_type: post.media_type,
        media_url: post.media_url,
        thumbnail_url: thumbnailUrl,
        permalink: post.permalink,
        timestamp: convertToBusinessTimezone(post.timestamp, businessTimezone),
        username: post.username || username,
        likes: post.like_count || 0,
        comments: post.comments_count || 0,
        children: post.children ? post.children.data.map(child => ({
          media_type: child.media_type,
          media_url: child.media_url,
          thumbnail_url: child.thumbnail_url || child.media_url
        })) : []
      };
    });
    
    // Sort posts by date (newest first)
    postDetails.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Limit to specified number of most recent posts for the details
    const limitedDetails = postDetails.slice(0, limit);
    
    console.log(`Found ${postsInRange.length} Instagram posts in date range, returning ${limitedDetails.length} in details (limit: ${limit})`);

    // Fetch insights for the limited posts using the same access token
    const postsWithInsights = await fetchInstagramInsights(limitedDetails, instagramAccessToken);

    return { count: postsInRange.length, details: postsWithInsights };
  } catch (error) {
    console.error('Error fetching Instagram posts:', error.message);
    throw error;
  }
};

/**
 * Gets the count of Facebook posts for a page within a date range
 * @param {string} pageId - Facebook page ID
 * @param {string} from - Start date (YYYY-MM-DD)
 * @param {string} to - End date (YYYY-MM-DD)
 * @param {number} [limit=25] - Maximum number of post details to return
 * @param {string} [businessTimezone] - Business timezone for timestamp conversion
 * @returns {Promise<Object>} Count of posts and post details
 */
exports.getFacebookPostsCount = async function(pageId, from, to, limit = 25, businessTimezone = null, options = {}) {
  try {
    // Use the full function to get both count and details
    const result = await exports.getFacebookPosts(pageId, from, to, limit, businessTimezone, options);
    return result;
  } catch (error) {
    console.error('Error in Facebook posts count:', error.message);
    return { count: 0, details: [] };
  }
};

/**
 * Gets the count of Instagram posts for a business account within a date range
 * @param {string} instagramId - Instagram business account ID
 * @param {string} from - Start date (YYYY-MM-DD)
 * @param {string} to - End date (YYYY-MM-DD)
 * @param {number} [limit=25] - Maximum number of post details to return
 * @param {string} [businessTimezone] - Business timezone for timestamp conversion
 * @param {Object} [options={}] - Additional options
 * @param {string} [options.accessToken] - OAuth access token (required; provided from brand.connections.instagram_page.access_token)
 * @returns {Promise<Object>} Count of posts and post details
 */
exports.getInstagramPostsCount = async function(instagramId, from, to, limit = 25, businessTimezone = null, options = {}) {
  try {
    // Use the full function to get both count and details
    const result = await exports.getInstagramPosts(instagramId, from, to, limit, businessTimezone, options);
    return result;
  } catch (error) {
    console.error('Error in Instagram posts count:', error.message);
    return { count: 0, details: [] };
  }
};

/**
 * NOTE: Facebook followers count is NOT available via OAuth as of 2024
 * Meta restricted access to fan_count and page_fans metrics to system user tokens only.
 * This function has been removed. Use Instagram followers instead if available.
 */

/**
 * Gets the followers count for an Instagram business account
 * @param {string} instagramId - Instagram business account ID
 * @param {Object} [options={}] - Additional options
 * @param {string} [options.accessToken] - OAuth access token (required; provided from brand.connections.instagram_page.access_token)
 * @returns {Promise<number>} Followers count
 */
exports.getInstagramFollowers = async function(instagramId, options = {}) {
  try {
    const { accessToken } = options;
    const instagramAccessToken = accessToken;

    if (!instagramAccessToken) {
      throw new Error('Instagram access token is required for getInstagramFollowers (no META_ACCESS_TOKEN fallback)');
    }

    const response = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${instagramId}`, {
      params: {
        access_token: instagramAccessToken,
        fields: 'followers_count'
      }
    });

    return response.data.followers_count || 0;
  } catch (error) {
    console.error('Error fetching Instagram followers:', error.message);
    return 0;
  }
};

/**
 * Fetches Facebook posts using brandId
 * @param {string} brandId - Brand ID to fetch Facebook data from
 * @param {string} from - Start date
 * @param {string} to - End date
 * @returns {Promise<Object>} Facebook posts response
 */
exports.getFacebookPostsByBrand = async (brandId, from, to) => {
  const { getBrandConnection } = require('./firebase-service.js');

  try {
    // Use centralized utility to extract Facebook connection
    const fbConnection = await getBrandConnection(brandId, 'facebook_page');

    if (!fbConnection || !fbConnection.page_id) {
      throw new Error(`Facebook page connection not found for brand ${brandId}`);
    }

    const pageId = fbConnection.page_id;
    const accessToken = fbConnection.access_token;

    console.log('Meta Social Service - Fetching Facebook posts by brand:', { brandId, pageId, from, to });

    return await exports.getFacebookPosts(pageId, from, to, 25, null, { accessToken });
  } catch (error) {
    console.error('Meta Social Service - Error fetching Facebook posts by brand:', error.message);
    throw error;
  }
};

/**
 * Fetches Instagram posts using brandId
 * @param {string} brandId - Brand ID to fetch Instagram data from
 * @param {string} from - Start date
 * @param {string} to - End date
 * @returns {Promise<Object>} Instagram posts response
 */
exports.getInstagramPostsByBrand = async (brandId, from, to) => {
  const { getBrandConnection } = require('./firebase-service.js');

  try {
    // Use centralized utility to extract Instagram connection
    const igConnection = await getBrandConnection(brandId, 'instagram_page');

    if (!igConnection || !igConnection.account_id) {
      throw new Error(`Instagram page connection not found for brand ${brandId}`);
    }

    const accountId = igConnection.account_id;
    const accessToken = igConnection.access_token;

    console.log('Meta Social Service - Fetching Instagram posts by brand:', { brandId, accountId, from, to });

    return await exports.getInstagramPostsCount(accountId, from, to, 25, null, { accessToken });
  } catch (error) {
    console.error('Meta Social Service - Error fetching Instagram posts by brand:', error.message);
    throw error;
  }
};
