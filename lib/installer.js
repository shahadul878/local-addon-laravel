'use strict';

const path = require('path');
const { CREATE_PROJECT_TIMEOUT_MS, ARTISAN_TIMEOUT_MS, QUICK_COMMAND_TIMEOUT_MS } = require('./constants');
const { assertSuccess } = require('./processRunner');
const { buildInstallEnv } = require('./laravelConfig');
const { parseEnv, updateEnv } = require('./envFile');
const {
  moveWebRootAside, restoreWebRoot, moveEntries, readTextOrNull, writeFileAtomic,
} = require('./project');
const { timestamp } = require('./paths');

/** Wraps a step so the renderer sees running → done / skipped / warning / failed. */
function createStepRunner(emit) {
  return async function step(id, task) {
    emit({ type: 'step', step: id, status: 'running' });
    try {
      const result = (await task()) || {};
      emit({ type: 'step', step: id, status: result.status || 'done', detail: result.detail || null });
      return result;
    } catch (error) {
      emit({ type: 'step', step: id, status: 'failed', detail: error.message });
      throw error;
    }
  };
}

async function createProject({ fs, runPhp, logger }, { php, phar, release, appDir, tmpDir, onLine }) {
  try {
    const result = await runPhp(php, [
      '-d', 'memory_limit=-1', phar, 'create-project', `laravel/laravel:${release.constraint}`, tmpDir,
      '--prefer-dist', '--no-interaction', '--no-progress',
    ], { cwd: appDir, env: { COMPOSER_NO_INTERACTION: '1' }, timeoutMs: CREATE_PROJECT_TIMEOUT_MS, onLine });
    assertSuccess(result);
  } catch (error) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch((rmError) => logger.warn(`Could not remove ${tmpDir}`, rmError));
    throw error;
  }
}

/** Swaps the web root: Laravel's files land in app/, so app/public becomes Laravel's public/. */
async function installIntoApp({ fs, logger }, { sitePaths, tmpDir, stamp }) {
  const backup = await moveWebRootAside(fs, sitePaths, stamp);
  let moved;
  try {
    moved = await moveEntries(fs, tmpDir, sitePaths.appDir);
  } catch (error) {
    const restoreError = await restoreWebRoot(fs, sitePaths, backup).then(() => null, (problem) => problem);
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    if (restoreError) {
      logger.error('Restoring the web root failed', restoreError);
      throw new Error(`${error.message} Putting the previous web root back also failed (${restoreError.message}); it is in app/${backup}.`);
    }
    throw error;
  }
  // The move succeeded; a leftover temp folder is only cosmetic.
  await fs.rm(tmpDir, { recursive: true, force: true }).catch((rmError) => logger.warn(`Could not remove ${tmpDir}`, rmError));
  return { backup, moved };
}

async function configureEnv({ fs }, { site, sitePaths, options }) {
  const existing = await readTextOrNull(fs, sitePaths.envFile);
  const base = existing !== null ? existing : (await readTextOrNull(fs, sitePaths.envExample)) || '';
  const next = updateEnv(base, buildInstallEnv(site, options));
  await writeFileAtomic(fs, sitePaths.envFile, next);
  if (options.dbDriver === 'sqlite') {
    await fs.mkdir(path.dirname(sitePaths.sqliteFile), { recursive: true });
    await fs.writeFile(sitePaths.sqliteFile, '', { flag: 'a' });
  }
  return parseEnv(next);
}

/** A step that may fail without undoing the install; the panel offers to retry it. */
async function softArtisan(artisan, args, onLine, warnings, label) {
  const result = await artisan(args, { onLine, timeoutMs: ARTISAN_TIMEOUT_MS }).catch((error) => ({ exitCode: null, error }));
  if (result.exitCode === 0) {
    return { status: 'done' };
  }
  const reason = result.error ? result.error.message : 'see the output above';
  const detail = `${label} failed (${reason}). You can retry it from the Artisan card.`;
  warnings.push(detail);
  return { status: 'warning', detail };
}

/**
 * Installs Laravel into a Local site. Preflight checks must already have passed.
 *
 * @param {object} deps   { fs, store, composer, runPhp, logger, now }
 * @param {object} target { site, sitePaths, php, artisan }
 * @param {object} options validated install options
 * @param {(event: object) => void} emit progress events for the renderer
 * @returns {Promise<{ warnings: string[], backup: string|null }>}
 */
async function runInstall(deps, { site, sitePaths, php, artisan }, options, emit) {
  const { fs, store, composer, now } = deps;
  const step = createStepRunner(emit);
  const onLine = (line) => emit({ type: 'line', line });
  const stamp = timestamp(now());
  const tmpDir = path.join(sitePaths.appDir, `.laravel-install-${stamp}`);
  const warnings = [];

  const { phar } = await step('composer', async () => ({ phar: await composer.ensure() }));
  await step('create-project', () => createProject(deps, {
    php, phar, release: options.release, appDir: sitePaths.appDir, tmpDir, onLine,
  }));

  const { backup } = await step('web-root', async () => {
    const result = await installIntoApp(deps, { sitePaths, tmpDir, stamp });
    const kept = result.backup ? `Previous web root kept in app/${result.backup}.` : null;
    try {
      await store.updateSite(site.id, () => ({
        installedAt: now().toISOString(),
        laravelMajor: options.release.major,
        movedEntries: result.moved,
        wordpressBackup: result.backup,
        autoSync: true,
      }));
    } catch (error) {
      // The swap already happened; failing here would misreport the install. Warn instead.
      deps.logger.error('Saving the install record failed', error);
      const detail = `Laravel is in place, but the add-on could not save its install record (${error.message}), so "Remove Laravel" won't be offered. ${kept || ''}`.trim();
      warnings.push(detail);
      return { ...result, status: 'warning', detail };
    }
    return { ...result, detail: kept };
  });

  await step('configure', async () => {
    const env = await configureEnv(deps, { site, sitePaths, options });
    if (!env.APP_KEY) {
      assertSuccess(await artisan(['key:generate', '--force'], { onLine, timeoutMs: QUICK_COMMAND_TIMEOUT_MS }));
    }
  });

  await step('migrate', () => (options.shouldMigrate
    ? softArtisan(artisan, ['migrate', '--force'], onLine, warnings, 'Migrations')
    : { status: 'skipped', detail: 'Skipped — run them later from the Artisan card.' }));

  await step('storage-link', () => softArtisan(artisan, ['storage:link', '--force'], onLine, warnings, 'storage:link'));

  return { warnings, backup };
}

module.exports = { runInstall, createStepRunner };
