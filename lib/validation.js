'use strict';

const { LARAVEL_VERSIONS, DB_DRIVERS, BLOCKED_ARTISAN_COMMANDS } = require('./constants');

const SITE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** Unquoted MySQL identifier. Kept conservative so it is also a safe file/URL fragment. */
const DB_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const APP_NAME_MAX = 60;
const APP_NAME_PATTERN = /^[\p{L}\p{N} ._-]+$/u;
const ARTISAN_NAME_PATTERN = /^[a-z][a-z0-9:_-]*$/i;
const MAX_ARTISAN_INPUT = 500;

function assertSiteId(siteId) {
  if (typeof siteId !== 'string' || !SITE_ID_PATTERN.test(siteId)) {
    throw new Error('Invalid site id.');
  }
  return siteId;
}

function assertLaravelMajor(major) {
  const release = LARAVEL_VERSIONS.find((candidate) => candidate.major === major);
  if (!release) {
    throw new Error(`Unsupported Laravel version "${major}". Choose one of: ${LARAVEL_VERSIONS.map((v) => v.major).join(', ')}.`);
  }
  return release;
}

function assertAppName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed || trimmed.length > APP_NAME_MAX || !APP_NAME_PATTERN.test(trimmed)) {
    throw new Error(`App name must be 1–${APP_NAME_MAX} letters, numbers, spaces, dots, dashes or underscores.`);
  }
  return trimmed;
}

function assertDbDriver(driver) {
  if (!DB_DRIVERS.includes(driver)) {
    throw new Error(`Database must be one of: ${DB_DRIVERS.join(', ')}.`);
  }
  return driver;
}

function assertDbName(name) {
  if (typeof name !== 'string' || !DB_NAME_PATTERN.test(name)) {
    throw new Error('Database names must start with a letter or underscore and use only letters, digits and underscores (max 64).');
  }
  return name;
}

function assertBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be true or false.`);
  }
  return value;
}

/** Validates the install form. Returns a new, normalised options object. */
function parseInstallOptions(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid install options.');
  }
  const release = assertLaravelMajor(raw.laravelMajor);
  const dbDriver = assertDbDriver(raw.dbDriver);
  return Object.freeze({
    release,
    appName: assertAppName(raw.appName),
    dbDriver,
    dbName: dbDriver === 'mysql' ? assertDbName(raw.dbName) : null,
    shouldMigrate: assertBoolean(raw.shouldMigrate, 'Run migrations'),
  });
}

/**
 * Splits an artisan command line into arguments the way a shell would for simple quoting,
 * without ever invoking a shell. Supports "double" and 'single' quotes and backslash escapes.
 */
function tokenize(input) {
  const tokens = [];
  let current = '';
  let quote = null;
  let hasToken = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '\\' && quote !== "'" && i + 1 < input.length) {
      current += input[i + 1];
      hasToken = true;
      i += 1;
    } else if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
      hasToken = true;
    } else if (/\s/.test(char)) {
      if (hasToken) {
        tokens.push(current);
      }
      current = '';
      hasToken = false;
    } else {
      current += char;
      hasToken = true;
    }
  }
  if (quote) {
    throw new Error('Unclosed quote in the artisan command.');
  }
  if (hasToken) {
    tokens.push(current);
  }
  return tokens;
}

/**
 * Symfony Console accepts abbreviations per segment ("tink" → tinker, "q:w" → queue:work),
 * so a name is blocked when each of its segments is a prefix of a blocked command's segment.
 */
function isBlockedCommand(name) {
  const segments = name.toLowerCase().split(':');
  return BLOCKED_ARTISAN_COMMANDS.some((blocked) => {
    const target = blocked.split(':');
    return target.length === segments.length && segments.every((segment, i) => segment && target[i].startsWith(segment));
  });
}

/** Parses "php artisan migrate --seed" / "migrate --seed" into ['migrate', '--seed']. */
function parseArtisanCommand(input) {
  if (typeof input !== 'string' || !input.trim() || input.length > MAX_ARTISAN_INPUT) {
    throw new Error('Enter an artisan command, e.g. "migrate" or "make:model Post -m".');
  }
  const tokens = tokenize(input.trim());
  const withoutPrefix = tokens[0] === 'php' && tokens[1] === 'artisan' ? tokens.slice(2) : tokens;
  const args = withoutPrefix[0] === 'artisan' ? withoutPrefix.slice(1) : withoutPrefix;
  const [name] = args;
  if (!name || !ARTISAN_NAME_PATTERN.test(name)) {
    throw new Error('The command must start with an artisan command name, e.g. "migrate".');
  }
  if (isBlockedCommand(name)) {
    throw new Error(`"${name}" keeps running or needs keyboard input. Run it from Local's "Open site shell" instead.`);
  }
  return Object.freeze(args);
}

module.exports = {
  assertSiteId,
  assertLaravelMajor,
  assertAppName,
  assertDbDriver,
  assertDbName,
  assertBoolean,
  parseInstallOptions,
  parseArtisanCommand,
  tokenize,
};
