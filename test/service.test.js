'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const { createAddonPaths } = require('../lib/paths');
const { createConfigStore } = require('../lib/configStore');
const { createKeyedQueue } = require('../lib/infra');
const { createLaravelService } = require('../lib/laravelService');
const { REQUIRED_EXTENSIONS } = require('../lib/constants');
const { parseEnv } = require('../lib/envFile');
const { rawSite, makeTempDir, silentLogger } = require('./fixtures');

const ENV_EXAMPLE = 'APP_NAME=Laravel\nAPP_KEY=\nAPP_URL=http://localhost\n\nDB_CONNECTION=sqlite\n# DB_HOST=127.0.0.1\n# DB_PORT=3306\n\nMAIL_MAILER=log\nMAIL_HOST=127.0.0.1\nMAIL_PORT=2525\n';

/** Writes what `composer create-project laravel/laravel` would produce. */
async function writeSkeleton(dir) {
  await fs.mkdir(path.join(dir, 'public'), { recursive: true });
  await fs.mkdir(path.join(dir, 'vendor/laravel/framework/src/Illuminate/Foundation'), { recursive: true });
  await fs.writeFile(path.join(dir, 'public/index.php'), '<?php // laravel');
  await fs.writeFile(path.join(dir, 'artisan'), '#!/usr/bin/env php');
  await fs.writeFile(path.join(dir, 'composer.json'), JSON.stringify({ require: { php: '^8.3', 'laravel/framework': '^13.0' } }));
  await fs.writeFile(path.join(dir, '.env.example'), ENV_EXAMPLE);
  await fs.writeFile(path.join(dir, 'vendor/laravel/framework/src/Illuminate/Foundation/Application.php'), "const VERSION = '13.17.0';");
}

/** A fake PHP: answers the extension probe, "runs" composer and records artisan calls. */
function createFakeProcess({ failArtisan = [], timeoutArtisan = [] } = {}) {
  const calls = [];
  const runProcess = async (file, args, options = {}) => {
    calls.push({ file, args, cwd: options.cwd, env: options.env });
    if (args[0] === '-r') {
      return { exitCode: 0, output: `8.4.18\n${[...REQUIRED_EXTENSIONS, 'pdo_mysql', 'pdo_sqlite'].join(',')}` };
    }
    const createAt = args.indexOf('create-project');
    if (createAt !== -1) {
      (options.onLine || (() => {}))('Installing laravel/laravel');
      await writeSkeleton(args[createAt + 2]);
      return { exitCode: 0, output: 'ok' };
    }
    const command = args[1];
    if (timeoutArtisan.includes(command)) {
      throw Object.assign(new Error('Timed out after 600 s.'), { isTimeout: true });
    }
    return { exitCode: failArtisan.includes(command) ? 1 : 0, output: `ran ${command}` };
  };
  return { runProcess, calls };
}

/** <tmp>/home/Local Sites/cars/app → <tmp>/userData */
const userDataOf = (appDir) => path.join(appDir, '..', '..', '..', '..', 'userData');

async function setup(options = {}) {
  const failingStore = options.failStoreWrites;
  const root = await makeTempDir();
  const home = path.join(root, 'home');
  const userData = path.join(root, 'userData');
  const siteRoot = path.join(home, 'Local Sites', 'cars');
  await fs.mkdir(path.join(siteRoot, 'app', 'public'), { recursive: true });
  await fs.mkdir(path.join(siteRoot, 'app', 'sql'));
  await fs.writeFile(path.join(siteRoot, 'app', 'public', 'wp-config.php'), '<?php // wordpress');
  const phpBin = path.join(userData, 'lightning-services', 'php-8.4.18+1', 'bin', 'linux', 'bin');
  await fs.mkdir(phpBin, { recursive: true });
  await fs.writeFile(path.join(phpBin, 'php'), '');
  const writeSites = (site) => fs.writeFile(path.join(userData, 'sites.json'), JSON.stringify({ site1: site }));
  await writeSites(rawSite());

  const paths = createAddonPaths(userData);
  const fake = createFakeProcess(options);
  const realStore = createConfigStore({ fs, file: paths.configFile, logger: silentLogger });
  const store = failingStore
    ? { ...realStore, updateSite: async () => { throw new Error('disk full'); } }
    : realStore;
  const service = createLaravelService({
    fs,
    paths,
    homeDir: home,
    runProcess: fake.runProcess,
    composer: { isReady: async () => true, ensure: async () => '/fake/composer.phar' },
    store,
    isPortOpen: async () => options.isDbOnline !== false,
    enqueue: createKeyedQueue(),
    logger: silentLogger,
    now: () => new Date(2026, 10, 7, 12, 0, 0),
    platform: 'linux',
  });
  return { service, fake, store, siteRoot, appDir: path.join(siteRoot, 'app'), writeSites };
}

const FORM = Object.freeze({ laravelMajor: '13', appName: 'Cars App', dbDriver: 'mysql', dbName: 'laravel', shouldMigrate: true });

test('getState reports a WordPress site that is ready for Laravel', async () => {
  const { service } = await setup();
  const state = await service.getState('site1');
  assert.equal(state.laravel, null);
  assert.equal(state.webRoot.hasWordPress, true);
  assert.equal(state.php.version, '8.4.18');
  assert.equal(state.site.db.password, undefined, 'the DB password never reaches the renderer');
  assert.equal(state.isDbOnline, true);
});

test('install moves WordPress aside, installs Laravel into app/ and configures .env', async () => {
  const { service, fake, store, appDir } = await setup();
  const events = [];
  const result = await service.install('site1', FORM, (event) => events.push(event));

  assert.deepEqual(result.warnings, []);
  assert.equal(result.backup, 'public.backup-20261107-120000');
  assert.equal(await fs.readFile(path.join(appDir, 'public.backup-20261107-120000', 'wp-config.php'), 'utf8'), '<?php // wordpress');
  assert.equal(await fs.readFile(path.join(appDir, 'public', 'index.php'), 'utf8'), '<?php // laravel');
  const leftovers = (await fs.readdir(appDir)).filter((name) => name.startsWith('.laravel-install'));
  assert.deepEqual(leftovers, []);

  const env = parseEnv(await fs.readFile(path.join(appDir, '.env'), 'utf8'));
  assert.equal(env.APP_NAME, 'Cars App');
  assert.equal(env.APP_URL, 'http://cars.local');
  assert.equal(env.DB_CONNECTION, 'mysql');
  assert.equal(env.DB_PORT, '10003');
  assert.equal(env.DB_HOST, 'localhost');
  assert.equal(env.DB_SOCKET, path.join(userDataOf(appDir), 'run', 'site1', 'mysql', 'mysqld.sock'));
  assert.equal(env.MAIL_MAILER, 'smtp');
  assert.equal(env.MAIL_PORT, '10001');

  const artisanCommands = fake.calls.filter((call) => call.args[0] === 'artisan').map((call) => call.args[1]);
  assert.deepEqual(artisanCommands, ['key:generate', 'migrate', 'storage:link']);
  assert.ok(fake.calls.every((call) => call.env.LD_LIBRARY_PATH.includes('shared-libs')));

  const doneSteps = events.filter((e) => e.type === 'step' && e.status === 'done').map((e) => e.step);
  assert.deepEqual(doneSteps, ['composer', 'create-project', 'web-root', 'configure', 'migrate', 'storage-link']);
  assert.ok(events.some((e) => e.type === 'line' && e.line === 'Installing laravel/laravel'));

  const record = await store.getSite('site1');
  assert.equal(record.autoSync, true);
  assert.ok(record.movedEntries.includes('artisan'));

  const state = await service.getState('site1');
  assert.equal(state.laravel.version, '13.17.0');
  assert.equal(state.laravel.isManaged, true);
  assert.deepEqual(state.laravel.pendingSync, []);
});

test('install refuses when preflight fails and leaves the site untouched', async () => {
  const { service, appDir } = await setup({ isDbOnline: false });
  await assert.rejects(service.install('site1', FORM, () => {}), /Start the site/);
  assert.deepEqual((await fs.readdir(path.join(appDir, 'public'))), ['wp-config.php']);
});

test('a failed migration is a warning, not a failed install', async () => {
  const { service } = await setup({ failArtisan: ['migrate'] });
  const events = [];
  const result = await service.install('site1', FORM, (event) => events.push(event));
  assert.equal(result.warnings.length, 1);
  assert.ok(events.some((e) => e.step === 'migrate' && e.status === 'warning'));
});

test('a failed install-record write is reported as a warning, not a failed install', async () => {
  const { service, appDir } = await setup({ failStoreWrites: true });
  const events = [];
  const result = await service.install('site1', FORM, (event) => events.push(event));
  assert.match(result.warnings[0], /disk full.*public\.backup-20261107-120000/);
  assert.ok(events.some((e) => e.step === 'web-root' && e.status === 'warning'));
  assert.ok(events.some((e) => e.step === 'storage-link' && e.status === 'done'), 'the remaining steps still run');
  assert.equal(await fs.readFile(path.join(appDir, 'public', 'index.php'), 'utf8'), '<?php // laravel');
});

test('a migration that times out is a warning too', async () => {
  const { service } = await setup({ timeoutArtisan: ['migrate'] });
  const events = [];
  const result = await service.install('site1', FORM, (event) => events.push(event));
  assert.match(result.warnings[0], /Migrations failed \(Timed out/);
  assert.ok(events.some((e) => e.step === 'storage-link' && e.status === 'done'));
});

test('syncEnv follows Local when ports change, and auto-sync runs on site start', async () => {
  const { service, appDir, writeSites } = await setup();
  await service.install('site1', FORM, () => {});
  const moved = rawSite();
  const changed = {
    ...moved,
    services: { ...moved.services, mysql: { ...moved.services.mysql, ports: { MYSQL: [10099] } } },
  };
  await writeSites(changed);
  const state = await service.getState('site1');
  assert.deepEqual(state.laravel.pendingSync, [{ key: 'DB_PORT', from: '10003', to: '10099' }]);

  const { changes } = await service.syncEnv('site1');
  assert.equal(changes.length, 1);
  assert.equal(parseEnv(await fs.readFile(path.join(appDir, '.env'), 'utf8')).DB_PORT, '10099');

  await service.handleSiteStarted({ ...changed, services: { ...changed.services, mailpit: { name: 'mailpit', ports: { SMTP: [10055] } } } });
  assert.equal(parseEnv(await fs.readFile(path.join(appDir, '.env'), 'utf8')).MAIL_PORT, '10055');

  await service.setAutoSync('site1', false);
  await service.handleSiteStarted({ ...changed, services: { ...changed.services, mailpit: { name: 'mailpit', ports: { SMTP: [10077] } } } });
  assert.equal(parseEnv(await fs.readFile(path.join(appDir, '.env'), 'utf8')).MAIL_PORT, '10055');
});

test('runArtisan streams output and rejects unsafe commands', async () => {
  const { service, fake } = await setup();
  await service.install('site1', FORM, () => {});
  const lines = [];
  const result = await service.runArtisan('site1', 'php artisan make:model "Blog Post"', (event) => lines.push(event.line));
  assert.equal(result.exitCode, 0);
  assert.equal(lines[0], '$ php artisan make:model Blog Post');
  const last = fake.calls[fake.calls.length - 1];
  assert.deepEqual(last.args, ['artisan', 'make:model', 'Blog Post', '--no-interaction', '--no-ansi']);
  assert.throws(() => service.runArtisan('site1', 'serve', () => {}), /site shell/i);
});

test('database commands on a stopped site fail fast with a plain message', async () => {
  const stopped = await setup({ isDbOnline: false });
  await stopped.service.install('site1', { ...FORM, shouldMigrate: false }, () => {});
  const callsBefore = stopped.fake.calls.length;
  await assert.rejects(stopped.service.runArtisan('site1', 'migrate --force', () => {}), /MySQL for "cars" isn't running\. Start the site/);
  assert.equal(stopped.fake.calls.length, callsBefore, 'PHP is not even started');
  const result = await stopped.service.runArtisan('site1', 'route:list', () => {});
  assert.equal(result.exitCode, 0, 'non-database commands still run');
});

test('uninstall moves Laravel away and brings WordPress back', async () => {
  const { service, store, appDir } = await setup();
  await service.install('site1', FORM, () => {});
  const result = await service.uninstall('site1');
  assert.equal(result.isRestored, true);
  assert.equal(await fs.readFile(path.join(appDir, 'public', 'wp-config.php'), 'utf8'), '<?php // wordpress');
  assert.ok((await fs.readdir(path.join(appDir, result.removedDir))).includes('artisan'));
  assert.ok((await fs.readdir(appDir)).includes('sql'), "Local's own folders stay put");
  assert.equal(await store.getSite('site1'), null);
  assert.equal((await service.getState('site1')).laravel, null);
});

test('uninstall refuses Laravel apps the add-on did not install', async () => {
  const { service } = await setup();
  await assert.rejects(service.uninstall('site1'), /installed by this add-on/);
});
