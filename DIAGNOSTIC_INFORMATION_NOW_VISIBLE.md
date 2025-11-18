# Diagnostic Information Now Visible

## What You'll See in Logs

### Before (Silent Failures)
```
Found 0 posts using feed endpoint
Found 0 posts using published_posts endpoint
Total unique Facebook posts found: 0
```

❌ No indication of what went wrong

### After (Visible Errors)

#### If Posts Edge Fails:
```
Posts edge endpoint FAILED: {
  error: 'Error: Request failed with status code 400',
  status: 400,
  statusText: 'Bad Request',
  errorCode: 200,
  errorMessage: 'Permissions error',
  errorType: 'OAuthException',
  fullError: '{"error":{"message":"Permissions error","type":"OAuthException","code":200}}'
}
```

#### If Feed Endpoint Fails:
```
Feed endpoint FAILED: {
  error: 'Error: Request failed with status code 401',
  status: 401,
  statusText: 'Unauthorized',
  errorCode: 192,
  errorMessage: 'Access token has expired',
  errorType: 'OAuthException',
  fullError: '{"error":{"message":"Access token has expired","type":"OAuthException","code":192}}'
}
```

#### If Published Posts Fails:
```
Published posts endpoint FAILED: {
  error: 'Error: Request failed with status code 400',
  status: 400,
  statusText: 'Bad Request',
  errorCode: 803,
  errorMessage: 'Some of the aliases you requested do not exist',
  errorType: 'OAuthException',
  fullError: '{"error":{"message":"Some of the aliases you requested do not exist","type":"OAuthException","code":803}}'
}
```

#### Summary Log (Always Shown):
```
Facebook Posts Fetch Summary: {
  pageId: '632376976633114',
  dateRange: { from: '2025-11-01', to: '2025-11-14' },
  postsEdgeStatus: 'rejected',
  feedStatus: 'rejected',
  publishedPostsStatus: 'rejected',
  totalUniquePostsFound: 0,
  tokenUsed: { length: 203, startsWith: 'EAALE5Ix3X' }
}
```

## How to Use This Information

1. **Look for `errorCode`** in the logs
2. **Match it to the table** in `META_API_ERROR_CODES_REFERENCE.md`
3. **Follow the solution** for that error code
4. **Re-run the API** to verify fix

## Example Diagnostic Flow

```
Logs show: errorCode: 200
↓
Reference: Code 200 = Permissions error
↓
Solution: Token needs pages_read_engagement scope
↓
Action: Re-authenticate Facebook connection
↓
Result: Posts now returned ✅
```

## Key Diagnostic Fields

| Field | Meaning |
|-------|---------|
| `errorCode` | Meta API error code (190, 200, 192, 803, etc.) |
| `errorMessage` | Human-readable error description |
| `status` | HTTP status code (400, 401, 403, etc.) |
| `statusText` | HTTP status text (Bad Request, Unauthorized, etc.) |
| `errorType` | Type of error (OAuthException, etc.) |
| `fullError` | Complete error response from Meta |

---

**Result**: No more guessing. All API failures are now visible with full diagnostic details.

