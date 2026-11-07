'use strict';

const { LOCALHOST } = require('./constants');

const LOCAL_HOSTS = Object.freeze(['127.0.0.1', 'localhost', '::1']);
const DB_KEYS = Object.freeze(['DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD']);

function isLocalHost(host) {
  return LOCAL_HOSTS.includes(String(host || '').toLowerCase());
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * How to reach Local's MySQL. Local only creates root@localhost and runs with skip-name-resolve,
 * so a TCP login from 127.0.0.1 is refused ("Host '127.0.0.1' is not allowed to connect").
 * Like WordPress in Local, connect as "localhost" over the site's unix socket. Windows has no
 * socket, so it falls back to TCP.
 */
function mysqlConnection(db) {
  return db.socket
    ? { DB_HOST: 'localhost', DB_PORT: String(db.port), DB_SOCKET: db.socket }
    : { DB_HOST: LOCALHOST, DB_PORT: String(db.port) };
}

function mysqlUpdates(db, dbName) {
  if (!db) {
    throw new Error("This site has no MySQL service in Local, so choose SQLite instead.");
  }
  return {
    DB_CONNECTION: 'mysql',
    ...mysqlConnection(db),
    DB_DATABASE: dbName,
    DB_USERNAME: db.user,
    DB_PASSWORD: db.password,
  };
}

/** SQLite needs no host/port, so the connection keys are commented out like Laravel's default .env. */
function sqliteUpdates() {
  return [...DB_KEYS, 'DB_SOCKET'].reduce((updates, key) => ({ ...updates, [key]: null }), { DB_CONNECTION: 'sqlite' });
}

function mailUpdates(mail) {
  return mail ? { MAIL_MAILER: 'smtp', MAIL_HOST: LOCALHOST, MAIL_PORT: String(mail.smtpPort) } : {};
}

/**
 * The .env values a fresh install gets: app URL from Local's domain, the site's MySQL
 * (or SQLite) and Local's Mailpit SMTP server so every email lands in Local's inbox.
 */
function buildInstallEnv(site, { appName, dbDriver, dbName }) {
  return Object.freeze({
    APP_NAME: appName,
    APP_ENV: 'local',
    APP_DEBUG: 'true',
    APP_URL: site.url,
    ...(dbDriver === 'mysql' ? mysqlUpdates(site.db, dbName) : sqliteUpdates()),
    ...mailUpdates(site.mail),
  });
}

/** Hosts that can only be Local's own: anything else (a tunnel, a staging URL) is the developer's choice. */
function isLocalDevHost(host) {
  return host === null || isLocalHost(host) || /\.(local|test|localhost)$/.test(host);
}

/**
 * Values Local owns and may change behind the app's back (ports are reassigned when they clash,
 * the domain can be renamed). Only keys already pointing at Local's services are touched;
 * anything the developer pointed elsewhere is left alone. This also moves older installs from
 * 127.0.0.1 to Local's socket.
 */
function buildSyncEnv(site, env) {
  const appHost = hostOf(env.APP_URL);
  const shouldSyncUrl = appHost !== site.domain.toLowerCase() && isLocalDevHost(appHost);
  const appUpdates = shouldSyncUrl ? { APP_URL: site.url } : {};
  const dbUpdates = site.db && env.DB_CONNECTION === 'mysql' && isLocalHost(env.DB_HOST)
    ? mysqlConnection(site.db)
    : {};
  const mailUpdatesForSync = site.mail && env.MAIL_MAILER === 'smtp' && isLocalHost(env.MAIL_HOST)
    ? { MAIL_PORT: String(site.mail.smtpPort) }
    : {};
  return Object.freeze({ ...appUpdates, ...dbUpdates, ...mailUpdatesForSync });
}

module.exports = { buildInstallEnv, buildSyncEnv, isLocalHost };
