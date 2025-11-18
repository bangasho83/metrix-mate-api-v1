# Meta API Error Codes Reference

When the new error logs appear, look for these error codes to diagnose the issue:

## Authentication & Token Errors

| Code | Meaning | Solution |
|------|---------|----------|
| **190** | Invalid OAuth access token | Token expired or revoked. Need to refresh token or re-authenticate |
| **191** | Invalid OAuth access token signature | Token corrupted. Re-authenticate |
| **192** | Access token has expired | Refresh the token using refresh_token |
| **193** | Invalid OAuth access token format | Token format is wrong |

## Permission Errors

| Code | Meaning | Solution |
|------|---------|----------|
| **200** | Permissions error | Token lacks required permissions. Check scopes: `pages_read_engagement`, `pages_read_user_content` |
| **210** | User not authorized | User doesn't have permission to access this page |
| **211** | Insufficient permissions | Add required permissions to app |

## Page/Resource Errors

| Code | Meaning | Solution |
|------|---------|----------|
| **100** | Invalid parameter | Check API parameters (pageId, fields, etc.) |
| **803** | Some of the aliases you requested do not exist | Page ID is invalid or doesn't exist |
| **104** | Requires valid access token | No token provided or token is empty |

## Rate Limiting & Service Errors

| Code | Meaning | Solution |
|------|---------|----------|
| **4** | Application request limit reached | Wait before retrying |
| **17** | User request limit exceeded | Wait before retrying |
| **2** | Service temporarily unavailable | Retry after delay |
| **1** | An unknown error occurred | Retry or contact Meta support |

## What to Look For in Logs

After running the Social API again, check for:

```
Posts edge endpoint FAILED: {
  errorCode: 190,  // Look at this
  errorMessage: "Invalid OAuth access token",
  status: 400
}
```

## Common Scenarios

### Scenario 1: All 3 endpoints return 200 (Permission denied)
- **Cause**: Token lacks `pages_read_engagement` or `pages_read_user_content`
- **Fix**: Re-authenticate with proper scopes

### Scenario 2: All 3 endpoints return 192 (Token expired)
- **Cause**: Token's `expires_at` has passed
- **Fix**: Use refresh_token to get new access_token

### Scenario 3: Endpoints return 100 (Invalid parameter)
- **Cause**: API field syntax or parameter format wrong
- **Fix**: Check Meta API v21.0 documentation

### Scenario 4: All endpoints return 2 (Service unavailable)
- **Cause**: Meta API temporary outage
- **Fix**: Retry after 5-10 minutes

### Scenario 5: All endpoints return empty data (no error)
- **Cause**: Page has no posts in date range
- **Fix**: Check if page actually has posts in that period

