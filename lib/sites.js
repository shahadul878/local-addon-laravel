'use strict';

const { expandHome } = require('./paths');

const DOMAIN_PATTERN = /^[A-Za-z0-9.-]{1,253}$/;
const DB_SERVICE_NAMES = Object.freeze(['mysql', 'mariadb']);
const MAIL_SERVICE_NAMES = Object.freeze(['mailpit', 'mailhog']);
const HTTP_SERVICE_NAMES = Object.freeze(['nginx', 'apache']);

function firstPort(service, key) {
  const value = service && service.ports ? service.ports[key] : undefined;
  const port = Array.isArray(value) ? value[0] : value;
  return Number.isInteger(port) ? port : null;
}

function findService(services, names) {
  const name = names.find((candidate) => services[candidate]);
  return name ? { name, ...services[name] } : null;
}

function describeDb(services, credentials) {
  const service = findService(services, DB_SERVICE_NAMES);
  const port = firstPort(service, 'MYSQL');
  if (!service || !port) {
    return null;
  }
  return Object.freeze({
    engine: service.name,
    version: service.version || null,
    port,
    user: (credentials && credentials.user) || 'root',
    password: (credentials && typeof credentials.password === 'string') ? credentials.password : 'root',
  });
}

function describeMail(services) {
  const service = findService(services, MAIL_SERVICE_NAMES);
  const smtpPort = firstPort(service, 'SMTP');
  if (!service || !smtpPort) {
    return null;
  }
  return Object.freeze({ engine: service.name, smtpPort, webPort: firstPort(service, 'WEB') });
}

/**
 * Turns a raw entry from Local's sites.json (or a site object from a Local hook)
 * into the small, validated shape the add-on works with.
 */
function normalizeSite(raw, homeDir) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || typeof raw.path !== 'string') {
    throw new Error('Local returned an unreadable site record.');
  }
  if (typeof raw.domain !== 'string' || !DOMAIN_PATTERN.test(raw.domain)) {
    throw new Error(`Site "${raw.name || raw.id}" has an invalid domain.`);
  }
  const services = raw.services && typeof raw.services === 'object' ? raw.services : {};
  const php = services.php || null;
  const http = findService(services, HTTP_SERVICE_NAMES);
  return Object.freeze({
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : raw.id,
    domain: raw.domain,
    url: `http://${raw.domain}`,
    root: expandHome(raw.path, homeDir),
    phpVersion: php && typeof php.version === 'string' ? php.version : null,
    webServer: http ? http.name : null,
    db: describeDb(services, raw.mysql),
    mail: describeMail(services),
  });
}

/** Reads one site from Local's sites.json. */
async function readSite({ fs, sitesFile, homeDir }, siteId) {
  let registry;
  try {
    registry = JSON.parse(await fs.readFile(sitesFile, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read Local's site list (${error.code || error.message}).`);
  }
  const raw = registry && Object.prototype.hasOwnProperty.call(registry, siteId) ? registry[siteId] : null;
  if (!raw) {
    throw new Error('This site no longer exists in Local.');
  }
  return normalizeSite(raw, homeDir);
}

module.exports = { readSite, normalizeSite };
