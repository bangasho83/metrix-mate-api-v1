# Brand Utility Function - Usage Guide

## Overview
The `getBrandInfo()` utility function provides a centralized, cached way to fetch brand information across all services. This function should be used instead of directly querying Firestore for brand data.

## Location
`services/firebase-service.js`

## Function Signature
```javascript
getBrandInfo(brandId, options = {})
```

## Parameters

### `brandId` (string, required)
The brand ID to fetch from Firestore.

### `options` (object, optional)
Configuration object with the following properties:

- **`idToken`** (string, optional): Firebase ID token for authentication
- **`useCache`** (boolean, optional, default: `true`): Whether to use the 15-minute cache
- **`throwOnNotFound`** (boolean, optional, default: `false`): Whether to throw an error if brand is not found

## Return Value
Returns a Promise that resolves to:
- **Brand object** with normalized fields (see below)
- **`null`** if brand is not found and `throwOnNotFound` is `false`
- **Throws error** if brand is not found and `throwOnNotFound` is `true`

## Brand Object Structure

The returned brand object includes all fields from the Firestore document, plus these normalized fields:

```javascript
{
  id: 'brand_123',                    // Brand ID
  name: 'Acme Corporation',           // Normalized from client_name, brandName, name, or title
  organizationId: 'org_456',          // Associated organization ID
  website: 'https://example.com',     // Brand website (from website or url field)
  services: {                         // Services configuration
    seo: 'Onpage/Offpage',
    posts: 10,
    campaigns: 5,
    // ... other service fields
  },
  keywords: ['keyword1', 'keyword2'], // Array of keywords
  createdAt: '2024-01-01T00:00:00Z',  // Creation timestamp
  // ... all other fields from the brand document
}
```

## Usage Examples

### Example 1: Basic Usage
```javascript
import { getBrandInfo } from '../services/firebase-service.js';

// In your API endpoint or service
const brand = await getBrandInfo('brand_123');

if (brand) {
  console.log('Brand name:', brand.name);
  console.log('Website:', brand.website);
  console.log('Organization:', brand.organizationId);
}
```

### Example 2: With Authentication
```javascript
import { getBrandInfo } from '../services/firebase-service.js';

export default async function handler(req, res) {
  const { brandId } = req.body;
  const idToken = req.headers.authorization?.replace('Bearer ', '');

  try {
    const brand = await getBrandInfo(brandId, { idToken });
    
    return res.status(200).json({
      success: true,
      brand
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
```

### Example 3: Without Cache (Force Fresh Data)
```javascript
import { getBrandInfo } from '../services/firebase-service.js';

// Fetch fresh data, bypassing cache
const brand = await getBrandInfo('brand_123', { useCache: false });
```

### Example 4: Throw Error if Not Found
```javascript
import { getBrandInfo } from '../services/firebase-service.js';

try {
  const brand = await getBrandInfo('brand_123', { throwOnNotFound: true });
  // Brand is guaranteed to exist here
  console.log('Brand found:', brand.name);
} catch (error) {
  console.error('Brand not found:', error.message);
  // Handle the error appropriately
}
```

### Example 5: Using in a Service Function
```javascript
import { getBrandInfo } from '../services/firebase-service.js';

async function processCalendarForBrand(brandId) {
  // Get brand info with all details
  const brand = await getBrandInfo(brandId);
  
  if (!brand) {
    throw new Error(`Brand ${brandId} not found`);
  }

  // Use brand data
  const brandName = brand.name;
  const website = brand.website;
  const keywords = brand.keywords || [];
  
  // Your processing logic here
  return {
    brandName,
    website,
    keywordsCount: keywords.length
  };
}
```

### Example 6: Fetching Multiple Brands
```javascript
import { getBrandInfo } from '../services/firebase-service.js';

async function getBrandsInfo(brandIds) {
  // Fetch all brands in parallel
  const brandPromises = brandIds.map(id => getBrandInfo(id));
  const brands = await Promise.all(brandPromises);
  
  // Filter out null values (brands not found)
  return brands.filter(brand => brand !== null);
}

// Usage
const brandIds = ['brand_1', 'brand_2', 'brand_3'];
const brands = await getBrandsInfo(brandIds);
```

## Cache Management

### Cache Duration
The cache has a TTL (Time To Live) of **15 minutes**.

### Clear Cache for Specific Brand
```javascript
import { clearBrandCache } from '../services/firebase-service.js';

// Clear cache for a specific brand
clearBrandCache('brand_123');
```

### Clear All Brand Cache
```javascript
import { clearBrandCache } from '../services/firebase-service.js';

// Clear all brand cache
clearBrandCache();
```

## Benefits

1. **Centralized**: Single source of truth for fetching brand data
2. **Cached**: 15-minute cache reduces Firestore reads and improves performance
3. **Normalized**: Consistent field names across different brand document structures
4. **Flexible**: Optional authentication, cache control, and error handling
5. **Well-documented**: Clear JSDoc comments and usage examples
6. **Reusable**: Can be used across all services and API endpoints

## Migration Guide

### Before (Direct Firestore Query)
```javascript
const brandRef = db.collection('brands').doc(brandId);
const brandSnap = await brandRef.get();
const brandData = brandSnap.data();
const brandName = brandData.client_name || brandData.brandName || 'Unknown';
```

### After (Using Utility)
```javascript
import { getBrandInfo } from '../services/firebase-service.js';

const brand = await getBrandInfo(brandId);
const brandName = brand.name; // Already normalized!
```

## Common Use Cases

### 1. API Endpoints
Use `getBrandInfo()` in API endpoints to fetch brand data with authentication:
```javascript
const brand = await getBrandInfo(brandId, { idToken });
```

### 2. Background Services
Use without authentication for server-side processing:
```javascript
const brand = await getBrandInfo(brandId);
```

### 3. Data Validation
Use with `throwOnNotFound` to ensure brand exists:
```javascript
const brand = await getBrandInfo(brandId, { throwOnNotFound: true });
```

### 4. Real-time Updates
Use without cache to get fresh data:
```javascript
const brand = await getBrandInfo(brandId, { useCache: false });
```

## Notes

- The function uses Firebase Admin SDK, so it bypasses all security rules
- All brand fields from Firestore are preserved in the returned object
- The `name` field is normalized from multiple possible sources for consistency
- Cache is stored in-memory and will be cleared on server restart
- The function logs detailed information for debugging purposes

