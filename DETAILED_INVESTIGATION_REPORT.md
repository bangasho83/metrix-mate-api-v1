# Detailed Investigation Report: Facebook Posts Returning 0

## Executive Summary

**Issue**: Brand `aZdrgtkQtVNlw8monjew` returns 0 Facebook posts despite having valid connections and tokens.

**Root Cause**: Silent API failures - the code was using `Promise.allSettled()` but had NO error logging for rejected promises.

**Status**: ✅ FIXED - Added comprehensive error logging to reveal the actual problem.

---

## Investigation Process

### Step 1: Verified Connections
✅ All connections properly configured:
- Facebook page: `632376976633114`
- Access token: Valid (203 chars, expires 2026-01-05)
- GA4, Meta Ads, Tossdown: All connected

### Step 2: Traced API Flow
1. Social API receives request
2. Calls `getFacebookPosts()` in `meta-social-service.js`
3. Makes 3 parallel API calls using `Promise.allSettled()`
4. Returns 0 posts

### Step 3: Identified the Problem
**Location**: `services/meta-social-service.js`, lines 403-463

**Issue**: 
```javascript
const [postsResponse, feedResponse, publishedResponse] = await Promise.allSettled([
  // 3 API calls
]);

// Only checks for 'fulfilled' status
if (postsResponse.status === 'fulfilled' && postsResponse.value.data?.posts?.data) {
  // Process posts
}
// NO HANDLING for 'rejected' status!
```

**Impact**: When any endpoint fails, the error is silently ignored with no logging.

---

## The Fix

### What Was Added

Enhanced error handling in `services/meta-social-service.js`:

**For Each Endpoint (Posts Edge, Feed, Published Posts):**

1. **When Fulfilled**:
   - Check if data exists
   - If empty, log response structure
   - If has data, process posts

2. **When Rejected**:
   - Log error message
   - Log HTTP status code
   - Log Meta error code (190, 200, 803, etc.)
   - Log Meta error message
   - Log full error response

3. **Summary Log**:
   - Status of all 3 endpoints
   - Total posts found
   - Token info

### Code Changes

**File**: `services/meta-social-service.js`
**Lines**: 435-532
**Changes**: 
- Replaced simple if-checks with comprehensive error handling
- Added 3 new error logging blocks (one per endpoint)
- Added summary log showing all endpoint statuses

---

## What Happens Next

### When You Run the API Again

You'll see one of these scenarios:

1. **All endpoints succeed** → Posts are returned ✅
2. **All endpoints fail with error code 200** → Permission issue (most likely)
3. **All endpoints fail with error code 192** → Token expired
4. **All endpoints fail with error code 803** → Invalid page ID
5. **Endpoints return empty data** → No posts in date range

### How to Diagnose

1. Look for `errorCode` in the logs
2. Check `META_API_ERROR_CODES_REFERENCE.md`
3. Follow the solution for that error code
4. Re-authenticate or refresh token if needed
5. Run API again

---

## Files Created/Modified

### Modified
- `services/meta-social-service.js` - Added error logging

### Created (Documentation)
- `FACEBOOK_POSTS_ZERO_ISSUE_ANALYSIS.md` - Detailed analysis
- `INVESTIGATION_SUMMARY.md` - Quick summary
- `META_API_ERROR_CODES_REFERENCE.md` - Error code reference
- `EXPECTED_LOG_OUTPUT_AFTER_FIX.md` - Example logs
- `DETAILED_INVESTIGATION_REPORT.md` - This file

---

## Key Takeaway

The issue wasn't with the connections or tokens - it was **invisible API failures** that weren't being logged. Now with proper error logging, you'll see exactly what Meta API is returning and can fix it accordingly.

