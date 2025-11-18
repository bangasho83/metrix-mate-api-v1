# Facebook Posts Returning 0 - Root Cause Analysis

## Issue Summary
The Social API is returning 0 Facebook posts despite having:
- Valid Facebook page connection (page_id: `632376976633114`)
- Valid access token (203 characters, starts with `EAALE5Ix3X...`)
- Proper date range (2025-11-01 to 2025-11-14)

## Root Cause: Silent API Failures

The code uses `Promise.allSettled()` to fetch from 3 Meta API endpoints:
1. Posts edge: `/{pageId}` with `posts.since().until()` field
2. Feed endpoint: `/{pageId}/feed`
3. Published posts endpoint: `/{pageId}/published_posts`

**Critical Problem:** When these API calls fail (rejected promises), the code silently ignores them with NO error logging.

### Code Location
`services/meta-social-service.js`, lines 403-463

### The Issue
```javascript
const [postsResponse, feedResponse, publishedResponse] = await Promise.allSettled([
  // 3 API calls...
]);

// Process posts edge response
if (postsResponse.status === 'fulfilled' && postsResponse.value.data?.posts?.data) {
  // Process posts...
}

// Process feed endpoint
if (feedResponse.status === 'fulfilled' && feedResponse.value.data?.data) {
  // Process posts...
}

// Process published posts endpoint
if (publishedResponse.status === 'fulfilled' && publishedResponse.value.data?.data) {
  // Process posts...
}
```

**Missing:** No logging for `status === 'rejected'` cases!

## Why Requests Are Failing

Likely causes (without error logs, we can't see):

1. **Token Permissions Issue**
   - Facebook page access token may lack required permissions
   - OAuth token may not have `pages_read_engagement` or `pages_read_user_content` scopes
   - Token may be restricted to specific endpoints

2. **API Endpoint Restrictions**
   - The `posts` field on page edge may require specific permissions
   - Feed endpoint may be restricted for OAuth tokens
   - Published_posts endpoint may have different permission requirements

3. **Token Expiration/Validity**
   - Token shows `expires_at: "2026-01-05T20:17:30.371Z"` (future date, so valid)
   - But Meta API might still reject it for other reasons

4. **Rate Limiting or Temporary Issues**
   - Meta API might be rate limiting the requests
   - Temporary service issues

## Evidence from Logs

```
Found 0 posts using feed endpoint
Found 0 posts using published_posts endpoint
Total unique Facebook posts found: 0
```

These logs indicate:
- The API calls completed (no exceptions thrown)
- But returned empty data arrays
- OR the responses were rejected and silently ignored

## Solution Implemented ✅

Added comprehensive error logging to `services/meta-social-service.js` (lines 435-517):

### For Each Endpoint (Posts Edge, Feed, Published Posts):

**When Fulfilled:**
- Logs if data is present
- If no data, logs the response structure to understand what Meta returned

**When Rejected:**
- Logs the error message
- Logs HTTP status code
- Logs Meta error code (e.g., 190, 200, 803)
- Logs Meta error message
- Logs Meta error type
- Logs full error response for debugging

### Additional Summary Log
Added a comprehensive summary at the end showing:
- Status of all 3 endpoints (fulfilled/rejected)
- Total posts found
- Token validation info

## Next Steps

1. **Run the Social API again** with the same brand ID and date range
2. **Check the logs** for the new error messages
3. **Look for Meta error codes:**
   - `190` = Invalid OAuth token
   - `200` = Permission denied
   - `803` = Some of the aliases you requested do not exist
   - `100` = Invalid parameter
   - `2` = Service temporarily unavailable

4. **Common Issues to Check:**
   - Token permissions (may need `pages_read_engagement`, `pages_read_user_content`)
   - Token scope restrictions
   - Page access restrictions
   - Rate limiting

