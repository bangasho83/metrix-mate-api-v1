# pages_read_engagement - Quick Reference

## What We Pull

### Facebook Page Data ✅
```json
{
  "id": "632376976633114",
  "name": "Page Name",
  "fan_count": 1234,
  "link": "https://facebook.com/page",
  "picture": "https://...",
  "instagram_business_account": "17841411554422395"
}
```

### Facebook Post Insights ✅
```json
{
  "post_impressions": 150
}
```

### Instagram Post Insights ✅
```json
{
  "impressions": 500,
  "reach": 450,
  "total_interactions": 45,
  "saved": 5,
  "likes": 30,
  "comments": 10,
  "shares": 5,
  "video_views": 200  // (if video/reel)
}
```

---

## What We DON'T Pull (But Could)

### Facebook Page Data ❌
- `followers_count` - Requires `pages_read_engagement` scope
- `talking_about_count` - Requires `pages_read_engagement` scope
- `verification_status` - Requires `pages_read_engagement` scope

### Facebook Post Insights ❌
- `post_impressions_unique` - Requires system user token
- `post_engaged_users` - Requires system user token
- `post_reactions_by_type_total` - Requires system user token
- `post_clicks` - Requires system user token
- `post_video_avg_time_watched` - Requires system user token
- `post_reach` - Requires system user token

---

## Why Limited?

| Reason | Impact |
|--------|--------|
| OAuth restrictions | Can't access system-token-only metrics |
| App not fully approved | Can't request all `pages_read_engagement` fields |
| Token type | OAuth tokens < System user tokens |

---

## Files Involved

| File | Purpose | Metrics |
|------|---------|---------|
| `api/meta-stats.js` | Fetch page info | Page data |
| `services/meta-social-service.js` | Fetch post insights | `post_impressions`, Instagram metrics |

---

## To Get More Data

### Option 1: Request App Review
- Apply for full `pages_read_engagement` scope
- Get: `followers_count`, `talking_about_count`, `verification_status`
- Timeline: 1-4 weeks

### Option 2: Use System User Token
- Implement backend system token
- Get: All post insights metrics
- Complexity: High

### Option 3: Estimate Metrics
- Calculate from available data
- Get: Approximate engagement metrics
- Complexity: Low

---

## Current Status

✅ **Fully Implemented**: Basic page info, post impressions, Instagram insights
❌ **Not Implemented**: Advanced engagement metrics, followers count
⚠️ **Blocked**: System-token-only metrics (requires backend changes)

---

## API Endpoints Used

```
GET /v21.0/{pageId}
  └─ fields: id,name,fan_count,link,picture,instagram_business_account

GET /v21.0
  └─ ids: {postIds}
  └─ fields: insights.metric(post_impressions)

GET /v21.0
  └─ ids: {instagramIds}
  └─ fields: insights.metric(impressions,reach,total_interactions,saved,likes,comments,shares,video_views)
```

