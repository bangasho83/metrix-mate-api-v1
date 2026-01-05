# Brands API Documentation

## Overview

The Brands API provides endpoints to manage brand documents in the system. All endpoints support CORS and return JSON responses.

**Base URL:** `https://social-apis-two.vercel.app/api/brands`

---

## Endpoints

### 1. Create Brand (POST)

**Endpoint:** `POST /api/brands`

**Description:** Creates a new brand document in the Firestore `brands` collection.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `client_name` | string | ✅ Yes | Brand/client name |
| `organizationId` | string | ✅ Yes | Organization ID this brand belongs to |
| `createdBy` | string | ✅ Yes | User ID of the creator |
| `website` | string | ❌ No | Brand website URL |
| `industry` | string | ❌ No | Industry/sector (e.g., "Technology & SaaS") |
| `country` | string | ❌ No | Country name |
| `tags` | array | ❌ No | Array of tags (e.g., ["premium", "enterprise"]) |
| `currency_symbol` | string | ❌ No | Currency symbol (e.g., "AED", "USD") |
| `brand_guidelines` | string | ❌ No | HTML or text content for brand guidelines |
| `services` | object | ❌ No | Services configuration object |

**Services Object Structure:**

```json
{
  "posts": 20,
  "blogs": 4,
  "seo": "Full SEO Audit",
  "newsletter": 2,
  "campaigns": 3,
  "fee": 5000,
  "monthly_budget": 15000
}
```

**Example Request:**

```bash
curl -X POST https://social-apis-two.vercel.app/api/brands \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Example Brand Inc",
    "website": "https://example.com",
    "industry": "Technology & SaaS",
    "country": "United Arab Emirates",
    "tags": ["premium", "enterprise", "tech"],
    "currency_symbol": "AED",
    "brand_guidelines": "<h2>Mission & Vision</h2><p>Our mission is...</p>",
    "services": {
      "posts": 20,
      "blogs": 4,
      "seo": "Full SEO Audit",
      "newsletter": 2,
      "campaigns": 3,
      "fee": 5000,
      "monthly_budget": 15000
    },
    "createdBy": "user_abc123",
    "organizationId": "org_xyz789"
  }'
```

**Success Response (201):**

```json
{
  "success": true,
  "message": "Brand created successfully",
  "brand": {
    "id": "brand_generated_id",
    "client_name": "Example Brand Inc",
    "organizationId": "org_xyz789",
    "createdBy": "user_abc123",
    "created_at": "2025-01-05T12:00:00.000Z",
    "website": "https://example.com",
    "industry": "Technology & SaaS",
    "country": "United Arab Emirates",
    "tags": ["premium", "enterprise", "tech"],
    "currency_symbol": "AED",
    "services": {
      "posts": 20,
      "blogs": 4,
      "seo": "Full SEO Audit",
      "newsletter": 2,
      "campaigns": 3,
      "fee": 5000,
      "monthly_budget": 15000
    }
  }
}
```

**Error Responses:**

#### 400 - Missing Required Field

```json
{
  "error": "Missing or invalid required field: client_name",
  "message": "client_name must be a valid string"
}
```

#### 400 - Invalid Field Type

```json
{
  "error": "Invalid field: tags",
  "message": "tags must be an array"
}
```

#### 500 - Server Error

```json
{
  "error": "Failed to create brand",
  "details": "Error message details"
}
```

---

### 2. Get Brands (GET)

**Endpoint:** `GET /api/brands`

**Description:** Retrieves brand documents. Excludes archived brands by default.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `organizationId` | string | ❌ No | Filter by organization ID |
| `seo` | string | ❌ No | Filter by SEO service value |
| `includeArchived` | boolean | ❌ No | Include archived brands (default: false) |
| `onlyArchived` | boolean | ❌ No | Show only archived brands |

**Example Requests:**

```bash
# Get all brands for an organization
curl -X GET 'https://social-apis-two.vercel.app/api/brands?organizationId=org_xyz789'

# Get brands with specific SEO service
curl -X GET 'https://social-apis-two.vercel.app/api/brands?organizationId=org_xyz789&seo=Full%20SEO%20Audit'

# Include archived brands
curl -X GET 'https://social-apis-two.vercel.app/api/brands?organizationId=org_xyz789&includeArchived=true'
```

**Success Response (200):**

```json
{
  "count": 2,
  "organizationId": "org_xyz789",
  "brands": [
    {
      "id": "brand_123",
      "client_name": "Example Brand Inc",
      "organizationId": "org_xyz789",
      "website": "https://example.com",
      "created_at": "2025-01-05T12:00:00.000Z"
    }
  ]
}
```

---

### 3. Delete Brand (DELETE)

**Endpoint:** `DELETE /api/brands`

**Description:** Soft deletes (archives) a brand. The brand is not permanently deleted but marked as archived.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `brandId` | string | ✅ Yes | Brand ID to archive |
| `organizationId` | string | ✅ Yes | Organization ID (for verification) |
| `userId` | string | ✅ Yes | User ID performing the deletion |

**Example Request:**

```bash
curl -X DELETE https://social-apis-two.vercel.app/api/brands \
  -H "Content-Type: application/json" \
  -d '{
    "brandId": "brand_123",
    "organizationId": "org_xyz789",
    "userId": "user_abc123"
  }'
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Brand archived successfully",
  "brand": {
    "id": "brand_123",
    "name": "Example Brand Inc",
    "organizationId": "org_xyz789",
    "archivedAt": "2025-01-05T12:00:00.000Z"
  }
}
```

**Error Responses:**

#### 404 - Brand Not Found

```json
{
  "error": "Brand not found",
  "brandId": "brand_123"
}
```

#### 403 - Unauthorized

```json
{
  "error": "Unauthorized",
  "message": "Brand does not belong to this organization",
  "brandId": "brand_123",
  "organizationId": "org_xyz789"
}
```

#### 410 - Already Archived

```json
{
  "error": "Brand already archived",
  "brandId": "brand_123",
  "archivedAt": "2025-01-05T12:00:00.000Z",
  "message": "This brand has already been archived"
}
```

---

### 4. Restore Brand (PATCH)

**Endpoint:** `PATCH /api/brands`

**Description:** Restores an archived brand.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `brandId` | string | ✅ Yes | Brand ID to restore |
| `organizationId` | string | ✅ Yes | Organization ID (for verification) |
| `userId` | string | ✅ Yes | User ID performing the restoration |

**Example Request:**

```bash
curl -X PATCH https://social-apis-two.vercel.app/api/brands \
  -H "Content-Type: application/json" \
  -d '{
    "brandId": "brand_123",
    "organizationId": "org_xyz789",
    "userId": "user_abc123"
  }'
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Brand restored successfully",
  "brand": {
    "id": "brand_123",
    "organizationId": "org_xyz789",
    "restoredAt": "2025-01-05T12:00:00.000Z"
  }
}
```

**Error Responses:**

#### 400 - Not Archived

```json
{
  "error": "Brand is not archived",
  "brandId": "brand_123",
  "message": "Only archived brands can be restored"
}
```

---

## Complete cURL Examples

### Minimal Brand Creation

```bash
curl -X POST https://social-apis-two.vercel.app/api/brands \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "My New Brand",
    "organizationId": "org_xyz789",
    "createdBy": "user_abc123"
  }'
```

### Full Brand Creation with All Fields

```bash
curl -X POST https://social-apis-two.vercel.app/api/brands \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Premium Tech Solutions",
    "website": "https://premiumtech.com",
    "industry": "Technology & SaaS",
    "country": "United Arab Emirates",
    "tags": ["premium", "enterprise", "tech", "b2b"],
    "currency_symbol": "AED",
    "brand_guidelines": "<h2>Brand Mission</h2><p>To deliver cutting-edge solutions...</p><h2>Core Values</h2><ul><li>Innovation</li><li>Excellence</li></ul>",
    "services": {
      "posts": 20,
      "blogs": 4,
      "seo": "Full SEO Audit",
      "newsletter": 2,
      "campaigns": 3,
      "fee": 5000,
      "monthly_budget": 15000
    },
    "createdBy": "user_abc123",
    "organizationId": "org_xyz789"
  }'
```

---

## Notes

- All timestamps are automatically generated using Firestore server timestamps
- Brands are automatically marked as `archived: false` on creation
- The `created_at` and `updated_at` fields are automatically set
- Brand IDs are auto-generated by Firestore
- All endpoints support CORS with wildcard origin (`*`)
- Maximum execution time: 30 seconds

---

## Related APIs

- **Organizations API**: `/api/organizations` - Manage organizations
- **Calendar API**: `/api/calendar` - Manage calendar posts for brands
- **Keywords API**: `/api/keywords` - Manage brand keywords

