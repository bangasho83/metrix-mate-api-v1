# Overview API Documentation

## Endpoint
`GET /api/overview`

## Description
The Overview API provides daily analytics data combining visitors, Meta ads performance, and sales data in a simplified format. This endpoint is designed to give a quick overview of key metrics across different data sources.

## Query Parameters

### Required Parameters
- `ga4PropertyId` (string): Google Analytics 4 property ID
- `metaAccountId` (string): Meta (Facebook) Ads account ID

### Optional Parameters
- `from` (string): Start date in YYYY-MM-DD format (defaults to 7 days ago)
- `to` (string): End date in YYYY-MM-DD format (defaults to today)
- `sales_source` (string): Sales data source ('tossdown' or 'square')
- `sales_source_id` (string): ID for the sales source (required if sales_source is provided)

## Response Format

```json
{
  "totals": {
    "visitors": {
      "total": 518,
      "organic_search": 135,
      "paid_search": 0,
      "organic_social": 36,
      "paid_social": 0,
      "direct": 93,
      "email": 0,
      "affiliate": 0,
      "display": 0,
      "video": 0,
      "referral": 254,
      "sessions": 586,
      "engagedSessions": 512,
      "bounceRate": 12.63,
      "engagementRate": 87.37
    },
    "meta_ads": {
      "spend": 236.00,
      "impressions": 51484,
      "clicks": 531,
      "reach": 45068,
      "ctr": 1.03,
      "cpc": 0.44,
      "cpm": 4.58
    },
    "sales": {
      "revenue": 266.08,
      "transactions": 20,
      "averageOrderValue": 13.30
    }
  },
  "dailyData": [
    {
      "date": "20240101",
      "visitors": {
        "total": 170,
        "organic_search": 35,
        "paid_search": 0,
        "organic_social": 9,
        "paid_social": 0,
        "direct": 28,
        "email": 0,
        "affiliate": 0,
        "display": 0,
        "video": 0,
        "referral": 98,
        "sessions": 186,
        "engagedSessions": 164,
        "bounceRate": 11.83,
        "engagementRate": 88.17,
        "medium_source_details": {
          "referral": {
            "meta": 90,
            "(not set)": 3,
            "ridgewayplazaeats.com": 3,
            "metrixmate5.vercel.app": 1
          },
          "organic_search": {
            "google": 35
          },
          "direct": {
            "(direct)": 28
          },
          "organic_social": {
            "l.instagram.com": 8,
            "apps.facebook.com": 1
          }
        }
      },
      "meta_ads": {
        "spend": 78.52,
        "impressions": 17358,
        "clicks": 174,
        "reach": 15034,
        "ctr": 1.00,
        "cpc": 0.45,
        "cpm": 4.52
      },
      "sales": {
        "revenue": 51.96,
        "transactions": 4,
        "averageOrderValue": 12.99
      }
    }
  ]
}
```

## Response Fields

### totals
Aggregated totals across all days in the date range.

#### totals.visitors
- `total`: Total number of visitors across all sources
- `organic_search`: Visitors from organic search (Google, Bing, Yahoo, etc.)
- `paid_search`: Visitors from paid search campaigns
- `organic_social`: Visitors from organic social media posts
- `paid_social`: Visitors from paid social media campaigns
- `direct`: Direct visitors (typed URL or bookmarks)
- `email`: Visitors from email campaigns
- `affiliate`: Visitors from affiliate marketing
- `display`: Visitors from display advertising
- `video`: Visitors from video advertising
- `referral`: Visitors from other referral sources
- `sessions`: Total number of sessions
- `engagedSessions`: Number of engaged sessions (sessions lasting >10s, with conversion event, or 2+ page views)
- `bounceRate`: Percentage of sessions that were not engaged
- `engagementRate`: Percentage of sessions that were engaged

#### totals.meta_ads
- `spend`: Total ad spend across all days
- `impressions`: Total ad impressions across all days
- `clicks`: Total ad clicks across all days
- `reach`: Total ad reach across all days
- `ctr`: Overall click-through rate (clicks/impressions * 100)
- `cpc`: Overall cost per click (spend/clicks)
- `cpm`: Overall cost per thousand impressions (spend/impressions * 1000)

#### totals.sales (only included if sales_source and sales_source_id are provided)
- `revenue`: Total revenue across all days
- `transactions`: Total number of transactions across all days
- `averageOrderValue`: Average order value across all transactions

### dailyData
Array of daily data objects, each containing:

#### dailyData[].visitors
- `total`: Total number of visitors for the day
- `organic_search`: Visitors from organic search for the day
- `paid_search`: Visitors from paid search campaigns for the day
- `organic_social`: Visitors from organic social media for the day
- `paid_social`: Visitors from paid social media campaigns for the day
- `direct`: Direct visitors for the day
- `email`: Visitors from email campaigns for the day
- `affiliate`: Visitors from affiliate marketing for the day
- `display`: Visitors from display advertising for the day
- `video`: Visitors from video advertising for the day
- `referral`: Visitors from other referral sources for the day
- `sessions`: Number of sessions for the day
- `engagedSessions`: Number of engaged sessions for the day
- `bounceRate`: Bounce rate percentage for the day
- `engagementRate`: Engagement rate percentage for the day
- `medium_source_details`: Detailed breakdown of traffic sources grouped by category

#### dailyData[].meta_ads
- `spend`: Total ad spend for the day
- `impressions`: Total ad impressions for the day
- `clicks`: Total ad clicks for the day
- `reach`: Total ad reach for the day
- `ctr`: Click-through rate for the day (clicks/impressions * 100)
- `cpc`: Cost per click for the day (spend/clicks)
- `cpm`: Cost per thousand impressions for the day (spend/impressions * 1000)

#### dailyData[].sales (only included if sales_source and sales_source_id are provided)
- `revenue`: Total revenue for the day
- `transactions`: Number of transactions for the day
- `averageOrderValue`: Average order value for the day

## Example Request

```bash
curl "https://your-domain.com/api/overview?ga4PropertyId=123456789&metaAccountId=987654321&from=2024-01-01&to=2024-01-07&sales_source=tossdown&sales_source_id=12345"
```

## Caching
- Responses are cached for 5 minutes
- Cache headers (`X-Cache`, `X-Cache-Age`) indicate cache status

## Error Handling
- Returns 200 with empty `dailyData` array if credentials are missing
- Returns 500 for server errors
- Gracefully handles missing or failed data sources

## Environment Variables Required
- `GOOGLE_CLIENT_EMAIL`: Google service account email
- `GOOGLE_PRIVATE_KEY`: Google service account private key
- `META_ACCESS_TOKEN`: Meta (Facebook) access token

## Notes
- Date format in response is YYYYMMDD (e.g., "20240101")
- Sales data is only included when both `sales_source` and `sales_source_id` parameters are provided
- Supports both Tossdown and Square as sales data sources
- All monetary values are in the currency configured for the respective platforms
