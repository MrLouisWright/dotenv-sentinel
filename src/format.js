// dotenv-linter style formatting checks. Pure: (text, file) -> raw findings.
export function formatChecks(text, { file = '.env', order = true } = {}) {
  const out = []; const lines = String(text).replace(/^\uFEFF/, '').split('\n');
  const add = (rule, line, message, fix, evidence) => out.push({ rule, file, line, location: `${file}:${line}`, message, fix, evidence });
  let prevKey = null; let blank = 0; let inQuote = null;
  lines.forEach((raw, i) => {
    const n = i + 1; const l = raw.replace(/\r$/, '');
    if (inQuote) { if (l.includes(inQuote)) inQuote = null; return; }
    if (n === lines.length && l === '') return;
    if (/[ \t]+$/.test(l)) add('trailing-whitespace', n, 'Line has trailing whitespace', 'Remove it.');
    if (!l.trim()) { blank++; if (blank === 2) add('extra-blank-line', n, 'More than one blank line in a row', 'Remove the extra blank line.'); return; }
    blank = 0;
    if (l.trim().startsWith('#')) { if (/^\s*#\s*-{3,}|^\s*#\s*={3,}/.test(l)) prevKey = null; return; }
    const m = /^(\s*)(export\s+)?([^=\s:]+)(\s*)([=:])(\s*)(.*)$/.exec(l); if (!m) return;
    const [, lead, , key, sp1, sep, sp2, value] = m;
    if (lead) add('leading-whitespace', n, `${key} is indented`, 'Remove the leading whitespace.', key);
    if (sep === ':') add('incorrect-delimiter', n, `${key} uses ":" instead of "="`, `Write ${key}=…`, key);
    if (sp1 || (sp2 && value)) add('space-around-equals', n, `${key} has spaces around "="; many loaders keep them in the key or value`, `Write ${key}=${value.trim()}`, key);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && key !== key.toUpperCase()) add('lowercase-key', n, `${key} is not UPPER_SNAKE_CASE`, `Rename it to ${key.toUpperCase()}.`, key);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) add('invalid-key-character', n, `${key} contains characters other than letters, digits and _`, 'Use only A-Z, 0-9 and _.', key);
    const v = value.trim(); const q = v[0];
    if ((q === '"' || q === "'") && v.length > 1 && v.endsWith(q) && !/[\s#$"'`\\=]/.test(v.slice(1, -1)) && v.length > 2) add('unnecessary-quotes', n, `${key} is quoted but does not need to be`, `Write ${key}=${v.slice(1, -1)}`, key);
    if (q === '"' && (v.length === 1 || !v.slice(1).includes('"'))) inQuote = '"';
    if (order && prevKey && key.localeCompare(prevKey, 'en') < 0 && /^[A-Z0-9_]+$/.test(key) && /^[A-Z0-9_]+$/.test(prevKey)) add('unordered-key', n, `${key} should come before ${prevKey}`, 'Sort keys alphabetically within each block (blank lines start a new block).', key);
    prevKey = key;
  });
  // blank lines split ordering blocks
  return out.filter((f, i, a) => f.rule !== 'unordered-key' || !blockBreak(lines, a, f));
}
function blockBreak(lines, _a, f) {
  for (let i = f.line - 2; i >= 0; i--) { const l = lines[i].trim(); if (!l) return true; if (l.startsWith('#')) continue; return false; }
  return false;
}
export const hasFinalNewline = (text) => !text.length || text.endsWith('\n');
