# dotenv-sentinel

[![npm version](https://img.shields.io/npm/v/dotenv-sentinel.svg)](https://www.npmjs.com/package/dotenv-sentinel) [![CI](https://github.com/MrLouisWright/dotenv-sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/MrLouisWright/dotenv-sentinel/actions/workflows/ci.yml) [![Node](https://img.shields.io/node/v/dotenv-sentinel.svg)](https://nodejs.org) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) [![provenance](https://img.shields.io/badge/npm-provenance-blue)](https://docs.npmjs.com/generating-provenance-statements)

> Validate `.env` files against `.env.example` or a schema, catch weak and default secrets, and keep `.env` files out of git, including its history.

`dotenv-sentinel` finds every `.env`, `.env.*` and `*.env` file in a project and checks three things: **completeness** (variables missing compared with `.env.example` or a JSON schema, empty required values, wrong types), **secret hygiene** (`changeme`, `<your-key>`, short secrets, debug mode in production files, real credentials left in example files) and **git exposure** (env files that are tracked, not covered by `.gitignore`, or present anywhere in history). **Values are never printed**: every secret is masked. CLI, library and GitHub Action. Node.js 18+, one runtime dependency, [bundle-secret-guard](https://www.npmjs.com/package/bundle-secret-guard), whose shared provider patterns detect real credentials (uses the `git` CLI when available).

## What it checks

- **Against `.env.example`** (or `.env.sample`, `.env.template`, `.env.dist`, `<file>.example`, or `--example`): missing variables, undocumented extras.
- **Against a schema** (`--schema env.schema.json`): required, empty, type (`string`, `number`, `integer`, `boolean`, `url`, `email`, `port`, `json`, `enum`), `pattern`, `enum`, `minLength`, `secret`.
- **Secrets**: variables named like secrets (`*_SECRET`, `*_TOKEN`, `*_PASSWORD`, `API_KEY`, `APP_KEY`…) holding well-known defaults or placeholders, or shorter than `--min-secret-length` (16). Example files holding real-looking credentials (AWS, GitHub, Stripe, Slack, private keys, passwords in URLs, high-entropy values).
- **Production files** (`*prod*`): `DEBUG=true`, `NODE_ENV=development`, `http://` URLs to remote services.
- **Syntax**: invalid lines, unterminated quotes, duplicate keys, unquoted values with spaces, `${VAR}` references to undefined variables.
- **Git**: tracked env files with values (`committed-env`), env files not matched by `.gitignore`, and env files added in any commit of any branch (`env-in-history`; rotate those secrets).

## Rules

| Rule | Default | Meaning |
|---|---|---|
| `committed-env` | critical | .env file with real values is tracked by git |
| `example-contains-secret` | critical | Example/template file contains a real-looking secret |
| `known-secret` | high | Value matches a known credential format (AWS, GitHub, Stripe…) — check it is not reused elsewhere |
| `env-in-history` | high | .env file was committed in git history (rotate its secrets) |
| `env-not-ignored` | high | .env file is not covered by .gitignore |
| `weak-secret` | high | Secret variable has a weak, default or placeholder value |
| `missing-var` | high | Variable from the example/schema is missing |
| `empty-required` | medium | Required variable is empty |
| `type-mismatch` | medium | Value does not match the schema type, pattern or enum |
| `short-secret` | medium | Secret is shorter than the minimum length (default 16) |
| `debug-in-production` | medium | Debug mode or development settings in a production env file |
| `duplicate-key` | medium | Variable is defined more than once (last one wins) |
| `invalid-line` | medium | Line is not KEY=value, a comment or blank |
| `insecure-url` | low | http:// URL for a remote service in a production env file |
| `unquoted-space` | low | Unquoted value contains spaces or a # that will be cut off |
| `undefined-reference` | low | ${VAR} refers to a variable that is not defined |
| `extra-var` | low | Variable is not in the example/schema |
| `missing-example` | info | No .env.example to document the expected variables |

## Install and run

```bash
npx dotenv-sentinel                       # current directory, including git checks
npx dotenv-sentinel apps/api --schema apps/api/env.schema.json
npx dotenv-sentinel .env.production --example .env.example --fail-on medium
```

Schema example:

```json
{ "variables": {
  "NODE_ENV": { "type": "enum", "enum": ["production", "staging"] },
  "PORT": { "type": "port" },
  "DATABASE_URL": { "type": "url", "pattern": "^postgres(ql)?://" },
  "JWT_SECRET": { "minLength": 32, "secret": true },
  "SENTRY_DSN": { "type": "url", "required": false }
} }
```

## Library

```js
import { check, lintEnv, parseEnv } from 'dotenv-sentinel';
const report = check(['.'], { schema: 'env.schema.json' });
```

## Configuration

Put a `.dotenv-sentinel.json` in the working directory (or pass `--config <file>`). Every key is optional; CLI flags override the file.

```json
{
  "failOn": "high",
  "severity": { "extra-var": "high" },
  "allow": [
    { "rule": "extra-var", "match": "*FEATURE_FLAG*", "reason": "Accepted risk, ticket SEC-123", "expires": "2027-03-31" }
  ]
}
```

- **`severity`** changes the severity of any rule, or turns it `off`.
- **`allow`** suppresses findings. Each entry needs a `rule` (globs such as `extra-*` work) and a `reason`, and can be narrowed with `target` and `match` (a glob tested against the target, location and value). Suppressed findings are listed in the JSON report. When `expires` (YYYY-MM-DD) has passed, the finding comes back together with an `allow-expired` finding, so exceptions can't be forgotten. Entries that match nothing are reported as `allow-unused` (info).

## Output and exit codes

- `--format text|json|sarif|markdown` for stdout, plus `--json`, `--sarif` and `--markdown <file>` to write extra copies in one run. SARIF 2.1.0 works with GitHub code scanning.
- `--fail-on critical|high|medium|low|info|none` (default `high`).
- Exit code **0**: passed. **1**: at least one finding at or above `--fail-on`. **2**: usage or config error, or a target could not be checked.
- `--list-rules` prints every rule with its default severity.

## GitHub Action

```yaml
permissions:
  contents: read
  security-events: write   # only for the SARIF upload
steps:
  - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
    with: { persist-credentials: false }
  - uses: MrLouisWright/dotenv-sentinel@v1
    with:
      targets: '.'
      fail-on: high
      sarif: dotenv-sentinel.sarif
  - uses: github/codeql-action/upload-sarif@v3
    if: always()
    with: { sarif_file: dotenv-sentinel.sarif }
```

Inputs: `targets`, `fail-on`, `config`, `sarif`, `json`, `job-summary` (Markdown report in the job summary, default `true`), `args` (extra CLI flags), `example`, `schema`. Outputs: `markdown-file`, `exit-code`.

## Requirements

Node.js 18 or newer. No runtime dependencies.

## Support

If this project is useful to you, you can support its development with a donation: [Buy me a coffee](https://donate.stripe.com/aFa00lek3cvX4Ds2Fk9EI0b). It helps keep these tools maintained, documented and free for everyone.

## Credit (optional)

Free to use under MIT, no attribution required. If dotenv-sentinel helps you, a link back is appreciated:

```html
<a href="https://louiswright.co.uk">Built with dotenv-sentinel by Louis Wright</a>
```

```markdown
[![Built with dotenv-sentinel by Louis Wright](https://img.shields.io/badge/built%20with-dotenv--sentinel-blue)](https://louiswright.co.uk)
```

## Formatting, environments and run-time validation

**Formatting** (like dotenv-linter): spaces around `=`, `KEY: value`, lower-case or invalid keys, leading or trailing whitespace, unnecessary quotes, keys out of order within a block, repeated blank lines and a missing final newline. Use `--no-format` or `--no-order` to skip them.

**Per-environment files** load in this order: `.env` < `.env.local` < `.env.<mode>` < `.env.<mode>.local`. `.env.local` is skipped in `test`, and real environment variables win. Override files only need the keys they change. dotenv-sentinel checks the *effective* env for each mode it finds, or for `--mode production`, against `.env.example` and the schema.

```js
import { loadEnv, cleanEnv, str, port, bool, url } from 'dotenv-sentinel';

const { values } = loadEnv('.', process.env.NODE_ENV, { processEnv: process.env });
export const env = cleanEnv({ ...values, ...process.env }, {
  NODE_ENV: str({ choices: ['production', 'development', 'test'] }),
  PORT: port({ default: 3000 }),
  DEBUG: bool({ devDefault: true, default: false }),
  API_URL: url(),
});
// env.PORT is a number. A missing or invalid variable throws EnvError listing every problem.
```

Prefer zod? `fromZod(z.object({ PORT: z.coerce.number() }), process.env)` gives the same `EnvError` reporting.

Real credentials are detected with the shared provider patterns from [bundle-secret-guard](https://www.npmjs.com/package/bundle-secret-guard) (`bundle-secret-guard/patterns`), so every package in the set recognises the same formats.

## Module formats and types

Ships ESM (`import`) and a bundled CommonJS build (`require`), with TypeScript declarations generated from the source:

```js
import * as lib from 'dotenv-sentinel';      // ESM
const lib = require('dotenv-sentinel');      // CommonJS
```

Tests live in [`test/`](test) and run on Node 18, 20 and 22 in [GitHub Actions](https://github.com/MrLouisWright/dotenv-sentinel/actions/workflows/ci.yml), including a require+import check. Releases are published with `npm publish --provenance`.

## License

MIT © Louis Wright ([Louis Wright](https://github.com/MrLouisWright))
