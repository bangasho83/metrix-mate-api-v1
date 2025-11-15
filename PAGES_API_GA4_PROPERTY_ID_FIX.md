# Pages API - GA4 Invalid Property ID Fix

## Issue
The `/api/pages` endpoint was throwing:
```
GA4 Service - Token refresh failed: {
  message: 'Request failed with status code 403',
  hasClientId: true,
  hasClientSecret: true
}
Pages API - Error fetching GA4 data: {
  error: 'Request failed with status code 403',
  propertyId: '0'
}
```

## Root Cause
The GA4 property ID was being set to `'0'` (string zero), which is invalid:

1. **Query parameter `ga4PropertyId='0'`** was being passed
2. **normalizeParam() function** was NOT filtering out `'0'`
3. **GA4 API call** was made with `propertyId: '0'`
4. **Google API** rejected the request with 403 error

## Solution
Added proper validation for GA4 property IDs:

### File: `api/pages.js`

#### 1. Updated normalizeParam Function (Line 222):

**Before:**
```javascript
const normalizeParam = (param) => {
  if (!param || param === '' || param === 'not-set') {
    return null;
  }
  return param;
};
```

**After:**
```javascript
const normalizeParam = (param) => {
  if (!param || param === '' || param === 'not-set' || param === '0') {
    return null;
  }
  return param;
};
```

#### 2. Added Property ID Validation (Line 276):

```javascript
// Validate GA4 property ID is a valid number string
const isValidPropertyId = ga4PropertyIdToUse && 
  String(ga4PropertyIdToUse).match(/^\d+$/) && 
  ga4PropertyIdToUse !== '0';
const includeGA4 = ga4Flag && isValidPropertyId;
```

#### 3. Enhanced Error Response (Lines 310-322):

```javascript
if (ga4Flag && !isValidPropertyId) {
  return res.status(400).json({
    error: 'Invalid GA4 Property ID',
    message: 'GA4 Property ID must be a valid numeric ID (not 0 or empty)',
    details: {
      ga4PropertyIdToUse,
      ga4PropertyIdType: typeof ga4PropertyIdToUse,
      isValidPropertyId,
      suggestion: 'Ensure the brand has GA4 connected with a valid property_id'
    },
    success: false
  });
}
```

#### 4. Added Detailed Logging (Lines 237-246):

```javascript
console.log('Pages API - GA4 initialization:', {
  queryGA4,
  ga4Flag,
  ga4PropertyId,
  ga4PropertyIdToUse,
  brandId
});
```

## Valid GA4 Property IDs

| Property ID | Valid? | Reason |
|-------------|--------|--------|
| `425347028` | ✅ | Valid numeric ID |
| `'425347028'` | ✅ | Valid numeric string |
| `0` | ❌ | Zero is not a valid property ID |
| `'0'` | ❌ | String zero is not valid |
| `''` | ❌ | Empty string |
| `null` | ❌ | Null value |
| `undefined` | ❌ | Undefined value |

## Testing

### Test 1: Valid Property ID from Brand Connection
```bash
curl "http://localhost:3000/api/pages?brandId=YOUR_BRAND_ID&ga4=1"
```
**Expected:** ✅ GA4 data fetched successfully

### Test 2: Valid Property ID from Query Parameter
```bash
curl "http://localhost:3000/api/pages?brandId=YOUR_BRAND_ID&ga4=1&ga4PropertyId=425347028"
```
**Expected:** ✅ GA4 data fetched successfully

### Test 3: Invalid Property ID (Zero)
```bash
curl "http://localhost:3000/api/pages?brandId=YOUR_BRAND_ID&ga4=1&ga4PropertyId=0"
```
**Expected:** ❌ 400 error with message "Invalid GA4 Property ID"

### Test 4: No GA4 Connection
```bash
curl "http://localhost:3000/api/pages?brandId=BRAND_WITHOUT_GA4&ga4=1"
```
**Expected:** ❌ 400 error with message "Invalid GA4 Property ID"

## Result
✅ Invalid property IDs (like '0') are now rejected early
✅ Clear error messages guide users to fix the issue
✅ 403 errors from Google API are prevented
✅ Better logging for debugging

