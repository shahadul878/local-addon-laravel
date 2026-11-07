'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertSiteId, parseInstallOptions, parseArtisanCommand, tokenize, assertDbName, assertAppName,
} = require('../lib/validation');

const VALID = Object.freeze({
  laravelMajor: '13', appName: 'Cars', dbDriver: 'mysql', dbName: 'laravel', shouldMigrate: true,
});

test('site ids must look like Local ids', () => {
  assert.equal(assertSiteId('LPZpiH6Zv'), 'LPZpiH6Zv');
  assert.equal(assertSiteId('-6zsZUxLr'), '-6zsZUxLr');
  assert.throws(() => assertSiteId('../etc'), /Invalid site id/);
  assert.throws(() => assertSiteId(42), /Invalid site id/);
});

test('parseInstallOptions normalises a valid form', () => {
  const options = parseInstallOptions({ ...VALID, appName: '  Cars  ' });
  assert.equal(options.release.major, '13');
  assert.equal(options.appName, 'Cars');
  assert.equal(options.dbName, 'laravel');
  assert.ok(Object.isFrozen(options));
});

test('parseInstallOptions drops the db name for SQLite', () => {
  assert.equal(parseInstallOptions({ ...VALID, dbDriver: 'sqlite', dbName: 'ignored!' }).dbName, null);
});

test('parseInstallOptions rejects bad input', () => {
  assert.throws(() => parseInstallOptions(null), /Invalid install options/);
  assert.throws(() => parseInstallOptions({ ...VALID, laravelMajor: '9' }), /Unsupported Laravel version/);
  assert.throws(() => parseInstallOptions({ ...VALID, dbDriver: 'pgsql' }), /Database must be/);
  assert.throws(() => parseInstallOptions({ ...VALID, shouldMigrate: 'yes' }), /true or false/);
  assert.throws(() => assertDbName('drop table;'), /Database names/);
  assert.throws(() => assertAppName('<script>'), /App name/);
  assert.throws(() => assertAppName(''), /App name/);
});

test('tokenize handles quotes and escapes without a shell', () => {
  assert.deepEqual(tokenize('make:model "Blog Post" --path=\'a b\' x\\ y'), ['make:model', 'Blog Post', '--path=a b', 'x y']);
  assert.deepEqual(tokenize('a ""'), ['a', '']);
  assert.throws(() => tokenize('"open'), /Unclosed quote/);
});

test('parseArtisanCommand strips "php artisan" and blocks long-running commands', () => {
  assert.deepEqual(parseArtisanCommand('php artisan migrate --seed'), ['migrate', '--seed']);
  assert.deepEqual(parseArtisanCommand('artisan route:list'), ['route:list']);
  assert.deepEqual(parseArtisanCommand('make:model Post -m'), ['make:model', 'Post', '-m']);
  assert.throws(() => parseArtisanCommand('serve'), /Site Shell|site shell/i);
  assert.throws(() => parseArtisanCommand('tinker'), /keyboard input/);
  assert.throws(() => parseArtisanCommand('tink'), /keyboard input/, 'abbreviations are blocked too');
  assert.throws(() => parseArtisanCommand('q:w'), /keyboard input/);
  assert.throws(() => parseArtisanCommand('QUEUE:LISTEN'), /keyboard input/);
  assert.deepEqual(parseArtisanCommand('queue:failed'), ['queue:failed']);
  assert.deepEqual(parseArtisanCommand('schedule:list'), ['schedule:list']);
  assert.throws(() => parseArtisanCommand('; rm -rf /'), /artisan command name/);
  assert.throws(() => parseArtisanCommand('   '), /Enter an artisan command/);
});
