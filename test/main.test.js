'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const LaravelAddonMain = require('../lib/main');
const { buildRoutes, registerIpcHandlers } = require('../lib/ipc');
const { IPC } = require('../lib/constants');
const { makeTempDir, silentLogger } = require('./fixtures');

function fakeIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    removeHandler: (channel) => handlers.delete(channel),
    handle: (channel, handler) => handlers.set(channel, handler),
  };
}

test('main registers every IPC channel and the site hooks', async () => {
  const userDataPath = await makeTempDir();
  const ipcMain = fakeIpcMain();
  const actions = {};
  // eslint-disable-next-line no-new
  new LaravelAddonMain({
    electron: { ipcMain },
    hooks: { addAction: (name, fn) => { actions[name] = fn; } },
    environment: { userDataPath, version: '9.2.5' },
  });
  const expected = Object.values(IPC).filter((channel) => channel !== IPC.OUTPUT).sort();
  assert.deepEqual([...ipcMain.handlers.keys()].sort(), expected);
  assert.deepEqual(Object.keys(actions).sort(), ['siteDeleted', 'siteStarted']);
  await actions.siteStarted({ id: 'unknown' });
  await actions.siteDeleted('unknown');
  const log = await fs.readFile(path.join(userDataPath, 'laravel', 'addon.log'), 'utf8');
  assert.match(log, /Laravel add-on loaded \(Local 9\.2\.5\)/);
});

test('IPC handlers validate payloads, forward output and clean up errors', async () => {
  const sent = [];
  const event = { sender: { isDestroyed: () => false, send: (channel, payload) => sent.push([channel, payload]) } };
  const service = {
    getState: async (siteId) => ({ siteId }),
    install: async (siteId, options, emit) => { emit({ type: 'line', line: 'hi' }); return undefined; },
    syncEnv: async () => { throw new Error('No .env'); },
  };
  const ipcMain = fakeIpcMain();
  registerIpcHandlers(ipcMain, service, silentLogger);

  assert.deepEqual(await ipcMain.handlers.get(IPC.GET_STATE)(event, { siteId: 's1' }), { siteId: 's1' });
  assert.equal(await ipcMain.handlers.get(IPC.INSTALL)(event, { siteId: 's1', options: {} }), null);
  assert.deepEqual(sent, [[IPC.OUTPUT, { siteId: 's1', type: 'line', line: 'hi' }]]);
  await assert.rejects(ipcMain.handlers.get(IPC.SYNC_ENV)(event, { siteId: 's1' }), /No \.env/);
  await assert.rejects(ipcMain.handlers.get(IPC.GET_STATE)(event, null), /Invalid request/);
  assert.equal(Object.keys(buildRoutes(service)).length, 6);
});
