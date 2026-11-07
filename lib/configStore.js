'use strict';

const path = require('path');
const { writeFileAtomic } = require('./project');

const EMPTY = Object.freeze({ version: 1, sites: Object.freeze({}) });

function isValidShape(data) {
  return Boolean(data) && typeof data === 'object' && Boolean(data.sites) && typeof data.sites === 'object';
}

/**
 * Per-site records for this add-on, stored as JSON. Updates are serialised through one chain
 * (so concurrent jobs on different sites can't overwrite each other), written atomically,
 * and every update produces a new object instead of mutating the cached one.
 *
 * A record looks like:
 *   { installedAt, laravelMajor, movedEntries: string[], wordpressBackup: string|null, autoSync: boolean }
 */
function createConfigStore({ fs, file, logger }) {
  let cache = null;
  let writes = Promise.resolve();

  async function load() {
    if (cache) {
      return cache;
    }
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
      if (!isValidShape(parsed)) {
        throw new Error('unexpected structure');
      }
      cache = parsed;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn(`Ignoring unreadable ${file}; it was kept as ${path.basename(file)}.corrupt`, error);
        await fs.rename(file, `${file}.corrupt`).catch(() => undefined);
      }
      cache = EMPTY;
    }
    return cache;
  }

  async function getSite(siteId) {
    await writes;
    const data = await load();
    return Object.prototype.hasOwnProperty.call(data.sites, siteId) ? data.sites[siteId] : null;
  }

  async function applyUpdate(siteId, updater) {
    const data = await load();
    const current = Object.prototype.hasOwnProperty.call(data.sites, siteId) ? data.sites[siteId] : null;
    const nextRecord = updater(current);
    const { [siteId]: _removed, ...others } = data.sites;
    const next = { ...data, sites: nextRecord ? { ...others, [siteId]: nextRecord } : others };
    await fs.mkdir(path.dirname(file), { recursive: true });
    await writeFileAtomic(fs, file, `${JSON.stringify(next, null, 2)}\n`);
    cache = next;
    return nextRecord;
  }

  /** `updater(current|null)` returns the new record, or null to delete it. */
  function updateSite(siteId, updater) {
    const run = writes.then(() => applyUpdate(siteId, updater));
    writes = run.catch(() => undefined);
    return run;
  }

  return { getSite, updateSite };
}

module.exports = { createConfigStore };
