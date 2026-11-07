'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');

/** A sites.json entry shaped like Local 9 writes it. */
function rawSite(overrides = {}) {
  return {
    id: 'site1',
    name: 'cars',
    path: '~/Local Sites/cars',
    domain: 'cars.local',
    mysql: { database: 'local', user: 'root', password: 'root' },
    services: {
      mailpit: { name: 'mailpit', version: '1.24.1', ports: { WEB: [10000], SMTP: [10001] } },
      mysql: { name: 'mysql', version: '8.0.35', role: 'db', ports: { MYSQL: [10003] } },
      nginx: { name: 'nginx', version: '1.26.1', role: 'http', ports: { HTTP: [10004] } },
      php: { name: 'php', version: '8.4.18', role: 'php', ports: { cgi: [10002] } },
    },
    ...overrides,
  };
}

async function makeTempDir(prefix = 'laravel-addon-') {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

const silentLogger = Object.freeze({ info() {}, warn() {}, error() {} });

module.exports = { rawSite, makeTempDir, silentLogger };
