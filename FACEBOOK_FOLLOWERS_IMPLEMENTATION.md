# Facebook Followers Implementation

## Summary

✅ **Facebook followers are now fetched just like Instagram followers!**

---

## Changes Made

### 1. Added `getFacebookFollowers()` Function
**File**: `services/meta-social-service.js` (lines 717-738)

```javascript
exports.getFacebookFollowers = async function(pageId, options = {}) {
  try {
    const { accessToken } = options;
    const facebookAccessToken = accessToken;

    if (!facebookAccessToken) {
      throw new Error('Facebook access token is required for getFacebookFollowers');
    }

    const response = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${pageId}`, {
      params: {
        access_token: facebookAccessToken,
        fields: 'followers_count'
      }
    });

    return response.data.followers_count || 0;
  } catch (error) {
    console.error('Error fetching Facebook followers:', error.message);
    return 0;
  }
};
```

**Key Features**:
- Uses OAuth token from brand connections
- Fetches `followers_count` field from Meta API
- Returns 0 on error (graceful fallback)
- Matches Instagram followers implementation

### 2. Updated Social API Import
**File**: `api/social.js` (line 5)

```javascript
const { getFacebookPosts, getFacebookFollowers, getInstagramPostsCount, getInstagramFollowers } = require('../services/meta-social-service.js');
```

### 3. Added Facebook Followers to Promises
**File**: `api/social.js` (lines 370-371)

```javascript
promises.push(getFacebookFollowers(fbPageIdToUse, { accessToken: facebookAccessToken }));
promiseMap.facebookFollowers = promises.length - 1;
```

### 4. Updated Response to Include Followers
**File**: `api/social.js` (lines 403-410)

```javascript
response.facebook = {
  pageId: fbPageIdToUse,
  followers: facebookFollowersResult.status === 'fulfilled' ? facebookFollowersResult.value : 0,
  posts: {
    count: 0,
    details: []
  }
};
```

---

## API Response Format

### Before
```json
{
  "facebook": {
    "pageId": "632376976633114",
    "posts": { "count": 0, "details": [] }
  }
}
```

### After
```json
{
  "facebook": {
    "pageId": "632376976633114",
    "followers": 1234,
    "posts": { "count": 0, "details": [] }
  }
}
```

---

## How It Works

1. **Social API** receives request with brand ID
2. **Extracts** Facebook page ID and access token from brand connections
3. **Calls** `getFacebookFollowers()` in parallel with posts fetch
4. **Returns** followers count in response alongside posts

---

## Testing

Run the Social API with brand `aZdrgtkQtVNlw8monjew`:

```bash
GET /api/social?brandId=aZdrgtkQtVNlw8monjew&from=2025-11-01&to=2025-11-14
```

Expected response:
```json
{
  "facebook": {
    "pageId": "632376976633114",
    "followers": <number>,
    "posts": { "count": <number>, "details": [...] }
  },
  "instagram": { ... }
}
```

---

## Consistency with Instagram

✅ Same function pattern
✅ Same error handling
✅ Same response structure
✅ Same OAuth token usage
✅ Same graceful fallback (returns 0 on error)

---

**Status**: ✅ Implementation complete. Ready for testing.

