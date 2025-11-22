#!/bin/bash

# Script to apply GitHub rulesets using GitHub CLI
# Prerequisites: GitHub CLI (gh) must be installed and authenticated
# Usage: ./apply-rulesets.sh [owner] [repo]

set -e

OWNER="${1:-eliranbenishai}"
REPO="${2:-slimgym}"

echo "Applying GitHub rulesets to ${OWNER}/${REPO}..."
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is not installed."
    echo "Install it from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "Error: Not authenticated with GitHub CLI."
    echo "Run: gh auth login"
    exit 1
fi

# Apply Main Branch Protection
echo "Applying Main Branch Protection ruleset..."
gh api repos/${OWNER}/${REPO}/rulesets \
  --method POST \
  --input .github/rulesets/main-branch-protection.json \
  || echo "Warning: Failed to apply Main Branch Protection ruleset"

echo ""

# Apply Pull Request Rules
echo "Applying Pull Request Rules ruleset..."
gh api repos/${OWNER}/${REPO}/rulesets \
  --method POST \
  --input .github/rulesets/pull-request-rules.json \
  || echo "Warning: Failed to apply Pull Request Rules ruleset"

echo ""

# Apply Tag Protection
echo "Applying Tag Protection ruleset..."
gh api repos/${OWNER}/${REPO}/rulesets \
  --method POST \
  --input .github/rulesets/tag-protection.json \
  || echo "Warning: Failed to apply Tag Protection ruleset"

echo ""
echo "Done! Check your repository settings to verify the rulesets were applied."
echo "Repository: https://github.com/${OWNER}/${REPO}/settings/rules"


