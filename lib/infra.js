'use strict';

const fs = require('fs');
const net = require('net');
const path = require('path');
const { PORT_PROBE_TIMEOUT_MS } = require('./constants');

/**
 * Per-key serial queues: jobs for the same site run one at a time, in call order,
 * while different sites stay independent. A failed job doesn't block the next one.
 */
function createKeyedQueue() {
  const tails = new Map();
  return function enqueue(key, task) {
    const previous = tails.get(key) || Promise.resolve();
    const run = previous.then(task);
    const tail = run.catch(() => undefined);
    tails.set(key, tail);
    tail.then(() => {
      if (tails.get(key) === tail) {
        tails.delete(key);
      }
    });
    return run;
  };
}

/** True when something accepts TCP connections on host:port (used to see if a site's MySQL is up). */
function isPortOpen(host, port, timeoutMs = PORT_PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (isOpen) => {
      socket.destroy();
      resolve(isOpen);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

const MAX_LOG_BYTES = 1024 * 1024;

/** File logger for the main process (Local doesn't hand add-ons its logger). Rotates at 1 MB. */
function createLogger(logFile) {
  let isReady = false;
  function write(level, message, error) {
    try {
      if (!isReady) {
        fs.mkdirSync(path.dirname(logFile), { recursive: true });
        isReady = true;
      }
      if (fs.existsSync(logFile) && fs.statSync(logFile).size > MAX_LOG_BYTES) {
        fs.renameSync(logFile, `${logFile}.1`);
      }
      const detail = error ? ` | ${error.stack || error.message || String(error)}` : '';
      fs.appendFileSync(logFile, `${new Date().toISOString()} [${level}] ${message}${detail}\n`);
    } catch (writeError) {
      process.stderr.write(`[local-addon-laravel] ${level}: ${message} (log write failed: ${writeError.message})\n`);
    }
  }
  return {
    info: (message) => write('info', message),
    warn: (message, error) => write('warn', message, error),
    error: (message, error) => write('error', message, error),
  };
}

module.exports = { createKeyedQueue, isPortOpen, createLogger };
