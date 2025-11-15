#!/bin/bash

# Test mates-take/overview with organizationId
# This will help us trace the Metronome ingest flow

echo "Testing mates-take/overview API with organizationId..."
echo ""

curl -X POST https://social-apis-two.vercel.app/api/mates-take/overview \
  -H "Content-Type: application/json" \
  -d '{
    "content": "This is a test content for the marketing expert analysis. We need to analyze this content thoroughly to ensure it meets all quality standards and provides valuable insights for our marketing strategy.",
    "organizationId": "kq8D0URspd5I7uBck8l9"
  }'

echo ""
echo ""
echo "Request completed. Check the server logs for [API-LOG] mates-take/overview entries."

