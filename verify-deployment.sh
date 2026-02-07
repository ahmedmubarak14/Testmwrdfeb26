#!/bin/bash

# Pre-Deployment Verification Script
# Checks code quality, configuration, and readiness for deployment

set -e

echo "╔════════════════════════════════════════════╗"
echo "║  Pre-Deployment Verification Script       ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
WARNINGS=0

# Function to check and report
check_pass() {
    echo -e "${GREEN}✅ PASS:${NC} $1"
    ((PASSED++))
}

check_fail() {
    echo -e "${RED}❌ FAIL:${NC} $1"
    ((FAILED++))
}

check_warn() {
    echo -e "${YELLOW}⚠️  WARN:${NC} $1"
    ((WARNINGS++))
}

echo "🔍 Running verification checks..."
echo ""

# Check 1: Environment file exists
echo "📋 Checking environment configuration..."
if [ -f ".env.local" ]; then
    check_pass ".env.local exists"

    # Check if it contains Supabase URL
    if grep -q "VITE_SUPABASE_URL=https://" .env.local; then
        check_pass "Supabase URL configured"
    else
        check_fail "Supabase URL not configured in .env.local"
    fi

    # Check if it contains Supabase anon key
    if grep -q "VITE_SUPABASE_ANON_KEY=" .env.local && ! grep -q "VITE_SUPABASE_ANON_KEY=$" .env.local; then
        check_pass "Supabase anon key configured"
    else
        check_fail "Supabase anon key not configured in .env.local"
    fi
else
    check_fail ".env.local does not exist"
fi
echo ""

# Check 2: Critical files exist
echo "📁 Checking critical files..."
CRITICAL_FILES=(
    "src/config/appConfig.ts"
    "src/services/authService.ts"
    "src/lib/supabase.ts"
    "src/store/useStore.ts"
    "supabase-schema.sql"
    "fix-rls-recursion.sql"
)

for file in "${CRITICAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        check_pass "$file exists"
    else
        check_fail "$file is missing"
    fi
done
echo ""

# Check 3: Node modules installed
echo "📦 Checking dependencies..."
if [ -d "node_modules" ]; then
    check_pass "node_modules directory exists"
else
    check_warn "node_modules not found - run 'npm install'"
fi

if [ -f "package.json" ]; then
    check_pass "package.json exists"
else
    check_fail "package.json is missing"
fi
echo ""

# Check 4: TypeScript compilation check
echo "🔨 Checking TypeScript..."
if command -v npx &> /dev/null; then
    if npx tsc --noEmit --skipLibCheck 2>&1 | grep -q "error TS"; then
        check_fail "TypeScript compilation has errors"
        echo "   Run: npx tsc --noEmit to see details"
    else
        check_pass "TypeScript compilation successful"
    fi
else
    check_warn "npx not available, skipping TypeScript check"
fi
echo ""

# Check 5: Git status
echo "📊 Checking Git status..."
if git rev-parse --git-dir > /dev/null 2>&1; then
    check_pass "Git repository initialized"

    CURRENT_BRANCH=$(git branch --show-current)
    echo "   Current branch: $CURRENT_BRANCH"

    # Check if there are uncommitted changes
    if [ -n "$(git status --porcelain)" ]; then
        check_warn "There are uncommitted changes"
        echo "   Run: git status to see details"
    else
        check_pass "No uncommitted changes"
    fi

    # Check if branch is pushed
    if git ls-remote --heads origin "$CURRENT_BRANCH" | grep -q "$CURRENT_BRANCH"; then
        check_pass "Current branch is pushed to remote"
    else
        check_warn "Current branch not pushed to remote"
    fi
else
    check_fail "Not a git repository"
fi
echo ""

# Check 6: Documentation files
echo "📚 Checking documentation..."
DOC_FILES=(
    "README.md"
    "SUPABASE_MIGRATION_GUIDE.md"
    "DEBUG_AUTH_ISSUE.md"
    "FIX_INFINITE_RECURSION.md"
    "COMPREHENSIVE_TEST_PLAN.md"
)

for file in "${DOC_FILES[@]}"; do
    if [ -f "$file" ]; then
        check_pass "$file exists"
    else
        check_warn "$file is missing"
    fi
done
echo ""

# Check 7: Code quality checks
echo "🔍 Checking code quality..."

# Check for console.log in production code (excluding config files)
if grep -r "console\.log" src/ --include="*.ts" --include="*.tsx" --exclude="appConfig.ts" --exclude="authService.ts" | grep -v "//.*console\.log" | grep -q "console\.log"; then
    check_warn "Found console.log statements in code (may want to remove for production)"
else
    check_pass "No unexpected console.log statements"
fi

# Check for TODO comments
TODO_COUNT=$(grep -r "TODO\|FIXME\|XXX" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l || echo "0")
if [ "$TODO_COUNT" -gt 0 ]; then
    check_warn "Found $TODO_COUNT TODO/FIXME comments in code"
else
    check_pass "No TODO/FIXME comments"
fi

# Check for hardcoded credentials (basic check)
if grep -r "password.*=" src/ --include="*.ts" --include="*.tsx" | grep -v "password:" | grep -v "// password" | grep -q "password.*=.*['\"]"; then
    check_fail "Possible hardcoded credentials found in code"
else
    check_pass "No obvious hardcoded credentials"
fi
echo ""

# Check 8: Build check
echo "🏗️  Checking build capability..."
if [ -f "package.json" ]; then
    if grep -q "\"build\":" package.json; then
        check_pass "Build script defined in package.json"
    else
        check_warn "Build script not found in package.json"
    fi
else
    check_fail "package.json not found"
fi
echo ""

# Summary
echo "═══════════════════════════════════════════════"
echo "📊 VERIFICATION SUMMARY"
echo "═══════════════════════════════════════════════"
echo -e "${GREEN}✅ Passed:${NC} $PASSED"
echo -e "${YELLOW}⚠️  Warnings:${NC} $WARNINGS"
echo -e "${RED}❌ Failed:${NC} $FAILED"
echo "═══════════════════════════════════════════════"
echo ""

# Final verdict
if [ $FAILED -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}🎉 All checks passed! Ready for deployment.${NC}"
        exit 0
    else
        echo -e "${YELLOW}⚠️  Some warnings found. Review before deployment.${NC}"
        exit 0
    fi
else
    echo -e "${RED}❌ Some checks failed. Fix issues before deployment.${NC}"
    exit 1
fi
