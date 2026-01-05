# Brands API - Quick Reference

## Get Single Brand Details

```bash
curl -X GET 'https://social-apis-two.vercel.app/api/brands?brandId=brand_123'
```

**Response:**
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
    "services": {
      "posts": 20,
      "blogs": 4,
      "seo": "Full SEO Audit"
    },
    "created_at": "2025-01-05T12:00:00.000Z"
  }
}
```

---

## Sample cURL Command to Add a Brand

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
    "brand_guidelines": "<h2>Mission & Vision</h2><h2>Core Values</h2>...",
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

## Expected Response

```json
{
  "success": true,
  "message": "Brand created successfully",
  "brand": {
    "id": "auto_generated_brand_id",
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

## Minimal Example (Required Fields Only)

```bash
curl -X POST https://social-apis-two.vercel.app/api/brands \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "My Brand",
    "organizationId": "org_xyz789",
    "createdBy": "user_abc123"
  }'
```

## Required Fields

- `client_name` (string) - Brand/client name
- `organizationId` (string) - Organization ID
- `createdBy` (string) - User ID of creator

## Optional Fields

- `website` (string)
- `industry` (string)
- `country` (string)
- `tags` (array)
- `currency_symbol` (string)
- `brand_guidelines` (string/HTML)
- `services` (object)

## Full Documentation

See [docs/BRANDS_API.md](docs/BRANDS_API.md) for complete API documentation.

