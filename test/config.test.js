'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSite, readSite } = require('../lib/sites');
const { buildInstallEnv, buildSyncEnv } = require('../lib/laravelConfig');
const { buildChecks, hasBlockingCheck } = require('../lib/preflight');
const { compareVersions, isAtLeast } = require('../lib/versions');
const { expandHome, timestamp } = require('../lib/paths');
const { LARAVEL_VERSIONS, REQUIRED_EXTENSIONS } = require('../lib/constants');
const { rawSite } = require('./fixtures');

const HOME = '/home/dev';
const site = normalizeSite(rawSite(), HOME);

test('normalizeSite extracts paths, ports and credentials', () => {
  assert.equal(site.root, '/home/dev/Local Sites/cars');
  assert.equal(site.url, 'http://cars.local');
  assert.deepEqual(site.db, { engine: 'mysql', version: '8.0.35', port: 10003, user: 'root', password: 'root' });
  assert.deepEqual(site.mail, { engine: 'mailpit', smtpPort: 10001, webPort: 10000 });
  assert.equal(site.webServer, 'nginx');
});

test('normalizeSite copes with MariaDB, Apache and missing services', () => {
  const services = { mariadb: { name: 'mariadb', ports: { MYSQL: 10020 } }, apache: { name: 'apache' }, php: { version: '8.3.1' } };
  const other = normalizeSite(rawSite({ services }), HOME);
  assert.equal(other.db.engine, 'mariadb');
  assert.equal(other.db.port, 10020);
  assert.equal(other.mail, null);
  assert.equal(other.webServer, 'apache');
  assert.equal(normalizeSite(rawSite({ services: undefined }), HOME).db, null);
  assert.throws(() => normalizeSite(rawSite({ domain: 'bad domain' }), HOME), /invalid domain/);
  assert.throws(() => normalizeSite(null, HOME), /unreadable/);
});

test('readSite reads from sites.json and explains failures', async () => {
  const fakeFs = (text) => ({ readFile: async () => text });
  const found = await readSite({ fs: fakeFs(JSON.stringify({ site1: rawSite() })), sitesFile: 'x', homeDir: HOME }, 'site1');
  assert.equal(found.name, 'cars');
  await assert.rejects(readSite({ fs: fakeFs('{}'), sitesFile: 'x', homeDir: HOME }, 'site1'), /no longer exists/);
  await assert.rejects(readSite({ fs: fakeFs('{oops'), sitesFile: 'x', homeDir: HOME }, 'site1'), /site list/);
});

test('buildInstallEnv points Laravel at the site URL, MySQL and Mailpit', () => {
  const env = buildInstallEnv(site, { appName: 'Cars', dbDriver: 'mysql', dbName: 'laravel' });
  assert.equal(env.APP_URL, 'http://cars.local');
  assert.equal(env.DB_CONNECTION, 'mysql');
  assert.equal(env.DB_PORT, '10003');
  assert.equal(env.DB_DATABASE, 'laravel');
  assert.equal(env.MAIL_PORT, '10001');
  assert.equal(env.DB_HOST, '127.0.0.1', 'TCP when there is no socket (Windows)');
  const socketSite = { ...site, db: { ...site.db, socket: '/run/site1/mysql/mysqld.sock' } };
  const viaSocket = buildInstallEnv(socketSite, { appName: 'Cars', dbDriver: 'mysql', dbName: 'laravel' });
  assert.equal(viaSocket.DB_HOST, 'localhost', "Local's MySQL only accepts root@localhost");
  assert.equal(viaSocket.DB_SOCKET, '/run/site1/mysql/mysqld.sock');
  const sqlite = buildInstallEnv(site, { appName: 'Cars', dbDriver: 'sqlite', dbName: null });
  assert.equal(sqlite.DB_SOCKET, null);
  assert.equal(sqlite.DB_CONNECTION, 'sqlite');
  assert.equal(sqlite.DB_HOST, null);
  assert.throws(() => buildInstallEnv({ ...site, db: null }, { appName: 'x', dbDriver: 'mysql', dbName: 'y' }), /SQLite/);
});

test('buildSyncEnv only touches values that still point at Local', () => {
  const env = {
    APP_URL: 'http://old.local', DB_CONNECTION: 'mysql', DB_HOST: '127.0.0.1', DB_PORT: '1', MAIL_MAILER: 'smtp', MAIL_HOST: 'localhost', MAIL_PORT: '2',
  };
  assert.deepEqual(buildSyncEnv(site, env), {
    APP_URL: 'http://cars.local', DB_HOST: '127.0.0.1', DB_PORT: '10003', MAIL_PORT: '10001',
  });
  const socketSite = { ...site, db: { ...site.db, socket: '/run/s/mysqld.sock' } };
  assert.deepEqual(buildSyncEnv(socketSite, { APP_URL: 'http://cars.local', DB_CONNECTION: 'mysql', DB_HOST: '127.0.0.1', DB_PORT: '10003' }), {
    DB_HOST: 'localhost', DB_PORT: '10003', DB_SOCKET: '/run/s/mysqld.sock',
  }, 'older installs on 127.0.0.1 are moved to the socket');
  const custom = { ...env, APP_URL: 'https://cars.local/', DB_HOST: 'db.example.com', MAIL_HOST: 'smtp.example.com' };
  assert.deepEqual(buildSyncEnv(site, custom), {});
  const tunnel = { ...custom, APP_URL: 'https://abc.ngrok.io' };
  assert.deepEqual(buildSyncEnv(site, tunnel), {}, 'a tunnel URL is the developer\'s choice');
  assert.deepEqual(buildSyncEnv(site, { ...custom, APP_URL: 'http://localhost' }), { APP_URL: 'http://cars.local' });
});

test('compareVersions orders numerically', () => {
  assert.equal(compareVersions('8.10.0', '8.9.9'), 1);
  assert.equal(compareVersions('8.3', '8.3.0'), 0);
  assert.equal(compareVersions('8.2.30', '8.3.0'), -1);
  assert.equal(isAtLeast(null, '8.2.0'), false);
});

test('expandHome and timestamp', () => {
  assert.equal(expandHome('~/Local Sites/a', HOME), '/home/dev/Local Sites/a');
  assert.equal(expandHome('~', HOME), HOME);
  assert.equal(expandHome('/abs', HOME), '/abs');
  assert.equal(timestamp(new Date(2026, 10, 7, 9, 5, 3)), '20261107-090503');
});

function checkInput(overrides = {}) {
  return {
    site,
    php: { isFound: true, version: '8.4.18', extensions: [...REQUIRED_EXTENSIONS, 'pdo_mysql', 'pdo_sqlite'], error: null },
    release: LARAVEL_VERSIONS[0],
    webRoot: { hasAppDir: true, hasPublic: true, isPublicEmpty: false, hasWordPress: true },
    laravel: null,
    dbDriver: 'mysql',
    shouldMigrate: true,
    isDbOnline: true,
    isComposerReady: false,
    ...overrides,
  };
}

const statusOf = (checks, id) => checks.find((item) => item.id === id).status;

test('buildChecks passes a healthy site and warns about WordPress', () => {
  const checks = buildChecks(checkInput());
  assert.equal(hasBlockingCheck(checks), false);
  assert.equal(statusOf(checks, 'web-root'), 'warn');
  assert.equal(statusOf(checks, 'composer'), 'info');
});

test('buildChecks blocks on old PHP, missing extensions, stopped DB and existing Laravel', () => {
  assert.equal(statusOf(buildChecks(checkInput({ php: { ...checkInput().php, version: '8.2.30' } })), 'php'), 'fail');
  assert.equal(statusOf(buildChecks(checkInput({ php: { ...checkInput().php, extensions: ['pdo'] } })), 'extensions'), 'fail');
  assert.equal(statusOf(buildChecks(checkInput({ isDbOnline: false })), 'database'), 'fail');
  assert.equal(statusOf(buildChecks(checkInput({ isDbOnline: false, shouldMigrate: false })), 'database'), 'warn');
  assert.equal(statusOf(buildChecks(checkInput({ dbDriver: 'sqlite', isDbOnline: false })), 'database'), 'ok');
  assert.equal(statusOf(buildChecks(checkInput({ laravel: { version: '13.0.0' } })), 'web-root'), 'fail');
  assert.equal(statusOf(buildChecks(checkInput({ php: { isFound: false, version: '8.4.18', extensions: [] } })), 'php'), 'fail');
  assert.equal(statusOf(buildChecks(checkInput({ site: { ...site, db: null } })), 'database'), 'fail');
});
