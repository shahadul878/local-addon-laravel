'use strict';

/**
 * Laravel releases offered in the UI, newest first.
 * `minPhp` mirrors the `require.php` constraint of the laravel/laravel skeleton on Packagist.
 */
const LARAVEL_VERSIONS = Object.freeze([
  Object.freeze({ major: '13', label: 'Laravel 13', constraint: '^13.0', minPhp: '8.3.0' }),
  Object.freeze({ major: '12', label: 'Laravel 12', constraint: '^12.0', minPhp: '8.2.0' }),
]);
const DEFAULT_LARAVEL_MAJOR = '13';

/** PHP extensions the Laravel framework requires (laravel.com/docs/deployment#server-requirements). */
const REQUIRED_EXTENSIONS = Object.freeze([
  'ctype', 'curl', 'dom', 'fileinfo', 'filter', 'hash', 'mbstring', 'openssl', 'pcre', 'pdo', 'session', 'tokenizer', 'xml',
]);
const DRIVER_EXTENSIONS = Object.freeze({ mysql: 'pdo_mysql', sqlite: 'pdo_sqlite' });
const DB_DRIVERS = Object.freeze(['mysql', 'sqlite']);
const DEFAULT_DB_NAME = 'laravel';

const COMPOSER_URL = 'https://getcomposer.org/download/latest-stable/composer.phar';
const COMPOSER_SHA_URL = `${COMPOSER_URL}.sha256`;

const LOCALHOST = '127.0.0.1';
const MAX_REDIRECTS = 5;
const DOWNLOAD_IDLE_TIMEOUT_MS = 60 * 1000;
const MAX_TEXT_RESPONSE_BYTES = 64 * 1024;
const PORT_PROBE_TIMEOUT_MS = 600;

const CREATE_PROJECT_TIMEOUT_MS = 20 * 60 * 1000;
const ARTISAN_TIMEOUT_MS = 10 * 60 * 1000;
const QUICK_COMMAND_TIMEOUT_MS = 30 * 1000;
const MAX_CAPTURED_OUTPUT_CHARS = 256 * 1024;

/** Artisan commands that never exit or wait for keyboard input; they belong in Local's Site Shell. */
const BLOCKED_ARTISAN_COMMANDS = Object.freeze([
  'serve', 'tinker', 'queue:work', 'queue:listen', 'schedule:work', 'horizon', 'reverb:start', 'pail', 'octane:start',
]);

const IPC = Object.freeze({
  GET_STATE: 'laraveladdon:get-state',
  INSTALL: 'laraveladdon:install',
  SYNC_ENV: 'laraveladdon:sync-env',
  SET_AUTO_SYNC: 'laraveladdon:set-auto-sync',
  RUN_ARTISAN: 'laraveladdon:run-artisan',
  UNINSTALL: 'laraveladdon:uninstall',
  OUTPUT: 'laraveladdon:output',
});

/** Install steps, in order. The renderer shows them as a checklist. */
const INSTALL_STEPS = Object.freeze([
  Object.freeze({ id: 'composer', label: 'Get Composer' }),
  Object.freeze({ id: 'create-project', label: 'Download Laravel' }),
  Object.freeze({ id: 'web-root', label: 'Point the web root at Laravel' }),
  Object.freeze({ id: 'configure', label: 'Write .env for this site' }),
  Object.freeze({ id: 'migrate', label: 'Run migrations' }),
  Object.freeze({ id: 'storage-link', label: 'Link public storage' }),
]);

/** The .env keys the panel shows and keeps in sync with Local. */
const WATCHED_ENV_KEYS = Object.freeze([
  'APP_NAME', 'APP_ENV', 'APP_URL', 'DB_CONNECTION', 'DB_HOST', 'DB_PORT', 'DB_SOCKET', 'DB_DATABASE', 'DB_USERNAME', 'MAIL_MAILER', 'MAIL_HOST', 'MAIL_PORT',
]);

module.exports = {
  LARAVEL_VERSIONS,
  DEFAULT_LARAVEL_MAJOR,
  REQUIRED_EXTENSIONS,
  DRIVER_EXTENSIONS,
  DB_DRIVERS,
  DEFAULT_DB_NAME,
  COMPOSER_URL,
  COMPOSER_SHA_URL,
  LOCALHOST,
  MAX_REDIRECTS,
  DOWNLOAD_IDLE_TIMEOUT_MS,
  MAX_TEXT_RESPONSE_BYTES,
  PORT_PROBE_TIMEOUT_MS,
  CREATE_PROJECT_TIMEOUT_MS,
  ARTISAN_TIMEOUT_MS,
  QUICK_COMMAND_TIMEOUT_MS,
  MAX_CAPTURED_OUTPUT_CHARS,
  BLOCKED_ARTISAN_COMMANDS,
  IPC,
  INSTALL_STEPS,
  WATCHED_ENV_KEYS,
};
