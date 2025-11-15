# Social API - Instagram Insights Batch Error Fix

## Issue
The `/api/social` endpoint was showing:
```
35 Total
3 Error

Error fetching insights for batch: {
  message: 'Request failed with status code 400',
  response: {
    error: {
      message: '(#100) The value must be a valid insights metric',
      type: 'OAuthException',
      code: 100
    }
  }
}
```

## Root Cause
The Instagram batch insights request was trying to fetch **invalid metrics**:

**Invalid metrics being requested:**
- `plays` ❌ NOT a valid Instagram insights metric
- `video_play_actions` ❌ NOT a valid Instagram insights metric

**Valid metrics:**
- `impressions` ✅
- `reach` ✅
- `engagement` ✅
- `saved` ✅
- `video_views` ✅ (for videos/reels only)

## Solution
Removed invalid metrics from the Instagram batch insights request.

### File: `services/meta-social-service.js`

#### Before (Lines 164-177):
```javascript
const baseMetrics = ['impressions', 'reach', 'engagement', 'saved'];
const videoMetrics = ['video_views', 'plays', 'video_play_actions'];
```

#### After (Lines 164-177):
```javascript
const baseMetrics = ['impressions', 'reach', 'engagement', 'saved'];
const videoMetrics = ['video_views']; // Only valid metric
```

## Enhanced Error Logging
Added detailed error logging to help diagnose future issues:

**Facebook batch errors now show:**
- HTTP status code
- Error code and message
- Requested metrics
- Post count
- Sample post IDs

**Instagram batch errors now show:**
- HTTP status code
- Error code and message
- Requested metrics
- Post count
- Video post count
- Sample post IDs

## Testing
```bash
# Test with your brand ID
curl "http://localhost:3000/api/social?brandId=YOUR_BRAND_ID"

# Check logs for:
# ✅ "Fetching insights for X posts in batch"
# ✅ "Insights response received for X posts"
# ✅ "Successfully fetched insights for X posts"
```

## Result
✅ Instagram batch insights now use only valid metrics
✅ 400 errors should be resolved
✅ Better error logging for debugging
✅ Graceful fallback with empty insights if batch fails

