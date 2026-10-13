# dotenv-sentinel

> Validate `.env` files against `.env.example` or a schema, catch weak and default secrets, and keep `.env` files out of git, including its history.

`dotenv-sentinel` finds every `.env`, `.env.*` and `*.env` file in a project and checks three things: **completeness** (variables missing compared with `.env.example` or a JSON schema, empty required values, wrong types), **secret hygiene** (`changeme`, `<your-key>`, short secrets, debug mode in production files, real credentials left in example files) and **git exposure** (env files that are tracked, not covered by `.gitignore`, or present anywhere in history). **Values are never printed**: every secret is masked. CLI, library and GitHub Action. Node.js 18+, **zero runtime dependencies** (uses the `git` CLI when available).

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

## License

MIT © Louis Wright
