import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { parseEnv, lintEnv, check, exitCode, weakness, isEnvFile, isExample, loadSchema } from '../src/index.js';
const F = new URL('./fixtures/', import.meta.url).pathname;
const rules = (x) => new Set((x.findings || x).map((f) => f.rule));

test('parser: export, quotes, multiline, inline comments', () => {
  const p = parseEnv('export A=1\nB="two words" # c\nC=\'lit ${A}\'\nD="line1\nline2"\nE=val # comment\nF=\n');
  assert.deepEqual(p.map, { A: '1', B: 'two words', C: 'lit ${A}', D: 'line1\nline2', E: 'val', F: '' });
  assert.equal(p.entries.find((e) => e.key === 'E').line, 6);
  assert.equal(parseEnv('X="open\n').bad.length, 1);
});
test('file name helpers and weakness', () => {
  assert.ok(isEnvFile('.env') && isEnvFile('.env.local') && isEnvFile('prod.env') && !isEnvFile('environment.ts'));
  assert.ok(isExample('.env.example') && isExample('.env.sample') && !isExample('.env.production'));
  assert.ok(weakness('changeme') && weakness('<your key>') && weakness('aaaaaaa') && !weakness('kq8Z!vX2#pL0'));
});
test('fixture app', () => {
  const r = check([F + 'app'], { git: false });
  const s = rules(r);
  for (const k of ['example-contains-secret', 'missing-var', 'weak-secret', 'debug-in-production', 'duplicate-key', 'invalid-line', 'short-secret', 'extra-var', 'insecure-url', 'undefined-reference', 'unquoted-space']) assert.ok(s.has(k), k);
  assert.ok(!s.has('committed-env'));
  assert.ok(!JSON.stringify(r).includes('AKIAIOSFODNN7EXAMPLE'), 'secrets are masked');
  assert.ok(!JSON.stringify(r).includes('changeme'));
});
test('placeholder password in URL is fine in examples; references are not weak', () => {
  assert.equal(lintEnv('DATABASE_URL=postgres://u:<password>@db/app\n', { file: '.env.example' }).raw.length, 0);
  assert.ok(!rules(lintEnv('API_KEY=${OTHER}\nOTHER=x\n', { file: '.env' }).raw).has('weak-secret'));
  assert.ok(rules(lintEnv('JWT_SECRET=kq8ZvX2pL0aB7cD9eF1gH3iJ5kL7mN9o\n', { file: '.env.example' }).raw).has('example-contains-secret'));
});
test('schema validation', () => {
  const schema = loadSchema(F + 'schema.json');
  const s = rules(lintEnv('NODE_ENV=prod\nPORT=99999\nJWT_SECRET=abc\nADMIN_EMAIL=nope\nSMTP_HOST=\n', { file: '.env', schema }).raw);
  assert.ok(s.has('type-mismatch'));
  assert.ok(!s.has('missing-var'));
  const s2 = lintEnv('PORT=80\n', { file: '.env', schema }).raw.filter((f) => f.rule === 'missing-var').map((f) => f.evidence);
  assert.deepEqual(s2.sort(), ['ADMIN_EMAIL', 'JWT_SECRET', 'NODE_ENV']);
  assert.ok(rules(lintEnv('ADMIN_EMAIL=\n', { file: '.env', schema }).raw).has('empty-required'));
  assert.throws(() => loadSchema({ variables: { A: { type: 'nope' } } }), /unknown type/);
});
test('git: committed, not ignored, history', () => {
  const d = mkdtempSync(join(tmpdir(), 'dotenv-sentinel-'));
  const g = (...a) => execFileSync('git', a, { cwd: d, stdio: 'ignore' });
  g('init', '-q'); g('config', 'user.email', 't@e.st'); g('config', 'user.name', 't'); g('config', 'commit.gpgsign', 'false');
  writeFileSync(join(d, '.env.old'), 'DB_PASSWORD=Xy7#kq8ZvX2pL0aBcD\n'); g('add', '.'); g('commit', '-qm', 'oops'); g('rm', '-q', '--cached', '.env.old'); g('commit', '-qm', 'rm'); rmSync(join(d, '.env.old'));
  writeFileSync(join(d, '.env.tracked'), 'TOKEN=Xy7kq8ZvX2pL0aBcDeF\n'); g('add', '.'); g('commit', '-qm', 'tracked');
  writeFileSync(join(d, '.env'), 'GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789AB\n');
  writeFileSync(join(d, '.env.local'), 'A=1\n'); writeFileSync(join(d, '.gitignore'), '.env.local\n');
  const r = check([d]);
  const by = (rule) => r.findings.filter((f) => f.rule === rule).map((f) => f.location);
  assert.ok(by('committed-env').some((l) => l.endsWith('.env.tracked')));
  assert.ok(by('env-not-ignored').some((l) => l.endsWith('/.env')));
  assert.ok(!by('env-not-ignored').some((l) => l.endsWith('.env.local')));
  assert.ok(by('env-in-history').some((l) => l.includes('.env.old')));
  assert.ok(by('known-secret').length >= 1);
  assert.equal(exitCode(r, 'high'), 1);
  assert.equal(rules(check([d], { history: false })).has('env-in-history'), false);
  rmSync(d, { recursive: true, force: true });
});
test('allowlist and severity', () => {
  const r = check([F + 'app'], { git: false, allow: [{ rule: 'weak-secret', match: '*JWT_SECRET*', reason: 'local only' }], severity: { 'extra-var': 'off' } });
  assert.ok(!rules(r).has('extra-var')); assert.ok(r.suppressed.some((f) => f.rule === 'weak-secret'));
});
test('CLI', () => {
  const bin = new URL('../bin/dotenv-sentinel.js', import.meta.url).pathname;
  for (const f of ['json', 'sarif', 'markdown', 'text']) { const p = spawnSync('node', [bin, F + 'app', '--no-git', '-f', f]); assert.equal(p.status, 1, f); assert.ok(p.stdout.length); }
  assert.equal(spawnSync('node', [bin, F + 'app', '--fail-on', 'none']).status, 0);
  assert.equal(spawnSync('node', [bin, '/nonexistent']).status, 2);
  assert.equal(spawnSync('node', [bin, F + 'app', '--schema', '/nonexistent.json']).status, 2);
  assert.equal(spawnSync('node', [bin, F + 'app', '--no-git', '--schema', F + 'schema.json', '-f', 'json']).status, 1);
});
