'use strict';

const { IPC } = require('../constants');

const REMOTE_ERROR_PREFIX = /^Error invoking remote method '[^']+':\s*(Error:\s*)?/;

/** Electron prefixes errors thrown in ipcMain.handle; strip that so users see our message. */
function cleanErrorMessage(error) {
  const message = (error && error.message) || 'Unexpected error.';
  return message.replace(REMOTE_ERROR_PREFIX, '');
}

/** Promise-based client for the handlers registered in lib/ipc.js. */
function createApi(ipcRenderer) {
  const call = async (channel, payload) => {
    try {
      return await ipcRenderer.invoke(channel, payload);
    } catch (error) {
      throw new Error(cleanErrorMessage(error));
    }
  };

  return {
    getState: (siteId) => call(IPC.GET_STATE, { siteId }),
    install: (siteId, options) => call(IPC.INSTALL, { siteId, options }),
    syncEnv: (siteId) => call(IPC.SYNC_ENV, { siteId }),
    setAutoSync: (siteId, autoSync) => call(IPC.SET_AUTO_SYNC, { siteId, autoSync }),
    runArtisan: (siteId, command) => call(IPC.RUN_ARTISAN, { siteId, command }),
    uninstall: (siteId) => call(IPC.UNINSTALL, { siteId }),
    /** Subscribes to step/line events for one site. Returns an unsubscribe function. */
    onOutput: (siteId, callback) => {
      const listener = (_event, output) => {
        if (output && output.siteId === siteId) {
          callback(output);
        }
      };
      ipcRenderer.on(IPC.OUTPUT, listener);
      return () => ipcRenderer.removeListener(IPC.OUTPUT, listener);
    },
  };
}

const MAX_CONSOLE_LINES = 500;

/** Pure reducer for the live console + install checklist. Never mutates `state`. */
function reduceOutput(state, output) {
  if (output.type === 'line') {
    const lines = [...state.lines, output.line];
    return { ...state, lines: lines.length > MAX_CONSOLE_LINES ? lines.slice(-MAX_CONSOLE_LINES) : lines };
  }
  if (output.type === 'step') {
    return { ...state, steps: { ...state.steps, [output.step]: { status: output.status, detail: output.detail || null } } };
  }
  return state;
}

const EMPTY_OUTPUT = Object.freeze({ lines: Object.freeze([]), steps: Object.freeze({}) });

module.exports = { createApi, cleanErrorMessage, reduceOutput, EMPTY_OUTPUT, MAX_CONSOLE_LINES };
