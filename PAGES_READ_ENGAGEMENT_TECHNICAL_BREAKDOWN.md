# pages_read_engagement - Technical Breakdown

## API Calls Using This Permission

### 1. Facebook Page Info Fetch
**File**: `api/meta-stats.js` (lines 927-941)

```javascript
const pageResponse = await axios.get(`${META_BASE_URL}/${META_API_VERSION}/${pageId}`, {
  params: {
    fields: 'id,name,fan_count,link,picture,instagram_business_account',
    access_token: facebookAccessToken
  }
});
```

**Data Retrieved**:
- `id` - Page ID
- `name` - Page name
- `fan_count` - Number of likes (NOT followers)
- `link` - Page URL
- `picture` - Page profile picture
- `instagram_business_account` - Connected Instagram account ID

**NOT Retrieved** (would need `pages_read_engagement`):
- `followers_count` ❌
- `talking_about_count` ❌
- `verification_status` ❌

---

### 2. Facebook Post Insights Fetch
**File**: `services/meta-social-service.js` (lines 58-65)

```javascript
const insightsResponse = await axios.get(`${META_BASE_URL}/${META_API_VERSION}`, {
  params: {
    ids: postIds,
    fields: `insights.metric(post_impressions)`,
    access_token: token
  }
});
```

**Data Retrieved**:
- `post_impressions` - Total times post was seen

**NOT Retrieved** (require system user token):
- `post_impressions_unique` ❌
- `post_engaged_users` ❌
- `post_reactions_by_type_total` ❌
- `post_clicks` ❌
- `post_video_avg_time_watched` ❌
- `post_reach` ❌

---

### 3. Instagram Post Insights Fetch
**File**: `services/meta-social-service.js` (lines 218-225)

```javascript
const insightsResponse = await axios.get(`${META_BASE_URL}/${META_API_VERSION}`, {
  params: {
    ids: postIds,
    fields: `insights.metric(${metricsArray.join(',')})`,
    access_token: token
  }
});
```

**Base Metrics Retrieved**:
- `impressions` - Total impressions
- `reach` - Unique users reached
- `total_interactions` - Total engagement
- `saved` - Times saved
- `likes` - Total likes
- `comments` - Total comments
- `shares` - Total shares

**Video Metrics** (if post is VIDEO or REELS):
- `video_views` - Video view count

---

## Permission Hierarchy

```
pages_read_engagement
├── Basic Page Info
│   ├── id ✅
│   ├── name ✅
│   ├── fan_count ✅
│   ├── link ✅
│   ├── picture ✅
│   └── followers_count ❌ (not requested)
│
├── Post Insights (OAuth)
│   ├── post_impressions ✅
│   └── post_reach ❌ (requires system token)
│
└── Engagement Metrics
    ├── post_engaged_users ❌
    ├── post_reactions_by_type_total ❌
    └── post_clicks ❌
```

---

## Why Some Data Isn't Fetched

### 1. OAuth Token Limitations
- OAuth tokens from brand connections have restricted scopes
- Meta limits certain metrics to system user tokens only
- This is a Meta API design decision for security

### 2. App Review Requirements
- Full `pages_read_engagement` scope requires Meta app review
- Current app may not be approved for all metrics
- Review process can take weeks

### 3. Token Type Mismatch
- OAuth tokens: Limited to basic engagement data
- System user tokens: Full access to all metrics
- We use OAuth tokens from brand connections

---

## Data Availability Summary

| Data | Available | Source | Permission |
|------|-----------|--------|-----------|
| Page ID | ✅ | Page API | Basic |
| Page Name | ✅ | Page API | Basic |
| Fan Count | ✅ | Page API | Basic |
| Followers Count | ❌ | Page API | pages_read_engagement |
| Post Impressions | ✅ | Insights API | pages_read_engagement |
| Post Reach | ❌ | Insights API | System token only |
| Instagram Insights | ✅ | Insights API | instagram_business_account_insights |

---

## Recommendations

### To Get More Data:
1. **Request App Review** - Apply for full `pages_read_engagement` scope
2. **Use System Token** - Implement backend system user token
3. **Estimate Metrics** - Calculate from available data (likes, comments, shares)

### Current Best Practice:
- Use available OAuth metrics
- Estimate missing metrics from engagement data
- Document limitations in API responses

