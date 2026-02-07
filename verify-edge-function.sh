#!/bin/bash
# Verify auth-rate-limit edge function deployment

set -e

PROJECT_REF="tuneojmajsqgvdkjcuen"
FUNCTION_NAME="auth-rate-limit"

echo "🔍 Verifying auth-rate-limit edge function deployment..."
echo ""

# Check if SUPABASE_ANON_KEY is set
if [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "⚠️  SUPABASE_ANON_KEY environment variable not set"
  echo "   Please set it first:"
  echo "   export SUPABASE_ANON_KEY='your_anon_key_here'"
  echo ""
  exit 1
fi

FUNCTION_URL="https://${PROJECT_REF}.supabase.co/functions/v1/${FUNCTION_NAME}"

echo "📍 Function URL: $FUNCTION_URL"
echo ""

# Test check_login_attempt action
echo "✅ Testing check_login_attempt..."
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" --location --request POST "$FUNCTION_URL" \
  --header "Authorization: Bearer $SUPABASE_ANON_KEY" \
  --header "Content-Type: application/json" \
  --data '{"action":"check_login_attempt","email":"test@example.com"}')

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ Status: 200 OK"
  echo "   Response: $BODY"
  
  if echo "$BODY" | grep -q '"allowed":true'; then
    echo "   ✅ Function is working correctly"
  else
    echo "   ⚠️  Unexpected response format"
  fi
else
  echo "   ❌ Status: $HTTP_CODE"
  echo "   Response: $BODY"
  echo ""
  echo "   Possible issues:"
  echo "   - Function not deployed (404)"
  echo "   - Function error (500)"
  echo "   - Wrong project ref or anon key"
  exit 1
fi

echo ""
echo "🎉 Edge function is deployed and working!"
echo ""
echo "Next steps:"
echo "1. Ensure phase11 migration is applied (creates login_attempts table)"
echo "2. Test login flow in the app"
echo "3. Check for warnings in browser console"
echo "4. Monitor login_attempts table for activity"
