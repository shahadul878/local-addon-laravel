'use strict';

const os = require('os');
const path = require('path');

/**
 * Locations inside Local's user-data folder:
 *
 *   <userData>/sites.json                         Local's site registry (read-only for us)
 *   <userData>/lightning-services/php-<v>+<b>/    Local's PHP builds
 *   <userData>/run/<siteId>/conf/php/php.ini      the ini Local generated for a running site
 *   <userData>/laravel/config.json                this add-on's per-site records
 *   <userData>/laravel/bin/composer.phar          Composer, downloaded on first install
 */
function createAddonPaths(userDataPath) {
  const root = path.join(userDataPath, 'laravel');
  return Object.freeze({
    root,
    configFile: path.join(root, 'config.json'),
    logFile: path.join(root, 'addon.log'),
    composerPhar: path.join(root, 'bin', 'composer.phar'),
    sitesFile: path.join(userDataPath, 'sites.json'),
    lightningServicesDir: path.join(userDataPath, 'lightning-services'),
    phpIni: (siteId) => path.join(userDataPath, 'run', siteId, 'conf', 'php', 'php.ini'),
    mysqlSocket: (siteId) => path.join(userDataPath, 'run', siteId, 'mysql', 'mysqld.sock'),
  });
}

/** Local stores site paths as "~/Local Sites/foo". */
function expandHome(sitePath, homeDir = os.homedir()) {
  if (sitePath === '~') {
    return homeDir;
  }
  if (sitePath.startsWith('~/') || sitePath.startsWith('~\\')) {
    return path.join(homeDir, sitePath.slice(2));
  }
  return sitePath;
}

/**
 * Laravel lives in <site>/app so that Laravel's own `public/` folder becomes Local's web root
 * (<site>/app/public). Local's nginx/Apache config never has to change.
 */
function createSitePaths(siteRoot) {
  const appDir = path.join(siteRoot, 'app');
  return Object.freeze({
    siteRoot,
    appDir,
    publicDir: path.join(appDir, 'public'),
    artisan: path.join(appDir, 'artisan'),
    composerJson: path.join(appDir, 'composer.json'),
    envFile: path.join(appDir, '.env'),
    envExample: path.join(appDir, '.env.example'),
    sqliteFile: path.join(appDir, 'database', 'database.sqlite'),
    frameworkApplication: path.join(appDir, 'vendor', 'laravel', 'framework', 'src', 'Illuminate', 'Foundation', 'Application.php'),
  });
}

/** Filesystem-safe timestamp, e.g. 20261107-164512. */
function timestamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

module.exports = { createAddonPaths, createSitePaths, expandHome, timestamp };
