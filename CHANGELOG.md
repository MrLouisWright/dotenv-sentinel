# Changelog

## 1.1.0 - 2026-10-17

Re-release: these changes were committed after 1.0.0 was published but never reached npm. 1.0.0 on npm is the original first release.

### Added

- dotenv-linter style formatting checks: `space-around-equals`, `incorrect-delimiter`, `lowercase-key`, `invalid-key-character`, `leading-whitespace`, `trailing-whitespace`, `unnecessary-quotes`, `unordered-key` (per block), `extra-blank-line`, `ending-blank-line` (duplicate keys were already checked). `--no-format` / `--no-order` turn them off.
- Run-time validation like envalid: `cleanEnv(process.env, { PORT: port({ default: 3000 }), DEBUG: bool({ devDefault: true }), ... })` with `str`, `num`, `int`, `bool`, `port`, `url`, `email`, `host`, `json` validators (`choices`, `default`, `devDefault`, `optional`, `pattern`, `minLength`). It returns a frozen, typed object or throws `EnvError` listing every problem. `fromZod(schema, env)` adapts zod (or anything with `safeParse`).
- Per-environment files: `loadEnv(dir, mode)` / `envFileOrder(mode)` follow the `.env` < `.env.local` < `.env.<mode>` < `.env.<mode>.local` order (`.env.local` is skipped for `test`), and real environment variables win. Override files are no longer reported for variables they inherit from `.env`. The effective env for each mode found (or `--mode <name>`) is checked against the example and schema instead.
- Provider secret patterns now come from `bundle-secret-guard/patterns`, the shared set, instead of a private copy. This adds SendGrid, Twilio, Mailgun, Anthropic, Slack webhooks, AWS secret keys and others. dotenv-sentinel keeps only its env-specific checks: key names, weak values and entropy.

### Packaging

- Dual ESM + CommonJS: `import` loads `src/`, `require` loads a bundled `dist/index.cjs`, via package.json `exports`.
- TypeScript declarations are generated from the source (`dist/types`) instead of hand-written.
- CI runs build, tests and a require+import check on Node 18/20/22; releases use `npm publish --provenance`.

## 1.0.0 - 2026-10-14

- First release: .env validator with 18 rules: comparison with .env.example, JSON schema validation, weak/default/short secrets, real secrets in example files, debug settings in production files, syntax checks, and git checks for tracked, unignored and historical .env files. Secret values are always masked.
- Text, JSON, SARIF and Markdown output; allowlist with expiry; per-rule severity; `--fail-on`; composite GitHub Action.
