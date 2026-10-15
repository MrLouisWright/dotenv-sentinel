import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintEnv, check, formatChecks, cleanEnv, fromZod, EnvError, str, num, bool, port, url, json, loadEnv, envFileOrder } from '../src/index.js';
import { findSecret, SECRET_PATTERNS } from '../src/secrets.js';

const rules = (raw) => raw.map((f) => f.rule);
const dir = (files) => { const d = mkdtempSync(join(tmpdir(), 'ds-')); for (const [k, v] of Object.entries(files)) writeFileSync(join(d, k), v); return d; };

test('secret patterns come from bundle-secret-guard/patterns', () => {
  assert.ok(SECRET_PATTERNS.some(([, , r]) => r?.id === 'github-token'));
  assert.equal(findSecret('ghp_' + 'a'.repeat(36)).id, 'github-token');
  assert.equal(findSecret('SG.' + 'a'.repeat(22) + '.' + 'b'.repeat(43)).id, 'sendgrid-api-key');
  assert.equal(findSecret('Ab1/' + 'xY9+'.repeat(9), 'AWS_SECRET_ACCESS_KEY').id, 'aws-secret-access-key');
  assert.equal(findSecret('postgres://app:hunter2hunter2@db/x').name, 'password in URL');
  assert.equal(findSecret('hello'), null);
});
test('formatting checks (dotenv-linter style)', () => {
  const r = rules(formatChecks('B=1\nA=2\n  C=3\nD = 4\ne_key=5\nF: 6\nG="plain"\nH=7 \n\n\nI=8\n', { file: '.env' }));
  for (const x of ['unordered-key', 'leading-whitespace', 'space-around-equals', 'lowercase-key', 'incorrect-delimiter', 'unnecessary-quotes', 'trailing-whitespace', 'extra-blank-line']) assert.ok(r.includes(x), x);
});
test('ordering resets after a blank line; quotes needed for spaces are fine', () => {
  const r = rules(formatChecks('B=1\n\nA=2\nC="two words"\n'));
  assert.deepEqual(r, []);
});
test('lintEnv reports formatting and missing final newline; can be disabled', () => {
  assert.ok(rules(lintEnv('A=1', { file: '.env' }).raw).includes('ending-blank-line'));
  assert.ok(!rules(lintEnv('B=1\nA=1', { file: '.env', format: false }).raw).includes('unordered-key'));
  assert.ok(!rules(lintEnv('B=1\nA=1\n', { file: '.env', order: false }).raw).includes('unordered-key'));
});
test('cleanEnv validates, coerces, defaults, and reports every problem', () => {
  const env = cleanEnv({ PORT: '8080', DEBUG: 'yes', URL: 'https://x.test', CFG: '{"a":1}', NODE_ENV: 'production' }, { PORT: port(), DEBUG: bool(), URL: url(), CFG: json(), RETRIES: num({ default: 3 }), NODE_ENV: str({ choices: ['production', 'development'] }) });
  assert.deepEqual({ ...env }, { PORT: 8080, DEBUG: true, URL: 'https://x.test', CFG: { a: 1 }, RETRIES: 3, NODE_ENV: 'production' });
  assert.ok(Object.isFrozen(env));
  assert.throws(() => cleanEnv({ PORT: '99999', NODE_ENV: 'production' }, { PORT: port(), KEY: str({ desc: 'API key' }) }), (e) => e instanceof EnvError && e.problems.length === 2 && /API key/.test(e.message));
  assert.equal(cleanEnv({ NODE_ENV: 'development' }, { DEBUG: bool({ devDefault: true }) }).DEBUG, true);
});
test('fromZod adapter uses safeParse', () => {
  const fake = { safeParse: (e) => e.PORT ? { success: true, data: { PORT: Number(e.PORT) } } : { success: false, error: { issues: [{ path: ['PORT'], message: 'Required' }] } } };
  assert.deepEqual(fromZod(fake, { PORT: '1' }), { PORT: 1 });
  assert.throws(() => fromZod(fake, {}), (e) => e instanceof EnvError && e.problems[0].key === 'PORT');
  assert.throws(() => fromZod({}, {}), TypeError);
});
test('per-environment files: order and overrides', () => {
  assert.deepEqual(envFileOrder('production'), ['.env', '.env.local', '.env.production', '.env.production.local']);
  assert.deepEqual(envFileOrder('test'), ['.env', '.env.test', '.env.test.local']);
  const d = dir({ '.env': 'A=base\nB=base\n', '.env.local': 'B=local\n', '.env.production': 'A=prod\n', '.env.production.local': 'C=prodlocal\n' });
  const r = loadEnv(d, 'production', { processEnv: { C: 'real' } });
  assert.deepEqual(r.values, { A: 'prod', B: 'local', C: 'real' });
  assert.equal(r.sources.A, '.env.production'); assert.equal(r.sources.C, 'process.env');
});
test('check(): override files are not missing-var; effective env per mode is', () => {
  const d = dir({ '.env.example': 'A=\nB=\nC=\n', '.env': 'A=1\nB=2\n', '.env.production': 'A=3\n' });
  const r = check([d], { git: false });
  const per = r.findings.filter((f) => f.rule === 'missing-var');
  assert.ok(!per.some((f) => /\.env\.production/.test(f.location)));
  assert.ok(per.some((f) => /mode: production/.test(f.location) && /C is in/.test(f.message)));
  assert.ok(check([d], { git: false, mode: 'staging' }).findings.some((f) => /mode: staging/.test(f.location)));
});
