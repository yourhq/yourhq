# Script Guardrails

Use scripts here for stable, reusable local helpers.

## Safety rules
- Default to read-only behavior when practical.
- Additive updates are allowed when they preserve existing data.
- Never delete records by default.
- Never overwrite existing values with weaker, partial, or unverified data.
- Prefer append/merge behavior for notes-style fields.
- For scalar fields, fill blanks first; only replace when the new value is clearly better and non-destructive.
- Prefer previews that show target records and intended field changes before writes.
- Print clear target identifiers before any write.

## Recommended pattern
- Resolve secrets from environment variables, not hardcoded values
- Support preview/dry-run mode when useful
- For writes, default to additive merge behavior rather than replace behavior
