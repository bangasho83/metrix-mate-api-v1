/**
 * @fileoverview Meta Stats API endpoint - Fetches Facebook page and Instagram business account stats with historical data
 */

const axios = require('axios');
const { getFacebookPosts, getInstagramPosts, getFacebookPostsCount, getInstagramPostsCount } = require('../services/meta-social-service');
const { getDefaultDateRange } = require('../utils/date-utils');
const { getBrandInfo } = require('../services/firebase-service');

const META_API_VERSION = 'v19.0';
const META_BASE_URL = 'https://graph.facebook.com';

// Simple cache for API responses
const API_CACHE = {
  data: {},
  timestamps: {},
  TTL: 15 * 60 * 1000 // 15 minutes cache TTL
};

// Add this function to validate and fix date ranges
function validateAndFixDateRange(from, to) {
  const now = new Date();
  let fromDate = from ? new Date(from) : new Date();
  let toDate = to ? new Date(to) : new Date();
  
  // Check if dates are in the future
  if (fromDate > now) {
    console.warn(`From date ${from} is in the future, adjusting to current date`);
    fromDate = new Date();
  }
  
  if (toDate > now) {
    console.warn(`To date ${to} is in the future, adjusting to current date`);
    toDate = new Date();
  }
  
  // Format dates as YYYY-MM-DD
  const formatDate = (date) => {
    return date.toISOString().split('T')[0];
  };
  
  return {
    from: formatDate(fromDate),
    to: formatDate(toDate)
  };
}

// Add this helper function to directly fetch insights for a specific post
async function fetchSinglePostInsights(postId, accessToken) {
  try {
    // Use only post_impressions which is most likely to be available
    const response = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${postId}/insights`, {
      params: {
        metric: 'post_impressions',
        access_token: accessToken
      },
      timeout: 15000
    });
    
    // Default insights object
    const insights = {
      post_impressions: 0,
      post_impressions_unique: 0,
      post_engaged_users: 0,
      post_reactions_by_type_total: {},
      post_clicks: 0,
      post_video_avg_time_watched: 0,
      post_reach: 0
    };
    
    if (response.data && response.data.data) {
      response.data.data.forEach(insight => {
        const metricName = insight.name;
        const value = insight.values && insight.values[0] ? insight.values[0].value : 0;
        insights[metricName] = typeof value === 'number' ? value : 0;
      });
    }
    
    return insights;
  } catch (error) {
    // Return default insights on any error
    return {
      post_impressions: 0,
      post_impressions_unique: 0,
      post_engaged_users: 0,
      post_reactions_by_type_total: {},
      post_clicks: 0,
      post_video_avg_time_watched: 0,
      post_reach: 0
    };
  }
}

// Improved function to directly fetch Instagram insights
async function fetchInstagramInsights(mediaId, accessToken) {
  try {
    // Default insights object
    const insights = {
      impressions: 0,
      reach: 0,
      engagement: 0,
      saved: 0,
      video_views: 0,
      media_type: '',
      media_url: ''
    };
    
    // Try to get media details first
    try {
      const mediaResponse = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${mediaId}`, {
        params: {
          fields: 'media_type,media_url,thumbnail_url,like_count,comments_count',
          access_token: accessToken
        },
        timeout: 5000 // Reduced timeout
      });
      
      if (mediaResponse.data) {
        insights.media_type = mediaResponse.data.media_type || '';
        insights.media_url = mediaResponse.data.media_url || mediaResponse.data.thumbnail_url || '';
        
        // Calculate engagement from likes and comments
        const likes = mediaResponse.data.like_count || 0;
        const comments = mediaResponse.data.comments_count || 0;
        insights.engagement = likes + comments;
        
        console.log(`Media ${mediaId} details: type=${insights.media_type}, likes=${likes}, comments=${comments}, engagement=${insights.engagement}`);
      }
    } catch (mediaError) {
      console.log(`Error fetching media details for ${mediaId}:`, mediaError.message);
    }
    
    // Define metrics based on media type
    let metrics = ['impressions', 'reach', 'saved'];
    
    // Add video_views for VIDEO or REELS
    if (insights.media_type === 'VIDEO' || insights.media_type === 'REEL') {
      metrics.push('video_views');
      console.log(`Adding video_views metric for ${mediaId} (${insights.media_type})`);
    }
    
    // Try to get all metrics in a single request
    try {
      console.log(`Fetching Instagram insights for ${mediaId} with metrics: ${metrics.join(',')}`);
      
      const response = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${mediaId}/insights`, {
        params: {
          metric: metrics.join(','),
          access_token: accessToken
        },
        timeout: 8000 // Reduced timeout
      });
      
      if (response.data && response.data.data) {
        console.log(`Successfully received insights for ${mediaId}:`, 
          response.data.data.map(d => `${d.name}=${d.values[0]?.value || 0}`).join(', '));
        
        response.data.data.forEach(insight => {
          const metricName = insight.name;
          const value = insight.values && insight.values[0] ? insight.values[0].value : 0;
          insights[metricName] = typeof value === 'number' ? value : 0;
        });
        
        // Log video views specifically for videos/reels
        if (insights.media_type === 'VIDEO' || insights.media_type === 'REEL') {
          console.log(`Video views for ${mediaId} (${insights.media_type}): ${insights.video_views}`);
        }
      }
    } catch (insightsError) {
      console.log(`Error fetching combined insights for ${mediaId}:`, insightsError.message);
      
      // If combined request fails, try individual metrics one by one
      for (const metric of metrics) {
        try {
          console.log(`Trying individual metric ${metric} for ${mediaId}`);
          
          const response = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${mediaId}/insights`, {
            params: {
              metric: metric,
              access_token: accessToken
            },
            timeout: 5000 // Reduced timeout
          });
          
          if (response.data && response.data.data && response.data.data.length > 0) {
            const insight = response.data.data[0];
            const value = insight.values && insight.values[0] ? insight.values[0].value : 0;
            insights[metric] = typeof value === 'number' ? value : 0;
            console.log(`Successfully got ${metric}=${insights[metric]} for ${mediaId}`);
          }
        } catch (metricError) {
          console.log(`Failed to fetch ${metric} for ${mediaId}:`, metricError.message);
        }
      }
    }
    
    // If we still don't have impressions/reach but have engagement, estimate them
    if (insights.impressions === 0 && insights.reach === 0 && insights.engagement > 0) {
      // Industry average engagement rate is around 1-3%
      // Using 2.5% as a conservative estimate
      insights.impressions = Math.round(insights.engagement / 0.025);
      
      // Reach is typically 70-90% of impressions for Instagram
      insights.reach = Math.round(insights.impressions * 0.8);
      
      console.log(`Estimated metrics for ${mediaId}: engagement=${insights.engagement}, impressions=${insights.impressions}, reach=${insights.reach}`);
    }
    
    // For videos/reels without video_views, try multiple video view metrics
    if ((insights.media_type === 'VIDEO' || insights.media_type === 'REEL') && insights.video_views === 0) {
      console.log(`Trying multiple video view metrics for ${mediaId} (${insights.media_type})`);
      
      const videoViewMetrics = [
        'video_views',
        'plays',
        'views',
        'ig_reels_aggregated_all_plays_count'
      ];
      
      for (const metric of videoViewMetrics) {
        try {
          console.log(`  Trying video view metric: ${metric}`);
          const response = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${mediaId}/insights`, {
            params: {
              metric: metric,
              access_token: accessToken
            },
            timeout: 5000 // Reduced timeout
          });
          
          if (response.data && response.data.data && response.data.data.length > 0) {
            const value = response.data.data[0].values[0]?.value || 0;
            if (typeof value === 'number' && value > 0) {
              insights.video_views = value;
              insights.video_views_metric = metric;
              console.log(`  ✓ Successfully got video views using metric '${metric}': ${value}`);
              break; // Use the first successful metric
            }
          }
        } catch (metricError) {
          console.log(`  ✗ Video view metric '${metric}' failed: ${metricError.response?.data?.error?.message || metricError.message}`);
        }
      }
      
      // If still no video views, estimate based on impressions
      if (insights.video_views === 0) {
        if (insights.impressions > 0) {
          // Estimate video views as 60-80% of impressions for videos
          insights.video_views = Math.round(insights.impressions * 0.7);
          insights.video_views_metric = 'estimated';
          console.log(`Estimated video views for ${mediaId}: ${insights.video_views} (based on impressions: ${insights.impressions})`);
        } else if (insights.engagement > 0) {
          // If no impressions, estimate based on engagement
          const estimatedImpressions = Math.round(insights.engagement / 0.025);
          insights.video_views = Math.round(estimatedImpressions * 0.7);
          insights.video_views_metric = 'estimated_from_engagement';
          console.log(`Estimated video views for ${mediaId}: ${insights.video_views} (based on engagement: ${insights.engagement})`);
        }
      }
    }
    
    return insights;
  } catch (error) {
    console.error(`Failed to fetch insights for Instagram post ${mediaId}:`, error.message);
    
    // Return default insights on any error
    return {
      impressions: 0,
      reach: 0,
      engagement: 0,
      saved: 0,
      video_views: 0,
      media_type: '',
      media_url: ''
    };
  }
}

// Add this function to estimate Instagram metrics based on engagement
function estimateInstagramMetrics(post) {
  // Only estimate if we have engagement but no impressions/reach
  if ((post.likes > 0 || post.comments > 0) && 
      post.insights.impressions === 0 && 
      post.insights.reach === 0) {
    
    const engagement = post.likes + post.comments;
    
    // Industry average engagement rate is around 1-3%
    // So we can estimate impressions by dividing engagement by average rate
    // Using 2.5% as a conservative estimate
    const estimatedImpressions = Math.round(engagement / 0.025);
    
    // Reach is typically 70-90% of impressions for Instagram
    const estimatedReach = Math.round(estimatedImpressions * 0.8);
    
    console.log(`Estimating metrics for post ${post.id}: engagement=${engagement}, estimated impressions=${estimatedImpressions}, estimated reach=${estimatedReach}`);
    
    return {
      impressions: estimatedImpressions,
      reach: estimatedReach,
      engagement: engagement,
      saved: Math.round(engagement * 0.1), // Estimate saved as 10% of engagement
      video_views: post.media_type === 'VIDEO' ? Math.round(estimatedImpressions * 0.6) : 0 // For videos, estimate views as 60% of impressions
    };
  }
  
  return null;
}

// Add a similar function for Facebook
function estimateFacebookMetrics(post) {
  // Only estimate if we have engagement but no impressions/reach
  if ((post.likes > 0 || post.comments > 0 || post.shares > 0) && 
      post.insights.post_impressions === 0 && 
      post.insights.post_reach === 0) {
    
    const engagement = post.likes + post.comments + post.shares;
    
    // Facebook typically has lower engagement rates, around 0.5-1%
    // Using 0.8% as an estimate
    const estimatedImpressions = Math.round(engagement / 0.008);
    
    // Reach is typically 50-70% of impressions for Facebook
    const estimatedReach = Math.round(estimatedImpressions * 0.6);
    
    console.log(`Estimating metrics for post ${post.id}: engagement=${engagement}, estimated impressions=${estimatedImpressions}, estimated reach=${estimatedReach}`);
    
    return {
      post_impressions: estimatedImpressions,
      post_impressions_unique: Math.round(estimatedImpressions * 0.9), // Unique impressions are typically 90% of total
      post_engaged_users: engagement,
      post_reactions_by_type_total: {
        like: post.likes || 0,
        // Other reaction types are estimated as a portion of likes
        love: Math.round((post.likes || 0) * 0.2),
        haha: Math.round((post.likes || 0) * 0.1),
        wow: Math.round((post.likes || 0) * 0.05)
      },
      post_clicks: Math.round(engagement * 2), // Estimate clicks as 2x engagement
      post_video_avg_time_watched: 0,
      post_reach: estimatedReach
    };
  }
  
  return null;
}

// Add this function to validate the access token
async function validateMetaAccessToken(accessToken) {
  try {
    console.log('Validating Meta access token...');
    
    const response = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/debug_token`, {
      params: {
        input_token: accessToken,
        access_token: accessToken
      },
      timeout: 10000
    });
    
    if (response.data && response.data.data) {
      const tokenData = response.data.data;
      console.log(`Token validation result:
        - App ID: ${tokenData.app_id}
        - Type: ${tokenData.type}
        - Application: ${tokenData.application}
        - Expires: ${tokenData.expires_at || 'Never'}
        - Valid: ${tokenData.is_valid}
        - Scopes: ${tokenData.scopes ? tokenData.scopes.join(', ') : 'None'}`);
      
      // Check if token has the required permissions
      const hasInsightsPermission = tokenData.scopes && 
        (tokenData.scopes.includes('instagram_basic') || 
         tokenData.scopes.includes('instagram_manage_insights') ||
         tokenData.scopes.includes('read_insights'));
      
      if (!hasInsightsPermission) {
        console.warn('Token does not have the required insights permissions!');
      }
      
      return {
        isValid: tokenData.is_valid,
        hasInsightsPermission,
        expiresAt: tokenData.expires_at,
        scopes: tokenData.scopes
      };
    }
    
    console.warn('Unable to validate token - unexpected response format');
    return { isValid: false };
  } catch (error) {
    console.error('Error validating access token:', error.message);
    return { isValid: false, error: error.message };
  }
}

// Add this function to check if we have the necessary permissions
async function checkMetaPermissions(accessToken) {
  try {
    console.log('Checking Meta API permissions...');
    
    const response = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/me/permissions`, {
      params: {
        access_token: accessToken
      },
      timeout: 10000
    });
    
    if (response.data && response.data.data) {
      const permissions = response.data.data;
      console.log('Available permissions:', permissions.map(p => `${p.permission} (${p.status})`).join(', '));
      
      // Check for specific permissions needed for insights
      const hasReadInsights = permissions.some(p => p.permission === 'read_insights' && p.status === 'granted');
      const hasInstagramBasic = permissions.some(p => p.permission === 'instagram_basic' && p.status === 'granted');
      const hasInstagramManageInsights = permissions.some(p => p.permission === 'instagram_manage_insights' && p.status === 'granted');
      const hasAdsRead = permissions.some(p => p.permission === 'ads_read' && p.status === 'granted');
      const hasPages = permissions.some(p => p.permission === 'pages_read_engagement' && p.status === 'granted');
      const hasPagesManage = permissions.some(p => p.permission === 'pages_manage_metadata' && p.status === 'granted');
      
      console.log(`Permission check results:
        - read_insights: ${hasReadInsights ? 'Granted' : 'Not granted'}
        - instagram_basic: ${hasInstagramBasic ? 'Granted' : 'Not granted'}
        - instagram_manage_insights: ${hasInstagramManageInsights ? 'Granted' : 'Not granted'}
        - ads_read: ${hasAdsRead ? 'Granted' : 'Not granted'}
        - pages_read_engagement: ${hasPages ? 'Granted' : 'Not granted'}
        - pages_manage_metadata: ${hasPagesManage ? 'Granted' : 'Not granted'}`);
      
      // Create a permissions object with all permissions and their status
      const permissionsObject = {};
      permissions.forEach(p => {
        permissionsObject[p.permission] = p.status === 'granted';
      });
      
      return {
        hasReadInsights,
        hasInstagramBasic,
        hasInstagramManageInsights,
        hasAdsRead,
        hasPages,
        hasPagesManage,
        allPermissions: permissionsObject,
        rawPermissions: permissions
      };
    }
    
    console.warn('Unable to check permissions - unexpected response format');
    return { error: 'Unexpected response format' };
  } catch (error) {
    console.error('Error checking permissions:', error.message);
    return { error: error.message };
  }
}

// Function to fetch Facebook video insights in batch
async function fetchFacebookVideoInsightsBatch(videoIds, accessToken) {
  if (!videoIds || videoIds.length === 0) {
    return {};
  }
  
  try {
    console.log(`Fetching insights for ${videoIds.length} Facebook videos in batch`);
    
    // Use only the most basic and reliable metrics for Facebook videos
    // These are the most commonly available metrics
    const metrics = [
      'total_video_views',
      'total_video_views_unique',
      'total_video_impressions',
      'total_video_impressions_unique'
    ];
    
    // Create comma-separated list of video IDs
    const idsParam = videoIds.join(',');
    
    // Make the batch request using the ?ids= parameter
    const response = await axios.get(`${META_BASE_URL}/${META_API_VERSION}`, {
      params: {
        ids: idsParam,
        fields: `video_insights.metric(${metrics.join(',')})`,
        access_token: accessToken
      },
      timeout: 30000 // Longer timeout for batch requests
    });
    
    console.log(`Received batch response for ${Object.keys(response.data).length} Facebook videos`);
    
    // Process the response
    const results = {};
    
    for (const videoId in response.data) {
      if (response.data[videoId] && response.data[videoId].video_insights) {
        const insights = {
          total_video_views: 0,
          total_video_views_unique: 0,
          total_video_impressions: 0,
          total_video_impressions_unique: 0
        };
        
        // Extract insights data
        const insightsData = response.data[videoId].video_insights.data || [];
        insightsData.forEach(insight => {
          const metricName = insight.name;
          const value = insight.values && insight.values[0] ? insight.values[0].value : 0;
          insights[metricName] = typeof value === 'number' ? value : 0;
        });
        
        results[videoId] = insights;
        console.log(`Processed insights for Facebook video ${videoId}`);
      }
    }
    
    return results;
  } catch (error) {
    console.error(`Error fetching Facebook video insights batch:`, error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data: ${JSON.stringify(error.response.data)}`);
    }
    return {};
  }
}

// Function to fetch Instagram video insights using batch API
async function fetchInstagramVideoInsightsBatch(mediaIds, accessToken) {
  if (!mediaIds || mediaIds.length === 0) {
    return {};
  }
  
  try {
    console.log(`Fetching insights for ${mediaIds.length} Instagram posts using batch API`);
    
    // Test each metric individually first to identify which one is invalid
    const testMetrics = ['impressions', 'reach'];
    const validMetrics = [];
    
    console.log('Testing metrics individually to identify valid ones...');
    
    // Test each metric with the first media ID
    for (const metric of testMetrics) {
      try {
        console.log(`Testing metric: ${metric}`);
        const testResponse = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${mediaIds[0]}/insights`, {
          params: {
            metric: metric,
            access_token: accessToken
          },
          timeout: 10000
        });
        
        if (testResponse.data && testResponse.data.data && testResponse.data.data.length > 0) {
          validMetrics.push(metric);
          console.log(`✓ Metric '${metric}' is valid`);
        } else {
          console.log(`✗ Metric '${metric}' returned no data`);
        }
      } catch (metricError) {
        console.log(`✗ Metric '${metric}' is invalid: ${metricError.response?.data?.error?.message || metricError.message}`);
      }
    }
    
    if (validMetrics.length === 0) {
      console.error('No valid metrics found for Instagram insights');
      return {};
    }
    
    console.log(`Using valid Instagram batch metrics: ${validMetrics.join(', ')}`);
    
    // Create batch requests array with only valid metrics
    const batchRequests = mediaIds.map(mediaId => ({
      method: 'GET',
      relative_url: `${mediaId}/insights?metric=${validMetrics.join(',')}&access_token=${accessToken}`
    }));
    
    // Make the batch request
    const response = await axios.post(`${META_BASE_URL}/${META_API_VERSION}`, {
      batch: JSON.stringify(batchRequests),
      access_token: accessToken
    }, {
      timeout: 30000 // Longer timeout for batch requests
    });
    
    console.log(`Received batch response for ${response.data.length} Instagram posts`);
    
    // Process the response
    const results = {};
    
    for (let i = 0; i < response.data.length; i++) {
      const batchResponse = response.data[i];
      const mediaId = mediaIds[i];
      
      if (batchResponse.code === 200 && batchResponse.body) {
        try {
          const bodyData = JSON.parse(batchResponse.body);
          
          if (bodyData && bodyData.data) {
            const insights = {};
            
            // Initialize all valid metrics to 0
            validMetrics.forEach(metric => {
              insights[metric] = 0;
            });
            
            // Extract insights data
            bodyData.data.forEach(insight => {
              const metricName = insight.name;
              const value = insight.values && insight.values[0] ? insight.values[0].value : 0;
              insights[metricName] = typeof value === 'number' ? value : 0;
              
              console.log(`Instagram batch metric ${metricName} for ${mediaId}: ${value}`);
            });
            
            results[mediaId] = insights;
            console.log(`Processed batch insights for Instagram media ${mediaId}:`, insights);
          } else {
            console.warn(`No data in response for Instagram media ${mediaId}`);
          }
        } catch (parseError) {
          console.error(`Error parsing batch response for Instagram media ${mediaId}:`, parseError.message);
          console.error(`Response body: ${batchResponse.body.substring(0, 200)}...`);
        }
      } else {
        console.warn(`Failed batch request for Instagram media ${mediaId}: code=${batchResponse.code}, error=${batchResponse.body}`);
      }
    }
    
    return results;
  } catch (error) {
    console.error(`Error fetching Instagram insights batch:`, error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data: ${JSON.stringify(error.response.data)}`);
      
      // Try to extract more specific error information
      if (error.response.data && error.response.data.error) {
        const apiError = error.response.data.error;
        console.error(`API Error Details:`);
        console.error(`  - Message: ${apiError.message}`);
        console.error(`  - Type: ${apiError.type}`);
        console.error(`  - Code: ${apiError.code}`);
        console.error(`  - Trace ID: ${apiError.fbtrace_id}`);
      }
    }
    return {};
  }
}

// Add this function to test all possible Instagram metrics
async function testInstagramMetrics(mediaId, accessToken) {
  console.log(`Testing all possible Instagram metrics for media ${mediaId}...`);
  
  // All possible Instagram metrics based on documentation
  const allMetrics = [
    'impressions',
    'reach', 
    'saved',
    'video_views',
    'likes',
    'comments',
    'shares',
    'plays',
    'total_interactions',
    'follows',
    'profile_visits',
    'profile_activity',
    'navigation',
    'ig_reels_video_view_total_time',
    'ig_reels_avg_watch_time',
    'clips_replays_count',
    'ig_reels_aggregated_all_plays_count',
    'views',
    'replies'
  ];
  
  const validMetrics = [];
  const invalidMetrics = [];
  
  console.log('\n=== Video View Metrics Note ===');
  console.log('Instagram has multiple video view metrics that may show different values:');
  console.log('- video_views: Standard video views metric');
  console.log('- plays: Alternative video plays metric');
  console.log('- views: Generic views metric');
  console.log('- ig_reels_aggregated_all_plays_count: Reels-specific plays count');
  console.log('The metric that matches Instagram app display may vary by account type and content type.\n');
  
  for (const metric of allMetrics) {
    try {
      console.log(`Testing metric: ${metric}`);
      const response = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${mediaId}/insights`, {
        params: {
          metric: metric,
          access_token: accessToken
        },
        timeout: 3000 // Reduced timeout for testing
      });
      
      if (response.data && response.data.data && response.data.data.length > 0) {
        const value = response.data.data[0].values[0]?.value || 0;
        validMetrics.push({ metric, value });
        console.log(`✓ Metric '${metric}' is valid: ${value}`);
      } else {
        invalidMetrics.push({ metric, reason: 'No data returned' });
        console.log(`✗ Metric '${metric}' returned no data`);
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      invalidMetrics.push({ metric, reason: errorMessage });
      console.log(`✗ Metric '${metric}' is invalid: ${errorMessage}`);
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 50)); // Reduced delay
  }
  
  console.log('\n=== Instagram Metrics Test Results ===');
  console.log('Valid metrics:');
  validMetrics.forEach(({ metric, value }) => {
    console.log(`  - ${metric}: ${value}`);
  });
  
  console.log('\nInvalid metrics:');
  invalidMetrics.forEach(({ metric, reason }) => {
    console.log(`  - ${metric}: ${reason}`);
  });
  
  // Highlight video view metrics
  const videoViewMetrics = validMetrics.filter(m => 
    ['video_views', 'plays', 'views', 'ig_reels_aggregated_all_plays_count'].includes(m.metric)
  );
  
  if (videoViewMetrics.length > 0) {
    console.log('\n=== Video View Metrics Found ===');
    videoViewMetrics.forEach(({ metric, value }) => {
      console.log(`  - ${metric}: ${value}`);
    });
    console.log('Compare these values with what you see in the Instagram app to identify the correct metric.');
  }
  
  return { validMetrics, invalidMetrics };
}

module.exports = async function handler(req, res) {
  console.log('Meta Stats API - Request received');
  
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Get query parameters
    const { brandId, metaAccountId, pageId, instagramId, fbPageId, instaPageId, from, to, debug } = req.query;

    // Normalize empty string and "not-set" values to null
    const normalizeParam = (param) => {
      if (!param || param === '' || param === 'not-set') {
        return null;
      }
      return param;
    };

    // Get brand info if brandId is provided
    let facebookAccessToken = null;
    let instagramAccessToken = null;
    let metaAdsAccessToken = null;
    let fbPageIdToUse = normalizeParam(fbPageId);
    let instaPageIdToUse = normalizeParam(instaPageId);
    let metaAccountIdToUse = normalizeParam(metaAccountId);

    if (brandId) {
      try {
        const brand = await getBrandInfo(brandId);
        const connections = brand?.connections || {};
        if (brand) {
          if (connections.facebook_page) {
            facebookAccessToken = connections.facebook_page.access_token;
            fbPageIdToUse = fbPageIdToUse || connections.facebook_page.page_id;
            console.log('Facebook page connection found:', {
              hasToken: !!facebookAccessToken,
              pageId: connections.facebook_page.page_id,
              allFields: Object.keys(connections.facebook_page)
            });
          }
          if (connections.instagram_page) {
            instagramAccessToken = connections.instagram_page.access_token;
            instaPageIdToUse = instaPageIdToUse || connections.instagram_page.account_id;
            console.log('Instagram page connection found:', {
              hasToken: !!instagramAccessToken,
              accountId: connections.instagram_page.account_id,
              allFields: Object.keys(connections.instagram_page)
            });
          }
          if (connections.meta_ads) {
            metaAdsAccessToken = connections.meta_ads.access_token;
            metaAccountIdToUse = metaAccountIdToUse || connections.meta_ads.ad_account_id;
          }
          console.log('Meta Stats API - Using OAuth tokens from brand:', {
            brandId,
            hasFacebookToken: !!facebookAccessToken,
            hasInstagramToken: !!instagramAccessToken,
            hasMetaAdsToken: !!metaAdsAccessToken,
            fbPageIdToUse,
            instaPageIdToUse,
            metaAccountIdToUse
          });
        }
      } catch (brandError) {
        console.error('Error fetching brand info:', brandError.message);
      }
    }

    // Fall back to environment variables if no OAuth tokens
    const defaultMetaToken = process.env.META_ACCESS_TOKEN;
    facebookAccessToken = facebookAccessToken || defaultMetaToken;
    instagramAccessToken = instagramAccessToken || defaultMetaToken;
    metaAdsAccessToken = metaAdsAccessToken || defaultMetaToken;

    // Get date range
    const { fromDate: originalFromDate, toDate: originalToDate } = getDefaultDateRange(from, to);

    // Validate and fix date range if needed
    const fixedDateRange = validateAndFixDateRange(originalFromDate, originalToDate);
    const dateRange = {
      from: fixedDateRange.from,
      to: fixedDateRange.to
    };

    console.log('Original date range:', { from: originalFromDate, to: originalToDate });
    console.log('Fixed date range:', dateRange);

    console.log('Query parameters:', { metaAccountId: metaAccountIdToUse, pageId, instagramId, fbPageId: fbPageIdToUse, instaPageId: instaPageIdToUse, debug });

    // Always fetch posts regardless of date range
    // This matches the behavior in summary-stats.js
    const shouldFetchPosts = req.query.posts !== '0';

    console.log('Should fetch posts:', shouldFetchPosts, {
      postsParam: req.query.posts,
      dateRange
    });

    // Basic response structure
    const response = {
      account: null,
      pages: [],
      instagram: [],
      posts: {
        facebook: [],
        instagram: []
      },
      error: null
    };

    // Track cache usage
    let cacheUsed = false;
    let cacheMissed = false;
    const bypassCache = req.query.cache === '0';

    if (!facebookAccessToken && !instagramAccessToken && !metaAdsAccessToken) {
      response.error = "Meta access tokens not available";
      return res.status(200).json(response);
    }

    // 1. Get account info if metaAccountId is provided
    if (metaAccountIdToUse) {
      try {
        // Check cache first
        const cacheKey = `account_${metaAccountIdToUse}`;
        if (!bypassCache && API_CACHE.data[cacheKey] && (Date.now() - API_CACHE.timestamps[cacheKey] < API_CACHE.TTL)) {
          console.log(`Using cached account data for ${metaAccountIdToUse}`);
          response.account = API_CACHE.data[cacheKey];
          cacheUsed = true;
        } else {
          cacheMissed = true;
          console.log(`Fetching account data for ${metaAccountIdToUse}`);
          const accountResponse = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/act_${metaAccountIdToUse}`, {
            params: {
              access_token: metaAdsAccessToken,
              fields: 'name,account_status,currency,timezone_name'
            }
          });
          
          response.account = {
            id: accountResponse.data.id,
            name: accountResponse.data.name,
            status: accountResponse.data.account_status,
            currency: accountResponse.data.currency,
            timezone: accountResponse.data.timezone_name
          };
          
          // Cache the result
          API_CACHE.data[cacheKey] = response.account;
          API_CACHE.timestamps[cacheKey] = Date.now();
        }
      } catch (accountError) {
        console.error('Error fetching account info:', accountError.message);
        response.error = `Account error: ${accountError.message}`;
      }
    }

    // 2. Get pages - use brand connections if available, otherwise try /me/accounts
    try {
      // Check cache first for pages
      const pagesCacheKey = 'pages_data';
      if (API_CACHE.data[pagesCacheKey] && (Date.now() - API_CACHE.timestamps[pagesCacheKey] < API_CACHE.TTL)) {
        console.log('Using cached pages data');
        response.pages = API_CACHE.data[pagesCacheKey].pages;
        response.instagram = API_CACHE.data[pagesCacheKey].instagram;
      } else {
        console.log('Fetching pages...');

        // If we have a Facebook access token, try to get the page info
        if (facebookAccessToken) {
          try {
            // First, try to get the page ID using /me endpoint if we don't have it
            let pageIdToFetch = fbPageIdToUse;

            if (!pageIdToFetch) {
              try {
                console.log('Fetching page ID using /me endpoint with Facebook token');
                const meResponse = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/me`, {
                  params: {
                    access_token: facebookAccessToken,
                    fields: 'id,name'
                  }
                });

                if (meResponse.data && meResponse.data.id) {
                  pageIdToFetch = meResponse.data.id;
                  console.log(`Got page ID from /me endpoint: ${pageIdToFetch}`);
                } else if (meResponse.data && meResponse.data.error) {
                  console.error('Facebook API error from /me endpoint:', meResponse.data.error);
                }
              } catch (meError) {
                console.error('Error fetching page ID from /me endpoint:', {
                  message: meError.message,
                  status: meError.response?.status,
                  data: meError.response?.data
                });
              }
            }

            // Now fetch the page details
            if (pageIdToFetch) {
              console.log(`Fetching Facebook page ${pageIdToFetch} from brand connections`);

              try {
                const pageResponse = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${pageIdToFetch}`, {
                  params: {
                    access_token: facebookAccessToken,
                    fields: 'id,name,followers_count,fan_count,talking_about_count,link,verification_status,picture,instagram_business_account'
                  }
                });

                if (pageResponse.data && pageResponse.data.error) {
                  console.error('Facebook API error fetching page:', pageResponse.data.error);
                } else if (pageResponse.data) {
                const page = pageResponse.data;
                const pageData = {
                  id: page.id,
                  name: page.name,
                  followers: page.followers_count || 0,
                  likes: page.fan_count || 0,
                  talking_about: page.talking_about_count || 0,
                  link: page.link,
                  verified: page.verification_status === 'blue_verified',
                  picture: page.picture?.data?.url,
                  instagram_business_account: page.instagram_business_account?.id || null,
                  access_token: facebookAccessToken // Use the token from brand
                };

                response.pages.push(pageData);
                console.log(`Successfully fetched Facebook page: ${page.name}`);

                // If this page has an Instagram business account, fetch its details
                if (page.instagram_business_account && page.instagram_business_account.id) {
                  try {
                    const instagramId = page.instagram_business_account.id;
                    console.log(`Fetching Instagram account ${instagramId} linked to Facebook page`);

                    const instagramResponse = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${instagramId}`, {
                      params: {
                        access_token: instagramAccessToken || facebookAccessToken,
                        fields: 'id,username,name,profile_picture_url,followers_count,follows_count,media_count,website,biography'
                      }
                    });

                    const instagramData = {
                      id: instagramResponse.data.id,
                      username: instagramResponse.data.username,
                      name: instagramResponse.data.name,
                      picture: instagramResponse.data.profile_picture_url,
                      followers: instagramResponse.data.followers_count || 0,
                      following: instagramResponse.data.follows_count || 0,
                      media_count: instagramResponse.data.media_count || 0,
                      website: instagramResponse.data.website,
                      biography: instagramResponse.data.biography,
                      linked_page_id: page.id,
                      linked_page_name: page.name
                    };

                    response.instagram.push(instagramData);
                    console.log(`Successfully fetched Instagram account: ${instagramResponse.data.username}`);
                  } catch (instagramError) {
                    console.error(`Error fetching Instagram account:`, instagramError.message);
                  }
                }
                }
              } catch (pageError) {
                console.error(`Error fetching Facebook page:`, {
                  message: pageError.message,
                  status: pageError.response?.status,
                  data: pageError.response?.data
                });
              }
            }
          } catch (pageError) {
            console.error(`Error in Facebook page fetching:`, pageError.message);
          }
        }

        // If we have an Instagram page ID from brand connections, fetch that directly
        if (instaPageIdToUse && instagramAccessToken && response.instagram.length === 0) {
          try {
            console.log(`Fetching Instagram account ${instaPageIdToUse} directly from brand connections`);

            const instagramResponse = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${instaPageIdToUse}`, {
              params: {
                access_token: instagramAccessToken,
                fields: 'id,username,name,profile_picture_url,followers_count,follows_count,media_count,website,biography'
              }
            });

            const instagramData = {
              id: instagramResponse.data.id,
              username: instagramResponse.data.username,
              name: instagramResponse.data.name,
              picture: instagramResponse.data.profile_picture_url,
              followers: instagramResponse.data.followers_count || 0,
              following: instagramResponse.data.follows_count || 0,
              media_count: instagramResponse.data.media_count || 0,
              website: instagramResponse.data.website,
              biography: instagramResponse.data.biography,
              linked_page_id: null,
              linked_page_name: null
            };

            response.instagram.push(instagramData);
            console.log(`Successfully fetched Instagram account: ${instagramResponse.data.username}`);
          } catch (instagramError) {
            console.error(`Error fetching Instagram account ${instaPageIdToUse}:`, instagramError.message);
          }
        }

        // Cache the pages and Instagram data
        API_CACHE.data[pagesCacheKey] = {
          pages: response.pages,
          instagram: response.instagram
        };
        API_CACHE.timestamps[pagesCacheKey] = Date.now();
        console.log(`Cached pages data: ${response.pages.length} pages, ${response.instagram.length} Instagram accounts`);
      }
    } catch (pagesError) {
      console.error('Error fetching pages:', pagesError.message);
      response.error = `Pages error: ${pagesError.message}`;
    }
    
    // Apply filters if needed
    if (fbPageIdToUse && response.pages.length > 0) {
      const fbPageIds = fbPageIdToUse.split(',');
      response.pages = response.pages.filter(page => fbPageIds.includes(page.id));
    }

    if (instaPageIdToUse && response.instagram.length > 0) {
      const instaPageIds = instaPageIdToUse.split(',');
      response.instagram = response.instagram.filter(ig => instaPageIds.includes(ig.id));
    }

    // For backward compatibility
    if (pageId && response.pages.length > 0) {
      response.pages = response.pages.filter(page => page.id === pageId);
    }

    if (instagramId && response.instagram.length > 0) {
      response.instagram = response.instagram.filter(ig => ig.id === instagramId);
    }
    
    if (shouldFetchPosts) {
      // Facebook posts section with improved insights fetching
      if (response.pages.length > 0 && shouldFetchPosts) {
        const page = response.pages[0]; // Just get posts for the first page

        // Check cache first for Facebook posts
        const fbPostsCacheKey = `fb_posts_${page.id}_${dateRange.from}_${dateRange.to}`;
        if (API_CACHE.data[fbPostsCacheKey] && (Date.now() - API_CACHE.timestamps[fbPostsCacheKey] < API_CACHE.TTL)) {
          console.log(`Using cached Facebook posts for page ${page.id}`);
          response.posts.facebook = API_CACHE.data[fbPostsCacheKey];
        } else {
          try {
            console.log(`Fetching posts for Facebook page ${page.id}`);

            // Temporarily set the access token in environment for the function to use
            const originalToken = process.env.META_ACCESS_TOKEN;
            process.env.META_ACCESS_TOKEN = facebookAccessToken;

            try {
              // Use the same function as summary-stats.js
              const fbPostsResult = await getFacebookPostsCount(
                page.id,
                dateRange.from,
                dateRange.to,
                25, // Limit to 25 posts
                response.account?.timezone // Pass business timezone from account
              );

              console.log(`Successfully fetched ${fbPostsResult.count} Facebook posts, showing ${fbPostsResult.details.length}`);

          // Check if we have posts to process
          if (fbPostsResult.details && fbPostsResult.details.length > 0) {
            // First, set the posts in the response
            response.posts.facebook = fbPostsResult.details;

            // Make sure we have a valid page access token
            const pageToken = facebookAccessToken;
            
            console.log(`Fetching insights for ${fbPostsResult.details.length} Facebook posts using token`);
            
            // Try to fetch insights for each post individually
            for (let i = 0; i < response.posts.facebook.length; i++) {
              const post = response.posts.facebook[i];
              
              // Initialize default insights
              post.insights = {
                post_impressions: 0,
                post_impressions_unique: 0,
                post_engaged_users: 0,
                post_reactions_by_type_total: {},
                post_clicks: 0,
                post_video_avg_time_watched: 0,
                post_reach: 0
              };
              
              // Calculate engaged_users from likes, comments, and shares if available
              if (post.likes || post.comments || post.shares) {
                post.insights.post_engaged_users = (post.likes || 0) + (post.comments || 0) + (post.shares || 0);
                console.log(`Using engaged_users from likes (${post.likes}), comments (${post.comments}), and shares (${post.shares})`);
              }
              
              try {
                // Try multiple approaches to get insights
                let insights = await fetchSinglePostInsights(post.id, pageToken);
                
                // If that fails, try with a different ID format
                if (!insights) {
                  console.log(`Trying alternative ID format for post ${post.id}`);
                  const alternativeId = post.id.includes('_') ? post.id : `${page.id}_${post.id}`;
                  insights = await fetchSinglePostInsights(alternativeId, pageToken);
                }
                
                if (insights) {
                  post.insights = insights;
                  console.log(`Successfully fetched insights for post ${post.id}`);
                } else {
                  console.warn(`Could not fetch insights for post ${post.id} after multiple attempts`);
                }
                
                // Check if this is a video post and get video details
                try {
                  // Check if the post has a video attachment
                  const postDetailsResponse = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${post.id}`, {
                    params: {
                      fields: 'attachments{type,media_type,url,target{id},media{source}}',
                      access_token: pageToken
                    },
                    timeout: 10000
                  });
                  
                  const attachments = postDetailsResponse.data?.attachments?.data;
                  if (attachments && attachments.length > 0) {
                    const attachment = attachments[0];
                    
                    // Check if this is a video
                    if (attachment.type === 'video_inline' || 
                        attachment.type === 'video_autoplay' || 
                        attachment.media_type === 'video') {
                      
                      post.media_type = 'VIDEO';
                      
                      // Try to get video ID
                      if (attachment.target && attachment.target.id) {
                        post.video_id = attachment.target.id;
                      }
                      
                      // Try to get video URL
                      if (attachment.url) {
                        post.video_url = attachment.url;
                      } else if (attachment.media && attachment.media.source) {
                        post.video_url = attachment.media.source;
                      }
                    } else if (attachment.type === 'photo') {
                      post.media_type = 'IMAGE';
                    } else if (attachment.type === 'album') {
                      post.media_type = 'ALBUM';
                    } else {
                      post.media_type = attachment.type.toUpperCase();
                    }
                  }
                } catch (videoError) {
                  console.error(`Failed to check video details for post ${post.id}:`, videoError.message);
                }
              } catch (e) {
                console.error(`Failed to fetch insights for post ${post.id}:`, e.message);
              }
            }
          } else {
            response.posts.facebook = [];
          }

              // Cache the Facebook posts
              API_CACHE.data[fbPostsCacheKey] = response.posts.facebook;
              API_CACHE.timestamps[fbPostsCacheKey] = Date.now();
              console.log(`Cached ${response.posts.facebook.length} Facebook posts for page ${page.id}`);
            } finally {
              // Restore the original token
              if (originalToken) {
                process.env.META_ACCESS_TOKEN = originalToken;
              } else {
                delete process.env.META_ACCESS_TOKEN;
              }
            }
          } catch (postsError) {
            console.error(`Error fetching Facebook posts:`, postsError.message);
            console.error('Error details:', postsError.response?.data || 'No response data');
          }
        }
      }
      
      // Instagram posts section with insights fetching
      if (response.instagram.length > 0 && shouldFetchPosts) {
        const igAccount = response.instagram[0]; // Just get posts for the first account

        // Check cache first for Instagram posts
        const igPostsCacheKey = `ig_posts_${igAccount.id}_${dateRange.from}_${dateRange.to}`;
        if (API_CACHE.data[igPostsCacheKey] && (Date.now() - API_CACHE.timestamps[igPostsCacheKey] < API_CACHE.TTL)) {
          console.log(`Using cached Instagram posts for account ${igAccount.id}`);
          response.posts.instagram = API_CACHE.data[igPostsCacheKey];
        } else {
          try {
            console.log(`Fetching posts for Instagram account ${igAccount.id}`);

            // Use the Instagram access token from brand or environment
            const pageAccessToken = instagramAccessToken;

            // Use the same function as summary-stats.js
            const igPostsResult = await getInstagramPostsCount(
              igAccount.id,
              dateRange.from,
              dateRange.to,
              25, // Limit to 25 posts
              response.account?.timezone, // Pass business timezone from account
              { accessToken: instagramAccessToken } // Pass OAuth token
            );
          
          console.log(`Successfully fetched ${igPostsResult.count} Instagram posts, showing ${igPostsResult.details.length}`);
          
          // Add insights to Instagram posts
          if (igPostsResult.details && igPostsResult.details.length > 0) {
            // First, set the posts in the response
            response.posts.instagram = igPostsResult.details;
            
            // Process insights in parallel batches to reduce timeout
            const batchSize = 5; // Process 5 posts at a time
            const batches = [];
            
            for (let i = 0; i < response.posts.instagram.length; i += batchSize) {
              batches.push(response.posts.instagram.slice(i, i + batchSize));
            }
            
            console.log(`Processing ${response.posts.instagram.length} Instagram posts in ${batches.length} batches of ${batchSize}`);
            
            // Process each batch in parallel
            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
              const batch = batches[batchIndex];
              console.log(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} posts`);
              
              // Process posts in this batch in parallel
              const batchPromises = batch.map(async (post, postIndex) => {
                const globalIndex = batchIndex * batchSize + postIndex;
                try {
                  // Initialize default insights
                  post.insights = {
                    impressions: 0,
                    reach: 0,
                    engagement: 0,
                    saved: 0,
                    video_views: 0
                  };
                  
                  // Calculate engagement from likes and comments if available
                  if (post.likes || post.comments) {
                    post.insights.engagement = (post.likes || 0) + (post.comments || 0);
                  }
                  
                  // Try to get insights with shorter timeout
                  let insights = await fetchInstagramInsights(post.id, pageAccessToken);
                  
                  // If that fails, try with a different ID format
                  if (!insights) {
                    const alternativeId = post.id.includes('_') ? post.id : `${igAccount.id}_${post.id}`;
                    insights = await fetchInstagramInsights(alternativeId, pageAccessToken);
                  }
                  
                  if (insights) {
                    post.insights = insights;
                    
                    // Add media type and video ID information
                    if (insights.media_type) {
                      post.media_type = insights.media_type;
                    }
                    
                    // Extract video ID from media_url if it's a video or reel
                    if ((post.media_type === 'VIDEO' || post.media_type === 'REEL' || 
                        insights.media_type === 'VIDEO' || insights.media_type === 'REEL') && 
                        (insights.media_url || post.media_url || post.permalink)) {
                      
                      // Try multiple methods to extract video ID
                      let videoId = null;
                      
                      // Method 1: Extract from permalink (most reliable)
                      if (post.permalink) {
                          const permalinkParts = post.permalink.split('/');
                          for (let i = 0; i < permalinkParts.length; i++) {
                              if (permalinkParts[i] === 'reel' || permalinkParts[i] === 'p') {
                                  if (i + 1 < permalinkParts.length && permalinkParts[i + 1]) {
                                      videoId = permalinkParts[i + 1];
                                      break;
                                  }
                              }
                          }
                      }
                      
                      // Method 2: Extract from media_url if method 1 failed
                      if (!videoId) {
                          const mediaUrl = insights.media_url || post.media_url;
                          if (mediaUrl) {
                              const urlParts = mediaUrl.split('/');
                              const lastPart = urlParts[urlParts.length - 1].split('?')[0];
                              if (lastPart && !lastPart.includes('.')) {
                                  videoId = lastPart;
                              }
                          }
                      }
                      
                      // Method 3: Use the post ID itself as a fallback
                      if (!videoId && post.id) {
                          videoId = post.id;
                      }
                      
                      // Set the video ID and URL
                      post.video_id = videoId;
                      post.video_url = insights.media_url || post.media_url || post.permalink;
                    }
                  } else {
                    // Try to get media type directly with shorter timeout
                    try {
                      const mediaResponse = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${post.id}`, {
                        params: {
                          fields: 'media_type,media_url,thumbnail_url,video_url',
                          access_token: pageAccessToken
                        },
                        timeout: 5000 // Reduced timeout
                      });
                      
                      if (mediaResponse.data) {
                        post.media_type = mediaResponse.data.media_type || '';
                        
                        // Extract video ID for videos and reels
                        if (post.media_type === 'VIDEO' || post.media_type === 'REEL') {
                          const videoUrl = mediaResponse.data.video_url || mediaResponse.data.media_url;
                          if (videoUrl) {
                            const urlParts = videoUrl.split('/');
                            post.video_id = urlParts[urlParts.length - 1].split('?')[0];
                            post.video_url = videoUrl;
                          }
                        }
                      }
                    } catch (mediaError) {
                      // Silently continue if media type fetch fails
                    }
                  }
                } catch (insightError) {
                  // Silently continue if insights fetch fails
                }
              });
              
              // Wait for this batch to complete before moving to next batch
              await Promise.allSettled(batchPromises);
              console.log(`Completed batch ${batchIndex + 1}/${batches.length}`);
            }
          } else {
            response.posts.instagram = [];
          }

          // Cache the Instagram posts
          API_CACHE.data[igPostsCacheKey] = response.posts.instagram;
          API_CACHE.timestamps[igPostsCacheKey] = Date.now();
          console.log(`Cached ${response.posts.instagram.length} Instagram posts for account ${igAccount.id}`);

          } catch (mediaError) {
            console.error(`Error fetching Instagram media:`, mediaError.message);
          }
        }
      }
    } else {
      console.log('Skipping posts fetch due to posts=0 parameter');
    }
    
    // Add summary log for Instagram video views
    if (response.posts.instagram && response.posts.instagram.length > 0) {
      const videoPosts = response.posts.instagram.filter(post => 
        post.media_type === 'VIDEO' || post.media_type === 'REEL'
      );
      
      if (videoPosts.length > 0) {
        console.log(`Instagram video summary: Found ${videoPosts.length} video/reel posts`);
        videoPosts.forEach(post => {
          const views = post.insights?.video_views || 0;
          const impressions = post.insights?.impressions || 0;
          const engagement = post.insights?.engagement || 0;
          console.log(`  - ${post.id} (${post.media_type}): views=${views}, impressions=${impressions}, engagement=${engagement}`);
        });
      } else {
        console.log('No Instagram video/reel posts found');
      }
    }
    
    // Debug mode: Test all Instagram metrics if debug parameter is enabled
    if (debug === '1' && response.posts.instagram && response.posts.instagram.length > 0) {
      console.log('\n=== DEBUG MODE: Testing Instagram Metrics ===');
      const testPost = response.posts.instagram[0]; // Test with the first post
      const linkedPage = response.pages.find(page => page.id === response.instagram[0]?.linked_page_id);
      const pageToken = linkedPage?.access_token || process.env.META_ACCESS_TOKEN;
      
      try {
        const testResults = await testInstagramMetrics(testPost.id, pageToken);
        console.log('Debug test completed. Check logs above for metric validation results.');
        
        // Add debug info to response
        response.debug = {
          testPostId: testPost.id,
          testPostType: testPost.media_type,
          validMetrics: testResults.validMetrics.map(m => m.metric),
          invalidMetrics: testResults.invalidMetrics.map(m => ({ metric: m.metric, reason: m.reason }))
        };
      } catch (debugError) {
        console.error('Debug test failed:', debugError.message);
        response.debug = {
          error: debugError.message
        };
      }
    }
    
    // Clear error if we found any data
    if (response.pages.length > 0 || response.instagram.length > 0) {
      response.error = null;
    }
    
    // Add this section to handle zero insights
    if (response.posts.facebook.length > 0 && 
        response.posts.facebook.every(post => 
          !post.insights || 
          (post.insights.post_impressions === 0 && 
           post.insights.post_engaged_users === 0 && 
           post.insights.post_reach === 0)
        )) {
      
      console.log('All Facebook post insights are zero, trying alternative approach');
      
      // Try to fetch insights for each post individually
      const pageToken = response.pages[0].access_token || process.env.META_ACCESS_TOKEN;
      
      for (let i = 0; i < response.posts.facebook.length; i++) {
        const post = response.posts.facebook[i];
        try {
          const insights = await fetchSinglePostInsights(post.id, pageToken);
          if (insights) {
            response.posts.facebook[i].insights = insights;
            console.log(`Successfully fetched insights for post ${post.id}`);
          }
        } catch (e) {
          console.error(`Failed to fetch insights for post ${post.id}:`, e.message);
        }
      }
    }
    
    // Check if we have zero insights despite having engagement metrics
    if (response.posts.facebook.length > 0 && 
        response.posts.facebook.some(post => 
          (post.likes > 0 || post.comments > 0 || post.shares > 0) && 
          post.insights.post_impressions === 0 && 
          post.insights.post_engaged_users === 0
        )) {
      console.warn('WARNING: Some Facebook posts have likes/comments but zero insights. This is likely a permissions issue.');
      console.warn('The access token may not have the insights_read permission.');
      
      // Add a note to the response
      response.warning = "Some posts have engagement but no insights data. This may be due to API permissions.";
    }

    if (response.posts.instagram.length > 0 && 
        response.posts.instagram.some(post => 
          (post.likes > 0 || post.comments > 0) && 
          post.insights.impressions === 0 && 
          post.insights.engagement === 0
        )) {
      console.warn('WARNING: Some Instagram posts have likes/comments but zero insights. This is likely a permissions issue.');
      console.warn('The access token may not have the instagram_basic and instagram_manage_insights permissions.');
      
      // Add a note to the response if not already added
      response.warning = response.warning || "Some posts have engagement but no insights data. This may be due to API permissions.";
    }

    // Check permissions for each page and add to response
    response.permissions = {
      available: {}
    };

    // Check permissions for the main token
    try {
      const mainTokenPermissions = await checkMetaPermissions(process.env.META_ACCESS_TOKEN);
      
      // Just include the permissions we have (where status is 'granted')
      if (mainTokenPermissions.rawPermissions) {
        const grantedPermissions = mainTokenPermissions.rawPermissions
          .filter(p => p.status === 'granted')
          .map(p => p.permission);
        
        response.permissions.available = grantedPermissions.reduce((acc, perm) => {
          acc[perm] = true;
          return acc;
        }, {});
        
        console.log('Available permissions:', grantedPermissions);
      }
      
      // Also include token debug info
      try {
        const tokenDebugResponse = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/debug_token`, {
          params: {
            input_token: process.env.META_ACCESS_TOKEN,
            access_token: process.env.META_ACCESS_TOKEN
          }
        });
        
        if (tokenDebugResponse.data && tokenDebugResponse.data.data) {
          response.permissions.tokenInfo = {
            type: tokenDebugResponse.data.data.type,
            expires_at: tokenDebugResponse.data.data.expires_at || 'Never',
            is_valid: tokenDebugResponse.data.data.is_valid,
            scopes: tokenDebugResponse.data.data.scopes || []
          };
        }
      } catch (debugError) {
        console.error('Error debugging token:', debugError);
      }
    } catch (permError) {
      console.error('Error checking permissions:', permError);
      response.permissions.error = permError.message;
    }

    // Process all Instagram posts to ensure video_id is set for videos
    for (let i = 0; i < response.posts.instagram.length; i++) {
      const post = response.posts.instagram[i];
      
      // Only process video content
      if (post.media_type === 'VIDEO' || post.media_type === 'REEL') {
        // If video_id is not set, extract it
        if (!post.video_id) {
          console.log(`Extracting video_id for Instagram post ${post.id} with media_type ${post.media_type}`);
          
          // Method 1: Extract from permalink (most reliable)
          if (post.permalink) {
            const permalinkParts = post.permalink.split('/');
            for (let j = 0; j < permalinkParts.length; j++) {
              if (permalinkParts[j] === 'reel' || permalinkParts[j] === 'p') {
                if (j + 1 < permalinkParts.length && permalinkParts[j + 1]) {
                  post.video_id = permalinkParts[j + 1];
                  console.log(`Extracted Instagram video ID from permalink: ${post.video_id}`);
                  break;
                }
              }
            }
          }
          
          // Method 2: Extract from media_url if method 1 failed
          if (!post.video_id && post.media_url) {
            const urlParts = post.media_url.split('/');
            const lastPart = urlParts[urlParts.length - 1].split('?')[0];
            if (lastPart && !lastPart.includes('.')) {
              post.video_id = lastPart;
              console.log(`Extracted Instagram video ID from media_url: ${post.video_id}`);
            }
          }
          
          // Method 3: Use the post ID itself as a fallback
          if (!post.video_id) {
            post.video_id = post.id;
            console.log(`Using Instagram post ID as video ID fallback: ${post.video_id}`);
          }
          
          // Set video URL if not already set
          if (!post.video_url) {
            post.video_url = post.media_url || post.permalink;
          }
          
          console.log(`Final video ID for Instagram post: ${post.video_id}`);
        }
      }
    }

    // Process all Facebook video posts to get video insights in batch
    if (response.posts.facebook.length > 0) {
      // Filter out video posts
      const videoPosts = response.posts.facebook.filter(post => 
        post.media_type === 'VIDEO' && post.video_id
      );
      
      if (videoPosts.length > 0) {
        console.log(`Found ${videoPosts.length} Facebook video posts, fetching video insights`);
        
        try {
          // Extract video IDs
          const videoIds = videoPosts.map(post => post.video_id);
          
          // Get page token
          const pageToken = response.pages[0]?.access_token || process.env.META_ACCESS_TOKEN;
          
          // Fetch video insights in batch
          const videoInsights = await fetchFacebookVideoInsightsBatch(videoIds, pageToken);
          
          // Add video insights to posts
          for (const post of videoPosts) {
            if (videoInsights[post.video_id]) {
              post.video_insights = videoInsights[post.video_id];
              console.log(`Added video insights to Facebook post ${post.id}`);
            }
          }
        } catch (videoError) {
          console.log(`Facebook video insights batch processing failed: ${videoError.message}`);
          console.log('Continuing without video insights...');
        }
      }
    }

    // Process all Instagram video posts to get video insights in batch
    if (response.posts.instagram.length > 0) {
      // Filter out video posts and ensure they have video_id
      const videoPosts = response.posts.instagram.filter(post => 
        (post.media_type === 'VIDEO' || post.media_type === 'REEL') && post.video_id
      );
      
      if (videoPosts.length > 0) {
        console.log(`Found ${videoPosts.length} Instagram video posts, fetching video insights`);
        
        try {
          // Extract media IDs (use post.id for Instagram, not video_id)
          const mediaIds = videoPosts.map(post => post.id);
          
          // Get page token
          const linkedPage = response.pages.find(page => page.id === response.instagram[0]?.linked_page_id);
          const pageToken = linkedPage?.access_token || process.env.META_ACCESS_TOKEN;
          
          // Fetch video insights in batch
          const videoInsights = await fetchInstagramVideoInsightsBatch(mediaIds, pageToken);
          
          // Add video insights to posts
          for (const post of videoPosts) {
            if (videoInsights[post.id]) {
              // Merge with existing insights
              post.insights = {
                ...post.insights,
                ...videoInsights[post.id]
              };
              console.log(`Added video insights to Instagram post ${post.id}`);
            }
          }
        } catch (videoError) {
          console.log(`Instagram video insights batch processing failed: ${videoError.message}`);
          console.log('Continuing without video insights...');
        }
      }
    }

    // Fetch video views individually for Instagram video posts (since batch doesn't support video_views reliably)
    if (response.posts.instagram.length > 0) {
      const videoPosts = response.posts.instagram.filter(post => 
        post.media_type === 'VIDEO' || post.media_type === 'REEL'
      );
      
      if (videoPosts.length > 0) {
        console.log(`Fetching video views individually for ${videoPosts.length} Instagram video posts`);
        
        // Get page token
        const linkedPage = response.pages.find(page => page.id === response.instagram[0]?.linked_page_id);
        const pageToken = linkedPage?.access_token || process.env.META_ACCESS_TOKEN;
        
        // Process video views in smaller batches to avoid timeout
        const videoBatchSize = 3; // Process 3 video posts at a time
        const videoBatches = [];
        
        for (let i = 0; i < videoPosts.length; i += videoBatchSize) {
          videoBatches.push(videoPosts.slice(i, i + videoBatchSize));
        }
        
        console.log(`Processing ${videoPosts.length} video posts in ${videoBatches.length} batches of ${videoBatchSize}`);
        
        // Process each video batch
        for (let batchIndex = 0; batchIndex < videoBatches.length; batchIndex++) {
          const videoBatch = videoBatches[batchIndex];
          console.log(`Processing video batch ${batchIndex + 1}/${videoBatches.length}`);
          
          // Process videos in this batch in parallel
          const videoPromises = videoBatch.map(async (post) => {
            try {
              // Try multiple video view metrics to find the one that matches Instagram app
              const videoViewMetrics = [
                'video_views',
                'plays',
                'views',
                'ig_reels_aggregated_all_plays_count'
              ];
              
              let videoViews = 0;
              let usedMetric = null;
              
              for (const metric of videoViewMetrics) {
                try {
                  const response = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${post.id}/insights`, {
                    params: {
                      metric: metric,
                      access_token: pageToken
                    },
                    timeout: 5000 // Reduced timeout for video views
                  });
                  
                  if (response.data && response.data.data && response.data.data.length > 0) {
                    const value = response.data.data[0].values[0]?.value || 0;
                    if (typeof value === 'number' && value > 0) {
                      videoViews = value;
                      usedMetric = metric;
                      break; // Use the first successful metric
                    }
                  }
                } catch (metricError) {
                  // Continue to next metric
                }
              }
              
              if (videoViews > 0) {
                post.insights.video_views = videoViews;
                post.insights.video_views_metric = usedMetric;
              } else {
                // If no video views from API, estimate based on impressions
                if (post.insights.impressions > 0) {
                  post.insights.video_views = Math.round(post.insights.impressions * 0.7);
                  post.insights.video_views_metric = 'estimated';
                }
              }
            } catch (videoViewsError) {
              // Estimate video views based on impressions if available
              if (post.insights.impressions > 0) {
                post.insights.video_views = Math.round(post.insights.impressions * 0.7);
                post.insights.video_views_metric = 'estimated_fallback';
              }
            }
          });
          
          // Wait for this video batch to complete
          await Promise.allSettled(videoPromises);
          console.log(`Completed video batch ${batchIndex + 1}/${videoBatches.length}`);
        }
      }
    }

    // Set cache headers for both application and Vercel
    if (bypassCache) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=300'); // 15 minutes cache, 5 minutes stale
    }
    res.setHeader('X-Cache-TTL', '900'); // Custom header to indicate cache TTL

    // Set cache status header
    if (bypassCache) {
      res.setHeader('X-Cache-Status', 'BYPASS');
    } else if (cacheUsed && !cacheMissed) {
      res.setHeader('X-Cache-Status', 'HIT');
    } else if (cacheUsed && cacheMissed) {
      res.setHeader('X-Cache-Status', 'PARTIAL'); // Some data from cache, some fresh
    } else {
      res.setHeader('X-Cache-Status', 'MISS');
    }

    // Return the response
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error in handler:', error);
    return res.status(200).json({
      error: 'An error occurred',
      message: error.message
    });
  }
}
