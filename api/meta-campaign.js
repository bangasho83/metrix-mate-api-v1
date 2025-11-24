/**
 * @fileoverview Meta Campaign Details API endpoint
 * @module api/meta-campaign
 */

import { getMetaCampaignDetails } from '../services/meta-ads-service.js';
import { getDefaultDateRange } from '../utils/date-utils.js';
import { getBrandConnection } from '../services/firebase-service.js';
import axios from 'axios';

const META_API_VERSION = 'v24.0';
const META_BASE_URL = 'https://graph.facebook.com';

const DEFAULT_RESPONSE = {
  campaign: null,
  adSets: [],
  ads: [],
  dailyStats: [],
  hourlyStats: [],
  hourlyTotals: {
    spend: 0,
    impressions: 0,
    clicks: 0,
    reach: 0
  }
};

// Note: Per-card carousel insights are no longer supported by Facebook Graph API
// The action_carousel_card_id breakdown was deprecated
// We'll estimate clicks based on card position instead

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { brandId, metaAccountId, campaignId, from, to } = req.query;

    // Normalize empty string and "not-set" values to null, also filter out invalid '0'
    const normalizeParam = (param) => {
      if (!param || param === '' || param === 'not-set' || param === '0') {
        return null;
      }
      return param.trim();
    };

    // Get brand info if brandId is provided
    let metaAccessToken = null;
    let metaAccountIdToUse = normalizeParam(metaAccountId);

    console.log('Meta Campaign API - Initial request:', {
      brandId,
      metaAccountId,
      campaignId,
      hasMetaAccountId: !!metaAccountIdToUse,
      hasCampaignId: !!campaignId
    });

    if (brandId) {
      try {
        // Use centralized utility to extract Meta Ads connection
        const metaConnection = await getBrandConnection(brandId, 'meta_ads');
        console.log('Meta Campaign API - Brand fetched:', {
          brandId,
          hasMetaAds: !!metaConnection,
          metaAdsFields: metaConnection ? Object.keys(metaConnection) : []
        });

        if (metaConnection) {
          metaAccessToken = metaConnection.access_token;
          metaAccountIdToUse = metaAccountIdToUse || metaConnection.ad_account_id;
          console.log('Meta Campaign API - Using OAuth token from brand:', {
            brandId,
            hasToken: !!metaAccessToken,
            tokenLength: metaAccessToken?.length || 0,
            metaAccountIdToUse,
            source: 'brand_connections'
          });
        } else {
          console.log('Meta Campaign API - Brand found but no meta_ads connection:', {
            brandId,
            hasMetaAds: false
          });
        }
      } catch (brandError) {
        console.error('Error fetching brand info:', brandError.message);
        console.error('Brand error details:', {
          code: brandError.code,
          message: brandError.message
        });
      }
    } else {
      console.log('Meta Campaign API - No brandId provided in request');
    }

    // Require OAuth token from brand connections (no environment fallback)
    if (!metaAccessToken) {
      console.log('Missing Meta OAuth access token from brand connections', {
        brandId,
        metaAccountId,
        campaignId,
        reason: !brandId ? 'No brandId provided' : 'Brand has no meta_ads connection'
      });
      return res.status(200).json(DEFAULT_RESPONSE);
    }

    if (!metaAccountIdToUse || !campaignId) {
      console.log('Missing required parameters', {
        metaAccountIdToUse,
        campaignId,
        brandId
      });
      return res.status(400).json({
        error: 'brandId and campaignId are required',
        details: {
          brandIdProvided: !!brandId,
          campaignIdProvided: !!campaignId,
          metaAccountIdProvided: !!metaAccountIdToUse,
          message: 'Call with: ?brandId=YOUR_BRAND_ID&campaignId=YOUR_CAMPAIGN_ID'
        }
      });
    }

    const { fromDate, toDate } = getDefaultDateRange(from, to);

    console.log('Meta Campaign API - Request parameters:', {
      brandId,
      metaAccountId: metaAccountIdToUse,
      campaignId,
      from: fromDate,
      to: toDate,
      hasOAuth: !!metaAccessToken
    });

    const data = await getMetaCampaignDetails(metaAccountIdToUse, campaignId, fromDate, toDate, { accessToken: metaAccessToken });
    
    if (!data || !data.campaign) {
      console.log('No campaign data found');
      return res.status(200).json(DEFAULT_RESPONSE);
    }

    // Process all ads with carousel cards first
    for (const adSet of data.adSets) {
      if (!adSet.ads) continue;
      
      for (const ad of adSet.ads) {
        if (ad.format === 'carousel' && ad.carousel_cards) {
          // Process each carousel card
          const processedCards = [];
          
          for (let i = 0; i < ad.carousel_cards.length; i++) {
            const card = ad.carousel_cards[i];
            
            // Replace template variables in URLs
            const processedUrl = card.link_url ? card.link_url
              .replace(/{{campaign\.name}}/g, data.campaign.name)
              .replace(/{{ad\.name}}/g, ad.name)
              : undefined;
            
            // Extract utm_content parameter
            const cardIdentifier = processedUrl && processedUrl.match(/utm_content=([^&]+)/);
            const cardUtmContent = cardIdentifier ? decodeURIComponent(cardIdentifier[1]) : '';
            
            try {
              // If image_url is empty, try to fetch it directly from the creative
              let imageUrl = card.image_url;

              if (!imageUrl) {
                try {
                  // Fetch the creative details to get the image URL
                  const creativeResponse = await axios({
                    method: 'get',
                    url: `${META_BASE_URL}/${META_API_VERSION}/${ad.id}`,
                    params: {
                      access_token: metaAccessToken,
                      fields: 'creative{object_story_spec{link_data{child_attachments}}}'
                    },
                    timeout: 10000
                  });

                  // Extract image URL from the creative response
                  const creative = creativeResponse.data?.creative?.object_story_spec?.link_data?.child_attachments;
                  if (creative && creative[i]) {
                    imageUrl = creative[i].image_url || creative[i].picture || '';
                  }
                } catch (imageError) {
                  console.error(`Error fetching image for carousel card ${i} of ad ${ad.id}:`, {
                    message: imageError.message,
                    status: imageError.response?.status,
                    data: imageError.response?.data
                  });
                }
              }

              // Estimate clicks based on card position
              // First cards typically get more clicks (weighted distribution)
              const totalCards = ad.carousel_cards.length;
              const clickShare = totalCards > 0 ?
                (totalCards - i) / (totalCards * (totalCards + 1) / 2) : 0;
              const estimatedClicks = Math.round(ad.metrics.clicks * clickShare);

              processedCards.push({
                ...card,
                link_url: processedUrl,
                image_url: imageUrl,
                estimated_clicks: estimatedClicks,
                utm_content: cardUtmContent
              });
            } catch (error) {
              console.error(`Error processing carousel card ${i} for ad ${ad.id}:`, error.message);
              // Still include the card with basic info
              processedCards.push({
                ...card,
                link_url: processedUrl,
                estimated_clicks: 0,
                utm_content: cardUtmContent
              });
            }
          }
          
          // Replace the original carousel_cards with processed ones
          ad.carousel_cards = processedCards;
        }
      }
    }

    // Now create the restructured data with all processed cards
    const restructuredData = {
      campaign: {
        ...data.campaign,
        ad_sets: data.adSets.map(adSet => ({
          ...adSet,
          ads: (adSet.ads || []).map(ad => ({
            ...ad,
            // Add daily stats for each ad
            dailyStats: data.dailyStats.map(day => ({
              date: day.date,
              spend: parseFloat((ad.metrics.spend / data.campaign.metrics.spend * day.spend).toFixed(2)) || 0,
              impressions: Math.round(ad.metrics.impressions / data.campaign.metrics.impressions * day.impressions) || 0,
              clicks: Math.round(ad.metrics.clicks / data.campaign.metrics.clicks * day.clicks) || 0,
              reach: Math.round(ad.metrics.impressions / data.campaign.metrics.impressions * day.reach) || 0
            }))
          }))
        }))
      },
      dailyStats: data.dailyStats || [],
      hourlyStats: data.hourlyStats || [],
      hourlyTotals: data.hourlyTotals || {
        spend: 0,
        impressions: 0,
        clicks: 0,
        reach: 0
      }
    };

    console.log('Meta Campaign API - Response Summary:', {
      campaignId: restructuredData.campaign.id,
      adSetsCount: restructuredData.campaign.ad_sets.length,
      adsCount: restructuredData.campaign.ad_sets.reduce((count, adSet) => count + adSet.ads.length, 0),
      totalSpend: restructuredData.campaign.metrics.spend,
      hourlyStatsCount: restructuredData.hourlyStats.length
    });

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    return res.status(200).json(restructuredData);

  } catch (error) {
    console.error('Meta Campaign API - Error:', {
      error: error.message,
      stack: error.stack,
      type: error.name
    });
    return res.status(500).json({
      error: 'Failed to fetch Meta campaign details',
      message: error.message
    });
  }
}
