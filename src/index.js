import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, basename, relative, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { buildReport, exceeds, exitCode, formatText, formatJson, formatSarif, formatMarkdown, SEVERITIES, ConfigError, validateConfig } from './core.js';
import { RULES } from './rules.js';
import { parseEnv } from './dotenv.js';
import { findSecret, SECRET_NAME, mask } from './secrets.js';

export { parseEnv, RULES, exceeds, exitCode, formatText, formatJson, formatSarif, formatMarkdown, SEVERITIES, ConfigError };
export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export const TOOL = { name: 'dotenv-sentinel', version: VERSION, rules: RULES, title: 'dotenv-sentinel', emoji: '🔑', defaultFailOn: 'high' };

export const isEnvFile = (n) => /^\.env(\.[\w.-]+)?$/.test(n) || /^[\w.-]+\.env$/.test(n) || /^env\.(example|sample|template)$/i.test(n);
export const isExample = (n) => /(^|[.\-_])(example|sample|template|dist|defaults?|tpl|schema)([.\-_]|$)/i.test(n);
const isProd = (n) => /prod/i.test(n);
const WEAK = new Set(['changeme', 'change_me', 'change-me', 'password', 'passw0rd', 'p@ssw0rd', 'secret', 'secretkey', 'secret_key', 'mysecret', 'supersecret', 'topsecret', 's3cr3t', 'admin', 'administrator', 'root', 'toor', 'test', 'testing', 'test123', 'demo', 'example', 'default', 'dev', 'development', 'local', 'letmein', 'welcome', 'qwerty', '123456', '12345678', '123456789', 'abc123', 'password1', 'password123', 'keyboard cat', 'your-secret-key', 'your_secret_key', 'yoursecretkey', 'your-api-key', 'your_api_key', 'replace-me', 'replaceme', 'todo', 'fixme', 'xxx', 'notsecret', 'insecure', 'postgres', 'mysql', 'guest', 'user', 'pass', 'key', 'token', 'jwt_secret', 'jwtsecret', 'django-insecure', 'thisisasecret', 'shhhhh', 'foobar', 'foo', 'bar']);
const looksPlaceholder = (v) => /^(<.*>|\[.*\]|\{\{.*\}\}|\$\{.*\}|x{3,}|\*{3,}|\.\.\.|your[_-].*|.*[_-]here|replace[_-]?me|todo|tbd|none|null|undefined)$/i.test(v);
export function weakness(v) {
  const s = String(v).trim(); const l = s.toLowerCase();
  if (!s) return null;
  if (WEAK.has(l) || l.startsWith('django-insecure-') || /^(.)\1+$/.test(s) || /^(0123456789|abcdef|abcdefgh)/i.test(s)) return 'a well-known default';
  if (looksPlaceholder(s)) return 'a placeholder';
  return null;
}
const entropy = (s) => { const c = {}; for (const ch of s) c[ch] = (c[ch] || 0) + 1; return -Object.values(c).reduce((e, n) => e + (n / s.length) * Math.log2(n / s.length), 0); };
const isSecretKey = (k) => SECRET_NAME.test(k) && !/_FILE$|_PATH$|_URL$|_HOST$|_USER(NAME)?$|_NAME$|_ID$|_ENABLED$|_LENGTH$|_TTL$|_EXPIR/i.test(k);

function git(cwd, args) { try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return e.status === 1 ? '' : null; } }
const gitRoot = (dir) => { const r = git(dir, ['rev-parse', '--show-toplevel']); return r ? r.trim() : null; };

const TYPES = {
  string: () => true, number: (v) => v !== '' && Number.isFinite(Number(v)), integer: (v) => /^-?\d+$/.test(v), boolean: (v) => /^(true|false|1|0|yes|no|on|off)$/i.test(v),
  url: (v) => { try { new URL(v); return true; } catch { return false; } }, email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), port: (v) => /^\d+$/.test(v) && +v > 0 && +v < 65536,
  json: (v) => { try { JSON.parse(v); return true; } catch { return false; } }, enum: () => true,
};
export function loadSchema(src) {
  let j = src;
  if (typeof src === 'string') { try { j = JSON.parse(readFileSync(src, 'utf8')); } catch (e) { throw new ConfigError(`Cannot read schema ${src}: ${e.code || e.message}`); } }
  const vars = j.variables || j.properties || j;
  for (const [k, s] of Object.entries(vars)) { if (typeof s !== 'object' || s === null) throw new ConfigError(`schema: ${k} must be an object`); if (s.type && !TYPES[s.type]) throw new ConfigError(`schema: ${k} has unknown type ${s.type}`); }
  return { vars, required: new Set(j.required || Object.entries(vars).filter(([, s]) => s.required !== false).map(([k]) => k)) };
}

/** Lint one env file's text. ctx: { file, example?: map|null, schema?, minSecretLength?, tracked?, ignored? } */
export function lintEnv(text, ctx = {}) {
  const file = ctx.file || '.env'; const name = basename(file); const ex = isExample(name);
  const p = parseEnv(text); const raw = [];
  const add = (rule, line, message, extra = {}) => raw.push({ rule, file, line, location: line ? `${file}:${line}` : file, message, ...extra });
  for (const b of p.bad) add('invalid-line', b.line, b.reason ? `Unterminated quote: ${b.text.slice(0, 40)}` : `Not KEY=value: ${b.text.slice(0, 60).replace(/=.*/, '=…')}`);
  const seen = new Map();
  for (const e of p.entries) {
    if (seen.has(e.key)) add('duplicate-key', e.line, `${e.key} is also defined on line ${seen.get(e.key)}; the last one wins`, { evidence: e.key }); seen.set(e.key, e.line);
    if (e.unquotedSpace) add('unquoted-space', e.line, `${e.key} has an unquoted value with spaces; some loaders cut it off`, { evidence: e.key, fix: 'Wrap the value in double quotes.' });
    if (e.quote !== "'") for (const m of e.value.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)(?::?-[^}]*)?\}?/g)) if (!(m[1] in p.map) && !ctx.example?.[m[1]] && !/:?-/.test(m[0])) add('undefined-reference', e.line, `${e.key} refers to \${${m[1]}}, which is not defined here`, { evidence: m[1] });
  }
  const tracked = !!ctx.tracked;
  for (const e of p.entries) {
    const v = e.value; if (!v) continue;
    let known = findSecret(v);
    if (known?.name === 'password in URL') { const pw = /:\/\/[^:/@\s]+:([^@\s]+)@/.exec(v)?.[1] || ''; if (weakness(pw) || /^\$\{?\w+\}?$/.test(pw)) known = ex ? null : known; }
    const isRef = /^\$\{?[A-Za-z_]\w*\}?$/.test(v);
    if (ex) {
      if (known) add('example-contains-secret', e.line, `${e.key} looks like a real ${known.name} (${mask(known.value)}) in an example file`, { evidence: e.key, fix: 'Rotate it and replace it with a placeholder.' });
      else if (isSecretKey(e.key) && !weakness(v) && v.length >= 20 && entropy(v) > 3.5 && !/\s/.test(v)) add('example-contains-secret', e.line, `${e.key} has a random-looking value (${mask(v)}) in an example file`, { evidence: e.key, fix: 'Use a placeholder such as <generate-with-openssl-rand-hex-32>.' });
      continue;
    }
    if (known && (tracked || ctx.ignored === false)) add('known-secret', e.line, `${e.key} contains a ${known.name} (${mask(known.value)}) in a file git can see`, { evidence: e.key });
    if (isSecretKey(e.key)) {
      const w = isRef ? null : weakness(v);
      if (w) add('weak-secret', e.line, `${e.key} is ${w} (${mask(v)})`, { evidence: e.key, fix: 'Generate a strong value, e.g. openssl rand -base64 32.' });
      else if (!known && !isRef && v.length < (ctx.minSecretLength ?? 16) && !/^(true|false|\d+)$/i.test(v)) add('short-secret', e.line, `${e.key} is only ${v.length} characters`, { evidence: e.key });
    }
    if (isProd(name)) {
      if (/^(APP_|FLASK_|DJANGO_|RAILS_|NEXT_PUBLIC_)?DEBUG$/i.test(e.key) && /^(true|1|yes|on|\*)$/i.test(v) || /^(NODE_ENV|APP_ENV|FLASK_ENV|RAILS_ENV|ENVIRONMENT|ENV)$/i.test(e.key) && /^(dev|development|local|test)$/i.test(v))
        add('debug-in-production', e.line, `${e.key}=${v} in a production file`, { evidence: e.key });
      if (/^http:\/\//i.test(v) && !/^http:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\]|[\w-]+(:\d+)?(\/|$))/i.test(v)) add('insecure-url', e.line, `${e.key} uses http:// (${v.replace(/\/\/[^@/]*@/, '//…@').slice(0, 60)})`, { evidence: e.key });
    }
  }
  if (!ex && ctx.example) {
    for (const k of Object.keys(ctx.example)) if (!(k in p.map)) add('missing-var', undefined, `${k} is in ${ctx.exampleName || 'the example'} but not here`, { evidence: k });
    for (const e of p.entries) if (!(e.key in ctx.example) && !(ctx.schema && e.key in ctx.schema.vars)) add('extra-var', e.line, `${e.key} is not documented in ${ctx.exampleName || 'the example'}`, { evidence: e.key });
  }
  if (!ex && ctx.schema) {
    for (const [k, s] of Object.entries(ctx.schema.vars)) {
      if (!(k in p.map)) { if (ctx.schema.required.has(k) && !(ctx.example && k in ctx.example)) add('missing-var', undefined, `${k} is required by the schema`, { evidence: k }); continue; }
      const v = p.map[k]; const line = p.entries.find((e) => e.key === k)?.line;
      if (v === '') { if (ctx.schema.required.has(k)) add('empty-required', line, `${k} is required but empty`, { evidence: k }); continue; }
      const show = s.secret || isSecretKey(k) ? mask(v) : JSON.stringify(v.slice(0, 40));
      if (s.type && !TYPES[s.type](v)) add('type-mismatch', line, `${k}=${show} is not a valid ${s.type}`, { evidence: k });
      else if (s.enum && !s.enum.map(String).includes(v)) add('type-mismatch', line, `${k}=${show} is not one of ${s.enum.join(', ')}`, { evidence: k });
      else if (s.pattern && !new RegExp(s.pattern).test(v)) add('type-mismatch', line, `${k}=${show} does not match /${s.pattern}/`, { evidence: k });
      else if (s.minLength && v.length < s.minLength) add('type-mismatch', line, `${k} is shorter than ${s.minLength} characters`, { evidence: k });
      if (s.secret && weakness(v) && !isSecretKey(k)) add('weak-secret', line, `${k} is ${weakness(v)} (${mask(v)})`, { evidence: k });
    }
  }
  return { raw, parsed: p };
}

const SKIP = new Set(['node_modules', '.git', 'vendor', 'dist', 'build', '.venv', 'venv', '__pycache__', '.next', 'coverage']);
function walk(dir, out = []) { for (const e of readdirSync(dir, { withFileTypes: true })) { if (SKIP.has(e.name)) continue; const f = join(dir, e.name); if (e.isDirectory()) walk(f, out); else if (isEnvFile(e.name)) out.push(f); } return out; }

/** Check directories or env files. Options: example (path), schema (path or object), minSecretLength, git (default true), history (default true), allow, severity. */
export function check(inputs, opts = {}) {
  validateConfig({ allow: opts.allow, severity: opts.severity });
  const schema = opts.schema ? loadSchema(opts.schema) : null;
  const results = []; const repos = new Set();
  for (const inp of inputs) {
    let files;
    try { files = statSync(inp).isDirectory() ? walk(inp) : [inp]; } catch (e) { results.push({ target: inp, fatal: true, raw: [], errors: [`Cannot read ${inp}: ${e.code || e.message}`] }); continue; }
    if (statSync(inp).isDirectory() && opts.git !== false && opts.history !== false) { const root = gitRoot(inp); if (root) repos.add(root); }
    for (const f of files.sort()) {
      const name = relative(process.cwd(), f) || f; const dir = dirname(f); const base = basename(f);
      let example = null; let exampleName;
      if (!isExample(base)) {
        const exPath = opts.example || ['.env.example', '.env.sample', '.env.template', '.env.dist', 'env.example', `${base}.example`].map((x) => join(dir, x)).find((x) => existsSync(x));
        if (exPath) { example = parseEnv(readFileSync(exPath, 'utf8')).map; exampleName = basename(exPath); }
      }
      let tracked, ignored;
      if (opts.git !== false) { const root = gitRoot(dir); if (root) { const rel = relative(root, resolve(f)); tracked = !!git(root, ['ls-files', '--', rel])?.trim(); ignored = spawnSync('git', ['check-ignore', '-q', '--', rel], { cwd: root, stdio: 'ignore' }).status === 0; } }
      const text = readFileSync(f, 'utf8');
      const { raw, parsed } = lintEnv(text, { file: name, example, exampleName, schema, minSecretLength: opts.minSecretLength, tracked, ignored });
      const hasValues = parsed.entries.some((e) => e.value);
      if (!isExample(base) && tracked && hasValues) raw.unshift({ rule: 'committed-env', file: name, location: name, message: `${name} is tracked by git; everyone with repo access has these values`, fix: 'git rm --cached it, add it to .gitignore, rotate the secrets, and commit an .env.example instead.' });
      else if (!isExample(base) && tracked === false && ignored === false) raw.unshift({ rule: 'env-not-ignored', file: name, location: name, message: `${name} is not in .gitignore; one "git add ." away from being committed`, fix: `Add "${base.startsWith('.env') ? '.env*\n!.env.example' : base}" to .gitignore.` });
      if (!isExample(base) && !example && !schema) raw.push({ rule: 'missing-example', file: name, location: name, message: `No .env.example next to ${name}` });
      results.push({ target: name, summary: { variables: parsed.entries.length, ...(exampleName ? { example: exampleName } : {}), ...(tracked !== undefined ? { gitTracked: tracked, gitIgnored: ignored } : {}) }, raw });
    }
    if (!files.length && !statSync(inp).isFile()) results.push({ target: inp, summary: { envFiles: 0 }, raw: [] });
  }
  for (const root of repos) {
    const log = git(root, ['log', '--all', '--diff-filter=A', '--name-only', '--format=%h %as']);
    if (!log) continue;
    const hits = new Map(); let commit = '';
    for (const l of log.split('\n')) { if (/^[0-9a-f]{7,} \d{4}-/.test(l)) { commit = l; continue; } const b = basename(l); if (l && isEnvFile(b) && !isExample(b)) hits.set(l, commit); }
    const raw = [...hits].map(([path, c]) => ({ rule: 'env-in-history', location: `${relative(process.cwd(), root) || '.'}:${path}`, file: path, message: `${path} was committed in ${c.split(' ')[0]} (${c.split(' ')[1]}); its values are still in the history`, evidence: path, fix: 'Rotate every secret it held. Rewriting history (git filter-repo) only helps if nobody has cloned it.' }));
    if (raw.length) results.push({ target: `git history (${relative(process.cwd(), root) || '.'})`, raw });
  }
  return buildReport(TOOL, results, opts);
}
