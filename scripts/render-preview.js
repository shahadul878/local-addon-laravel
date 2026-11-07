#!/usr/bin/env node
'use strict';

/**
 * Renders scripts/social-preview.html to docs/social-preview.png (1280×640) with headless Chrome.
 * Set CHROME to point at a Chrome/Chromium binary if it isn't on the PATH as google-chrome.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(__dirname, 'social-preview.html');
const OUTPUT = path.join(ROOT, 'docs', 'social-preview.png');
const WIDTH = 1280;
const HEIGHT = 640;
const FONT_WAIT_MS = 8000;

const chrome = process.env.CHROME || 'google-chrome';
execFileSync(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  `--window-size=${WIDTH},${HEIGHT}`,
  `--virtual-time-budget=${FONT_WAIT_MS}`,
  '--allow-file-access-from-files',
  `--screenshot=${OUTPUT}`,
  `file://${SOURCE}`,
], { stdio: 'inherit' });
process.stdout.write(`Wrote ${path.relative(ROOT, OUTPUT)}\n`);
