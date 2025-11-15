# Meta Campaign API Guide

## Endpoint
`GET /api/meta-campaign`

## Required Parameters

### 1. **brandId** (REQUIRED)
- The brand ID from your Firebase database
- Used to fetch OAuth token from brand connections
- Must have `connections.meta_ads.access_token` configured

### 2. **campaignId** (REQUIRED)
- The Meta campaign ID to fetch details for
- Format: `123456789` (numeric ID)

## Optional Parameters

### 3. **from** (Optional)
- Start date for data range
- Format: `YYYY-MM-DD`
- Default: 30 days ago

### 4. **to** (Optional)
- End date for data range
- Format: `YYYY-MM-DD`
- Default: Today

### 5. **metaAccountId** (Optional)
- Meta Ad Account ID (format: `act_123456789`)
- If not provided, will use the one from brand connections
- Only used if brandId is not provided

## Usage Examples

### Basic Call (Recommended)
```bash
curl "http://localhost:3000/api/meta-campaign?brandId=YOUR_BRAND_ID&campaignId=YOUR_CAMPAIGN_ID"
```

### With Date Range
```bash
curl "http://localhost:3000/api/meta-campaign?brandId=YOUR_BRAND_ID&campaignId=YOUR_CAMPAIGN_ID&from=2025-11-01&to=2025-11-13"
```

### Without brandId (Legacy - requires metaAccountId)
```bash
curl "http://localhost:3000/api/meta-campaign?metaAccountId=act_123456789&campaignId=YOUR_CAMPAIGN_ID"
```

## Required Brand Connections

Your brand must have the following in Firebase:
```javascript
brand.connections.meta_ads = {
  access_token: "EAALE5Ix3XgYBP...",  // OAuth token
  ad_account_id: "349313873754318",    // Ad account ID
  connected_at: timestamp,
  expires_at: "2026-01-12T12:43:56.517Z"
}
```

## Response Format

```javascript
{
  campaign: {
    id: "123456789",
    name: "Campaign Name",
    objective: "LINK_CLICKS",
    status: "ACTIVE",
    metrics: {
      spend: 1234.56,
      impressions: 50000,
      clicks: 1200,
      reach: 25000
    },
    ad_sets: [
      {
        id: "adset_id",
        name: "Ad Set Name",
        ads: [
          {
            id: "ad_id",
            name: "Ad Name",
            metrics: { ... },
            dailyStats: [ ... ]
          }
        ]
      }
    ]
  },
  dailyStats: [ ... ],
  hourlyStats: [ ... ],
  hourlyTotals: { ... }
}
```

## Troubleshooting

### Error: "Missing Meta OAuth access token from brand connections"
**Cause**: `brandId` not provided or brand has no `meta_ads` connection
**Solution**: 
1. Pass `brandId` as query parameter
2. Ensure brand has `connections.meta_ads.access_token` in Firebase

### Error: "brandId and campaignId are required"
**Cause**: Missing required parameters
**Solution**: Include both `brandId` and `campaignId` in query string

### Error: "No campaign data found"
**Cause**: Campaign ID doesn't exist or token doesn't have access
**Solution**: 
1. Verify campaign ID is correct
2. Verify OAuth token has required permissions
3. Check token hasn't expired

## Permissions Required

The Meta OAuth token must have these permissions:
- `ads_read` - Read ad account data
- `campaigns_read` - Read campaign data
- `adsets_read` - Read ad set data
- `ads_read` - Read ads data

