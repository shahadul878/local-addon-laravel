'use strict';

/** KEY=value, optionally commented ("# KEY=value") or exported ("export KEY=value"). */
const LINE_PATTERN = /^\s*(#\s*)?(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;
const BARE_VALUE = /^[A-Za-z0-9_./:@+-]*$/;

/** "…" (with escapes) or '…' (literal), optionally followed by an inline # comment. */
const DOUBLE_QUOTED = /^"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/;
const SINGLE_QUOTED = /^'([^']*)'\s*(?:#.*)?$/;

function unquote(rawValue) {
  const value = rawValue.trim();
  const double = DOUBLE_QUOTED.exec(value);
  if (double) {
    return double[1].replace(/\\(.)/g, (_match, char) => (char === 'n' ? '\n' : char));
  }
  const single = SINGLE_QUOTED.exec(value);
  if (single) {
    return single[1];
  }
  const commentAt = value.search(/\s#/);
  return commentAt === -1 ? value : value.slice(0, commentAt).trim();
}

function formatValue(value) {
  const text = String(value);
  if (BARE_VALUE.test(text)) {
    return text;
  }
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function parseLine(line) {
  const match = LINE_PATTERN.exec(line);
  return match ? { isCommented: Boolean(match[1]), key: match[2], rawValue: match[3] } : null;
}

/** Active (uncommented) keys and their unquoted values. Later duplicates win, as in phpdotenv. */
function parseEnv(text) {
  return Object.freeze(text.split(/\r?\n/).reduce((values, line) => {
    const parsed = parseLine(line);
    return parsed && !parsed.isCommented ? { ...values, [parsed.key]: unquote(parsed.rawValue) } : values;
  }, {}));
}

/**
 * Returns a new .env text with `updates` applied, keeping comments and ordering:
 *  - a string sets the key (re-using a commented "# KEY=" line if the key isn't active yet);
 *  - null comments the key out;
 *  - keys that don't exist anywhere are appended.
 *
 * @param {string} text
 * @param {Record<string, string|null>} updates
 * @returns {string}
 */
function updateEnv(text, updates) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const hasTrailingNewline = text.endsWith('\n');
  const body = hasTrailingNewline ? text.replace(/\r?\n$/, '') : text;
  const lines = body === '' ? [] : body.split(/\r?\n/);
  const activeKeys = new Set(lines.map(parseLine).filter((p) => p && !p.isCommented).map((p) => p.key));
  const handled = new Set();
  const wants = (key) => Object.prototype.hasOwnProperty.call(updates, key);

  const rewritten = lines.map((line) => {
    const parsed = parseLine(line);
    if (!parsed || !wants(parsed.key)) {
      return line;
    }
    const value = updates[parsed.key];
    if (value === null) {
      handled.add(parsed.key);
      return parsed.isCommented ? line : `# ${parsed.key}=${parsed.rawValue.trim()}`;
    }
    // Every active duplicate gets the new value, so whichever one phpdotenv reads is right.
    const shouldRewrite = !parsed.isCommented || (!activeKeys.has(parsed.key) && !handled.has(parsed.key));
    if (!shouldRewrite) {
      return line;
    }
    handled.add(parsed.key);
    return `${parsed.key}=${formatValue(value)}`;
  });

  const appended = Object.keys(updates)
    .filter((key) => !handled.has(key) && updates[key] !== null)
    .map((key) => `${key}=${formatValue(updates[key])}`);
  const all = [...rewritten, ...appended];
  return all.join(eol) + (hasTrailingNewline || appended.length ? eol : '');
}

/**
 * Lists the updates that would actually change `values`.
 * @returns {{ key: string, from: string|null, to: string|null }[]}
 */
function diffEnv(values, updates) {
  return Object.keys(updates)
    .map((key) => ({ key, from: Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null, to: updates[key] }))
    .filter(({ from, to }) => from !== (to === null ? null : String(to)));
}

module.exports = { parseEnv, updateEnv, diffEnv, formatValue, unquote };
