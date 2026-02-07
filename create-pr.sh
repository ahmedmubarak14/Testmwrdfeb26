#!/bin/bash

# Script to create Pull Request
# Run this to create the PR to main branch

echo "Creating Pull Request..."
echo ""

gh pr create \
  --base main \
  --head claude/fix-blank-display-01YBTfq8uDGh6JbSBsF9VGGV \
  --title "Fix: Resolve blank display and authentication issues with comprehensive Supabase integration" \
  --body-file PR_BODY.md

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Pull Request created successfully!"
  echo ""
  echo "Next steps:"
  echo "1. Review the PR in GitHub"
  echo "2. Apply RLS fix in Supabase (see fix-rls-recursion.sql)"
  echo "3. Create demo users (see NEXT_STEPS_CREATE_USERS.md)"
  echo "4. Run tests (see COMPREHENSIVE_TEST_PLAN.md)"
  echo "5. Merge when ready"
else
  echo ""
  echo "❌ Failed to create PR"
  echo ""
  echo "You can create it manually on GitHub:"
  echo "1. Go to: https://github.com/ahmedmubarak14/MARKETPLACE---MWRD/compare/main...claude/fix-blank-display-01YBTfq8uDGh6JbSBsF9VGGV"
  echo "2. Click 'Create pull request'"
  echo "3. Copy content from PR_BODY.md as the description"
fi
