'use strict';

const path = require('path');
const {
  LARAVEL_VERSIONS, LOCALHOST, WATCHED_ENV_KEYS, ARTISAN_TIMEOUT_MS, QUICK_COMMAND_TIMEOUT_MS,
} = require('./constants');
const {
  assertSiteId, assertBoolean, parseInstallOptions, parseArtisanCommand,
} = require('./validation');
const { createSitePaths, timestamp } = require('./paths');
const { readSite, normalizeSite } = require('./sites');
const { resolvePhp, readPhpInfo } = require('./phpRuntime');
const { parseEnv, updateEnv, diffEnv } = require('./envFile');
const { buildSyncEnv } = require('./laravelConfig');
const { buildChecks, hasBlockingCheck } = require('./preflight');
const {
  inspectWebRoot, detectLaravel, restoreWebRoot, moveEntries, readTextOrNull, listDir, writeFileAtomic,
} = require('./project');
const { runInstall } = require('./installer');

/** Artisan commands that always need the database connection. */
const DB_COMMAND_PREFIXES = Object.freeze(['migrate', 'db:', 'schema:', 'model:prune', 'queue:retry', 'queue:flush']);

function pick(values, keys) {
  return Object.freeze(keys.reduce((picked, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? { ...picked, [key]: values[key] } : picked
  ), {}));
}

/**
 * Everything the panel can ask for. Jobs that change a site run one at a time per site.
 * All collaborators are injected so the whole flow can be tested without Local or PHP.
 */
function createLaravelService(deps) {
  const {
    fs, paths, homeDir, runProcess, composer, store, isPortOpen, enqueue, logger, now = () => new Date(), platform = process.platform,
  } = deps;
  const phpInfoCache = new Map();
  const activeJobs = new Map();

  const runPhp = (php, args, options = {}) => runProcess(php.binary, args, {
    ...options, env: { ...php.env, ...(options.env || {}) },
  });
  const artisanFor = (php, sitePaths) => (args, options = {}) => runPhp(php, ['artisan', ...args, '--no-interaction', '--no-ansi'], {
    cwd: sitePaths.appDir, ...options,
  });

  async function loadPhp(site) {
    const php = await resolvePhp({
      fs, lightningServicesDir: paths.lightningServicesDir, version: site.phpVersion, iniPath: paths.phpIni(site.id), platform,
    });
    if (!php) {
      return { runtime: null, summary: { isFound: false, version: site.phpVersion, extensions: [], error: null } };
    }
    const cacheKey = `${php.binary}|${php.env.PHPRC || ''}`;
    if (!phpInfoCache.has(cacheKey)) {
      phpInfoCache.set(cacheKey, readPhpInfo(runProcess, php).catch((error) => {
        phpInfoCache.delete(cacheKey);
        return { error: error.message };
      }));
    }
    const info = await phpInfoCache.get(cacheKey);
    return {
      runtime: php,
      summary: {
        isFound: true, version: info.version || php.version, extensions: info.extensions || [], error: info.error || null,
      },
    };
  }

  /** Local's MySQL socket for the site (none on Windows, where Local's MySQL uses TCP only). */
  function withMysqlSocket(site) {
    if (!site.db || platform === 'win32') {
      return site;
    }
    return Object.freeze({ ...site, db: Object.freeze({ ...site.db, socket: paths.mysqlSocket(site.id) }) });
  }

  async function gatherFacts(siteId, rawSite) {
    assertSiteId(siteId);
    const loaded = rawSite ? normalizeSite(rawSite, homeDir) : await readSite({ fs, sitesFile: paths.sitesFile, homeDir }, siteId);
    const site = withMysqlSocket(loaded);
    const sitePaths = createSitePaths(site.root);
    const [php, webRoot, laravel, isDbOnline, isComposerReady, record] = await Promise.all([
      loadPhp(site),
      inspectWebRoot(fs, sitePaths),
      detectLaravel(fs, sitePaths),
      site.db ? isPortOpen(LOCALHOST, site.db.port) : Promise.resolve(false),
      composer.isReady(),
      store.getSite(siteId),
    ]);
    return {
      site, sitePaths, php, webRoot, laravel, isDbOnline, isComposerReady, record,
    };
  }

  /** Runs a job in the site's queue and reports it as the site's active job meanwhile. */
  function withJob(siteId, kind, task) {
    return enqueue(siteId, async () => {
      activeJobs.set(siteId, kind);
      try {
        return await task();
      } finally {
        activeJobs.delete(siteId);
      }
    });
  }

  function describeLaravel(facts, envValues) {
    const { site, laravel, record } = facts;
    return {
      ...laravel,
      env: envValues ? pick(envValues, WATCHED_ENV_KEYS) : null,
      pendingSync: envValues ? diffEnv(envValues, buildSyncEnv(site, envValues)) : [],
      isManaged: Boolean(record && record.movedEntries),
      installedAt: record ? record.installedAt || null : null,
      previousWebRoot: record ? record.wordpressBackup || null : null,
      autoSync: Boolean(record && record.autoSync),
    };
  }

  async function getState(siteId) {
    const facts = await gatherFacts(siteId);
    const { site, sitePaths, php, webRoot, laravel, isDbOnline, isComposerReady } = facts;
    const envText = laravel ? await readTextOrNull(fs, sitePaths.envFile) : null;
    const publicDb = site.db ? (({ password: _password, ...rest }) => rest)(site.db) : null;
    return {
      site: {
        id: site.id, name: site.name, domain: site.domain, url: site.url, appDir: sitePaths.appDir,
        phpVersion: site.phpVersion, webServer: site.webServer, db: publicDb, mail: site.mail,
      },
      php: php.summary,
      releases: LARAVEL_VERSIONS,
      webRoot,
      isDbOnline,
      isComposerReady,
      laravel: laravel ? describeLaravel(facts, envText === null ? null : parseEnv(envText)) : null,
      activeJob: activeJobs.get(siteId) || null,
    };
  }

  function install(siteId, rawOptions, emit) {
    const options = parseInstallOptions(rawOptions);
    return withJob(siteId, 'install', async () => {
      const facts = await gatherFacts(siteId);
      const checks = buildChecks({
        ...facts, php: facts.php.summary, release: options.release, dbDriver: options.dbDriver, shouldMigrate: options.shouldMigrate,
      });
      if (hasBlockingCheck(checks)) {
        throw new Error(checks.filter((item) => item.status === 'fail').map((item) => item.detail).join(' '));
      }
      const php = facts.php.runtime;
      logger.info(`Installing ${options.release.label} into ${facts.sitePaths.appDir}`);
      const result = await runInstall(
        { fs, store, composer, runPhp, logger, now },
        { site: facts.site, sitePaths: facts.sitePaths, php, artisan: artisanFor(php, facts.sitePaths) },
        options,
        emit,
      );
      logger.info(`Installed Laravel for site ${siteId}${result.warnings.length ? ` with warnings: ${result.warnings.join(' ')}` : ''}`);
      return result;
    });
  }

  async function applySync(facts) {
    const { site, sitePaths } = facts;
    const text = await readTextOrNull(fs, sitePaths.envFile);
    if (text === null) {
      throw new Error('This Laravel app has no .env file.');
    }
    const values = parseEnv(text);
    const updates = buildSyncEnv(site, values);
    const changes = diffEnv(values, updates);
    if (changes.length) {
      await writeFileAtomic(fs, sitePaths.envFile, updateEnv(text, updates));
      const cachedConfig = path.join(sitePaths.appDir, 'bootstrap', 'cache', 'config.php');
      if (facts.php.runtime && await readTextOrNull(fs, cachedConfig) !== null) {
        // A cached config would ignore the new .env values.
        await artisanFor(facts.php.runtime, sitePaths)(['config:clear'], { timeoutMs: QUICK_COMMAND_TIMEOUT_MS });
      }
    }
    return { changes };
  }

  function requireLaravel(facts) {
    if (!facts.laravel) {
      throw new Error('Laravel is not installed in this site.');
    }
    return facts;
  }

  const syncEnv = (siteId) => withJob(siteId, 'sync', async () => applySync(requireLaravel(await gatherFacts(siteId))));

  async function setAutoSync(siteId, autoSync) {
    assertSiteId(siteId);
    assertBoolean(autoSync, 'Auto-sync');
    await store.updateSite(siteId, (current) => ({ ...(current || {}), autoSync }));
  }

  /**
   * Database commands against a stopped site only produce a long PDO stack trace
   * ("[2002] No such file or directory"), so stop early with a plain explanation.
   */
  async function assertDbReachable(facts, commandName) {
    const isDbCommand = DB_COMMAND_PREFIXES.some((prefix) => commandName.toLowerCase().startsWith(prefix));
    if (!isDbCommand || facts.isDbOnline || !facts.site.db) {
      return;
    }
    const envText = await readTextOrNull(fs, facts.sitePaths.envFile);
    const usesLocalMysql = envText !== null && parseEnv(envText).DB_CONNECTION === 'mysql';
    if (usesLocalMysql) {
      const engine = facts.site.db.engine === 'mariadb' ? 'MariaDB' : 'MySQL';
      throw new Error(`${engine} for "${facts.site.name}" isn't running. Start the site in Local ("Start site", top right), then run "${commandName}" again.`);
    }
  }

  function runArtisan(siteId, command, emit) {
    const args = parseArtisanCommand(command);
    return withJob(siteId, 'artisan', async () => {
      const facts = requireLaravel(await gatherFacts(siteId));
      if (!facts.php.runtime) {
        throw new Error(`Local's PHP ${facts.site.phpVersion} build was not found.`);
      }
      await assertDbReachable(facts, args[0]);
      emit({ type: 'line', line: `$ php artisan ${args.join(' ')}` });
      const { exitCode } = await artisanFor(facts.php.runtime, facts.sitePaths)(args, {
        timeoutMs: ARTISAN_TIMEOUT_MS, onLine: (line) => emit({ type: 'line', line }),
      });
      return { exitCode };
    });
  }

  /** Moves the add-on's files to app/laravel-removed-<stamp> and restores the previous web root. Nothing is deleted. */
  function uninstall(siteId) {
    return withJob(siteId, 'uninstall', async () => {
      const facts = await gatherFacts(siteId);
      if (!facts.record || !facts.record.movedEntries) {
        throw new Error('Only a Laravel app installed by this add-on can be removed here.');
      }
      const { appDir } = facts.sitePaths;
      const present = new Set(await listDir(fs, appDir) || []);
      const entries = facts.record.movedEntries.filter((name) => present.has(name));
      const removedName = `laravel-removed-${timestamp(now())}`;
      const removedDir = path.join(appDir, removedName);
      await fs.mkdir(removedDir);
      try {
        await moveEntries(fs, appDir, removedDir, entries);
      } catch (error) {
        await fs.rmdir(removedDir).catch(() => undefined); // only succeeds if nothing was left inside
        throw error;
      }
      const isRestored = await restoreWebRoot(fs, facts.sitePaths, facts.record.wordpressBackup);
      await store.updateSite(siteId, () => null);
      logger.info(`Removed Laravel from site ${siteId}; files kept in ${removedName}`);
      return { removedDir: removedName, isRestored };
    });
  }

  /** Keeps .env in step with Local when a site starts (Local may have reassigned ports). */
  async function handleSiteStarted(rawSite) {
    const siteId = rawSite && rawSite.id;
    try {
      const record = siteId ? await store.getSite(siteId) : null;
      if (!record || !record.autoSync) {
        return;
      }
      await withJob(siteId, 'sync', async () => {
        const facts = await gatherFacts(siteId, rawSite);
        if (facts.laravel) {
          const { changes } = await applySync(facts);
          if (changes.length) {
            logger.info(`Synced .env for ${siteId}: ${changes.map((c) => `${c.key}=${c.to}`).join(', ')}`);
          }
        }
      });
    } catch (error) {
      logger.warn(`Auto-sync failed for site ${siteId}`, error);
    }
  }

  async function handleSiteDeleted(siteId) {
    try {
      await store.updateSite(assertSiteId(siteId), () => null);
    } catch (error) {
      logger.warn(`Could not forget deleted site ${siteId}`, error);
    }
  }

  return {
    getState, install, syncEnv, setAutoSync, runArtisan, uninstall, handleSiteStarted, handleSiteDeleted,
  };
}

module.exports = { createLaravelService };
