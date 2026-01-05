# Update Brand API - Quick Reference

## Update Brand Fields

**Endpoint:** `PUT /api/brands`

**Description:** Update one or more fields of a brand. Only updates the fields you provide, leaving all other fields unchanged.

---

## Update Single Field

```bash
curl -X PUT https://social-apis-two.vercel.app/api/brands \
  -H "Content-Type: application/json" \
  -d '{
    "brandId": "brand_123",
    "organizationId": "org_xyz789",
    "userId": "user_abc123",
    "data": {
      "website": "https://newwebsite.com"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Brand updated successfully",
  "brand": {
    "id": "brand_123",
    "organizationId": "org_xyz789",
    "updatedFields": ["website"],
    "updated_at": "2025-01-05T14:30:00.000Z",
    "lastUpdatedBy": "user_abc123"
  }
}
```

---

## Update Multiple Fields

```bash
curl -X PUT https://social-apis-two.vercel.app/api/brands \
  -H "Content-Type: application/json" \
  -d '{
    "brandId": "brand_123",
    "organizationId": "org_xyz789",
    "userId": "user_abc123",
    "data": {
      "client_name": "Updated Brand Name",
      "website": "https://newwebsite.com",
      "industry": "Finance & Banking",
      "country": "United States",
      "tags": ["finance", "premium", "enterprise"]
    }
  }'
```

---

## Update Services Object

```bash
curl -X PUT https://social-apis-two.vercel.app/api/brands \
  -H "Content-Type: application/json" \
  -d '{
    "brandId": "brand_123",
    "organizationId": "org_xyz789",
    "userId": "user_abc123",
    "data": {
      "services": {
        "posts": 30,
        "blogs": 8,
        "seo": "Premium SEO Package",
        "newsletter": 4,
        "campaigns": 5,
        "fee": 8000,
        "monthly_budget": 25000
      }
    }
  }'
```

---

## Update Brand Guidelines

```bash
curl -X PUT https://social-apis-two.vercel.app/api/brands \
  -H "Content-Type: application/json" \
  -d '{
    "brandId": "brand_123",
    "organizationId": "org_xyz789",
    "userId": "user_abc123",
    "data": {
      "brand_guidelines": "<h2>Updated Mission</h2><p>Our new mission statement...</p><h2>Core Values</h2><ul><li>Innovation</li><li>Excellence</li><li>Integrity</li></ul>"
    }
  }'
```

---

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `brandId` | string | Brand ID to update |
| `organizationId` | string | Organization ID (for verification) |
| `userId` | string | User ID performing the update |
| `data` | object | Object containing fields to update |

---

## Protected Fields (Cannot Update)

These fields are protected and cannot be updated via PUT:
- `id` - Brand ID
- `createdBy` - Original creator
- `created_at` - Creation timestamp
- `archived` - Archive status (use DELETE/PATCH instead)
- `archivedAt` - Archive timestamp
- `archivedMetadata` - Archive metadata

---

## Updatable Fields

You can update any of these fields:
- `client_name`
- `website`
- `industry`
- `country`
- `tags`
- `currency_symbol`
- `brand_guidelines`
- `services` (entire object or individual properties)
- Any custom fields you've added

---

## Error Responses

### Brand Not Found (404)
```json
{
  "error": "Brand not found",
  "brandId": "brand_123"
}
```

### Unauthorized (403)
```json
{
  "error": "Unauthorized",
  "message": "Brand does not belong to this organization",
  "brandId": "brand_123",
  "organizationId": "org_xyz789"
}
```

### Protected Fields (400)
```json
{
  "error": "Cannot update protected fields",
  "message": "The following fields cannot be updated: id, createdBy",
  "protectedFields": ["id", "createdBy"]
}
```

---

## Notes

- Only the fields in the `data` object will be updated
- All other fields remain unchanged
- `updated_at` and `lastUpdatedBy` are automatically set
- The update uses Firestore's merge mode
- Organization verification ensures security

---

## Full Documentation

See [docs/BRANDS_API.md](docs/BRANDS_API.md) for complete API documentation.

