/** Parse dotenv syntax: export, single/double/backtick quotes, multi-line double quotes, inline comments, ${VAR}. */
export function parseEnv(text) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  const entries = []; const bad = [];
  for (let i = 0; i < lines.length; i++) {
    const line = i + 1; const l = lines[i];
    if (!l.trim() || l.trim().startsWith('#')) continue;
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*([=:])\s?(.*)$/.exec(l);
    if (!m) { bad.push({ line, text: l.trim() }); continue; }
    const key = m[1]; let rest = m[3]; let value; let quote = null; let unquotedSpace = false;
    const q = rest.trimStart()[0];
    if (q === '"' || q === "'" || q === '`') {
      quote = q; rest = rest.trimStart().slice(1);
      let end = rest.indexOf(q); let acc = rest; let j = i;
      while (end < 0 && q === '"' && j + 1 < lines.length) { j++; acc += '\n' + lines[j]; end = acc.indexOf(q, acc.length - lines[j].length); }
      if (end < 0) { bad.push({ line, text: l.trim(), reason: 'unterminated quote' }); continue; }
      i = j; value = acc.slice(0, end);
      if (q === '"') value = value.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else {
      const hash = rest.search(/\s#/); value = (hash >= 0 ? rest.slice(0, hash) : rest).trim();
      if (/\s/.test(value) || (/#/.test(value) && !/\s#/.test(rest))) unquotedSpace = /\s/.test(value);
    }
    entries.push({ key, value, line, quote, unquotedSpace, sep: m[2] });
  }
  return { entries, bad, map: Object.fromEntries(entries.map((e) => [e.key, e.value])) };
}
