#!/bin/bash

# Social API Test - Facebook & Instagram Posts
# This script tests the new simplified Posts edge endpoint

# Configuration
API_URL="http://localhost:3000/api/social"
BRAND_ID="your_brand_id_here"
FROM_DATE="2025-11-01"
TO_DATE="2025-11-18"

# Test 1: Fetch Facebook posts only
echo "=== Test 1: Facebook Posts Only ==="
curl -X GET "${API_URL}?brandId=${BRAND_ID}&from=${FROM_DATE}&to=${TO_DATE}" \
  -H "Content-Type: application/json" \
  -v

echo -e "\n\n"

# Test 2: Fetch Instagram posts only
echo "=== Test 2: Instagram Posts Only ==="
curl -X GET "${API_URL}?brandId=${BRAND_ID}&from=${FROM_DATE}&to=${TO_DATE}" \
  -H "Content-Type: application/json" \
  -v

echo -e "\n\n"

# Test 3: Fetch both Facebook and Instagram posts
echo "=== Test 3: Both Facebook & Instagram Posts ==="
curl -X GET "${API_URL}?brandId=${BRAND_ID}&from=${FROM_DATE}&to=${TO_DATE}" \
  -H "Content-Type: application/json" \
  -v

echo -e "\n\n"

# Test 4: With specific page IDs
echo "=== Test 4: With Specific Page IDs ==="
curl -X GET "${API_URL}?brandId=${BRAND_ID}&fbPageId=635618689629361&from=${FROM_DATE}&to=${TO_DATE}" \
  -H "Content-Type: application/json" \
  -v

echo -e "\n\n"

# Test 5: Check response structure
echo "=== Test 5: Pretty Print Response ==="
curl -s -X GET "${API_URL}?brandId=${BRAND_ID}&from=${FROM_DATE}&to=${TO_DATE}" \
  -H "Content-Type: application/json" | jq '.'

