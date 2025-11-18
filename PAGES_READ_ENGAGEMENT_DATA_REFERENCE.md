# pages_read_engagement Permission - Data Reference

## Overview

The `pages_read_engagement` permission is used to access **engagement metrics** and **page information** from Facebook Pages. However, our current implementation has **limited usage** of this permission.

---

## What We Currently Pull

### ✅ Currently Implemented

#### 1. **Facebook Page Information** (api/meta-stats.js)
```javascript
// Fields requested:
- id
- name
- fan_count (likes)
- link
- picture
- instagram_business_account
```

**Note**: We intentionally **do NOT request** these fields (they require `pages_read_engagement`):
- `followers_count` ❌
- `talking_about_count` ❌
- `verification_status` ❌

#### 2. **Facebook Post Insights** (services/meta-social-service.js)
```javascript
// Only metric available via OAuth:
- post_impressions

// Metrics that REQUIRE system user token (not available):
- post_impressions_unique ❌
- post_engaged_users ❌
- post_reactions_by_type_total ❌
- post_clicks ❌
- post_video_avg_time_watched ❌
- post_reach ❌
```

#### 3. **Instagram Post Insights** (services/meta-social-service.js)
```javascript
// Base metrics (all posts):
- impressions
- reach
- total_interactions
- saved
- likes
- comments
- shares

// Video-specific metrics:
- video_views (for VIDEO and REELS only)
```

---

## What pages_read_engagement COULD Provide

### Page-Level Data
- `followers_count` - Total page followers
- `talking_about_count` - People talking about the page
- `verification_status` - If page is verified
- `engagement_rate` - Overall engagement metrics

### Post-Level Data (with system user token)
- `post_impressions_unique` - Unique users who saw post
- `post_engaged_users` - Users who engaged with post
- `post_reactions_by_type_total` - Breakdown of reactions
- `post_clicks` - Total clicks on post
- `post_reach` - Total reach of post

---

## Current Limitations

| Data | Status | Reason |
|------|--------|--------|
| `followers_count` | ❌ Not fetched | Requires `pages_read_engagement` |
| `post_impressions` | ✅ Fetched | Available via OAuth |
| `post_reach` | ❌ Not fetched | Requires system user token |
| `post_engaged_users` | ❌ Not fetched | Requires system user token |
| Instagram insights | ✅ Fetched | Available via OAuth |

---

## Why Limited Usage?

1. **OAuth Restrictions**: Meta restricts many metrics to system user tokens only
2. **App Approval**: Full `pages_read_engagement` scope requires app review
3. **Token Type**: OAuth tokens (from brand connections) have fewer permissions than system user tokens

---

## To Expand Data Collection

### Option 1: Request More Permissions
- Add `pages_read_engagement` to app scopes
- Request app review from Meta
- Would enable: `followers_count`, `talking_about_count`, `verification_status`

### Option 2: Use System User Token
- Requires backend system user token (not OAuth)
- Would enable: All post insights metrics
- More complex setup, higher security requirements

---

## Summary

**Current `pages_read_engagement` Usage**: Minimal
- Primarily used for basic page info
- Most engagement metrics blocked by OAuth restrictions
- Instagram insights work better than Facebook insights

**Recommendation**: If you need more engagement data, consider:
1. Requesting app review for full `pages_read_engagement` scope
2. Implementing system user token for backend access
3. Using estimated metrics based on available data

