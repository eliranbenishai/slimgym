# GitHub Rulesets Configuration

This directory contains recommended GitHub rulesets for the slimgym project. These rulesets help maintain code quality, security, and collaboration standards.

## Rulesets Overview

**Note:** These rulesets are configured to require code owner approval. A `.github/CODEOWNERS` file has been created that designates you (`@eliranbenishai`) as the code owner for all files, meaning you must approve all pull requests before they can be merged.

### 1. Main Branch Protection (`main-branch-protection.json`)
Protects the `main` branch by requiring:
- At least 1 approving review before merging (requires code owner approval via CODEOWNERS)
- Code owner review requirement (you must approve all PRs)
- All review threads to be resolved
- Required status checks (build, test, lint) to pass
- Linear history (no merge commits)
- Conversation resolution before merging
- Prevents force pushes and branch updates

### 2. Pull Request Rules (`pull-request-rules.json`)
Applies to all pull requests and requires:
- Review thread resolution
- At least 1 approving review (requires code owner approval via CODEOWNERS)
- Code owner review requirement (you must approve all PRs)
- Required status checks to pass
- Conversation resolution

### 3. Tag Protection (`tag-protection.json`)
Protects version tags (matching `v*` pattern) by:
- Restricting tag creation
- Restricting tag updates
- Restricting tag deletions

This ensures release tags cannot be accidentally modified or deleted.

## Applying Rulesets

### Quick Start (Recommended)

Use the provided script to apply all rulesets at once:

```bash
cd .github/rulesets
./apply-rulesets.sh [owner] [repo]
```

Example:
```bash
./apply-rulesets.sh eliranbenishai slimgym
```

The script will:
- Check if GitHub CLI is installed and authenticated
- Apply all three rulesets automatically
- Provide feedback on success/failure

### Using GitHub CLI Manually

You can also apply rulesets individually using GitHub CLI:

1. **Main Branch Protection:**
```bash
gh api repos/:owner/:repo/rulesets \
  --method POST \
  --input .github/rulesets/main-branch-protection.json
```

2. **Pull Request Rules:**
```bash
gh api repos/:owner/:repo/rulesets \
  --method POST \
  --input .github/rulesets/pull-request-rules.json
```

3. **Tag Protection:**
```bash
gh api repos/:owner/:repo/rulesets \
  --method POST \
  --input .github/rulesets/tag-protection.json
```

### Using GitHub Web Interface

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Rules** → **Rulesets**
3. Click **New ruleset**
4. Select the appropriate target (branch, pull_request, or tag)
5. Copy the contents from the corresponding JSON file
6. Configure the ruleset as needed
7. Save the ruleset

### Using GitHub API Directly

You can use the GitHub REST API to create rulesets programmatically. See the [GitHub Rulesets API documentation](https://docs.github.com/en/rest/repos/rules#create-a-repository-ruleset) for details.

## Customization

You can customize these rulesets based on your project's needs:

- **Bypass Actors**: Add specific users or teams that can bypass rules (e.g., repository administrators)
  ```json
  "bypass_actors": [
    {
      "actor_id": 123456,
      "actor_type": "OrganizationAdmin"
    }
  ]
  ```

- **Required Review Count**: Adjust the number of required approvals in `required_approving_review_count`

- **Status Checks**: Update the required status check contexts to match your CI/CD workflow names
  - The current rulesets expect status checks named: `build`, `test`, and `lint`
  - Update these in the `required_status_checks` array to match your actual workflow names
  - If you don't have CI/CD set up yet, you can remove the `required_status_checks` rule temporarily

- **Code Owner Review**: Already enabled. The `.github/CODEOWNERS` file designates `@eliranbenishai` as the code owner. To change this, edit the CODEOWNERS file and update the GitHub username.

- **Branch Names**: Modify the `ref_name.include` patterns to match your branch naming conventions

## Important Notes

- **Status Checks**: These rulesets expect CI/CD workflows that report status checks named `build`, `test`, and `lint`. If your workflows use different names, update the `required_status_checks` arrays in the JSON files before applying.

- **CI/CD Setup**: If you haven't set up CI/CD workflows yet, you may want to:
  - Remove the `required_status_checks` rules temporarily, or
  - Set up GitHub Actions workflows that report these status checks

- **Tag Pattern**: The tag protection ruleset uses the pattern `v*` to match semantic version tags (e.g., `v1.0.0`). Adjust if you use a different tagging convention.

- **Review Before Applying**: These rulesets are recommendations and should be reviewed before applying to ensure they match your project's workflow and requirements.

- **Updating Rulesets**: Rulesets can be updated or disabled at any time through the GitHub web interface (Settings → Rules → Rulesets).

- **API Compatibility**: These rulesets are designed for the GitHub Rulesets API. Some rule types may vary based on your GitHub plan (Free, Pro, Team, Enterprise).

## Repository Settings Access

**Repository settings are NOT public.** Only repository administrators and owners can access repository settings. This includes:
- Rulesets configuration
- Branch protection settings
- Collaborator management
- Webhook configuration
- Security settings
- And all other repository settings

Public repositories are public for:
- Code visibility (anyone can view code)
- Issue and pull request visibility
- Read access to the repository

But settings, administrative functions, and write access remain restricted to authorized users only.

## References

- [GitHub Rulesets Documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)
- [GitHub Rulesets API](https://docs.github.com/en/rest/repos/rules)
- [CODEOWNERS Documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)

