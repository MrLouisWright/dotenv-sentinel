// Per-environment files and their override order (the Vite / Next.js / dotenv-flow convention).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from './dotenv.js';

/** Files for a mode, lowest priority first: .env, .env.local, .env.<mode>, .env.<mode>.local (.env.local is skipped in "test"). */
export function envFileOrder(mode) {
  const files = ['.env'];
  if (mode !== 'test') files.push('.env.local');
  if (mode) files.push(`.env.${mode}`, `.env.${mode}.local`);
  return files;
}

/**
 * Load the layered env for a mode. Later files override earlier ones; real environment
 * variables (opts.processEnv) win over every file unless opts.override is true.
 * Returns { values, sources: { KEY: file }, files: [existing files], overrides: [{ key, file, over }] }.
 */
export function loadEnv(dir = '.', mode, opts = {}) {
  const values = {}; const sources = {}; const files = []; const overrides = [];
  for (const f of envFileOrder(mode)) {
    const p = join(dir, f); if (!existsSync(p)) continue; files.push(f);
    for (const e of parseEnv(readFileSync(p, 'utf8')).entries) { if (e.key in values && values[e.key] !== e.value) overrides.push({ key: e.key, file: f, over: sources[e.key] }); values[e.key] = e.value; sources[e.key] = f; }
  }
  const pe = opts.processEnv; if (pe && !opts.override) for (const k of Object.keys(values)) if (pe[k] !== undefined) { values[k] = pe[k]; sources[k] = 'process.env'; }
  return { values, sources, files, overrides };
}
