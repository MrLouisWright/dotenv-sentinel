#!/usr/bin/env node
import { runCli, UsageError } from '../src/cli-core.js';
import { check, TOOL } from '../src/index.js';

const HELP = `dotenv-sentinel {VERSION} — validate .env files and keep secrets out of git

Usage: dotenv-sentinel [dir|file...] [options]

Directories (default: .) are searched for .env, .env.*, *.env files (node_modules, .git, dist… skipped).
Each env file is compared with the .env.example (or .sample/.template/.dist) next to it.
In a git repository, tracked, unignored and historical .env files are reported.
Values are never printed: secrets are masked in every output.

      --example <file>       Compare every env file with this example
      --schema <file>        JSON schema: { "variables": { "PORT": { "type": "port" }, ... } }
                             types: string number integer boolean url email port json enum
                             keys: required (default true), pattern, enum, minLength, secret
      --min-secret-length <n>  Minimum length for secret variables (default 16)
      --no-git               Do not ask git about tracked/ignored files
      --no-history           Do not search git history for committed .env files
{COMMON}`;

process.exitCode = await runCli(TOOL, {
  help: HELP,
  options: { example: { type: 'string' }, schema: { type: 'string' }, 'min-secret-length': { type: 'string' }, 'no-git': { type: 'boolean' }, 'no-history': { type: 'boolean' } },
  run(o, pos, cfg) {
    const paths = pos.length ? pos : cfg.paths || ['.'];
    const m = o['min-secret-length'] ?? cfg.minSecretLength; if (m !== undefined && !(Number(m) >= 0)) throw new UsageError('--min-secret-length must be a number');
    return check(paths, { example: o.example || cfg.example, schema: o.schema || cfg.schema, minSecretLength: m === undefined ? undefined : Number(m), git: !(o['no-git'] ?? cfg.noGit), history: !(o['no-history'] ?? cfg.noHistory), allow: cfg.allow, severity: cfg.severity });
  },
});
