# API Refactoring Plan - Use Connections Utility Functions

## Goal
Replace manual connection extraction in all APIs with centralized utility functions.

## APIs to Refactor

### 1. api/pages.js
**Current:**
```javascript
const brand = await getBrandInfo(brandId);
const connections = brand?.connections || {};
ga4AccessToken = connections.ga4.access_token;
ga4RefreshToken = connections.ga4.refresh_token;
ga4PropertyIdToUse = connections.ga4.property_id;
```

**Refactored:**
```javascript
const ga4Connection = await getBrandConnection(brandId, 'ga4');
if (ga4Connection) {
  ga4AccessToken = ga4Connection.access_token;
  ga4RefreshToken = ga4Connection.refresh_token;
  ga4PropertyIdToUse = ga4Connection.property_id;
}
```

### 2. api/meta-stats.js
**Current:**
```javascript
const connections = brand?.connections || {};
facebookAccessToken = connections.facebook_page.access_token;
fbPageIdToUse = connections.facebook_page.page_id;
instagramAccessToken = connections.instagram_page.access_token;
instaPageIdToUse = connections.instagram_page.account_id;
```

**Refactored:**
```javascript
const fbConnection = await getBrandConnection(brandId, 'facebook_page');
const igConnection = await getBrandConnection(brandId, 'instagram_page');

if (fbConnection) {
  facebookAccessToken = fbConnection.access_token;
  fbPageIdToUse = fbConnection.page_id;
}
if (igConnection) {
  instagramAccessToken = igConnection.access_token;
  instaPageIdToUse = igConnection.account_id;
}
```

### 3. api/meta-ads.js
**Current:**
```javascript
const connections = brand?.connections || {};
metaAccessToken = connections.meta_ads.access_token;
metaAccountIdToUse = connections.meta_ads.ad_account_id;
```

**Refactored:**
```javascript
const metaConnection = await getBrandConnection(brandId, 'meta_ads');
if (metaConnection) {
  metaAccessToken = metaConnection.access_token;
  metaAccountIdToUse = metaConnection.ad_account_id;
}
```

### 4. api/social.js
**Current:**
```javascript
const connections = brand?.connections || {};
facebookAccessToken = connections.facebook_page.access_token;
fbPageIdToUse = connections.facebook_page.page_id;
instagramAccessToken = connections.instagram_page.access_token;
instaPageIdToUse = connections.instagram_page.account_id;
```

**Refactored:**
```javascript
const fbConnection = await getBrandConnection(brandId, 'facebook_page');
const igConnection = await getBrandConnection(brandId, 'instagram_page');

if (fbConnection) {
  facebookAccessToken = fbConnection.access_token;
  fbPageIdToUse = fbConnection.page_id;
}
if (igConnection) {
  instagramAccessToken = igConnection.access_token;
  instaPageIdToUse = igConnection.account_id;
}
```

### 5. api/overview.js
**Current:**
```javascript
const connections = brand?.connections || {};
ga4PropertyId = connections?.ga4?.property_id;
metaAdAccountId = connections?.meta_ads?.ad_account_id;
tossdownId = connections?.tossdown?.tossdown_id;
```

**Refactored:**
```javascript
const connections = await getBrandConnections(brandId);
ga4PropertyId = connections.ga4?.property_id;
metaAdAccountId = connections.meta_ads?.ad_account_id;
tossdownId = connections.tossdown?.tossdown_id;
```

## Benefits
✅ **Consistency**: All APIs use same extraction pattern
✅ **Maintainability**: Changes to connection structure only need updates in one place
✅ **Error Handling**: Centralized error handling and logging
✅ **Caching**: Automatic cache management via getBrandInfo
✅ **Type Safety**: Clear connection structure documentation

## Implementation Order
1. Create utility functions (DONE)
2. Update api/pages.js
3. Update api/meta-stats.js
4. Update api/meta-ads.js
5. Update api/social.js
6. Update api/overview.js
7. Update api/social-insights.js
8. Update services (meta-social-service.js, meta-ads-service.js, etc.)

## Testing
After each refactor:
- Test with valid brandId
- Test with missing connection
- Test with expired token
- Verify logging output

