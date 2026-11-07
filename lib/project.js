'use strict';

const path = require('path');

const WORDPRESS_MARKERS = Object.freeze(['wp-config.php', 'wp-load.php', 'wp-settings.php']);
const VERSION_PATTERN = /const VERSION = '([^']+)'/;

async function listDir(fs, dir) {
  try {
    return await fs.readdir(dir);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function readTextOrNull(fs, file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/** What currently sits in Local's web root (<site>/app/public). */
async function inspectWebRoot(fs, sitePaths) {
  const [appEntries, publicEntries] = await Promise.all([listDir(fs, sitePaths.appDir), listDir(fs, sitePaths.publicDir)]);
  return Object.freeze({
    hasAppDir: appEntries !== null,
    hasPublic: publicEntries !== null,
    isPublicEmpty: !publicEntries || publicEntries.length === 0,
    hasWordPress: Boolean(publicEntries) && WORDPRESS_MARKERS.some((marker) => publicEntries.includes(marker)),
  });
}

/** Detects a Laravel app in <site>/app — whether this add-on installed it or not. */
async function detectLaravel(fs, sitePaths) {
  const composerText = await readTextOrNull(fs, sitePaths.composerJson);
  if (composerText === null || (await listDir(fs, sitePaths.appDir) || []).indexOf('artisan') === -1) {
    return null;
  }
  let requires;
  try {
    requires = JSON.parse(composerText).require || {};
  } catch {
    return null;
  }
  if (!requires['laravel/framework']) {
    return null;
  }
  const source = await readTextOrNull(fs, sitePaths.frameworkApplication);
  const match = source ? VERSION_PATTERN.exec(source) : null;
  return Object.freeze({
    version: match ? match[1] : null,
    constraint: String(requires['laravel/framework']),
    hasVendor: source !== null,
  });
}

/**
 * Moves the current web root aside so Laravel's public/ can take its place.
 * Nothing is deleted: a non-empty folder is renamed to public.backup-<stamp>.
 * @returns {Promise<string|null>} the backup folder name (relative to app/), or null if there was nothing to keep
 */
async function moveWebRootAside(fs, sitePaths, stamp) {
  const entries = await listDir(fs, sitePaths.publicDir);
  if (entries === null) {
    return null;
  }
  if (entries.length === 0) {
    await fs.rmdir(sitePaths.publicDir);
    return null;
  }
  const backupName = `public.backup-${stamp}`;
  await fs.rename(sitePaths.publicDir, path.join(sitePaths.appDir, backupName));
  return backupName;
}

/** Puts a backed-up web root back (or leaves an empty public/ so the web server still has a root). */
async function restoreWebRoot(fs, sitePaths, backupName) {
  if (await listDir(fs, sitePaths.publicDir) !== null) {
    throw new Error('app/public already exists, so the previous web root was not restored.');
  }
  const backupPath = backupName ? path.join(sitePaths.appDir, backupName) : null;
  if (backupPath && await listDir(fs, backupPath) !== null) {
    await fs.rename(backupPath, sitePaths.publicDir);
    return true;
  }
  await fs.mkdir(sitePaths.publicDir);
  return false;
}

/**
 * Renames every entry of `fromDir` into `toDir`. Refuses up front if any name already exists,
 * and moves everything back if a rename fails midway.
 * @returns {Promise<string[]>} the moved entry names
 */
async function moveEntries(fs, fromDir, toDir, names = null) {
  const entries = names || await fs.readdir(fromDir);
  const existing = new Set(await fs.readdir(toDir));
  const conflicts = entries.filter((name) => existing.has(name));
  if (conflicts.length) {
    throw new Error(`These already exist in ${toDir}: ${conflicts.join(', ')}. Move them away and try again.`);
  }
  const moved = [];
  try {
    for (const name of entries) {
      // eslint-disable-next-line no-await-in-loop
      await fs.rename(path.join(fromDir, name), path.join(toDir, name));
      moved.push(name);
    }
  } catch (error) {
    const stuck = (await Promise.all(moved.map((name) => fs.rename(path.join(toDir, name), path.join(fromDir, name))
      .then(() => null, () => name)))).filter(Boolean);
    const suffix = stuck.length ? ` Could not move these back, so they are still in ${toDir}: ${stuck.join(', ')}.` : '';
    throw new Error(`${error.message}${suffix}`);
  }
  return Object.freeze([...moved]);
}

let atomicCounter = 0;

/** Writes via a uniquely named temp file + rename, keeping the original file's permissions. */
async function writeFileAtomic(fs, file, content) {
  atomicCounter += 1;
  const temp = `${file}.${process.pid}-${Date.now()}-${atomicCounter}.tmp`;
  const mode = await fs.stat(file).then((stats) => stats.mode, () => undefined);
  try {
    await fs.writeFile(temp, content, mode === undefined ? undefined : { mode });
    await fs.rename(temp, file);
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

module.exports = {
  inspectWebRoot, detectLaravel, moveWebRootAside, restoreWebRoot, moveEntries, listDir, readTextOrNull, writeFileAtomic,
};
