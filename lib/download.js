'use strict';

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const { MAX_REDIRECTS, DOWNLOAD_IDLE_TIMEOUT_MS, MAX_TEXT_RESPONSE_BYTES } = require('./constants');

const USER_AGENT = 'local-addon-laravel';

/** GET over HTTPS only, following redirects. Resolves with the final response stream. */
function openStream(url, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    if (new URL(url).protocol !== 'https:') {
      reject(new Error(`Refusing to download over an insecure connection: ${url}`));
      return;
    }
    const request = https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (response) => {
      const { statusCode, headers } = response;
      if (statusCode >= 300 && statusCode < 400 && headers.location) {
        response.resume();
        if (redirectsLeft <= 0) {
          reject(new Error('Download failed: too many redirects.'));
          return;
        }
        openStream(new URL(headers.location, url).toString(), redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with HTTP ${statusCode} for ${url}`));
        return;
      }
      resolve(response);
    });
    request.setTimeout(DOWNLOAD_IDLE_TIMEOUT_MS, () => request.destroy(new Error('the connection stalled')));
    request.on('error', (error) => reject(new Error(`Download failed: ${error.message}`)));
  });
}

async function fetchText(url) {
  const stream = await openStream(url);
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_TEXT_RESPONSE_BYTES) {
      stream.destroy();
      throw new Error('Download failed: response was unexpectedly large.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Streams a URL to disk while hashing it. Resolves with the SHA-256 hex digest. */
async function downloadFile(url, destination) {
  const response = await openStream(url);
  const hash = crypto.createHash('sha256');
  const file = fs.createWriteStream(destination);
  return new Promise((resolve, reject) => {
    const fail = (error) => {
      response.destroy();
      file.destroy();
      reject(new Error(`Download failed: ${error.message}`));
    };
    response.on('data', (chunk) => hash.update(chunk));
    response.on('error', fail);
    file.on('error', fail);
    file.on('finish', () => resolve(hash.digest('hex')));
    response.pipe(file);
  });
}

module.exports = { fetchText, downloadFile };
