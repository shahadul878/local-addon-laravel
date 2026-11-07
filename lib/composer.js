'use strict';

const path = require('path');
const { COMPOSER_URL, COMPOSER_SHA_URL } = require('./constants');

const SHA256_PATTERN = /\b([a-f0-9]{64})\b/i;

/**
 * Keeps a private, checksum-verified composer.phar. Composer always runs on the *site's* PHP,
 * so dependency resolution matches what PHP-FPM will run (a system Composer may use another PHP).
 */
function createComposer({ fs, pharPath, fetchText, downloadFile, logger }) {
  async function isReady() {
    try {
      await fs.access(pharPath);
      return true;
    } catch {
      return false;
    }
  }

  let inFlight = null;

  /** Concurrent installs on different sites share one download. */
  function ensure() {
    if (!inFlight) {
      inFlight = download().finally(() => { inFlight = null; });
    }
    return inFlight;
  }

  async function download() {
    if (await isReady()) {
      return pharPath;
    }
    await fs.mkdir(path.dirname(pharPath), { recursive: true });
    const partial = `${pharPath}.download`;
    try {
      const shaText = await fetchText(COMPOSER_SHA_URL);
      const match = SHA256_PATTERN.exec(shaText);
      if (!match) {
        throw new Error('getcomposer.org returned an unreadable checksum.');
      }
      const actual = await downloadFile(COMPOSER_URL, partial);
      if (actual.toLowerCase() !== match[1].toLowerCase()) {
        throw new Error('The downloaded composer.phar failed its SHA-256 check and was discarded.');
      }
      await fs.rename(partial, pharPath);
      logger.info(`Downloaded Composer to ${pharPath}`);
      return pharPath;
    } catch (error) {
      await fs.rm(partial, { force: true });
      throw new Error(`Could not download Composer: ${error.message}`);
    }
  }

  return { isReady, ensure, pharPath };
}

module.exports = { createComposer };
