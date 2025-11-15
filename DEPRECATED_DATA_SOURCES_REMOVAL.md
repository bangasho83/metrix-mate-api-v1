# Deprecated data_sources Removal - OAuth-Only Architecture

## Issue
The system was still reading from the deprecated `data_sources` object which contained invalid placeholder values like `'0'`:

```javascript
data_sources: {
  fb_page_id: 0,
  ga_property_id: "0",
  insta_page_id: "0",
  meta_account_id: "0"
}
```

This caused API failures because the code was using these invalid `'0'` values instead of the valid OAuth tokens and IDs from the `connections` object.

## Root Cause
The `api/social-insights.js` file was still checking `data_sources` as a fallback source for:
- Facebook page ID
- Instagram account ID
- Meta Ads account ID
- GA4 property ID

## Solution
Updated `api/social-insights.js` to **prioritize the `connections` object** and removed all references to deprecated `data_sources`.

### File: `api/social-insights.js`

#### 1. Updated extractSocialIds Function (Lines 65-105):

**Before:**
```javascript
const fbCandidates = [
  b.fbPageId, ...,
  b.data_sources?.fb_page_id,  // ❌ DEPRECATED
  b.dataSources?.fb_page_id    // ❌ DEPRECATED
];
```

**After:**
```javascript
// PRIORITY: Use connections object (new OAuth-only architecture)
const connections = b.connections || {};
const fbPageIdFromConnections = connections.facebook_page?.page_id;
const instaPageIdFromConnections = connections.instagram_page?.account_id;

// Fallback candidates (no more data_sources)
const fbCandidates = [
  b.fbPageId, ...,
  // REMOVED: b.data_sources?.fb_page_id (deprecated)
];

return {
  fbPageId: fbPageIdFromConnections || firstTruthy([...fbCandidates, fromPagesFb]),
  instaPageId: instaPageIdFromConnections || firstTruthy([...igCandidates, fromPagesIg])
};
```

#### 2. Updated extractMetaGa Function (Lines 107-137):

**Before:**
```javascript
const metaCandidates = [
  b.metaAccountId, ...,
  b.data_sources?.meta_account_id,  // ❌ DEPRECATED
];
const gaCandidates = [
  b.ga4PropertyId, ...,
  b.data_sources?.ga_property_id    // ❌ DEPRECATED
];
```

**After:**
```javascript
// PRIORITY: Use connections object (new OAuth-only architecture)
const connections = b.connections || {};
const metaAccountIdFromConnections = connections.meta_ads?.ad_account_id;
const gaPropertyIdFromConnections = connections.ga4?.property_id;

// Fallback candidates (no more data_sources)
const metaCandidates = [
  b.metaAccountId, ...,
  // REMOVED: b.data_sources?.meta_account_id (deprecated)
];
const gaCandidates = [
  b.ga4PropertyId, ...,
  // REMOVED: b.data_sources?.ga_property_id (deprecated)
];

return {
  metaAccountId: metaAccountIdFromConnections || firstTruthy(metaCandidates),
  gaPropertyId: gaPropertyIdFromConnections || firstTruthy(gaCandidates)
};
```

## New Priority Order

### For Social IDs:
1. ✅ `connections.facebook_page.page_id` (OAuth)
2. ✅ `connections.instagram_page.account_id` (OAuth)
3. ⚠️ Legacy fields (fbPageId, facebookPageId, etc.)
4. ❌ `data_sources` (REMOVED - deprecated)

### For Meta & GA4:
1. ✅ `connections.meta_ads.ad_account_id` (OAuth)
2. ✅ `connections.ga4.property_id` (OAuth)
3. ⚠️ Legacy fields (metaAccountId, ga4PropertyId, etc.)
4. ❌ `data_sources` (REMOVED - deprecated)

## Valid Connection Structure

```javascript
brand.connections = {
  facebook_page: {
    page_id: "669797383166734",      // ✅ Valid
    access_token: "EAALE5Ix3XgYBP...",
    connected_at: timestamp,
    expires_at: "2026-01-05T18:29:27.341Z"
  },
  instagram_page: {
    account_id: "17841400052994749", // ✅ Valid
    access_token: "EAALE5Ix3XgYBP...",
    connected_at: timestamp,
    expires_at: "2026-01-05T18:30:12.115Z"
  },
  meta_ads: {
    ad_account_id: "1165824728412594", // ✅ Valid
    access_token: "EAAKycEb1D0gBP...",
    connected_at: timestamp,
    expires_at: "2026-01-05T17:05:09.321Z"
  },
  ga4: {
    property_id: "347656248",         // ✅ Valid
    access_token: "ya29.a0ATi6K2u...",
    refresh_token: "1//0536IfETVmCV...",
    connected_at: timestamp,
    expires_at: "2025-11-13T15:23:42.669Z"
  }
}
```

## Result
✅ All IDs and tokens now come from `connections` object
✅ No more invalid `'0'` values from deprecated `data_sources`
✅ OAuth-only architecture fully enforced
✅ Backward compatibility maintained for legacy fields

