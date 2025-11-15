# Pages API - GA4 OAuth Token Fix

## Issue
The `/api/pages` endpoint was throwing error:
```
GA4 OAuth access token is required (no service account fallback)
```

## Root Cause
The GA4 access token was only being extracted from brand connections when:
- `brandId` was provided AND
- `ga4Flag` was true AND
- **`ga4PropertyId` was NOT provided** (line 234 condition)

If `ga4PropertyId` was passed as a query parameter, the condition failed and the access token was never extracted from the brand connections, causing the error.

## Solution
Changed the logic to **always extract GA4 tokens from brand connections** when:
- `brandId` is provided AND
- `ga4Flag` is true

The `ga4PropertyId` can now come from either:
1. Query parameter (`?ga4PropertyId=...`)
2. Brand connections (`brand.connections.ga4.property_id`)

## Changes Made

### File: `api/pages.js`

#### Before (Lines 234-250):
```javascript
if (brandId && ga4Flag && !ga4PropertyIdToUse) {
  // Only extracted if ga4PropertyId was NOT provided
  ga4AccessToken = connections.ga4.access_token;
}
```

#### After (Lines 236-266):
```javascript
if (brandId && ga4Flag) {
  // Always extract tokens when GA4 is requested
  ga4PropertyIdToUse = ga4PropertyIdToUse || connections.ga4.property_id;
  ga4AccessToken = connections.ga4.access_token;
  ga4RefreshToken = connections.ga4.refresh_token;
}
```

#### GA4 Options (Lines 398-401):
```javascript
const ga4Options = ga4AccessToken ? {
  accessToken: ga4AccessToken,
  refreshToken: ga4RefreshToken
} : {};
```

## Usage Examples

### With Brand Connection (Recommended)
```bash
curl "http://localhost:3000/api/pages?brandId=YOUR_BRAND_ID&ga4=1"
```
- Fetches GA4 property ID from brand connections
- Fetches GA4 tokens from brand connections
- Uses refresh token for automatic token refresh

### With Query Parameter
```bash
curl "http://localhost:3000/api/pages?brandId=YOUR_BRAND_ID&ga4=1&ga4PropertyId=425347028"
```
- Uses provided GA4 property ID
- Still fetches GA4 tokens from brand connections
- Uses refresh token for automatic token refresh

## Required Brand Connections
```javascript
brand.connections.ga4 = {
  access_token: "ya29.a0ATi6K2u...",
  refresh_token: "1//05iOb-E6_7Y3e...",
  property_id: "425347028",
  connected_at: timestamp,
  expires_at: "2025-11-14T00:13:04.098Z"
}
```

## Testing
```bash
# Test with your brand ID
curl "http://localhost:3000/api/pages?brandId=YOUR_BRAND_ID&ga4=1"

# Check logs for:
# - "Pages API - Using GA4 connection from brand"
# - "Pages API - GA4 options prepared"
# - "Pages API - GA4 data received"
```

## Result
✅ GA4 tokens are now always extracted from brand connections when GA4 is requested
✅ Works with or without explicit `ga4PropertyId` parameter
✅ Automatic token refresh on 401 errors

