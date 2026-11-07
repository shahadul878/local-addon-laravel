'use strict';

const path = require('path');
const { QUICK_COMMAND_TIMEOUT_MS } = require('./constants');

/** Folder names Local uses for its PHP builds under lightning-services/php-<v>+<b>/bin/. */
function platformDirs(platform, arch) {
  if (platform === 'darwin') {
    return arch === 'arm64' ? ['darwin-arm64', 'darwin'] : ['darwin'];
  }
  if (platform === 'win32') {
    return ['win64'];
  }
  return ['linux'];
}

function buildNumber(dirName) {
  const plus = dirName.lastIndexOf('+');
  return plus === -1 ? 0 : Number.parseInt(dirName.slice(plus + 1), 10) || 0;
}

async function exists(fs, target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function buildEnv({ binDir, platformDir, platform, iniPath, baseEnv }) {
  const env = { PATH: [binDir, baseEnv.PATH].filter(Boolean).join(path.delimiter) };
  if (iniPath) {
    // PHPRC (not -c) so that PHP processes Composer spawns pick up the same ini.
    env.PHPRC = path.dirname(iniPath);
  }
  if (platform === 'linux') {
    // Local's Linux PHP builds ship their own shared libraries next to the binary.
    env.LD_LIBRARY_PATH = [path.join(platformDir, 'shared-libs'), baseEnv.LD_LIBRARY_PATH].filter(Boolean).join(path.delimiter);
  }
  return Object.freeze(env);
}

/**
 * Finds the PHP CLI binary Local uses for a site's PHP version.
 * @returns {Promise<null | { binary: string, version: string, env: Record<string,string> }>}
 */
async function resolvePhp({
  fs, lightningServicesDir, version, iniPath, platform = process.platform, arch = process.arch, baseEnv = process.env,
}) {
  if (!version) {
    return null;
  }
  let entries;
  try {
    entries = await fs.readdir(lightningServicesDir);
  } catch {
    return null;
  }
  const candidates = entries
    .filter((name) => name.startsWith(`php-${version}+`) || name === `php-${version}`)
    .sort((a, b) => buildNumber(b) - buildNumber(a));
  const hasIni = iniPath ? await exists(fs, iniPath) : false;

  for (const candidate of candidates) {
    for (const dir of platformDirs(platform, arch)) {
      const platformDir = path.join(lightningServicesDir, candidate, 'bin', dir);
      const binDir = platform === 'win32' ? platformDir : path.join(platformDir, 'bin');
      const binary = path.join(binDir, platform === 'win32' ? 'php.exe' : 'php');
      // eslint-disable-next-line no-await-in-loop
      if (await exists(fs, binary)) {
        return Object.freeze({
          binary, version, env: buildEnv({ binDir, platformDir, platform, iniPath: hasIni ? iniPath : null, baseEnv }),
        });
      }
    }
  }
  return null;
}

const PHP_INFO_SCRIPT = 'echo PHP_VERSION, "\\n", implode(",", get_loaded_extensions());';

/** Asks the PHP binary for its exact version and loaded extensions (lower-cased). */
async function readPhpInfo(runProcess, php) {
  const { exitCode, output } = await runProcess(php.binary, ['-r', PHP_INFO_SCRIPT], { env: php.env, timeoutMs: QUICK_COMMAND_TIMEOUT_MS });
  const lines = output.trim().split(/\r?\n/);
  const [versionLine, extensionLine] = lines.slice(-2);
  if (exitCode !== 0 || !versionLine || !extensionLine) {
    throw new Error(`Local's PHP ${php.version} could not run: ${output.trim().slice(0, 300) || `exit code ${exitCode}`}`);
  }
  return Object.freeze({
    version: versionLine.trim(),
    extensions: Object.freeze(extensionLine.split(',').map((ext) => ext.trim().toLowerCase()).filter(Boolean)),
  });
}

function missingExtensions(info, required) {
  return required.filter((ext) => !info.extensions.includes(ext));
}

module.exports = { resolvePhp, readPhpInfo, missingExtensions, platformDirs };
