# Facebook & Instagram OAuth Token Troubleshooting

## Issue Summary
Instagram posts are showing but Facebook posts are not. Errors include:
- `Error getting page access token: Request failed with status code 400`
- `Error fetching Facebook followers: Request failed with status code 400`
- `Error fetching Instagram insights for batch: Request failed with status code 400`
- `Error getting Instagram page access token: Request failed with status code 403`

## Root Cause
The Facebook and Instagram tokens stored in brand connections may not have the required permissions:

### Facebook Token Issues
- **Missing Permission**: `pages_read_engagement` - Required for `followers_count`, `talking_about_count`, `verification_status`
- **Solution**: Removed these fields from the initial page fetch. Now only fetching: `id, name, fan_count, link, picture, instagram_business_account`

### Instagram Token Issues
- **Missing Permission**: `instagram_business_account_basic` or `instagram_business_account_insights`
- **Status 403**: Indicates permission denied, not just missing fields

## Changes Made

### 1. Removed Unnecessary Page Token Exchange (meta-social-service.js)
**Before**: Tried to fetch page-specific token from Facebook API (caused 400 errors)
**After**: Use OAuth token directly from brand connections

### 2. Simplified Facebook Page Fields (api/meta-stats.js)
**Before**: Requested `followers_count, fan_count, talking_about_count, verification_status`
**After**: Request only `id, name, fan_count, link, picture, instagram_business_account`

### 3. Added Detailed Error Logging
- Token validation logging (length, start of token)
- HTTP status codes
- Full API error response details
- Helps diagnose permission issues

## Required OAuth Permissions

### Facebook Page Token
- `pages_read_user_profile` - Basic page info
- `pages_read_engagement` - For followers, engagement metrics (optional)
- `pages_read_posts` - For posts data

### Instagram Business Account Token
- `instagram_business_account_basic` - Basic account info
- `instagram_business_account_insights` - For insights/metrics

## Next Steps

1. **Check Token Permissions**: Verify tokens have required scopes
2. **Review Logs**: Look for detailed error messages in console
3. **Re-authenticate**: If tokens lack permissions, user needs to re-authenticate with proper scopes
4. **Test Endpoints**: Use `/api/meta-stats?brandId=YOUR_BRAND_ID` to test

## Testing
```bash
# Test with your brand ID
curl "http://localhost:3000/api/meta-stats?brandId=YOUR_BRAND_ID"

# Check logs for:
# - Token validation info
# - API error details
# - HTTP status codes
```

