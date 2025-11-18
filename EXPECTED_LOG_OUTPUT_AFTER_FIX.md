# Expected Log Output After Fix

When you run the Social API again, you'll now see detailed logs. Here's what to expect:

## Scenario 1: All Endpoints Succeed (Posts Found)

```
Fetching Facebook posts for page 632376976633114 from 2025-11-01 to 2025-11-14
Using Facebook page access token from brand connections for page 632376976633114
Token validation: Token length=203, starts with=EAALE5Ix3X...
Found 5 posts using posts edge
Found 3 posts using feed endpoint
Found 2 posts using published_posts endpoint
Facebook Posts Fetch Summary: {
  pageId: '632376976633114',
  dateRange: { from: '2025-11-01', to: '2025-11-14' },
  postsEdgeStatus: 'fulfilled',
  feedStatus: 'fulfilled',
  publishedPostsStatus: 'fulfilled',
  totalUniquePostsFound: 8,
  tokenUsed: { length: 203, startsWith: 'EAALE5Ix3X' }
}
Total unique Facebook posts found: 8, returning 8 in details (limit: 25)
```

## Scenario 2: Token Permission Error (Most Likely)

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
Feed endpoint FAILED: {
  error: 'Error: Request failed with status code 400',
  status: 400,
  statusText: 'Bad Request',
  errorCode: 200,
  errorMessage: 'Permissions error',
  errorType: 'OAuthException',
  fullError: '{"error":{"message":"Permissions error","type":"OAuthException","code":200}}'
}
Published posts endpoint FAILED: {
  error: 'Error: Request failed with status code 400',
  status: 400,
  statusText: 'Bad Request',
  errorCode: 200,
  errorMessage: 'Permissions error',
  errorType: 'OAuthException',
  fullError: '{"error":{"message":"Permissions error","type":"OAuthException","code":200}}'
}
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

**Action**: Token needs `pages_read_engagement` and `pages_read_user_content` scopes

## Scenario 3: Token Expired

```
Posts edge endpoint FAILED: {
  errorCode: 192,
  errorMessage: 'Access token has expired',
  status: 401
}
```

**Action**: Use refresh_token to get new access_token

## Scenario 4: Invalid Page ID

```
Posts edge endpoint FAILED: {
  errorCode: 803,
  errorMessage: 'Some of the aliases you requested do not exist',
  status: 400
}
```

**Action**: Verify page_id is correct

## How to Use These Logs

1. Look for `errorCode` in the logs
2. Match it to the reference table in `META_API_ERROR_CODES_REFERENCE.md`
3. Follow the suggested solution
4. Re-authenticate or refresh token as needed
5. Run the API again to verify fix

