#!/bin/bash

# Test the image-to-prompt API in production
# Usage: ./test-image-to-prompt-production.sh [PRODUCTION_URL]

# Default to common Vercel URL pattern if not provided
PROD_URL="${1:-https://social-apis-two.vercel.app}"

echo "🚀 Testing Image-to-Prompt API in Production"
echo "================================================"
echo "URL: $PROD_URL/api/image-to-prompt"
echo ""

# Test image URL - using a sample product image from Unsplash
IMAGE_URL="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800"

echo "📸 Test Image: $IMAGE_URL"
echo ""
echo "Sending request..."
echo ""

# Make the API call
curl -X POST "$PROD_URL/api/image-to-prompt" \
  -H "Content-Type: application/json" \
  -d "{
    \"imageUrl\": \"$IMAGE_URL\",
    \"userId\": \"test-user-production\",
    \"organizationId\": \"test-org-production\"
  }" \
  -w "\n\n⏱️  Response Time: %{time_total}s\n" \
  -s | jq '.'

echo ""
echo "✅ Test completed!"
echo ""
echo "Expected response:"
echo "  - success: true"
echo "  - prompt: (250-500 word detailed description)"
echo "  - variables: (object with 10+ fields)"
echo ""

