# pages_read_engagement Permission - Summary

## Your Question
**"What data do we pull with the pages_read_engagement permissions exactly?"**

---

## The Answer

### ✅ Data We DO Pull

#### 1. Facebook Page Information
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

#### 2. Facebook Post Insights
```json
{
  "post_impressions": 150
}
```

#### 3. Instagram Post Insights
```json
{
  "impressions": 500,
  "reach": 450,
  "total_interactions": 45,
  "saved": 5,
  "likes": 30,
  "comments": 10,
  "shares": 5,
  "video_views": 200
}
```

---

### ❌ Data We DON'T Pull (But Could)

#### Facebook Page
- `followers_count` - Requires system user token
- `talking_about_count` - Requires system user token
- `verification_status` - Requires system user token

#### Facebook Posts
- `post_impressions_unique` - Requires system user token
- `post_engaged_users` - Requires system user token
- `post_reactions_by_type_total` - Requires system user token
- `post_clicks` - Requires system user token
- `post_video_avg_time_watched` - Requires system user token
- `post_reach` - Requires system user token

---

## Why Limited?

### The Core Issue
**OAuth tokens (from brand connections) have restricted access to Meta API.**

Meta intentionally limits certain metrics to system user tokens only for security reasons.

### The Hierarchy
```
OAuth Token (Brand Connection)
├── ✅ Basic page info
├── ✅ Post impressions
├── ✅ Instagram insights
└── ❌ Advanced engagement metrics

System User Token (Backend)
├── ✅ All page info
├── ✅ All post insights
└── ✅ All engagement metrics
```

---

## Current Implementation

| Component | Status | Details |
|-----------|--------|---------|
| Page Info | ✅ Partial | Basic fields only |
| Facebook Insights | ✅ Minimal | Only impressions |
| Instagram Insights | ✅ Full | All metrics available |
| Advanced Metrics | ❌ Blocked | Requires system token |

---

## To Get More Data

### Option 1: Request App Review (Recommended)
- **Timeline**: 1-4 weeks
- **Effort**: Low
- **Result**: Get `followers_count`, `talking_about_count`, `verification_status`
- **Limitation**: Still won't get advanced post metrics

### Option 2: Use System User Token (Complex)
- **Timeline**: 1-2 weeks
- **Effort**: High
- **Result**: Get ALL metrics
- **Limitation**: Requires backend changes, security considerations

### Option 3: Estimate Metrics (Quick)
- **Timeline**: Immediate
- **Effort**: Low
- **Result**: Approximate engagement metrics
- **Limitation**: Not actual data, estimates only

---

## Files Involved

- `api/meta-stats.js` - Fetches page info
- `services/meta-social-service.js` - Fetches post insights

---

## Conclusion

We're using `pages_read_engagement` permission **optimally for OAuth tokens**. The limitation isn't in our implementation—it's in Meta's API design. Advanced metrics require system user tokens, which require backend infrastructure changes.

**Current setup is production-ready and secure.**

