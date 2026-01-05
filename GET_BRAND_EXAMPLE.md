# Get Brand Details API - Quick Reference

## Get Single Brand by ID

**Endpoint:** `GET /api/brands?brandId=BRAND_ID`

### Sample cURL Command

```bash
curl -X GET 'https://social-apis-two.vercel.app/api/brands?brandId=brand_123'
```

### Expected Response (200 OK)

```json
{
  "success": true,
  "brand": {
    "id": "brand_123",
    "client_name": "Example Brand Inc",
    "organizationId": "org_xyz789",
    "website": "https://example.com",
    "industry": "Technology & SaaS",
    "country": "United Arab Emirates",
    "tags": ["premium", "enterprise", "tech"],
    "currency_symbol": "AED",
    "brand_guidelines": "<h2>Mission & Vision</h2>...",
    "services": {
      "posts": 20,
      "blogs": 4,
      "seo": "Full SEO Audit",
      "newsletter": 2,
      "campaigns": 3,
      "fee": 5000,
      "monthly_budget": 15000
    },
    "created_at": "2025-01-05T12:00:00.000Z",
    "updated_at": "2025-01-05T12:00:00.000Z",
    "createdBy": "user_abc123",
    "archived": false
  }
}
```

### Get Archived Brand

```bash
curl -X GET 'https://social-apis-two.vercel.app/api/brands?brandId=brand_123&includeArchived=true'
```

### Error Responses

#### Brand Not Found (404)

```json
{
  "error": "Brand not found",
  "brandId": "brand_123"
}
```

#### Brand Archived (410)

```json
{
  "error": "Brand is archived",
  "brandId": "brand_123",
  "archivedAt": "2025-01-05T12:00:00.000Z",
  "message": "This brand has been archived. Use includeArchived=true to view it."
}
```

---

## Get Multiple Brands

### Get All Brands for an Organization

```bash
curl -X GET 'https://social-apis-two.vercel.app/api/brands?organizationId=org_xyz789'
```

**Response:**

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
    },
    {
      "id": "brand_456",
      "client_name": "Another Brand",
      "organizationId": "org_xyz789",
      "website": "https://anotherbrand.com",
      "created_at": "2025-01-04T10:00:00.000Z"
    }
  ]
}
```

---

## Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `brandId` | string | Get single brand by ID |
| `organizationId` | string | Filter brands by organization |
| `seo` | string | Filter by SEO service value |
| `includeArchived` | boolean | Include archived brands (default: false) |
| `onlyArchived` | boolean | Show only archived brands |

---

## Complete Documentation

See [docs/BRANDS_API.md](docs/BRANDS_API.md) for full API documentation including:
- Create Brand (POST)
- Get Single Brand (GET)
- Get Brands List (GET)
- Delete Brand (DELETE)
- Restore Brand (PATCH)

