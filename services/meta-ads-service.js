/**
 * @fileoverview Meta Ads API service functions
 * @module services/meta-ads-service
 */

const axios = require('axios');
const { getDefaultDateRange, formatDate, convertToBusinessTimezone, convertDateToBusinessTimezone } = require('../utils/date-utils');

const META_API_VERSION = 'v24.0';
const META_BASE_URL = 'https://graph.facebook.com';

/**
 * Refresh Meta OAuth access token to get a long-lived token
 * @param {string} shortLivedToken - Short-lived access token
 * @returns {Promise<string>} New long-lived access token
 */
const refreshMetaAccessToken = async (shortLivedToken) => {
  try {
    console.log('Meta Ads Service - Refreshing access token');

    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
      throw new Error('Missing META_APP_ID or META_APP_SECRET environment variables');
    }

    const response = await axios.get(`${META_BASE_URL}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        fb_exchange_token: shortLivedToken
      }
    });

    console.log('Meta Ads Service - Token refreshed successfully');
    return response.data.access_token;
  } catch (error) {
    console.error('Meta Ads Service - Error refreshing token:', {
      message: error.message,
      response: error.response?.data
    });
    throw new Error('Failed to refresh Meta access token: ' + error.message);
  }
};

/**
 * Fetches Meta Ads data for the specified date range
 * @param {string} metaAccountId - Meta Ads account ID
 * @param {Date} from - Start date
 * @param {Date} to - End date
 * @param {Object} options - Additional options
 * @param {string} options.fbPageId - Specific Facebook page ID(s) to fetch
 * @param {string} options.instaPageId - Specific Instagram page ID(s) to fetch
 * @param {string} options.accessToken - OAuth access token (required; provided from brand.connections.meta_ads.access_token)
 * @returns {Promise<Object>} Meta Ads report response
 */
exports.getMetaAdsData = async (metaAccountId, from, to, options = {}) => {
  try {
    console.log('Initiating Meta Ads API request:', { metaAccountId, from, to, hasOAuth: !!options.accessToken });

    const { fbPageId, instaPageId, accessToken } = options;
    const metaAccessToken = accessToken;

    if (!metaAccessToken) {
      throw new Error('Meta access token is required for getMetaAdsData (no environment fallback)');
    }

    const timeRange = {
      since: formatDate(from),
      until: formatDate(to)
    };

    // Add a cache-busting parameter to ensure fresh data
    const cacheBuster = new Date().getTime();

    // Calculate date range length in days
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const daysDifference = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24));

    // For longer date ranges, split into smaller chunks to avoid pagination issues
    let insightsData = [];

    if (daysDifference > 14) {
      console.log('Long date range detected, using chunked requests');

      // Split into chunks of 14 days maximum
      let currentFrom = new Date(from);
      const endDate = new Date(to);

      while (currentFrom < endDate) {
        let currentTo = new Date(currentFrom);
        currentTo.setDate(currentTo.getDate() + 13); // 14 days including start date

        if (currentTo > endDate) {
          currentTo = endDate;
        }

        const chunkTimeRange = {
          since: formatDate(currentFrom),
          until: formatDate(currentTo)
        };

        console.log('Fetching chunk:', chunkTimeRange);

        const chunkResponse = await axios({
          method: 'get',
          url: `${META_BASE_URL}/${META_API_VERSION}/act_${metaAccountId}/insights`,
          params: {
            access_token: metaAccessToken,
            level: 'account',
            fields: 'spend,impressions,clicks,reach,actions,action_values,cost_per_action_type,outbound_clicks,video_30_sec_watched_actions',
            time_range: JSON.stringify(chunkTimeRange),
            time_increment: 1,
            cache_buster: cacheBuster // Add cache buster parameter
          },
          timeout: 15000, // Increased timeout for larger requests
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        if (chunkResponse.data && chunkResponse.data.data) {
          insightsData = [...insightsData, ...chunkResponse.data.data];
        }
        
        // Move to next chunk
        currentFrom.setDate(currentFrom.getDate() + 14);
      }
    } else {
      // Original single request for shorter date ranges
      const insightsResponse = await axios({
        method: 'get',
        url: `${META_BASE_URL}/${META_API_VERSION}/act_${metaAccountId}/insights`,
        params: {
          access_token: metaAccessToken,
          level: 'account',
          fields: 'spend,impressions,clicks,reach,actions,action_values,cost_per_action_type,outbound_clicks,video_30_sec_watched_actions',
          time_range: JSON.stringify(timeRange),
          time_increment: 1,
          cache_buster: cacheBuster // Add cache buster parameter
        },
        timeout: 10000,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!insightsResponse.data || !insightsResponse.data.data) {
        throw new Error('Invalid response format from Meta API insights');
      }

      insightsData = insightsResponse.data.data;

      console.log('Meta Ads Service - Insights response:', {
        dataLength: insightsData.length,
        hasData: insightsData.length > 0,
        firstItem: insightsData[0],
        timeRange
      });
    }

    // Then get campaign data for the same period
    const campaignsResponse = await axios({
      method: 'get',
      url: `${META_BASE_URL}/${META_API_VERSION}/act_${metaAccountId}/campaigns`,
      params: {
        access_token: metaAccessToken,
        fields: 'name,objective,status,buying_type,insights.time_range(' + JSON.stringify(timeRange) + '){spend,impressions,clicks,reach}',
        limit: 1000,
        cache_buster: cacheBuster // Add cache buster parameter
      },
      timeout: 10000,
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    console.log('Meta Ads Service - Campaigns response:', {
      totalCampaigns: campaignsResponse.data.data?.length || 0,
      campaigns: campaignsResponse.data.data?.map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        hasInsights: !!c.insights,
        insightsData: c.insights?.data?.[0],
        spend: c.insights?.data?.[0]?.spend
      }))
    });

    // Filter campaigns that had spend during the period
    const activeCampaigns = await Promise.all(campaignsResponse.data.data
      .filter(campaign => campaign.insights?.data?.[0]?.spend > 0)
      .map(async campaign => {
        // Get ad sets for this campaign
        const adSetsResponse = await axios({
          method: 'get',
          url: `${META_BASE_URL}/${META_API_VERSION}/${campaign.id}/adsets`,
          params: {
            access_token: metaAccessToken,
            fields: 'name,status,targeting,bid_strategy,billing_event,optimization_goal,promoted_object,daily_budget,lifetime_budget,start_time,end_time,publisher_platforms,platform_positions,facebook_positions,device_platforms,insights.time_range(' + JSON.stringify(timeRange) + '){spend,impressions,clicks,reach}',
            limit: 50
          },
          timeout: 10000
        });

        const adSets = await Promise.all(adSetsResponse.data.data.map(async adSet => {
          // Get ads for this ad set
          const adsResponse = await axios({
            method: 'get',
            url: `${META_BASE_URL}/${META_API_VERSION}/${adSet.id}/ads`,
            params: {
              access_token: metaAccessToken,
              fields: 'name,status,creative{id,name,title,body,image_url,thumbnail_url,video_id,call_to_action_type,object_story_spec,object_story_id,object_url,object_type,link_url},adcreatives{image_url,thumbnail_url,video_id,object_story_id,object_url,object_type,object_story_spec},insights.time_range(' + JSON.stringify(timeRange) + '){spend,impressions,clicks,reach}',
              limit: 50
            },
            timeout: 10000
          });

          // Process ads data
          const ads = adsResponse.data.data.map(ad => {
            const creative = ad.creative || {};
            const adcreatives = ad.adcreatives?.data?.[0] || {};
            const metrics = ad.insights?.data?.[0] || {};
            const impressions = parseInt(metrics.impressions || 0);
            const clicks = parseInt(metrics.clicks || 0);

            // Comprehensive media URL fallback logic
            let mediaUrl = '';
            let thumbnailUrl = creative.thumbnail_url || adcreatives.thumbnail_url || '';

            // Try multiple sources for media URL
            if (creative.video_id || adcreatives.video_id) {
              // For videos, prefer thumbnail_url from multiple sources
              mediaUrl = creative.thumbnail_url ||
                         adcreatives.thumbnail_url ||
                         creative.image_url ||
                         adcreatives.image_url ||
                         creative.object_url ||
                         adcreatives.object_url ||
                         '';
            } else {
              // For images, try all available image sources
              mediaUrl = creative.image_url ||
                         creative.thumbnail_url ||
                         adcreatives.image_url ||
                         adcreatives.thumbnail_url ||
                         creative.object_url ||
                         adcreatives.object_url ||
                         '';
            }

            return {
              id: ad.id,
              name: ad.name,
              format: (creative.video_id || adcreatives.video_id) ? 'video' : 'image',
              media_url: mediaUrl,
              thumbnail_url: thumbnailUrl,
              video_id: creative.video_id || adcreatives.video_id || null,
              text: creative.body || '',
              headline: creative.title || '',
              cta: creative.call_to_action_type || '',
              destination: creative.link_url || creative.object_story_spec?.link_data?.link || '',
              metrics: {
                spend: parseFloat(metrics.spend || 0),
                clicks: clicks,
                impressions: impressions,
                ctr: impressions > 0 ? parseFloat(((clicks / impressions) * 100).toFixed(2)) : 0
              }
            };
          });

          // Extract audience data from targeting
          const targeting = adSet.targeting || {};
          const geoLocations = targeting.geo_locations || {};

          // Get detailed location information
          const locationInfo = getDetailedLocationInfo(geoLocations, targeting);

          const ageMin = targeting.age_min || '';
          const ageMax = targeting.age_max || '';
          const genders = {
            1: 'male',
            2: 'female'
          };
          const gender = targeting.genders ? genders[targeting.genders[0]] || 'all' : 'all';

          // Helper function to detect manual placements more accurately
          function isManualPlacement(adSet) {
            const defaultPlatforms = ['facebook', 'instagram', 'audience_network', 'messenger'];
            const defaultPositions = ['feed', 'story', 'marketplace', 'video_feeds', 'right_hand_column', 'search', 'rewarded_video', 'instream_video'];

            const platforms = adSet.publisher_platforms || [];
            const positions = adSet.platform_positions || [];

            // If user removed any default OR selected a smaller list → assume manual
            const isPlatformCustom = platforms.length > 0 && platforms.some(p => !defaultPlatforms.includes(p));
            const isPositionCustom = positions.length > 0 && positions.some(p => !defaultPositions.includes(p));
            const isSubset = platforms.length > 0 && platforms.length < defaultPlatforms.length;

            return isPlatformCustom || isPositionCustom || isSubset;
          }

          // Determine placement type
          let placementType = isManualPlacement(adSet) ? 'manual' : 'automatic';

          // Extract budget
          let budget = 0;
          if (adSet.daily_budget) {
            budget = parseFloat(adSet.daily_budget) / 100; // Convert from cents
          } else if (adSet.lifetime_budget) {
            budget = parseFloat(adSet.lifetime_budget) / 100; // Convert from cents
          }

          return {
            id: adSet.id,
            name: adSet.name,
            status: adSet.status,
            audience: {
              location: locationInfo.formatted,
              locations: locationInfo.locations,
              excluded: locationInfo.excluded,
              age_range: ageMin && ageMax ? `${ageMin}-${ageMax}` : 'all',
              gender: gender
            },
            placements: {
              type: placementType,
              platforms: adSet.publisher_platforms || [],
              positions: adSet.platform_positions || [],
              devices: adSet.device_platforms || []
            },
            budget: budget,
            schedule: {
              start_date: adSet.start_time ? convertDateToBusinessTimezone(adSet.start_time.split('T')[0]) : '',
              end_date: adSet.end_time ? convertDateToBusinessTimezone(adSet.end_time.split('T')[0]) : ''
            },
            metrics: {
              spend: parseFloat(adSet.insights?.data?.[0]?.spend || 0),
              impressions: parseInt(adSet.insights?.data?.[0]?.impressions || 0),
              clicks: parseInt(adSet.insights?.data?.[0]?.clicks || 0),
              reach: parseInt(adSet.insights?.data?.[0]?.reach || 0)
            },
            ads: ads
          };
        }));

        return {
          id: campaign.id,
          name: campaign.name,
          objective: campaign.objective,
          status: campaign.status,
          buying_type: campaign.buying_type || 'UNKNOWN',
          metrics: {
            spend: parseFloat(campaign.insights?.data?.[0]?.spend || 0),
            impressions: parseInt(campaign.insights?.data?.[0]?.impressions || 0),
            clicks: parseInt(campaign.insights?.data?.[0]?.clicks || 0),
            reach: parseInt(campaign.insights?.data?.[0]?.reach || 0)
          },
          ad_sets: adSets
        };
      }));

    // Transform the dates to match GA4 format and include campaigns data
    const transformedData = {
      data: insightsData.map(item => ({
        ...item,
        date_start: convertDateToBusinessTimezone(item.date_start).replace(/-/g, '')
      })),
      campaigns: activeCampaigns
    };

    console.log('Successfully received Meta Ads data:', {
      dataPoints: transformedData.data.length,
      campaignsCount: transformedData.campaigns.length,
      adSetsCount: transformedData.campaigns.reduce((count, campaign) => count + (campaign.ad_sets?.length || 0), 0),
      adsCount: transformedData.campaigns.reduce((count, campaign) => 
        count + campaign.ad_sets.reduce((adCount, adSet) => adCount + (adSet.ads?.length || 0), 0), 0),
      timeRange,
      chunkedRequests: daysDifference > 14
    });

    return transformedData;
  } catch (error) {
    console.error('Error fetching Meta Ads data:', {
      message: error.message,
      response: error.response?.data,
      metaAccountId
    });
    throw error;
  }
};

/**
 * Fetches Meta Ads creatives data
 * @param {string} metaAccountId - Meta Ads account ID
 * @param {Object} options - Additional options
 * @param {string} options.accessToken - OAuth access token (required; provided from brand.connections.meta_ads.access_token)
 * @returns {Promise<Object>} Meta Ads creatives response
 */
exports.getMetaCreativesData = async (metaAccountId, options = {}) => {
  try {
    const { accessToken } = options;
    const metaAccessToken = accessToken;

    if (!metaAccessToken) {
      throw new Error('Meta access token is required for getMetaCreativesData (no environment fallback)');
    }

    const response = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/act_${metaAccountId}/ads`, {
      params: {
        access_token: metaAccessToken,
        fields: 'creative{image_url,thumbnail_url},status',
        limit: 100,
        date_preset: 'last_30d'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching Meta Ads creatives:', {
      message: error.message,
      response: error.response?.data,
      metaAccountId
    });
    throw error;
  }
};

/**
 * Fetches hourly insights for a specific campaign
 * @param {string} campaignId - Campaign ID
 * @param {Object} timeRange - Time range object with since and until dates
 * @param {string} accessToken - OAuth access token (required; provided from brand.connections.meta_ads.access_token)
 * @returns {Promise<Array>} Hourly campaign insights
 */
async function getHourlyInsights(campaignId, timeRange, accessToken) {
  try {
    // Extend the time range by one day on both ends to capture timezone differences
    const extendedTimeRange = {
      since: formatDate(new Date(new Date(timeRange.since).setDate(new Date(timeRange.since).getDate() - 1))),
      until: formatDate(new Date(new Date(timeRange.until).setDate(new Date(timeRange.until).getDate() + 1)))
    };

    const metaAccessToken = accessToken;
    if (!metaAccessToken) {
      throw new Error('Meta access token is required for getHourlyInsights (no environment fallback)');
    }

    const hourlyResponse = await axios({
      method: 'get',
      url: `${META_BASE_URL}/${META_API_VERSION}/${campaignId}/insights`,
      params: {
        access_token: metaAccessToken,
        fields: 'spend,impressions,clicks,reach,date_start',
        time_range: JSON.stringify(extendedTimeRange),
        breakdowns: 'hourly_stats_aggregated_by_audience_time_zone',
        level: 'campaign',
        time_increment: 1,
        limit: 168 * 3,
        default_summary: true
      },
      timeout: 15000
    });

    if (!hourlyResponse.data?.data) {
      console.log('No hourly data available for campaign:', campaignId);
      return {
        hourlyData: new Array(24).fill().map((_, index) => ({
          hour: index,
          spend: 0,
          impressions: 0,
          clicks: 0,
          reach: 0
        })),
        totals: {
          spend: 0,
          impressions: 0,
          clicks: 0,
          reach: 0
        }
      };
    }

    // Initialize hourly data array with zeros
    const hourlyData = new Array(24).fill().map((_, index) => ({
      hour: index,
      spend: 0,
      impressions: 0,
      clicks: 0,
      reach: 0
    }));

    // Calculate totals while processing hourly data
    const totals = {
      spend: 0,
      impressions: 0,
      clicks: 0,
      reach: 0
    };

    // Create a Set to track processed date-hour combinations
    const processedDateHours = new Set();

    // Filter data points to only include those within the original time range
    const originalStartDate = new Date(timeRange.since);
    const originalEndDate = new Date(timeRange.until);

    // Process each data point
    hourlyResponse.data.data.forEach(item => {
      const itemDate = new Date(item.date_start);
      const hour = parseInt(item.hourly_stats_aggregated_by_audience_time_zone);
      
      // Skip if outside original date range or invalid hour
      if (itemDate < originalStartDate || itemDate > originalEndDate || hour < 0 || hour >= 24) {
        return;
      }

      // Create unique key for date-hour combination
      const dateHourKey = `${item.date_start}-${hour}`;
      
      // Skip if we've already processed this date-hour combination
      if (processedDateHours.has(dateHourKey)) {
        return;
      }
      processedDateHours.add(dateHourKey);

      const spend = parseFloat(item.spend || 0);
      const impressions = parseInt(item.impressions || 0);
      const clicks = parseInt(item.clicks || 0);
      const reach = parseInt(item.reach || 0);

      hourlyData[hour].spend += spend;
      hourlyData[hour].impressions += impressions;
      hourlyData[hour].clicks += clicks;
      hourlyData[hour].reach += reach;

      totals.spend += spend;
      totals.impressions += impressions;
      totals.clicks += clicks;
      totals.reach += reach;
    });

    // Round spend values
    hourlyData.forEach(hour => {
      hour.spend = parseFloat(hour.spend.toFixed(6));
    });
    totals.spend = parseFloat(totals.spend.toFixed(6));

    console.log('Hourly data fetched:', {
      campaignId,
      dataPoints: hourlyResponse.data.data.length,
      processedDataPoints: processedDateHours.size,
      totalSpend: totals.spend,
      totalImpressions: totals.impressions,
      timeRange
    });

    return {
      hourlyData,
      totals
    };
  } catch (error) {
    console.error('Error fetching hourly insights:', {
      campaignId,
      error: error.message,
      response: error.response?.data,
      timeRange
    });
    throw error;
  }
}

/**
 * Helper function to extract interest and behavior targeting information
 * @param {Object} targeting - The targeting object from ad set
 * @returns {Object} Formatted interests and behaviors
 */
function getInterestsAndBehaviors(targeting) {
  if (!targeting) return { 
    interests: [], 
    behaviors: [], 
    demographics: [],
    customAudiences: [],
    lookalikeAudiences: [],
    excludedInterests: [],
    excludedBehaviors: [],
    excludedCustomAudiences: [],
    isAdvantageAudience: false
  };
  
  const result = {
    interests: [],
    behaviors: [],
    demographics: [],
    customAudiences: [],
    lookalikeAudiences: [],
    excludedInterests: [],
    excludedBehaviors: [],
    excludedCustomAudiences: [],
    isAdvantageAudience: false
  };
  
  // Extract flexible spec interests (AND condition)
  if (targeting.flexible_spec && Array.isArray(targeting.flexible_spec)) {
    targeting.flexible_spec.forEach(spec => {
      // Interests
      if (spec.interests && Array.isArray(spec.interests)) {
        spec.interests.forEach(interest => {
          if (interest.name) {
            result.interests.push(interest.name);
          }
        });
      }
      
      // Behaviors
      if (spec.behaviors && Array.isArray(spec.behaviors)) {
        spec.behaviors.forEach(behavior => {
          if (behavior.name) {
            result.behaviors.push(behavior.name);
          }
        });
      }
      
      // Demographics
      if (spec.demographics && Array.isArray(spec.demographics)) {
        spec.demographics.forEach(demographic => {
          if (demographic.name) {
            result.demographics.push(demographic.name);
          }
        });
      }
      
      // Custom Audiences in flexible spec
      if (spec.custom_audiences && Array.isArray(spec.custom_audiences)) {
        spec.custom_audiences.forEach(audience => {
          if (audience.name) {
            result.customAudiences.push(audience.name);
          }
        });
      }
    });
  }
  
  // Extract exclusions (NOT condition)
  if (targeting.exclusions) {
    // Excluded interests
    if (targeting.exclusions.interests && Array.isArray(targeting.exclusions.interests)) {
      targeting.exclusions.interests.forEach(interest => {
        if (interest.name) {
          result.excludedInterests.push(interest.name);
        }
      });
    }
    
    // Excluded behaviors
    if (targeting.exclusions.behaviors && Array.isArray(targeting.exclusions.behaviors)) {
      targeting.exclusions.behaviors.forEach(behavior => {
        if (behavior.name) {
          result.excludedBehaviors.push(behavior.name);
        }
      });
    }
    
    // Excluded custom audiences
    if (targeting.exclusions.custom_audiences && Array.isArray(targeting.exclusions.custom_audiences)) {
      targeting.exclusions.custom_audiences.forEach(audience => {
        if (audience.name) {
          result.excludedCustomAudiences.push(audience.name);
        }
      });
    }
  }
  
  // Direct interests (OR condition)
  if (targeting.interests && Array.isArray(targeting.interests)) {
    targeting.interests.forEach(interest => {
      if (interest.name) {
        result.interests.push(interest.name);
      }
    });
  }
  
  // Direct behaviors (OR condition)
  if (targeting.behaviors && Array.isArray(targeting.behaviors)) {
    targeting.behaviors.forEach(behavior => {
      if (behavior.name) {
        result.behaviors.push(behavior.name);
      }
    });
  }
  
  // Custom Audiences (direct targeting)
  if (targeting.custom_audiences && Array.isArray(targeting.custom_audiences)) {
    targeting.custom_audiences.forEach(audience => {
      if (audience.name) {
        result.customAudiences.push(audience.name);
      }
    });
  }
  
  // Lookalike Audiences
  if (targeting.lookalike_audiences && Array.isArray(targeting.lookalike_audiences)) {
    targeting.lookalike_audiences.forEach(audience => {
      if (audience.name) {
        result.lookalikeAudiences.push(audience.name);
      } else if (audience.ratio && audience.pixel_id) {
        result.lookalikeAudiences.push(`Lookalike ${(audience.ratio * 100).toFixed(0)}% - Pixel ID: ${audience.pixel_id}`);
      } else if (audience.ratio && audience.page_id) {
        result.lookalikeAudiences.push(`Lookalike ${(audience.ratio * 100).toFixed(0)}% - Page ID: ${audience.page_id}`);
      } else if (audience.ratio) {
        result.lookalikeAudiences.push(`Lookalike ${(audience.ratio * 100).toFixed(0)}%`);
      } else {
        result.lookalikeAudiences.push('Unnamed Lookalike Audience');
      }
    });
  }
  
  // Check for Advantage+ audience
  if (targeting.use_accelerate_targeting === true || 
      targeting.targeting_optimization === 'expansion_all' ||
      targeting.targeting_expansion === 'expansion_all' ||
      targeting.targeting_expansion_level === 'maximum') {
    result.isAdvantageAudience = true;
  }
  
  // Check for Advantage+ detailed targeting expansion
  if (targeting.targeting_expansion && 
      targeting.targeting_expansion !== 'none' && 
      targeting.targeting_expansion !== 'expansion_none') {
    result.hasTargetingExpansion = true;
  }
  
  return result;
}

/**
 * Formats location information from geo_locations object into a detailed structure
 * that matches the Facebook Ads Manager UI display
 * @param {Object} geoLocations - The geo_locations object from targeting
 * @param {Object} targeting - The full targeting object for additional location data
 * @returns {Object} Structured location information with formatted display
 */
function getDetailedLocationInfo(geoLocations, targeting = {}) {
  if (!geoLocations) {
    return {
      formatted: 'worldwide',
      locations: []
    };
  }
  
  const locations = [];
  
  // Process countries
  if (geoLocations.countries && geoLocations.countries.length > 0) {
    geoLocations.countries.forEach(country => {
      locations.push({
        type: 'country',
        name: country,
        display: country
      });
    });
  }
  
  // Process regions
  if (geoLocations.regions && geoLocations.regions.length > 0) {
    geoLocations.regions.forEach(region => {
      locations.push({
        type: 'region',
        name: region.name || region.key,
        country: region.country_name || region.country_code,
        key: region.key,
        display: `${region.name || region.key}${region.country_name ? `, ${region.country_name}` : ''}`
      });
    });
  }
  
  // Process cities
  if (geoLocations.cities && geoLocations.cities.length > 0) {
    geoLocations.cities.forEach(city => {
      const location = {
        type: 'city',
        name: city.name,
        region: city.region_name || city.region_id,
        country: city.country_name || city.country_code,
        radius: city.radius || 0,
        display: `${city.name}${city.region_name ? `, ${city.region_name}` : ''}${city.radius ? ` (+${city.radius} km)` : ''}`
      };
      
      if (city.latitude && city.longitude) {
        location.latitude = city.latitude;
        location.longitude = city.longitude;
      }
      
      locations.push(location);
    });
  }
  
  // Process custom locations (radius targeting)
  if (geoLocations.custom_locations && geoLocations.custom_locations.length > 0) {
    geoLocations.custom_locations.forEach(loc => {
      const location = {
        type: 'custom_location',
        name: loc.address_string || `Location at ${loc.latitude},${loc.longitude}`,
        address: loc.address_string,
        radius: loc.radius || 0,
        latitude: loc.latitude,
        longitude: loc.longitude,
        distance_unit: loc.distance_unit || 'km',
        display: loc.address_string 
          ? `${loc.address_string} (+${loc.radius} ${loc.distance_unit || 'km'})`
          : `Custom location (+${loc.radius} ${loc.distance_unit || 'km'})`
      };
      
      locations.push(location);
    });
  }
  
  // Process places
  if (geoLocations.places && geoLocations.places.length > 0) {
    geoLocations.places.forEach(place => {
      const location = {
        type: 'place',
        name: place.name,
        id: place.id,
        radius: place.radius || 0,
        latitude: place.latitude,
        longitude: place.longitude,
        display: place.name || `Place ID: ${place.id}`
      };
      
      locations.push(location);
    });
  }
  
  // Process excluded locations if needed
  const excludedLocations = [];
  if (geoLocations.excluded_geo_locations) {
    // Process excluded countries, cities, etc. similar to above
    // Add to excludedLocations array
  }
  
  // Create a formatted location string
  const formattedLocations = locations.map(loc => loc.display || loc.name).join(', ');
  
  return {
    formatted: formattedLocations || 'worldwide',
    locations: locations,
    excluded: excludedLocations
  };
}

/**
 * Fetches detailed Meta Ads campaign data including ad sets and ads
 * @param {string} metaAccountId - Meta Ads account ID
 * @param {string} campaignId - Campaign ID
 * @param {Date} from - Start date
 * @param {Date} to - End date
 * @returns {Promise<Object>} Detailed campaign data
 */
exports.getMetaCampaignDetails = async (metaAccountId, campaignId, from, to, options = {}) => {
  try {
    console.log('Fetching Meta campaign details:', { metaAccountId, campaignId, from, to });

    const { accessToken } = options;
    const metaAccessToken = accessToken;

    if (!metaAccessToken) {
      throw new Error('Meta access token is required for getMetaCampaignDetails (no environment fallback)');
    }

    const timeRange = {
      since: formatDate(from),
      until: formatDate(to)
    };

    // Get campaign data and daily stats in parallel
    let campaignResponse, dailyStatsResponse;
    try {
      [campaignResponse, dailyStatsResponse] = await Promise.all([
        axios({
          method: 'get',
          url: `${META_BASE_URL}/${META_API_VERSION}/${campaignId}`,
          params: {
            access_token: metaAccessToken,
            fields: 'name,objective,status,insights.time_range(' + JSON.stringify(timeRange) + '){spend,impressions,clicks,reach}'
          },
          timeout: 10000
        }),
        axios({
          method: 'get',
          url: `${META_BASE_URL}/${META_API_VERSION}/${campaignId}/insights`,
          params: {
            access_token: metaAccessToken,
            fields: 'spend,impressions,clicks,reach,date_start',
            time_range: JSON.stringify(timeRange),
            time_increment: 1,
            level: 'campaign'
          },
          timeout: 10000
        })
      ]);
    } catch (error) {
      console.error('Error fetching campaign data:', {
        message: error.message,
        response: error.response?.data
      });
      throw error;
    }

    // Get hourly stats for the campaign
    let hourlyStats = { hourlyData: [], totals: { spend: 0, impressions: 0, clicks: 0, reach: 0 } };
    try {
      hourlyStats = await getHourlyInsights(campaignId, timeRange, metaAccessToken);
    } catch (hourlyError) {
      console.error('Error fetching hourly insights:', {
        message: hourlyError.message,
        response: hourlyError.response?.data
      });
      // Continue with other data even if hourly stats fail
    }

    // Get ad sets for the campaign
    let adSetsResponse;
    try {
      adSetsResponse = await axios({
        method: 'get',
        url: `${META_BASE_URL}/${META_API_VERSION}/${campaignId}/adsets`,
        params: {
          access_token: metaAccessToken,
          fields: 'name,status,targeting,bid_strategy,billing_event,optimization_goal,promoted_object,daily_budget,lifetime_budget,start_time,end_time,effective_status,publisher_platforms,platform_positions,device_platforms,insights.time_range(' + JSON.stringify(timeRange) + '){spend,impressions,clicks,reach}',
          limit: 100
        },
        timeout: 10000
      });
    } catch (adSetsError) {
      console.error('Error fetching ad sets:', {
        message: adSetsError.message,
        response: adSetsError.response?.data
      });
      adSetsResponse = { data: { data: [] } };
    }

    // Process ad sets
    const adSets = [];
    const adSetIds = adSetsResponse.data.data || [];
    
    // First, get all ads for the campaign to avoid multiple API calls
    let allAdsResponse;
    try {
      allAdsResponse = await axios({
        method: 'get',
        url: `${META_BASE_URL}/${META_API_VERSION}/${campaignId}/ads`,
        params: {
          access_token: metaAccessToken,
          fields: 'name,status,adset_id,creative{id,name,title,body,image_url,thumbnail_url,video_id,call_to_action_type,object_story_spec{link_data{child_attachments}},object_story_id,object_url,object_type,link_url},adcreatives{image_url,thumbnail_url,video_id,object_story_id,object_url,object_type,object_story_spec},insights.time_range(' + JSON.stringify(timeRange) + '){spend,impressions,clicks,reach}',
          limit: 500
        },
        timeout: 15000
      });
    } catch (allAdsError) {
      console.error('Error fetching all ads:', {
        message: allAdsError.message,
        response: allAdsError.response?.data
      });
      allAdsResponse = { data: { data: [] } };
    }

    // Group ads by ad set ID
    const adsByAdSetId = {};
    if (allAdsResponse.data && allAdsResponse.data.data) {
      allAdsResponse.data.data.forEach(ad => {
        if (ad.adset_id) {
          if (!adsByAdSetId[ad.adset_id]) {
            adsByAdSetId[ad.adset_id] = [];
          }

          const creative = ad.creative || {};
          const adcreatives = ad.adcreatives?.data?.[0] || {};
          const metrics = ad.insights?.data?.[0] || {};
          const impressions = parseInt(metrics.impressions || 0);
          const clicks = parseInt(metrics.clicks || 0);

          // Extract carousel cards if present
          const carouselCards = [];
          if (creative.object_story_spec?.link_data?.child_attachments) {
            creative.object_story_spec.link_data.child_attachments.forEach(card => {
              carouselCards.push({
                headline: card.title || '',
                description: card.description || '',
                image_url: card.image_url || card.picture || '',
                link_url: card.url || card.link || ''
              });
            });
          }

          // Comprehensive media URL fallback logic
          let mediaUrl = '';
          let thumbnailUrl = creative.thumbnail_url || adcreatives.thumbnail_url || '';

          // Try multiple sources for media URL
          if (creative.video_id || adcreatives.video_id) {
            // For videos, prefer thumbnail_url from multiple sources
            mediaUrl = creative.thumbnail_url ||
                       adcreatives.thumbnail_url ||
                       creative.image_url ||
                       adcreatives.image_url ||
                       creative.object_url ||
                       adcreatives.object_url ||
                       '';
          } else {
            // For images, try all available image sources
            mediaUrl = creative.image_url ||
                       creative.thumbnail_url ||
                       adcreatives.image_url ||
                       adcreatives.thumbnail_url ||
                       creative.object_url ||
                       adcreatives.object_url ||
                       '';
          }

          adsByAdSetId[ad.adset_id].push({
            id: ad.id,
            name: ad.name,
            status: ad.status,
            format: carouselCards.length > 0 ? 'carousel' : ((creative.video_id || adcreatives.video_id) ? 'video' : 'image'),
            media_url: mediaUrl,
            thumbnail_url: thumbnailUrl,
            video_id: creative.video_id || adcreatives.video_id || null,
            text: creative.body || '',
            headline: creative.title || '',
            cta: creative.call_to_action_type || '',
            destination: creative.link_url || creative.object_story_spec?.link_data?.link || '',
            carousel_cards: carouselCards.length > 0 ? carouselCards : undefined,
            metrics: {
              spend: parseFloat(metrics.spend || 0),
              clicks: clicks,
              impressions: impressions,
              ctr: impressions > 0 ? parseFloat(((clicks / impressions) * 100).toFixed(2)) : 0
            }
          });
        }
      });
    }

    // Process each ad set
    for (const adSet of adSetIds) {
      try {
        // If targeting information is missing, fetch it directly
        if (!adSet.targeting || !adSet.targeting.geo_locations) {
          try {
            const targetingResponse = await axios({
              method: 'get',
              url: `${META_BASE_URL}/${META_API_VERSION}/${adSet.id}`,
              params: {
                access_token: metaAccessToken,
                fields: 'targeting'
              },
              timeout: 10000
            });
            
            if (targetingResponse.data && targetingResponse.data.targeting) {
              adSet.targeting = targetingResponse.data.targeting;
            }
          } catch (error) {
            console.error(`Failed to fetch targeting for ad set ${adSet.id}:`, error.message);
          }
        }
        
        // Extract audience data from targeting
        const targeting = adSet.targeting || {};
        
        // Extract excluded audiences directly from the targeting object
        const excludedCustomAudiences = [];
        const excludedInterests = [];
        const excludedBehaviors = [];
        
        // Process excluded custom audiences
        if (targeting.excluded_custom_audiences && Array.isArray(targeting.excluded_custom_audiences)) {
          targeting.excluded_custom_audiences.forEach(audience => {
            if (audience.name) {
              excludedCustomAudiences.push(audience.name);
            } else if (audience.id) {
              excludedCustomAudiences.push(`Custom Audience ID: ${audience.id}`);
            }
          });
        }
        
        // Process excluded interests
        if (targeting.excluded_interests && Array.isArray(targeting.excluded_interests)) {
          targeting.excluded_interests.forEach(interest => {
            if (interest.name) {
              excludedInterests.push(interest.name);
            } else if (interest.id) {
              excludedInterests.push(`Interest ID: ${interest.id}`);
            }
          });
        }
        
        // Process excluded behaviors
        if (targeting.excluded_behaviors && Array.isArray(targeting.excluded_behaviors)) {
          targeting.excluded_behaviors.forEach(behavior => {
            if (behavior.name) {
              excludedBehaviors.push(behavior.name);
            } else if (behavior.id) {
              excludedBehaviors.push(`Behavior ID: ${behavior.id}`);
            }
          });
        }
        
        // Extract interests and behaviors using existing function
        const audienceDetails = getInterestsAndBehaviors(targeting);
        
        // Get detailed location information
        const geoLocations = targeting.geo_locations || {};
        const locationInfo = getDetailedLocationInfo(geoLocations, targeting);
        
        // Process location data into a structured format for the API response
        const locationData = [];
        
        // Process cities
        if (geoLocations.cities && geoLocations.cities.length > 0) {
          geoLocations.cities.forEach(city => {
            locationData.push({
              name: city.name,
              type: 'city',
              region: city.region_id,
              country: city.country_code,
              radius: city.radius || 0
            });
          });
        }
        
        // Process places
        if (geoLocations.places && geoLocations.places.length > 0) {
          geoLocations.places.forEach(place => {
            locationData.push({
              name: place.name,
              type: 'place',
              latitude: place.latitude,
              longitude: place.longitude,
              radius: place.radius || 0
            });
          });
        }
        
        // Process custom locations
        if (geoLocations.custom_locations && geoLocations.custom_locations.length > 0) {
          geoLocations.custom_locations.forEach(loc => {
            locationData.push({
              name: loc.address_string || `Location at ${loc.latitude},${loc.longitude}`,
              type: 'custom',
              latitude: loc.latitude,
              longitude: loc.longitude,
              radius: loc.radius || 0
            });
          });
        }
        
        const ageMin = targeting.age_min || '';
        const ageMax = targeting.age_max || '';
        const genders = {
          1: 'male',
          2: 'female'
        };
        const gender = targeting.genders ? genders[targeting.genders[0]] || 'all' : 'all';
        
        // Determine placement type
        let placementType = 'automatic';
        if (
          Array.isArray(adSet.publisher_platforms) && adSet.publisher_platforms.length > 0 &&
          Array.isArray(adSet.platform_positions) && adSet.platform_positions.length > 0
        ) {
          placementType = 'manual';
        }

        // Extract budget
        let budget = 0;
        if (adSet.daily_budget) {
          budget = parseFloat(adSet.daily_budget) / 100; // Convert from cents
        } else if (adSet.lifetime_budget) {
          budget = parseFloat(adSet.lifetime_budget) / 100; // Convert from cents
        }

        adSets.push({
          id: adSet.id,
          name: adSet.name,
          status: adSet.status,
          audience: {
            location: locationInfo.formatted,
            locations: locationData, // Add the structured location data array
            age_range: ageMin && ageMax ? `${ageMin}-${ageMax}` : 'all',
            gender: gender,
            interests: audienceDetails.interests,
            behaviors: audienceDetails.behaviors,
            demographics: audienceDetails.demographics,
            customAudiences: audienceDetails.customAudiences,
            lookalikeAudiences: audienceDetails.lookalikeAudiences,
            excludedInterests: excludedInterests,
            excludedBehaviors: excludedBehaviors,
            excludedCustomAudiences: excludedCustomAudiences,
            isAdvantageAudience: audienceDetails.isAdvantageAudience || false,
            hasTargetingExpansion: audienceDetails.hasTargetingExpansion || false
          },
          placements: {
            type: placementType,
            platforms: adSet.publisher_platforms || [],
            positions: adSet.platform_positions || [],
            devices: adSet.device_platforms || []
          },
          budget: budget,
          schedule: {
            start_date: adSet.start_time ? convertDateToBusinessTimezone(adSet.start_time.split('T')[0]) : '',
            end_date: adSet.end_time ? convertDateToBusinessTimezone(adSet.end_time.split('T')[0]) : ''
          },
          metrics: {
            spend: parseFloat(adSet.insights?.data?.[0]?.spend || 0),
            impressions: parseInt(adSet.insights?.data?.[0]?.impressions || 0),
            clicks: parseInt(adSet.insights?.data?.[0]?.clicks || 0),
            reach: parseInt(adSet.insights?.data?.[0]?.reach || 0)
          },
          // Assign ads to this ad set from our grouped collection
          ads: adsByAdSetId[adSet.id] || []
        });
      } catch (adSetError) {
        console.error('Error processing ad set:', {
          adSetId: adSet?.id || 'unknown',
          error: adSetError.message,
          stack: adSetError.stack
        });
      }
    }

    // Transform the campaign data
    const campaign = {
      id: campaignId,
      name: campaignResponse.data.name,
      objective: campaignResponse.data.objective,
      status: campaignResponse.data.status,
      metrics: {
        spend: parseFloat(campaignResponse.data.insights?.data?.[0]?.spend || 0),
        impressions: parseInt(campaignResponse.data.insights?.data?.[0]?.impressions || 0),
        clicks: parseInt(campaignResponse.data.insights?.data?.[0]?.clicks || 0),
        reach: parseInt(campaignResponse.data.insights?.data?.[0]?.reach || 0)
      }
    };

    // Transform daily stats
    const dailyStats = [];
    if (dailyStatsResponse?.data?.data) {
      dailyStatsResponse.data.data.forEach(day => {
        if (day) {
          dailyStats.push({
            date: convertDateToBusinessTimezone(day.date_start).replace(/-/g, ''),
            spend: parseFloat(day.spend || 0),
            impressions: parseInt(day.impressions || 0),
            clicks: parseInt(day.clicks || 0),
            reach: parseInt(day.reach || 0)
          });
        }
      });
    }

    console.log('Meta campaign details fetched successfully:', {
      campaignId,
      adSetsCount: adSets.length,
      adsCount: adSets.reduce((count, adSet) => count + (adSet.ads?.length || 0), 0),
      dailyStatsCount: dailyStats.length,
      hourlyStatsCount: hourlyStats.hourlyData.length
    });

    return {
      campaign,
      adSets,
      dailyStats,
      hourlyStats: hourlyStats.hourlyData,
      hourlyTotals: hourlyStats.totals
    };

  } catch (error) {
    console.error('Error fetching Meta campaign details:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      metaAccountId,
      campaignId
    });
    throw error;
  }
};

/**
 * Helper function to format location information from geo_locations object
 * @param {Object} geoLocations - The geo_locations object from targeting
 * @returns {string} Formatted location string
 */
function getLocationString(geoLocations) {
  if (!geoLocations) return 'worldwide';
  
  const locations = [];
  
  // Cities
  if (geoLocations.cities && geoLocations.cities.length > 0) {
    const cityNames = geoLocations.cities.map(city => {
      if (city.radius) {
        return `${city.name} (+${city.radius}km)`;
      }
      return city.name;
    });
    locations.push(...cityNames);
  }
  
  // Regions
  if (geoLocations.regions && geoLocations.regions.length > 0) {
    const regionNames = geoLocations.regions.map(region => region.name);
    locations.push(...regionNames);
  }
  
  // Countries
  if (geoLocations.countries && geoLocations.countries.length > 0) {
    locations.push(...geoLocations.countries);
  }
  
  // Custom locations (like radius targeting)
  if (geoLocations.custom_locations && geoLocations.custom_locations.length > 0) {
    const customLocations = geoLocations.custom_locations.map(loc => {
      if (loc.address_string) {
        return `${loc.address_string} (+${loc.radius}km)`;
      } else if (loc.latitude && loc.longitude) {
        return `Location at ${loc.latitude},${loc.longitude} (+${loc.radius}km)`;
      } else {
        return `Custom location (+${loc.radius}km)`;
      }
    });
    locations.push(...customLocations);
  }
  
  // Places
  if (geoLocations.places && geoLocations.places.length > 0) {
    const placeNames = geoLocations.places.map(place => place.name);
    locations.push(...placeNames);
  }
  
  // Check for places in flexible_spec
  if (geoLocations.flexible_spec && Array.isArray(geoLocations.flexible_spec)) {
    geoLocations.flexible_spec.forEach(spec => {
      if (spec.user_adclusters && Array.isArray(spec.user_adclusters)) {
        const placeNames = spec.user_adclusters
          .filter(place => place.name)
          .map(place => place.name);
        locations.push(...placeNames);
      }
    });
  }
  
  return locations.length > 0 ? locations.join(', ') : 'worldwide';
}

/**
 * Fetches detailed location data for specific locations
 * @param {Array} locationIds - Array of location IDs to fetch
 * @returns {Promise<Array>} Detailed location data with coordinates
 */
async function fetchLocationDetails(locationIds, accessToken) {
  if (!locationIds || locationIds.length === 0) return [];

  const metaAccessToken = accessToken;
  if (!metaAccessToken) {
    console.error('Meta access token is required for fetchLocationDetails (no environment fallback)');
    return [];
  }

  try {
    // Batch requests for location details in groups of 50
    const batchSize = 50;
    const locationBatches = [];

    for (let i = 0; i < locationIds.length; i += batchSize) {
      locationBatches.push(locationIds.slice(i, i + batchSize));
    }

    const locationDetailsPromises = locationBatches.map(async (batch) => {
      const idsParam = batch.join(',');
      const response = await axios({
        method: 'get',
        url: `${META_BASE_URL}/${META_API_VERSION}/`,
        params: {
          access_token: metaAccessToken,
          ids: idsParam,
          fields: 'name,location{city,city_id,latitude,longitude,street,zip}'
        },
        timeout: 10000
      });

      return response.data;
    });
    
    const locationDetailsResponses = await Promise.all(locationDetailsPromises);
    
    // Flatten and process the responses
    const locationDetails = {};
    locationDetailsResponses.forEach(batchResponse => {
      Object.assign(locationDetails, batchResponse);
    });
    
    return locationDetails;
  } catch (error) {
    console.error('Error fetching location details:', error.message);
    return [];
  }
}

/**
 * Processes custom locations from targeting data
 * @param {Object} targeting - The targeting object
 * @returns {Array} Array of processed custom locations with coordinates
 */
function processCustomLocations(targeting) {
  const customLocations = [];
  
  // Process flexible_spec custom locations
  if (targeting.flexible_spec && Array.isArray(targeting.flexible_spec)) {
    targeting.flexible_spec.forEach(spec => {
      if (spec.custom_locations && Array.isArray(spec.custom_locations)) {
        spec.custom_locations.forEach(loc => {
          customLocations.push({
            type: 'custom_location',
            address: loc.address_string || null,
            latitude: loc.latitude || null,
            longitude: loc.longitude || null,
            radius: loc.radius || 0,
            distance_unit: loc.distance_unit || 'km',
            name: loc.address_string || `Location at ${loc.latitude},${loc.longitude}`
          });
        });
      }
    });
  }
  
  // Process direct custom_locations
  if (targeting.custom_locations && Array.isArray(targeting.custom_locations)) {
    targeting.custom_locations.forEach(loc => {
      customLocations.push({
        type: 'custom_location',
        address: loc.address_string || null,
        latitude: loc.latitude || null,
        longitude: loc.longitude || null,
        radius: loc.radius || 0,
        distance_unit: loc.distance_unit || 'km',
        name: loc.address_string || `Location at ${loc.latitude},${loc.longitude}`
      });
    });
  }
  
  return customLocations;
}

// Helper function to extract location data from targeting
function extractLocationData(targeting) {
  if (!targeting || !targeting.geo_locations) return [];
  
  const locations = [];
  const geoLocations = targeting.geo_locations;
  
  // Process cities
  if (geoLocations.cities && Array.isArray(geoLocations.cities)) {
    geoLocations.cities.forEach(city => {
      locations.push({
        name: city.name,
        type: 'city',
        region: city.region || city.region_name,
        country: city.country || city.country_code,
        radius: city.radius || 0,
        latitude: city.latitude,
        longitude: city.longitude
      });
    });
  }
  
  // Process custom locations
  if (geoLocations.custom_locations && Array.isArray(geoLocations.custom_locations)) {
    geoLocations.custom_locations.forEach(loc => {
      locations.push({
        name: loc.address_string || `Custom location`,
        type: 'custom',
        radius: loc.radius || 0,
        latitude: loc.latitude,
        longitude: loc.longitude
      });
    });
  }
  
  // Process places
  if (geoLocations.places && Array.isArray(geoLocations.places)) {
    geoLocations.places.forEach(place => {
      locations.push({
        name: place.name,
        type: 'place',
        id: place.id,
        radius: place.radius || 0,
        latitude: place.latitude,
        longitude: place.longitude
      });
    });
  }
  
  // Process user_adclusters from flexible_spec which often contain named locations
  if (targeting.flexible_spec && Array.isArray(targeting.flexible_spec)) {
    targeting.flexible_spec.forEach(spec => {
      if (spec.user_adclusters && Array.isArray(spec.user_adclusters)) {
        spec.user_adclusters.forEach(cluster => {
          // Only add if it has a name
          if (cluster.name) {
            locations.push({
              name: cluster.name,
              type: 'place',
              id: cluster.id,
              // Note: user_adclusters often don't include coordinates directly
              // We'll need to fetch these separately if needed
            });
          }
        });
      }
      
      // Also check for custom_locations in flexible_spec
      if (spec.custom_locations && Array.isArray(spec.custom_locations)) {
        spec.custom_locations.forEach(loc => {
          locations.push({
            name: loc.address_string || `Custom location`,
            type: 'custom',
            radius: loc.radius || 0,
            latitude: loc.latitude,
            longitude: loc.longitude
          });
        });
      }
    });
  }
  
  return locations;
}

/**
 * Determines if an ad set is using manual placements by comparing against default values
 * @param {Object} adSet - The ad set object from Meta API
 * @returns {boolean} True if manual placements are detected
 */
function isManualPlacement(adSet) {
  const defaultPlatforms = ['facebook', 'instagram', 'audience_network', 'messenger'];
  const defaultPositions = ['feed', 'story', 'marketplace', 'video_feeds', 'right_hand_column', 'search', 'rewarded_video', 'instream_video'];

  const platforms = adSet.publisher_platforms || [];
  const positions = adSet.platform_positions || [];

  // Check if platforms is a subset (fewer than default) or contains custom platforms
  const isPlatformSubset = platforms.length > 0 && platforms.length < defaultPlatforms.length;
  const isPlatformCustom = platforms.length > 0 && platforms.some(p => !defaultPlatforms.includes(p));

  // Check if positions is a subset or contains custom positions
  const isPositionSubset = positions.length > 0 && positions.length < defaultPositions.length;
  const isPositionCustom = positions.length > 0 && positions.some(p => !defaultPositions.includes(p));

  return isPlatformSubset || isPlatformCustom || isPositionSubset || isPositionCustom;
}

/**
 * Fetches Meta Ads data using brandId
 * @param {string} brandId - Brand ID to fetch Meta Ads data from
 * @param {string} from - Start date
 * @param {string} to - End date
 * @returns {Promise<Object>} Meta Ads report response
 */
exports.getMetaAdsDataByBrand = async (brandId, from, to) => {
  const { getBrandConnection } = require('./firebase-service.js');

  try {
    // Use centralized utility to extract Meta Ads connection
    const metaConnection = await getBrandConnection(brandId, 'meta_ads');

    if (!metaConnection || !metaConnection.ad_account_id) {
      throw new Error(`Meta Ads connection not found for brand ${brandId}`);
    }

    const metaAccountId = metaConnection.ad_account_id;
    const accessToken = metaConnection.access_token;

    console.log('Meta Ads Service - Fetching data by brand:', { brandId, metaAccountId, from, to });

    return await exports.getMetaAdsData(metaAccountId, from, to, { accessToken });
  } catch (error) {
    console.error('Meta Ads Service - Error fetching data by brand:', error.message);
    throw error;
  }
};
