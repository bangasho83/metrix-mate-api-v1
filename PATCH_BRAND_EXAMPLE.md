# PATCH Brand API - Quick Reference

## PATCH vs PUT

- **PATCH** - Partial updates (update only specific fields you provide)
- **PUT** - Full updates (same as PATCH but semantically different)

Both work the same way in this API. Use whichever you prefer!

---

## Option 1: Partial Update (Most Common)

Update one or more fields without affecting other fields.

### Update Single Field

```bash
curl -X PATCH https://social-apis-two.vercel.app/api/brands \
  -H "Content-Type: application/json" \
  -d '{
    "brandId": "Vvx9NPyD2lq48NT5fn7T",
    "organizationId": "org_xyz789",
    "userId": "user_abc123",
    "data": {
      "website": "https://newwebsite.com"
    }
  }'
```

### Update Multiple Fields

```bash
curl -X PATCH https://social-apis-two.vercel.app/api/brands \
  -H "Content-Type: application/json" \
  -d '{
    "brandId": "Vvx9NPyD2lq48NT5fn7T",
    "organizationId": "org_xyz789",
    "userId": "user_abc123",
    "data": {
      "client_name": "Updated Brand Name",
      "website": "https://newwebsite.com",
      "industry": "Technology",
      "tags": ["tech", "premium"]
    }
  }'
```

### Update Services

```bash
curl -X PATCH https://social-apis-two.vercel.app/api/brands \
  -H "Content-Type: application/json" \
  -d '{
    "brandId": "Vvx9NPyD2lq48NT5fn7T",
    "organizationId": "org_xyz789",
    "userId": "user_abc123",
    "data": {
      "services": {
        "posts": 25,
        "blogs": 5,
        "seo": "Premium SEO",
        "fee": 6000
      }
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Brand updated successfully",
  "brand": {
    "id": "Vvx9NPyD2lq48NT5fn7T",
    "organizationId": "org_xyz789",
    "updatedFields": ["services"],
    "updated_at": "2025-01-05T14:30:00.000Z",
    "lastUpdatedBy": "user_abc123"
  }
}
```

---

## Option 2: Restore Archived Brand

Only use this when you want to restore an archived brand.

```bash
curl -X PATCH https://social-apis-two.vercel.app/api/brands \
  -H "Content-Type: application/json" \
  -d '{
    "brandId": "brand_123",
    "organizationId": "org_xyz789",
    "userId": "user_abc123",
    "restore": true
  }'
```

**Response:**
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

---

## Required Fields

### For Partial Update:
- `brandId` (string)
- `organizationId` (string)
- `userId` (string)
- `data` (object with fields to update)

### For Restore:
- `brandId` (string)
- `organizationId` (string)
- `userId` (string)
- `restore` (boolean, must be `true`)

---

## Protected Fields (Cannot Update)

- `id`
- `createdBy`
- `created_at`
- `archived`
- `archivedAt`
- `archivedMetadata`

---

## Error Responses

### Missing Data Field (400)
```json
{
  "error": "Missing or invalid required field: data",
  "message": "data must be an object containing fields to update"
}
```

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
  "message": "Brand does not belong to this organization"
}
```

---

## Notes

- PATCH and PUT work identically in this API
- Only fields in `data` object are updated
- All other fields remain unchanged
- `updated_at` and `lastUpdatedBy` are set automatically
- Use `restore: true` only for restoring archived brands

---

## Full Documentation

See [docs/BRANDS_API.md](docs/BRANDS_API.md) for complete API documentation.

