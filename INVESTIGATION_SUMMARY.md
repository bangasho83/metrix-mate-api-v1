# Investigation Summary: Facebook Posts Returning 0

## Problem Statement
Brand `aZdrgtkQtVNlw8monjew` has all connections properly configured:
- ✅ Facebook page connected (page_id: `632376976633114`)
- ✅ Valid access token (203 chars, starts with `EAALE5Ix3X...`)
- ✅ Token expires: 2026-01-05 (valid for ~50 days)
- ✅ GA4, Meta Ads, Tossdown also connected

Yet the Social API returns **0 Facebook posts** for date range 2025-11-01 to 2025-11-14.

## Root Cause Identified

**Silent API Failures** - The code was using `Promise.allSettled()` to fetch from 3 Meta endpoints but had **NO error logging for rejected promises**.

### The Three Endpoints Being Called:
1. **Posts Edge**: `GET /v21.0/{pageId}?fields=posts.since().until()...`
2. **Feed Endpoint**: `GET /v21.0/{pageId}/feed?since=...&until=...`
3. **Published Posts**: `GET /v21.0/{pageId}/published_posts?since=...&until=...`

### Why We Couldn't See the Problem:
- When an endpoint failed, the code silently ignored it
- No error messages were logged
- The function returned 0 posts without explaining why
- Logs only showed "Found 0 posts using feed endpoint" (empty array, not error)

## Solution Implemented

Enhanced error logging in `services/meta-social-service.js` (lines 435-532):

### For Each Endpoint:
**When Fulfilled:**
- Logs if data exists
- If empty, logs response structure

**When Rejected:**
- Error message
- HTTP status code
- Meta error code (190=invalid token, 200=permission denied, etc.)
- Meta error message
- Full error response

### Summary Log Added:
Shows status of all 3 endpoints + total posts found

## What to Do Next

1. **Trigger the Social API again** with same brand/dates
2. **Check the new logs** for error details
3. **Identify the issue** from Meta error codes
4. **Fix accordingly** (token refresh, permissions, etc.)

## Files Modified
- `services/meta-social-service.js` - Added comprehensive error logging
- `FACEBOOK_POSTS_ZERO_ISSUE_ANALYSIS.md` - Detailed analysis

