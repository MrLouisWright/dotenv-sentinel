# Changelog

## 1.0.0 - 2026-10-14

- First release: .env validator with 18 rules: comparison with .env.example, JSON schema validation, weak/default/short secrets, real secrets in example files, debug settings in production files, syntax checks, and git checks for tracked, unignored and historical .env files. Secret values are always masked.
- Text, JSON, SARIF and Markdown output; allowlist with expiry; per-rule severity; `--fail-on`; composite GitHub Action.
