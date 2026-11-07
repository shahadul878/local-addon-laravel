'use strict';

const { IPC } = require('./constants');

function requireObject(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid request.');
  }
  return payload;
}

/** Streams step/line events for one site back to the window that asked. */
function outputSender(event, siteId) {
  return (output) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send(IPC.OUTPUT, { siteId, ...output });
    }
  };
}

/** Maps each IPC channel to a service call. Payloads are validated again inside the service. */
function buildRoutes(service) {
  return {
    [IPC.GET_STATE]: (_event, { siteId }) => service.getState(siteId),
    [IPC.INSTALL]: (event, { siteId, options }) => service.install(siteId, options, outputSender(event, siteId)),
    [IPC.SYNC_ENV]: (_event, { siteId }) => service.syncEnv(siteId),
    [IPC.SET_AUTO_SYNC]: (_event, { siteId, autoSync }) => service.setAutoSync(siteId, autoSync),
    [IPC.RUN_ARTISAN]: (event, { siteId, command }) => service.runArtisan(siteId, command, outputSender(event, siteId)),
    [IPC.UNINSTALL]: (_event, { siteId }) => service.uninstall(siteId),
  };
}

function registerIpcHandlers(ipcMain, service, logger) {
  Object.entries(buildRoutes(service)).forEach(([channel, route]) => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (event, payload) => {
      try {
        const result = await route(event, requireObject(payload));
        return result === undefined ? null : result;
      } catch (error) {
        logger.error(`${channel} failed`, error);
        throw new Error(error.message || 'Unexpected Laravel add-on error.');
      }
    });
  });
}

module.exports = { registerIpcHandlers, buildRoutes };
