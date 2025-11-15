# Brand Connections Utility Functions - Usage Guide

## Overview
New utility functions in `services/firebase-service.js` provide a centralized, consistent way to extract OAuth connections data from brands.

## Functions

### 1. getBrandConnections(brandId, options)
Fetches all connections for a brand.

**Returns:**
```javascript
{
  facebook_page: { page_id, access_token, refresh_token, expires_at, ... },
  instagram_page: { account_id, access_token, expires_at, ... },
  meta_ads: { ad_account_id, access_token, expires_at, ... },
  ga4: { property_id, access_token, refresh_token, expires_at, ... },
  tossdown: { tossdown_id, ... }
}
```

**Usage:**
```javascript
const { getBrandConnections } = require('../services/firebase-service.js');

// Get all connections
const connections = await getBrandConnections('brand_123');

// Access specific connection
const fbPageId = connections.facebook_page?.page_id;
const fbToken = connections.facebook_page?.access_token;
const ga4PropertyId = connections.ga4?.property_id;
const ga4Token = connections.ga4?.access_token;
```

### 2. getBrandConnection(brandId, connectionType, options)
Fetches a specific connection type.

**Parameters:**
- `brandId` (string): Brand ID
- `connectionType` (string): One of: `facebook_page`, `instagram_page`, `meta_ads`, `ga4`, `tossdown`
- `options` (object): Optional configuration

**Returns:**
```javascript
// Example for facebook_page
{
  page_id: "669797383166734",
  access_token: "EAALE5Ix3XgYBP...",
  refresh_token: "1//0536IfETVmCV...",
  expires_at: "2026-01-05T18:29:27.341Z",
  connected_at: timestamp
}
```

**Usage:**
```javascript
const { getBrandConnection } = require('../services/firebase-service.js');

// Get specific connection
const fbConnection = await getBrandConnection('brand_123', 'facebook_page');
const ga4Connection = await getBrandConnection('brand_123', 'ga4');

// Extract data
const fbPageId = fbConnection?.page_id;
const fbToken = fbConnection?.access_token;
const ga4PropertyId = ga4Connection?.property_id;
const ga4Token = ga4Connection?.access_token;
const ga4RefreshToken = ga4Connection?.refresh_token;
```

## Migration Examples

### Before (Manual Extraction)
```javascript
const brand = await getBrandInfo(brandId);
const connections = brand?.connections || {};
const fbPageId = connections.facebook_page?.page_id;
const fbToken = connections.facebook_page?.access_token;
const ga4PropertyId = connections.ga4?.property_id;
const ga4Token = connections.ga4?.access_token;
const ga4RefreshToken = connections.ga4?.refresh_token;
```

### After (Using Utility)
```javascript
const fbConnection = await getBrandConnection(brandId, 'facebook_page');
const ga4Connection = await getBrandConnection(brandId, 'ga4');

const fbPageId = fbConnection?.page_id;
const fbToken = fbConnection?.access_token;
const ga4PropertyId = ga4Connection?.property_id;
const ga4Token = ga4Connection?.access_token;
const ga4RefreshToken = ga4Connection?.refresh_token;
```

## Connection Types

| Type | Fields | Purpose |
|------|--------|---------|
| `facebook_page` | page_id, access_token | Facebook page data |
| `instagram_page` | account_id, access_token | Instagram account data |
| `meta_ads` | ad_account_id, access_token | Meta Ads campaigns |
| `ga4` | property_id, access_token, refresh_token | Google Analytics 4 |
| `tossdown` | tossdown_id | Tossdown sales data |

## Error Handling

```javascript
try {
  const connection = await getBrandConnection(brandId, 'ga4');
  
  if (!connection) {
    console.log('GA4 not connected for this brand');
    return;
  }
  
  const { property_id, access_token, refresh_token } = connection;
  // Use connection data
} catch (error) {
  console.error('Error fetching connection:', error);
}
```

## Benefits
✅ Consistent connection extraction across all APIs
✅ Centralized error handling
✅ Built-in logging for debugging
✅ Automatic cache management
✅ Type-safe connection access

