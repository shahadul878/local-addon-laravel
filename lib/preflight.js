'use strict';

const { REQUIRED_EXTENSIONS, DRIVER_EXTENSIONS } = require('./constants');
const { isAtLeast } = require('./versions');

const check = (id, label, status, detail) => Object.freeze({ id, label, status, detail });

function phpCheck(site, php, release) {
  const label = 'PHP version';
  if (!site.phpVersion) {
    return check('php', label, 'fail', 'Local reports no PHP service for this site.');
  }
  if (!php || !php.isFound) {
    return check('php', label, 'fail', `Local's PHP ${site.phpVersion} build was not found. Re-select PHP on the site's Overview tab.`);
  }
  if (php.error) {
    return check('php', label, 'fail', php.error);
  }
  if (!isAtLeast(php.version, release.minPhp)) {
    return check('php', label, 'fail', `${release.label} needs PHP ${release.minPhp.replace(/\.0$/, '')}+, but this site runs ${php.version}. Change it on the site's Overview tab.`);
  }
  return check('php', label, 'ok', `PHP ${php.version}`);
}

function extensionsCheck(php, dbDriver) {
  const label = 'PHP extensions';
  if (!php || !php.isFound || php.error) {
    return check('extensions', label, 'fail', 'Waiting for a working PHP binary.');
  }
  const required = [...REQUIRED_EXTENSIONS, DRIVER_EXTENSIONS[dbDriver]];
  const missing = required.filter((ext) => !php.extensions.includes(ext));
  return missing.length
    ? check('extensions', label, 'fail', `Missing: ${missing.join(', ')}.`)
    : check('extensions', label, 'ok', `All ${required.length} required extensions are loaded.`);
}

function databaseCheck(site, { dbDriver, shouldMigrate, isDbOnline }) {
  const label = 'Database';
  if (dbDriver === 'sqlite') {
    return check('database', label, 'ok', 'SQLite file at database/database.sqlite.');
  }
  if (!site.db) {
    return check('database', label, 'fail', 'This site has no MySQL service. Choose SQLite instead.');
  }
  if (!isDbOnline && shouldMigrate) {
    return check('database', label, 'fail', `Start the site so ${site.db.engine === 'mariadb' ? 'MariaDB' : 'MySQL'} is running (needed for migrations), or untick "Run migrations".`);
  }
  if (!isDbOnline) {
    return check('database', label, 'warn', 'The site is stopped. Migrations can be run later from this tab.');
  }
  return check('database', label, 'ok', `${site.db.engine === 'mariadb' ? 'MariaDB' : 'MySQL'} on port ${site.db.port}.`);
}

function webRootCheck(webRoot, laravel) {
  const label = 'Web root';
  if (laravel) {
    return check('web-root', label, 'fail', 'Laravel is already installed in this site.');
  }
  if (!webRoot.hasAppDir) {
    return check('web-root', label, 'fail', "The site's app/ folder is missing.");
  }
  if (webRoot.hasWordPress) {
    return check('web-root', label, 'warn', 'WordPress in app/public will be moved to app/public.backup-… (nothing is deleted).');
  }
  if (!webRoot.isPublicEmpty) {
    return check('web-root', label, 'warn', 'Files in app/public will be moved to app/public.backup-… (nothing is deleted).');
  }
  return check('web-root', label, 'ok', 'app/public is empty.');
}

/**
 * Everything that must be true before installing. Pure, so the renderer shows the same
 * checklist the main process enforces.
 *
 * @returns {{ id: string, label: string, status: 'ok'|'warn'|'info'|'fail', detail: string }[]}
 */
function buildChecks({ site, php, release, webRoot, laravel, dbDriver, shouldMigrate, isDbOnline, isComposerReady }) {
  return Object.freeze([
    phpCheck(site, php, release),
    extensionsCheck(php, dbDriver),
    check('composer', 'Composer', isComposerReady ? 'ok' : 'info', isComposerReady ? 'Ready.' : 'Will be downloaded from getcomposer.org and checksum-verified.'),
    databaseCheck(site, { dbDriver, shouldMigrate, isDbOnline }),
    check('mail', 'Mail', site.mail ? 'ok' : 'info', site.mail ? `Emails go to Local's Mailpit (SMTP ${site.mail.smtpPort}).` : 'No Mailpit service: mail stays on Laravel\'s defaults.'),
    webRootCheck(webRoot, laravel),
  ]);
}

const hasBlockingCheck = (checks) => checks.some((item) => item.status === 'fail');

module.exports = { buildChecks, hasBlockingCheck };
