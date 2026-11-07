#!/usr/bin/env node
'use strict';

/**
 * Installs this add-on into Local's add-ons folder and enables it.
 *
 *   node scripts/install-addon.js          copy lib/, assets/ and package.json
 *   node scripts/install-addon.js --link   symlink the folder (for development)
 *   node scripts/install-addon.js --remove remove it and disable it
 *
 * Restart Local afterwards. LOCAL_USER_DATA overrides the Local data folder.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const pkg = require('../package.json');

const SOURCE = path.resolve(__dirname, '..');
const COPIED = Object.freeze(['package.json', 'lib', 'assets', 'README.md', 'LICENSE']);

function localUserData() {
  if (process.env.LOCAL_USER_DATA) {
    return process.env.LOCAL_USER_DATA;
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Local');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Local');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'Local');
}

function setEnabled(userData, isEnabled) {
  const file = path.join(userData, 'enabled-addons.json');
  let current = {};
  try {
    current = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Could not read ${file}: ${error.message}`);
    }
  }
  const { [pkg.name]: _previous, ...others } = current;
  const next = isEnabled ? { ...others, [pkg.name]: true } : others;
  fs.writeFileSync(file, JSON.stringify(next));
}

function main() {
  const mode = process.argv[2] || '--copy';
  const userData = localUserData();
  const target = path.join(userData, 'addons', pkg.name);
  if (!fs.existsSync(userData)) {
    throw new Error(`Local's data folder was not found at ${userData}. Is Local installed?`);
  }
  fs.rmSync(target, { recursive: true, force: true });

  if (mode === '--remove') {
    setEnabled(userData, false);
    process.stdout.write(`Removed ${target}. Restart Local.\n`);
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (mode === '--link') {
    fs.symlinkSync(SOURCE, target, process.platform === 'win32' ? 'junction' : 'dir');
  } else {
    COPIED.filter((entry) => fs.existsSync(path.join(SOURCE, entry)))
      .forEach((entry) => fs.cpSync(path.join(SOURCE, entry), path.join(target, entry), { recursive: true }));
  }
  setEnabled(userData, true);
  process.stdout.write(`Installed ${pkg.productName} add-on to ${target}${mode === '--link' ? ' (linked)' : ''}. Restart Local to load it.\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
