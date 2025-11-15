# API/Social.js - OAuth-Only Architecture Fix

## Issues Identified

### 1. ❌ Environment Variable Fallback (Lines 226-229)
```javascript
// BEFORE: Using environment variable fallback
const defaultMetaToken = process.env.META_ACCESS_TOKEN;
facebookAccessToken = facebookAccessToken || defaultMetaToken;
instagramAccessToken = instagramAccessToken || defaultMetaToken;
```

**Problem**: Violates OAuth-only architecture by falling back to environment variables

### 2. ❌ Using Wrong Token for Instagram Insights (Line 402)
```javascript
// BEFORE: Using environment variable instead of OAuth token
const pageTokenResponse = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${instaPageIdToUse}`, {
  params: {
    fields: 'access_token',
    access_token: process.env.META_ACCESS_TOKEN  // ❌ WRONG
  }
});
```

**Problem**: Uses environment variable instead of `instagramAccessToken` from brand connections

### 3. ❌ Weak Parameter Validation
```javascript
// BEFORE: Allowed metaAccountId without OAuth tokens
if (!brandId && !metaAccountId) {
  // Error
}
```

**Problem**: Allowed requests without OAuth tokens from brand connections

## Fixes Applied

### 1. ✅ Removed Environment Variable Fallback
```javascript
// AFTER: OAuth-only architecture
// OAuth tokens are required from brand connections (no environment fallback)
```

### 2. ✅ Enforce brandId Requirement
```javascript
// AFTER: Require brandId for OAuth token extraction
if (!brandId) {
  return res.status(400).json({
    error: 'Missing required parameter: brandId',
    message: 'Please provide brandId in the query parameters (OAuth tokens are fetched from brand connections)',
    success: false
  });
}
```

### 3. ✅ Validate OAuth Tokens Available
```javascript
// AFTER: Validate tokens before making API calls
if (fbPageIdToUse && !facebookAccessToken) {
  return res.status(400).json({
    error: 'Missing Facebook OAuth token',
    message: 'Facebook page is not connected to this brand. Please connect your Facebook page first.',
    success: false
  });
}

if (instaPageIdToUse && !instagramAccessToken) {
  return res.status(400).json({
    error: 'Missing Instagram OAuth token',
    message: 'Instagram page is not connected to this brand. Please connect your Instagram page first.',
    success: false
  });
}
```

### 4. ✅ Use OAuth Token for Instagram Insights
```javascript
// AFTER: Use instagramAccessToken from brand connections
if (!instagramAccessToken) {
  console.log('Social API - Skipping Instagram insights (no access token available)');
} else {
  // Use instagramAccessToken for all API calls
  let insights = await fetchInstagramInsights(post.id, instagramAccessToken);
}
```

## Error Resolution

| Error | Root Cause | Fix |
|-------|-----------|-----|
| Facebook followers 400 | Missing/invalid token | Validate token before API call |
| Instagram insights undefined | Wrong token used | Use instagramAccessToken |
| Instagram page token 403 | Using env var instead of OAuth | Use instagramAccessToken |

## Architecture Compliance

✅ OAuth-only architecture enforced
✅ No environment variable fallbacks
✅ Proper token validation
✅ Clear error messages for missing connections
✅ Centralized connection utilities used

