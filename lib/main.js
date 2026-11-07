'use strict';

const fs = require('fs/promises');
const os = require('os');
const { createAddonPaths } = require('./paths');
const { createLogger, createKeyedQueue, isPortOpen } = require('./infra');
const { createConfigStore } = require('./configStore');
const { createComposer } = require('./composer');
const { fetchText, downloadFile } = require('./download');
const { runProcess } = require('./processRunner');
const { createLaravelService } = require('./laravelService');
const { registerIpcHandlers } = require('./ipc');

function buildService(userDataPath) {
  const paths = createAddonPaths(userDataPath);
  const logger = createLogger(paths.logFile);
  const service = createLaravelService({
    fs,
    paths,
    homeDir: os.homedir(),
    runProcess,
    composer: createComposer({
      fs, pharPath: paths.composerPhar, fetchText, downloadFile, logger,
    }),
    store: createConfigStore({ fs, file: paths.configFile, logger }),
    isPortOpen,
    enqueue: createKeyedQueue(),
    logger,
  });
  return { service, logger };
}

/** Main-process entry point. Local instantiates this with `new`, so it must be a regular function. */
module.exports = function LaravelAddonMain(context) {
  const { electron, hooks, environment } = context;
  const { service, logger } = buildService(environment.userDataPath);

  registerIpcHandlers(electron.ipcMain, service, logger);
  hooks.addAction('siteStarted', (site) => service.handleSiteStarted(site));
  hooks.addAction('siteDeleted', (siteId) => service.handleSiteDeleted(typeof siteId === 'string' ? siteId : siteId && siteId.id));

  logger.info(`Laravel add-on loaded (Local ${environment.version})`);
};
