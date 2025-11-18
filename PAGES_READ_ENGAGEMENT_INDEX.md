# pages_read_engagement Permission - Complete Index

## 📋 Quick Answer

**What data do we pull with `pages_read_engagement`?**

### ✅ We DO Pull:
1. **Facebook Page Info**: id, name, fan_count, link, picture, instagram_business_account
2. **Facebook Post Insights**: post_impressions (only)
3. **Instagram Post Insights**: impressions, reach, total_interactions, saved, likes, comments, shares, video_views

### ❌ We DON'T Pull:
1. **Facebook Page**: followers_count, talking_about_count, verification_status
2. **Facebook Posts**: post_reach, post_engaged_users, post_reactions_by_type_total, post_clicks, post_video_avg_time_watched

**Reason**: Most advanced metrics require system user tokens, not OAuth tokens

---

## 📚 Documentation Files

### Quick Reference
- **[PAGES_READ_ENGAGEMENT_QUICK_REFERENCE.md](PAGES_READ_ENGAGEMENT_QUICK_REFERENCE.md)** ⭐ START HERE
  - What we pull vs. don't pull
  - Why we don't pull certain data
  - Options to get more data

### Detailed Reference
- **[PAGES_READ_ENGAGEMENT_DATA_REFERENCE.md](PAGES_READ_ENGAGEMENT_DATA_REFERENCE.md)**
  - Complete data breakdown
  - Current limitations
  - Expansion options

### Technical Breakdown
- **[PAGES_READ_ENGAGEMENT_TECHNICAL_BREAKDOWN.md](PAGES_READ_ENGAGEMENT_TECHNICAL_BREAKDOWN.md)**
  - API calls with line numbers
  - Permission hierarchy
  - Data availability summary

---

## 🔍 Data Summary Table

| Data | Status | Source | Why Limited |
|------|--------|--------|-------------|
| Page ID | ✅ | Page API | - |
| Page Name | ✅ | Page API | - |
| Fan Count | ✅ | Page API | - |
| Followers Count | ❌ | Page API | System token only |
| Post Impressions | ✅ | Insights API | OAuth available |
| Post Reach | ❌ | Insights API | System token only |
| Post Engaged Users | ❌ | Insights API | System token only |
| Instagram Insights | ✅ | Insights API | OAuth available |

---

## 🎯 Key Findings

### Current Implementation
- **Facebook**: Minimal engagement data (only impressions)
- **Instagram**: Full engagement data available
- **Limitation**: OAuth tokens can't access advanced Facebook metrics

### Why This Limitation?
1. Meta restricts advanced metrics to system user tokens
2. OAuth tokens from brand connections have limited scope
3. App may not be approved for full `pages_read_engagement` scope

### To Get More Data
1. **Request App Review** (1-4 weeks) - Get followers_count, etc.
2. **Use System Token** (complex) - Get all post metrics
3. **Estimate Metrics** (simple) - Calculate from available data

---

## 📍 Files Involved

| File | Purpose | Lines |
|------|---------|-------|
| `api/meta-stats.js` | Fetch page info | 927-941 |
| `services/meta-social-service.js` | Fetch post insights | 20-30, 160-176, 218-225 |

---

## 🚀 Next Steps

### If You Need More Data:
1. Review [PAGES_READ_ENGAGEMENT_QUICK_REFERENCE.md](PAGES_READ_ENGAGEMENT_QUICK_REFERENCE.md)
2. Choose expansion option (app review, system token, or estimation)
3. Implement chosen solution

### If Current Data Is Sufficient:
- No action needed
- Current implementation is optimized for OAuth tokens

---

## 💡 Key Takeaway

**We're using `pages_read_engagement` permission effectively for what OAuth tokens allow, but advanced metrics require system user tokens which require backend changes.**

Current setup is optimal for OAuth-based authentication from brand connections.

