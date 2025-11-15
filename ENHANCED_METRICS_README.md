# Enhanced Meta Stats API with Post Insights

## Overview

The Meta Stats API has been enhanced to include additional metrics for both Facebook and Instagram posts, as well as timezone conversion to display all timestamps in the business timezone.

## New Features

### 1. Timezone Conversion
- All timestamps are now converted from UTC to the business timezone
- Business timezone is automatically fetched from the Meta account (`timezone_name` field)
- Fallback to `BUSINESS_TIMEZONE` environment variable or UTC if not available
- Affects: `created_time` (Facebook), `timestamp` (Instagram), `date_start` (Meta Ads)

### 2. Facebook Post Insights
Each Facebook post now includes an `insights` object with the following metrics:

```json
{
  "insights": {
    "post_impressions": 0,           // Total number of impressions (times seen)
    "post_impressions_unique": 0,    // Unique users who saw the post
    "post_engaged_users": 0,         // Number of users who engaged (liked/commented/shared)
    "post_reactions_by_type_total": {}, // Reactions breakdown (like, love, haha, etc.)
    "post_clicks": 0,                // Total clicks on post (including photo/video clicks)
    "post_video_avg_time_watched": 0, // Average time video was watched (for videos only)
    "post_reach": 0                  // Total number of people who saw your post
  }
}
```

### 3. Instagram Post Insights
Each Instagram post now includes an `insights` object with the following metrics:

```json
{
  "insights": {
    "impressions": 0,    // Total number of impressions
    "reach": 0,          // Number of unique users who saw the post
    "engagement": 0,     // Total engagement (likes, comments, saves, shares)
    "saved": 0,          // Number of times the post was saved
    "video_views": 0     // Number of video views (for video posts only)
  }
}
```

## API Usage

### Request
```
GET /api/meta-stats?metaAccountId=YOUR_ACCOUNT_ID&from=2024-01-01&to=2024-12-31&posts=1
```

### Response Structure
```json
{
  "account": {
    "id": "act_474224379697300",
    "name": "tezmart",
    "status": 1,
    "currency": "CAD",
    "timezone": "America/Toronto"
  },
  "pages": [...],
  "instagram": [...],
  "posts": {
    "facebook": [
      {
        "id": "635618689629361_122127856184819575",
        "message": "Post content...",
        "created_time": "2025-07-03T02:53:31-04:00",  // Converted to business timezone
        "permalink_url": "https://...",
        "picture": "https://...",
        "likes": 1,
        "comments": 0,
        "shares": 0,
        "insights": {
          "post_impressions": 150,
          "post_impressions_unique": 120,
          "post_engaged_users": 25,
          "post_reactions_by_type_total": {
            "like": 15,
            "love": 5,
            "haha": 2
          },
          "post_clicks": 10,
          "post_video_avg_time_watched": 0,
          "post_reach": 140
        }
      }
    ],
    "instagram": [
      {
        "id": "18047092037197358",
        "caption": "Post caption...",
        "timestamp": "2025-07-02T14:59:23-04:00",  // Converted to business timezone
        "media_type": "IMAGE",
        "media_url": "https://...",
        "permalink": "https://...",
        "likes": 24,
        "comments": 0,
        "insights": {
          "impressions": 200,
          "reach": 180,
          "engagement": 30,
          "saved": 5,
          "video_views": 0
        }
      }
    ]
  },
  "error": null
}
```

## Implementation Details

### Batch Requests
- Facebook insights are fetched in batches of 50 posts using the `?ids=` parameter
- Instagram insights are fetched in batches of 25 posts
- Graceful fallback to zero values if insights API calls fail

### Error Handling
- If insights API calls fail (common due to permissions), posts are returned with zero values
- Individual batch failures don't affect other batches
- Original post data is preserved even if insights fail

### Performance
- Insights are only fetched for the limited number of posts returned (based on `limit` parameter)
- Batch requests minimize API calls
- Timezone conversion is done efficiently using moment-timezone

## Environment Variables

```env
# Business timezone - will use Meta account timezone if not set
BUSINESS_TIMEZONE=America/New_York
```

## Notes

- Insights data requires appropriate permissions from Facebook/Instagram
- Some metrics may not be available for all posts (e.g., video metrics for image posts)
- Historical insights data may have limitations based on Meta's data retention policies
- The API gracefully handles missing or restricted insights data
