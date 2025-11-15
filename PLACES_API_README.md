# Places API Documentation

## Endpoint
`POST /api/places`

## Description
The Places API fetches places data from Firebase Firestore with authentication. It retrieves all places for a specific brand and includes comprehensive statistics and brand information.

## Authentication
This endpoint requires Firebase authentication. Include a valid Firebase ID token in the Authorization header.

## Headers
- `Authorization: Bearer <Firebase_ID_Token>` (required)
- `Content-Type: application/json` (required)

## Request Body
```json
{
  "brandId": "your_brand_id"
}
```

## Parameters
- `brandId` (string, required): The brand ID to fetch places for

## Response Format
```json
{
  "places": [
    {
      "id": "place_123",
      "brandId": "brand_456",
      "name": "Downtown Location",
      "address": "123 Main St, City, State 12345",
      "placeId": "ChIJN1t_tDeuEmsRUsoyG83frY4",
      "rating": 4.5,
      "reviewCount": 127,
      "verified": true,
      "phone": "+1-555-123-4567",
      "website": "https://example.com",
      "coordinates": {
        "lat": 40.7128,
        "lng": -74.0060
      },
      "businessHours": {
        "monday": "9:00 AM - 6:00 PM",
        "tuesday": "9:00 AM - 6:00 PM",
        "wednesday": "9:00 AM - 6:00 PM",
        "thursday": "9:00 AM - 6:00 PM",
        "friday": "9:00 AM - 6:00 PM",
        "saturday": "10:00 AM - 4:00 PM",
        "sunday": "Closed"
      },
      "categories": ["restaurant", "food"],
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-20T14:45:00Z"
    }
  ],
  "brand": {
    "id": "brand_456",
    "name": "Example Restaurant Chain",
    "organizationId": "org_789",
    "description": "A popular restaurant chain",
    "website": "https://example-restaurants.com",
    "createdAt": "2024-01-01T00:00:00Z"
  },
  "totals": {
    "count": 5,
    "verified": 4,
    "unverified": 1,
    "averageRating": 4.3,
    "totalReviews": 542
  },
  "success": true
}
```



## Response Fields

### places[] (array of place objects)
- `id`: Firestore document ID
- `brandId`: Associated brand ID
- `name`: Place name
- `address`: Full address
- `placeId`: Google Places ID (if available)
- `rating`: Average rating (0-5)
- `reviewCount`: Number of reviews
- `verified`: Whether the place is verified
- `phone`: Contact phone number
- `website`: Place website URL
- `coordinates`: Latitude and longitude
- `businessHours`: Operating hours by day
- `categories`: Array of business categories
- `createdAt`: Creation timestamp
- `updatedAt`: Last update timestamp

### brand (object)
- `id`: Brand ID
- `name`: Brand name
- `organizationId`: Associated organization ID
- `description`: Brand description
- `website`: Brand website
- `createdAt`: Creation timestamp

### totals (object)
- `count`: Total number of places
- `verified`: Number of verified places
- `unverified`: Number of unverified places
- `averageRating`: Average rating across all places
- `totalReviews`: Total number of reviews across all places

## Example Requests

### Get all places for a brand:
```bash
curl -X POST "https://your-domain.com/api/places" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \
  -d '{"brandId": "brand_456"}'
```

### JavaScript Example:
```javascript
const response = await fetch('/api/places', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${firebaseIdToken}`
  },
  body: JSON.stringify({
    brandId: 'brand_456'
  })
});

const data = await response.json();
```

## Error Responses

### Brand not found:
```json
{
  "error": "Brand not found",
  "brandId": "invalid_brand_id",
  "success": false
}
```

### Missing authentication:
```json
{
  "error": "Missing or invalid Authorization header",
  "message": "Please provide a valid Firebase ID token in the Authorization header as \"Bearer <token>\"",
  "success": false
}
```

### Missing parameters:
```json
{
  "error": "Missing required parameter: brandId",
  "message": "Please provide brandId in the request body",
  "success": false
}
```

### Method not allowed:
```json
{
  "error": "Method not allowed",
  "message": "This endpoint only accepts POST requests",
  "success": false
}
```

## Caching
- Responses are cached for 10 minutes
- Cache headers (`X-Cache`, `X-Cache-Age`) indicate cache status
- Cache key is generated from query parameters

## Firebase Integration
- Uses Firebase Firestore for data storage
- Implements proper error handling and logging
- Validates brand existence before fetching places
- Fetches all places for a specified brand

## Security
- Follows Firebase security rules for data access
- Requires proper authentication for protected data
- Validates input parameters to prevent injection attacks
