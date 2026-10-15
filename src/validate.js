// Run-time validation and coercion, envalid-style, plus a zod (safeParse) adapter.
export class EnvError extends Error {
  constructor(problems) { super(`Invalid environment:\n${problems.map((p) => `  ${p.key}: ${p.message}`).join('\n')}`); this.name = 'EnvError'; this.problems = problems; }
}
const SKIP = Symbol('skip');
function makeValidator(type, parse) {
  return (spec = {}) => ({ type, parse, ...spec });
}
const truthy = /^(true|1|yes|on|t|y)$/i; const falsy = /^(false|0|no|off|f|n)$/i;
export const str = makeValidator('string', (v) => String(v));
export const num = makeValidator('number', (v) => { const n = Number(v); if (v === '' || !Number.isFinite(n)) throw new Error('is not a number'); return n; });
export const int = makeValidator('integer', (v) => { if (!/^-?\d+$/.test(String(v))) throw new Error('is not an integer'); return parseInt(v, 10); });
export const bool = makeValidator('boolean', (v) => { if (typeof v === 'boolean') return v; if (truthy.test(v)) return true; if (falsy.test(v)) return false; throw new Error('is not a boolean (true/false/1/0/yes/no/on/off)'); });
export const port = makeValidator('port', (v) => { const n = Number(v); if (!/^\d+$/.test(String(v)) || n < 1 || n > 65535) throw new Error('is not a port (1-65535)'); return n; });
export const url = makeValidator('url', (v) => { try { return new URL(v).href && String(v); } catch { throw new Error('is not a URL'); } });
export const email = makeValidator('email', (v) => { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error('is not an email address'); return String(v); });
export const host = makeValidator('host', (v) => { if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(v) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) throw new Error('is not a host name or IP'); return String(v); });
export const json = makeValidator('json', (v) => { try { return JSON.parse(v); } catch { throw new Error('is not valid JSON'); } });

/**
 * Validate and coerce an environment object against a spec of validators.
 * cleanEnv(process.env, { PORT: port({ default: 3000 }), DEBUG: bool({ devDefault: true }), NODE_ENV: str({ choices: ['production', 'development', 'test'] }) })
 * Returns a frozen object; throws EnvError listing every problem at once (unless opts.onError is given).
 */
export function cleanEnv(env, spec, opts = {}) {
  const out = {}; const problems = [];
  const isProd = (env.NODE_ENV || 'production') === 'production';
  for (const [key, v] of Object.entries(spec)) {
    const validator = typeof v === 'function' ? v() : v;
    let raw = env[key];
    if (raw === undefined || raw === '') {
      if (!isProd && 'devDefault' in validator) raw = validator.devDefault;
      else if ('default' in validator) raw = validator.default;
      else if (validator.optional) { out[key] = undefined; continue; }
      else { problems.push({ key, message: `is required${validator.desc ? ` (${validator.desc})` : ''}${validator.example ? `, e.g. ${validator.example}` : ''}` }); continue; }
      if (raw === undefined) { out[key] = undefined; continue; }
      if (typeof raw !== 'string') { out[key] = raw; continue; }
    }
    try {
      const val = validator.parse(raw);
      if (validator.choices && !validator.choices.includes(val)) throw new Error(`must be one of ${validator.choices.join(', ')}`);
      if (validator.pattern && !new RegExp(validator.pattern).test(String(raw))) throw new Error(`does not match /${validator.pattern}/`);
      if (validator.minLength && String(raw).length < validator.minLength) throw new Error(`is shorter than ${validator.minLength} characters`);
      out[key] = val;
    } catch (e) { problems.push({ key, message: e.message }); }
  }
  if (problems.length) { const err = new EnvError(problems); if (opts.onError) { opts.onError(err); return Object.freeze(out); } throw err; }
  if (opts.strict === false) return Object.freeze(out);
  return Object.freeze(out);
}

/** Validate with any zod-like schema (anything with safeParse). Returns parsed data or throws EnvError. */
export function fromZod(schema, env) {
  if (!schema || typeof schema.safeParse !== 'function') throw new TypeError('fromZod expects a schema with safeParse (zod, valibot adapters, …)');
  const r = schema.safeParse(env);
  if (r.success) return r.data;
  const issues = r.error?.issues || r.error?.errors || [];
  throw new EnvError(issues.map((i) => ({ key: (i.path || []).join('.') || '(root)', message: i.message })));
}
void SKIP;
