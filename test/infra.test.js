'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const net = require('net');
const path = require('path');
const { runProcess, assertSuccess, stripAnsi, appendCapped } = require('../lib/processRunner');
const { createKeyedQueue, isPortOpen } = require('../lib/infra');
const { createConfigStore } = require('../lib/configStore');
const { createComposer } = require('../lib/composer');
const { resolvePhp, readPhpInfo, missingExtensions } = require('../lib/phpRuntime');
const { moveEntries, detectLaravel, restoreWebRoot } = require('../lib/project');
const { createSitePaths } = require('../lib/paths');
const { makeTempDir, silentLogger } = require('./fixtures');

test('runProcess streams lines and captures the exit code without a shell', async () => {
  const lines = [];
  const result = await runProcess(process.execPath, ['-e', 'console.log("a\\nb"); console.error("c"); process.exit(3)'], { onLine: (l) => lines.push(l) });
  assert.equal(result.exitCode, 3);
  assert.deepEqual(lines.sort(), ['a', 'b', 'c']);
  assert.throws(() => assertSuccess(result), /a|c/);
  assert.equal(assertSuccess({ exitCode: 0, output: '' }).exitCode, 0);
});

test('runProcess times out and fails cleanly for missing binaries', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { timeoutMs: 200 }), /Timed out/);
  await assert.rejects(runProcess('/definitely/not/here', []), /Could not start/);
});

test('a timeout waits for the process tree to exit, grandchildren included', { skip: process.platform === 'win32' }, async () => {
  const dir = await makeTempDir();
  const pidFile = path.join(dir, 'grandchild.pid');
  const script = `const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});`
    + `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(c.pid)); setInterval(()=>{},1000);`;
  await assert.rejects(runProcess(process.execPath, ['-e', script], { timeoutMs: 400 }), (error) => error.isTimeout === true);
  const grandchild = Number(await fs.readFile(pidFile, 'utf8'));
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.throws(() => process.kill(grandchild, 0), /ESRCH/, 'the grandchild was killed');
});

test('commands cannot wait on stdin', async () => {
  const result = await runProcess(process.execPath, ['-e', 'process.stdin.on("data",()=>{}).on("end",()=>{console.log("eof")})'], { timeoutMs: 5000 });
  assert.equal(result.output.trim(), 'eof');
});

test('stripAnsi and appendCapped', () => {
  assert.equal(stripAnsi('\u001b[32mok\u001b[0m'), 'ok');
  assert.equal(appendCapped('abc', 'def', 4), 'cdef');
});

test('keyed queue serialises per key and survives failures', async () => {
  const enqueue = createKeyedQueue();
  const order = [];
  const slow = enqueue('a', () => new Promise((resolve) => setTimeout(() => { order.push('a1'); resolve(); }, 20)));
  const failing = enqueue('a', async () => { order.push('a2'); throw new Error('boom'); });
  const after = enqueue('a', async () => order.push('a3'));
  const other = enqueue('b', async () => order.push('b1'));
  await Promise.all([slow, failing.catch(() => {}), after, other]);
  assert.deepEqual(order, ['b1', 'a1', 'a2', 'a3']);
});

test('isPortOpen detects a listening socket', async () => {
  const server = net.createServer().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  assert.equal(await isPortOpen('127.0.0.1', port), true);
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await isPortOpen('127.0.0.1', port), false);
});

test('config store writes atomically and recovers from corrupt files', async () => {
  const dir = await makeTempDir();
  const file = path.join(dir, 'config.json');
  const store = createConfigStore({ fs, file, logger: silentLogger });
  await store.updateSite('s1', () => ({ autoSync: true }));
  await store.updateSite('s2', () => ({ autoSync: false }));
  await store.updateSite('s1', () => null);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')).sites, { s2: { autoSync: false } });

  await Promise.all(['a', 'b', 'c', 'd'].map((id) => store.updateSite(id, () => ({ autoSync: true }))));
  assert.deepEqual(Object.keys(JSON.parse(await fs.readFile(file, 'utf8')).sites).sort(), ['a', 'b', 'c', 'd', 's2'], 'concurrent updates are not lost');
  assert.deepEqual((await fs.readdir(dir)).filter((name) => name.endsWith('.tmp')), []);

  await fs.writeFile(file, '{broken');
  const fresh = createConfigStore({ fs, file, logger: silentLogger });
  assert.equal(await fresh.getSite('s2'), null);
  assert.ok((await fs.readdir(dir)).includes('config.json.corrupt'));
});

test('composer download is checksum-verified', async () => {
  const dir = await makeTempDir();
  const pharPath = path.join(dir, 'bin', 'composer.phar');
  const write = (hash) => async (_url, destination) => { await fs.writeFile(destination, 'phar'); return hash; };
  const good = 'a'.repeat(64);

  const bad = createComposer({ fs, pharPath, fetchText: async () => `${good}  composer.phar`, downloadFile: write('b'.repeat(64)), logger: silentLogger });
  await assert.rejects(bad.ensure(), /SHA-256/);
  assert.equal(await bad.isReady(), false);
  assert.deepEqual(await fs.readdir(path.join(dir, 'bin')), [], 'the partial download is removed');

  let downloads = 0;
  const counting = async (url, destination) => { downloads += 1; return write(good)(url, destination); };
  const ok = createComposer({ fs, pharPath, fetchText: async () => good, downloadFile: counting, logger: silentLogger });
  const [first, second] = await Promise.all([ok.ensure(), ok.ensure()]);
  assert.equal(downloads, 1, 'concurrent installs share one download');
  assert.equal(first, second);
  assert.equal(await ok.ensure(), pharPath);
  assert.equal(await ok.isReady(), true);
});

test('resolvePhp picks the newest build and sets up the environment', async () => {
  const dir = await makeTempDir();
  for (const build of ['php-8.4.18+0', 'php-8.4.18+2', 'php-8.2.30+1']) {
    await fs.mkdir(path.join(dir, build, 'bin', 'linux', 'bin'), { recursive: true });
    await fs.writeFile(path.join(dir, build, 'bin', 'linux', 'bin', 'php'), '');
  }
  const ini = path.join(dir, 'php.ini');
  await fs.writeFile(ini, '');
  const php = await resolvePhp({
    fs, lightningServicesDir: dir, version: '8.4.18', iniPath: ini, platform: 'linux', arch: 'x64', baseEnv: { PATH: '/usr/bin' },
  });
  assert.equal(php.binary, path.join(dir, 'php-8.4.18+2', 'bin', 'linux', 'bin', 'php'));
  assert.equal(php.env.PHPRC, dir);
  assert.ok(php.env.LD_LIBRARY_PATH.endsWith(path.join('php-8.4.18+2', 'bin', 'linux', 'shared-libs')));
  assert.ok(php.env.PATH.endsWith('/usr/bin'));
  assert.equal(await resolvePhp({ fs, lightningServicesDir: dir, version: '7.4.0', platform: 'linux' }), null);
  assert.equal(await resolvePhp({ fs, lightningServicesDir: path.join(dir, 'missing'), version: '8.4.18' }), null);
});

test('readPhpInfo parses the probe output', async () => {
  const php = { binary: 'php', version: '8.4.18', env: {} };
  const info = await readPhpInfo(async () => ({ exitCode: 0, output: 'Deprecated: noise\n8.4.18\nCore,PDO,pdo_mysql' }), php);
  assert.deepEqual(info, { version: '8.4.18', extensions: ['core', 'pdo', 'pdo_mysql'] });
  assert.deepEqual(missingExtensions(info, ['pdo', 'mbstring']), ['mbstring']);
  await assert.rejects(readPhpInfo(async () => ({ exitCode: 127, output: 'libtidy missing' }), php), /could not run/);
});

test('moveEntries refuses conflicts and detectLaravel reads the version', async () => {
  const dir = await makeTempDir();
  const from = path.join(dir, 'from');
  const to = path.join(dir, 'to');
  await fs.mkdir(from);
  await fs.mkdir(to);
  await fs.writeFile(path.join(from, 'artisan'), '');
  await fs.writeFile(path.join(to, 'artisan'), '');
  await assert.rejects(moveEntries(fs, from, to), /already exist/);
  assert.deepEqual(await fs.readdir(from), ['artisan']);

  const sitePaths = createSitePaths(dir);
  await fs.mkdir(sitePaths.appDir);
  assert.equal(await detectLaravel(fs, sitePaths), null);
  await fs.writeFile(sitePaths.artisan, '');
  await fs.writeFile(sitePaths.composerJson, JSON.stringify({ require: { 'laravel/framework': '^12.0' } }));
  assert.deepEqual(await detectLaravel(fs, sitePaths), { version: null, constraint: '^12.0', hasVendor: false });

  assert.equal(await restoreWebRoot(fs, sitePaths, null), false);
  assert.deepEqual(await fs.readdir(sitePaths.publicDir), []);
  await assert.rejects(restoreWebRoot(fs, sitePaths, null), /already exists/);
});
