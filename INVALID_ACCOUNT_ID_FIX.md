# Invalid Account ID Validation Fix

## Problem Identified

The api/overview logs showed 3 errors related to invalid account IDs:

```
Error fetching Meta Ads data: {
  message: 'Request failed with status code 400',
  metaAccountId: '0'  // ← Invalid account ID
}
```

The issue: Query parameters like `metaAccountId='0'` and `ga4PropertyId='0'` were being accepted as valid values, causing API failures.

## Root Cause

The validation logic only checked if parameters were empty strings or 'not-set', but didn't filter out invalid values like `'0'`:

```javascript
// Before (Incomplete validation)
let metaAccountIdToUse = metaAccountId && metaAccountId.trim() ? metaAccountId : null;
// This accepts '0' as valid because '0'.trim() is truthy
```

## Solution Implemented

Added validation to filter out invalid values like `'0'` across all APIs:

```javascript
// After (Complete validation)
let metaAccountIdToUse = metaAccountId && metaAccountId.trim() && metaAccountId !== '0' ? metaAccountId : null;
```

Or using a normalizeParam function:

```javascript
const normalizeParam = (param) => {
  if (!param || param === '' || param === 'not-set' || param === '0') {
    return null;
  }
  return param;
};
```

## Files Fixed (9 total)

1. ✅ **api/overview.js** - Direct validation
2. ✅ **api/meta-stats.js** - normalizeParam function
3. ✅ **api/meta-ads.js** - normalizeParam function
4. ✅ **api/meta-campaign.js** - normalizeParam function
5. ✅ **api/ga4-users.js** - normalizeParam function
6. ✅ **api/ga4-events.js** - normalizeParam function
7. ✅ **api/combined-analytics.js** - normalizeParam function
8. ✅ **api/social.js** - normalizeParam function
9. ✅ **api/sales.js** - normalizeParam function
10. ✅ **api/sales-trends.js** - normalizeParam function
11. ✅ **api/summary-stats.js** - normalizeParam function + fixed connections extraction

## Valid vs Invalid IDs

| ID | Valid? | Reason |
|----|--------|--------|
| `425347028` | ✅ | Valid numeric ID |
| `'425347028'` | ✅ | Valid numeric string |
| `0` | ❌ | Zero is not valid |
| `'0'` | ❌ | String zero is not valid |
| `''` | ❌ | Empty string |
| `'not-set'` | ❌ | Placeholder value |

## Benefits

✅ Prevents invalid API calls to Meta and GA4
✅ Reduces 400/403 errors in logs
✅ Better error handling and validation
✅ Consistent validation across all APIs
✅ Cleaner error messages for debugging

## Testing

Test with invalid ID:
```bash
curl "http://localhost:3000/api/overview?brandId=YOUR_BRAND_ID&metaAccountId=0"
```

Expected: API will use brand connections instead of invalid '0'

