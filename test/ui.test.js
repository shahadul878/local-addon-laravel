'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { createLaravelPanel } = require('../lib/ui/LaravelPanel');
const { reduceOutput, EMPTY_OUTPUT, cleanErrorMessage, createApi, MAX_CONSOLE_LINES } = require('../lib/ui/api');
const { LARAVEL_VERSIONS, REQUIRED_EXTENSIONS, IPC } = require('../lib/constants');
const rendererEntry = require('../lib/renderer');

const { act } = TestRenderer;
const mounted = [];

// Unmount every panel so its polling timer stops and the test process can exit.
test.after(() => act(() => { mounted.forEach((root) => root.unmount()); }));

function baseState(overrides = {}) {
  return {
    site: {
      id: 'site1', name: 'cars', domain: 'cars.local', url: 'http://cars.local', appDir: '/sites/cars/app', phpVersion: '8.4.18',
      webServer: 'nginx', db: { engine: 'mysql', port: 10003, user: 'root' }, mail: { smtpPort: 10001, webPort: 10000 },
    },
    php: { isFound: true, version: '8.4.18', extensions: [...REQUIRED_EXTENSIONS, 'pdo_mysql', 'pdo_sqlite'], error: null },
    releases: LARAVEL_VERSIONS,
    webRoot: { hasAppDir: true, hasPublic: true, isPublicEmpty: false, hasWordPress: true },
    isDbOnline: true,
    isComposerReady: false,
    laravel: null,
    activeJob: null,
    ...overrides,
  };
}

const installedLaravel = Object.freeze({
  version: '13.17.0', constraint: '^13.0', hasVendor: true, isManaged: true, installedAt: '2026-11-07T12:00:00.000Z', previousWebRoot: 'public.backup-x',
  autoSync: true, pendingSync: [{ key: 'DB_PORT', from: '1', to: '10003' }],
  env: { APP_URL: 'http://cars.local', DB_CONNECTION: 'mysql', DB_PORT: '1' },
});

function fakeApi(state, overrides = {}) {
  const calls = [];
  const record = (name, result) => async (...args) => { calls.push([name, ...args]); return result; };
  return {
    calls,
    getState: async () => state,
    install: record('install', { warnings: [] }),
    syncEnv: record('syncEnv', { changes: [{ key: 'DB_PORT' }] }),
    setAutoSync: record('setAutoSync', null),
    runArtisan: record('runArtisan', { exitCode: 0 }),
    uninstall: record('uninstall', { removedDir: 'laravel-removed-x', isRestored: true }),
    onOutput: () => () => {},
    ...overrides,
  };
}

async function render(state, { confirm = () => true, output = [] } = {}) {
  let emit = () => {};
  const api = fakeApi(state, { onOutput: (_siteId, callback) => { emit = callback; return () => {}; } });
  const opened = [];
  const copied = [];
  const Panel = createLaravelPanel(React, {
    api, clipboard: { writeText: (value) => copied.push(value) }, confirm, shell: { openExternal: (url) => opened.push(url), openPath: (dir) => opened.push(dir) },
  });
  let root;
  await act(async () => { root = TestRenderer.create(React.createElement(Panel, { site: { id: 'site1', name: 'cars' } })); });
  mounted.push(root);
  await act(async () => { output.forEach((line) => emit({ type: 'line', line })); });
  return { root, api, opened, copied };
}

const text = (root) => JSON.stringify(root.toJSON());
const buttonWithText = (root, label) => root.root.findAll((node) => node.type === 'button' && node.props.children === label)[0];

test('install view shows requirements and submits the form', async () => {
  const { root, api } = await render(baseState());
  assert.match(text(root), /Requirements/);
  assert.match(text(root), /WordPress in app\/public will be moved/);
  const form = root.root.findByType('form');
  await act(async () => { form.props.onSubmit({ preventDefault() {} }); });
  assert.equal(api.calls[0][0], 'install');
  assert.deepEqual(api.calls[0][2], { laravelMajor: '13', appName: 'cars', dbDriver: 'mysql', dbName: 'laravel', shouldMigrate: true });
});

test('install view picks Laravel 12 for PHP 8.2 and blocks when nothing fits', async () => {
  const { root } = await render(baseState({ php: { ...baseState().php, version: '8.2.30' } }));
  const radio = root.root.findAll((node) => node.props.role === 'radio' && node.props['aria-checked'] === true)[0];
  assert.equal(radio.props.children, 'Laravel 12');

  const { root: blocked } = await render(baseState({ php: { isFound: false, version: '8.4.18', extensions: [] } }));
  const submit = blocked.root.findAll((node) => node.type === 'button' && node.props.type === 'submit')[0];
  assert.equal(submit.props.disabled, true);
});

test('cancelling the WordPress confirmation does not install', async () => {
  const { root, api } = await render(baseState(), { confirm: () => false });
  await act(async () => { root.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
  assert.equal(api.calls.length, 0);
});

test('project view shows env drift and wires its actions', async () => {
  const { root, api, opened } = await render(baseState({ laravel: installedLaravel }));
  assert.match(text(root), /Out of sync/);
  await act(async () => { buttonWithText(root, 'Update .env').props.onClick(); });
  await act(async () => { buttonWithText(root, 'migrate:status').props.onClick(); });
  await act(async () => { buttonWithText(root, 'migrate').props.onClick(); });
  await act(async () => { buttonWithText(root, 'Open site').props.onClick(); });
  await act(async () => { buttonWithText(root, 'Remove Laravel').props.onClick(); });
  assert.deepEqual(api.calls.map((call) => call[0]), ['syncEnv', 'runArtisan', 'runArtisan', 'uninstall']);
  assert.deepEqual(api.calls[2], ['runArtisan', 'site1', 'migrate --force'], 'migrate can create a missing database');
  assert.deepEqual(api.calls[1], ['runArtisan', 'site1', 'migrate:status']);
  assert.deepEqual(opened, ['http://cars.local']);
  assert.match(text(root), /laravel-removed-x/);
});

test('the console has a copy button for its output', async () => {
  const { root, copied } = await render(baseState({ laravel: installedLaravel }), { output: ['$ php artisan migrate', 'SQLSTATE[HY000] [1130]'] });
  const copy = root.root.findAll((node) => node.type === 'button' && node.props.title === 'Copy the terminal output')[0];
  await act(async () => { copy.props.onClick(); });
  assert.deepEqual(copied, ['$ php artisan migrate\nSQLSTATE[HY000] [1130]']);
  assert.match(text(root), /Copied ✓/);

  const { root: empty } = await render(baseState({ laravel: installedLaravel }));
  assert.equal(empty.root.findAll((node) => node.props.title === 'Copy the terminal output').length, 0, 'hidden while empty');
});

test('reduceOutput appends immutably and caps the console', () => {
  const one = reduceOutput(EMPTY_OUTPUT, { type: 'line', line: 'a' });
  assert.deepEqual(EMPTY_OUTPUT.lines, []);
  assert.deepEqual(one.lines, ['a']);
  const stepped = reduceOutput(one, { type: 'step', step: 'composer', status: 'done' });
  assert.deepEqual(stepped.steps.composer, { status: 'done', detail: null });
  const full = Array.from({ length: MAX_CONSOLE_LINES + 5 }).reduce((s, _x, i) => reduceOutput(s, { type: 'line', line: String(i) }), EMPTY_OUTPUT);
  assert.equal(full.lines.length, MAX_CONSOLE_LINES);
  assert.equal(reduceOutput(one, { type: 'other' }), one);
});

test('api strips Electron error prefixes and filters output by site', async () => {
  assert.equal(cleanErrorMessage(new Error("Error invoking remote method 'x': Error: Nope")), 'Nope');
  const listeners = [];
  const ipc = {
    invoke: async () => { throw new Error("Error invoking remote method 'x': Error: Bad"); },
    on: (_channel, listener) => listeners.push(listener),
    removeListener: () => {},
  };
  const api = createApi(ipc);
  await assert.rejects(api.getState('site1'), /^Error: Bad$/);
  const seen = [];
  api.onOutput('site1', (output) => seen.push(output.line));
  listeners[0]({}, { siteId: 'other', line: 'x' });
  listeners[0]({}, { siteId: 'site1', line: 'y' });
  assert.deepEqual(seen, ['y']);
});

test('renderer entry registers a Laravel tools tab', () => {
  let filter;
  rendererEntry({ React, hooks: { addFilter: (_name, fn) => { filter = fn; } }, electron: { ipcRenderer: { invoke() {}, on() {}, removeListener() {} }, clipboard: {}, shell: {} } });
  const items = filter([{ path: '/x' }], { routeChildrenProps: { site: { id: 's', name: 'n' } } });
  assert.equal(items[1].menuItem, 'Laravel');
  assert.equal(filter([], {}).length, 0);
  assert.ok(IPC.GET_STATE.startsWith('laraveladdon:'));
});
