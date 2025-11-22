#!/bin/bash

# Script to apply GitHub rulesets using GitHub CLI
# Prerequisites: GitHub CLI (gh) must be installed and authenticated
# Usage: ./apply-rulesets.sh [owner] [repo]

set -e

OWNER="${1:-eliranbenishai}"
REPO="${2:-slimgym}"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULESETS_DIR="${SCRIPT_DIR}"

echo "Applying GitHub rulesets to ${OWNER}/${REPO}..."
echo "Rulesets directory: ${RULESETS_DIR}"
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

# Verify JSON files exist
for file in main-branch-protection.json pull-request-rules.json tag-protection.json; do
    if [ ! -f "${RULESETS_DIR}/${file}" ]; then
        echo "Error: Ruleset file not found: ${RULESETS_DIR}/${file}"
        exit 1
    fi
done

# Function to apply a ruleset
apply_ruleset() {
    local ruleset_name="$1"
    local json_file="$2"
    
    echo "Applying ${ruleset_name} ruleset..."
    echo "  Using file: ${json_file}"
    
    # Validate JSON first
    if ! python3 -m json.tool "${json_file}" > /dev/null 2>&1; then
        echo "  ✗ Error: Invalid JSON in ${json_file}"
        return 1
    fi
    
    # Check if ruleset already exists
    local existing_id=$(gh api "repos/${OWNER}/${REPO}/rulesets" --jq ".[] | select(.name == \"${ruleset_name}\") | .id" 2>/dev/null | head -1)
    if [ -n "${existing_id}" ]; then
        echo "  ⚠ Ruleset '${ruleset_name}' already exists (ID: ${existing_id})"
        echo "  Skipping creation. To update, delete it first or use the GitHub web interface."
        return 0
    fi
    
    # Apply the ruleset
    local output
    output=$(gh api "repos/${OWNER}/${REPO}/rulesets" \
        --method POST \
        --input "${json_file}" \
        2>&1)
    local exit_code=$?
    
    if [ ${exit_code} -eq 0 ]; then
        local ruleset_id=$(echo "${output}" | python3 -c "import sys, json; print(json.load(sys.stdin).get('id', 'unknown'))" 2>/dev/null || echo "unknown")
        echo "  ✓ Successfully applied ${ruleset_name} (ID: ${ruleset_id})"
        return 0
    else
        echo "  ✗ Failed to apply ${ruleset_name}"
        echo "  Error details:"
        echo "${output}" | sed 's/^/    /'
        return ${exit_code}
    fi
}

# Apply Main Branch Protection
apply_ruleset "Main Branch Protection" "${RULESETS_DIR}/main-branch-protection.json"
echo ""

# Apply Pull Request Rules
apply_ruleset "Pull Request Rules" "${RULESETS_DIR}/pull-request-rules.json"
echo ""

# Apply Tag Protection
apply_ruleset "Tag Protection" "${RULESETS_DIR}/tag-protection.json"
echo ""

echo "Done! Check your repository settings to verify the rulesets were applied."
echo "Repository: https://github.com/${OWNER}/${REPO}/settings/rules"


