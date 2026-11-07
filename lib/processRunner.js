'use strict';

const { spawn } = require('child_process');
const { MAX_CAPTURED_OUTPUT_CHARS } = require('./constants');

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const LINE_BREAK = /\r\n|\r|\n/;
const KILL_GRACE_MS = 3000;
const ERROR_TAIL_LINES = 12;
const IS_WINDOWS = process.platform === 'win32';

function stripAnsi(text) {
  return text.replace(ANSI_PATTERN, '');
}

/** Keeps only the newest `limit` characters so a chatty process can't exhaust memory. */
function appendCapped(existing, addition, limit = MAX_CAPTURED_OUTPUT_CHARS) {
  const combined = existing + addition;
  return combined.length > limit ? combined.slice(combined.length - limit) : combined;
}

function createLineSplitter(onLine) {
  let pending = '';
  return {
    push(chunk) {
      const parts = (pending + chunk).split(LINE_BREAK);
      pending = parts.pop();
      parts.forEach((line) => onLine(line));
    },
    flush() {
      if (pending) {
        onLine(pending);
      }
      pending = '';
    },
  };
}

/** Kills the process *and* what it spawned (Composer runs `php artisan` children). */
function killTree(child, signal) {
  try {
    if (IS_WINDOWS) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      process.kill(-child.pid, signal);
    }
  } catch {
    // The process group is already gone.
  }
}

/**
 * Spawns a program with an argument array — never through a shell, so arguments can't inject
 * commands — and streams its combined stdout/stderr line by line. stdin is closed so a command
 * that prompts fails instead of waiting forever.
 *
 * Resolves with the exit code and captured output. Rejects if it can't start, or on timeout —
 * and then only after the whole process tree has exited, so callers can clean up safely.
 *
 * @param {string} file
 * @param {string[]} args
 * @param {{ cwd?: string, env?: Record<string,string>, timeoutMs?: number, onLine?: (line: string) => void }} [options]
 * @returns {Promise<{ exitCode: number|null, output: string }>}
 */
function runProcess(file, args, options = {}) {
  const onLine = options.onLine || (() => {});
  return new Promise((resolve, reject) => {
    let output = '';
    let isTimedOut = false;
    let hardKill = null;
    const splitter = createLineSplitter((line) => onLine(line));
    const child = spawn(file, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: !IS_WINDOWS, // own process group, so a timeout can stop grandchildren too
      windowsHide: true,
      shell: false,
    });

    const timer = options.timeoutMs ? setTimeout(() => {
      isTimedOut = true;
      killTree(child, 'SIGTERM');
      hardKill = setTimeout(() => killTree(child, 'SIGKILL'), KILL_GRACE_MS);
    }, options.timeoutMs) : null;

    const onData = (chunk) => {
      const text = stripAnsi(chunk.toString('utf8'));
      output = appendCapped(output, text);
      splitter.push(text);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`Could not start ${file}: ${error.message}`));
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      clearTimeout(hardKill);
      splitter.flush();
      if (isTimedOut) {
        reject(Object.assign(new Error(`Timed out after ${Math.round(options.timeoutMs / 1000)} s.`), { output, isTimeout: true }));
        return;
      }
      resolve({ exitCode, output });
    });
  });
}

/** Throws with the last lines of output when a finished process didn't exit with 0. */
function assertSuccess(result) {
  if (result.exitCode !== 0) {
    const tail = result.output.trim().split(LINE_BREAK).slice(-ERROR_TAIL_LINES).join('\n');
    throw Object.assign(new Error(tail || `Exited with code ${result.exitCode}.`), { output: result.output, exitCode: result.exitCode });
  }
  return result;
}

module.exports = { runProcess, assertSuccess, stripAnsi, appendCapped, createLineSplitter };
