'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseEnv, updateEnv, diffEnv, formatValue } = require('../lib/envFile');

const LARAVEL_DEFAULT = [
  'APP_NAME=Laravel',
  'APP_KEY=',
  '',
  'DB_CONNECTION=sqlite',
  '# DB_HOST=127.0.0.1',
  '# DB_PORT=3306',
  '# DB_DATABASE=laravel',
  '',
  'MAIL_MAILER=log',
  '',
].join('\n');

test('parseEnv reads active keys and ignores comments', () => {
  const values = parseEnv('A=1\n# B=2\nexport C="hello world"\nD=\'x y\'\nE=plain # comment\n');
  assert.deepEqual(values, { A: '1', C: 'hello world', D: 'x y', E: 'plain' });
});

test('updateEnv reuses commented lines in place instead of appending', () => {
  const next = updateEnv(LARAVEL_DEFAULT, { DB_CONNECTION: 'mysql', DB_HOST: '127.0.0.1', DB_PORT: '10010' });
  assert.match(next, /DB_CONNECTION=mysql\nDB_HOST=127\.0\.0\.1\nDB_PORT=10010\n# DB_DATABASE=laravel/);
  assert.ok(next.endsWith('\n'));
});

test('updateEnv comments keys out when set to null', () => {
  const withMysql = updateEnv(LARAVEL_DEFAULT, { DB_HOST: 'db' });
  const next = updateEnv(withMysql, { DB_HOST: null, DB_PORT: null });
  assert.match(next, /# DB_HOST=db/);
  assert.match(next, /# DB_PORT=3306/);
  assert.equal(parseEnv(next).DB_HOST, undefined);
});

test('updateEnv appends unknown keys and quotes values that need it', () => {
  const next = updateEnv('A=1', { APP_NAME: 'My "Cool" App', B: 'two' });
  assert.equal(next, 'A=1\nAPP_NAME="My \\"Cool\\" App"\nB=two\n');
  assert.equal(parseEnv(next).APP_NAME, 'My "Cool" App');
});

test('updateEnv leaves the original text untouched and keeps CRLF endings', () => {
  const original = 'A=1\r\nB=2\r\n';
  const next = updateEnv(original, { B: '3' });
  assert.equal(original, 'A=1\r\nB=2\r\n');
  assert.equal(next, 'A=1\r\nB=3\r\n');
});

test('updateEnv skips a commented duplicate when the key is already active', () => {
  const next = updateEnv('# DB_PORT=3306\nDB_PORT=1\n', { DB_PORT: '2' });
  assert.equal(next, '# DB_PORT=3306\nDB_PORT=2\n');
});

test('updateEnv rewrites every active duplicate so the effective value changes', () => {
  const next = updateEnv('DB_PORT=3306\nDB_PORT=10006\n', { DB_PORT: '10010' });
  assert.equal(next, 'DB_PORT=10010\nDB_PORT=10010\n');
  assert.equal(parseEnv(next).DB_PORT, '10010');
});

test('quoted values may carry inline comments and escapes', () => {
  const values = parseEnv('A="http://a.local" # note\nB="x\\\\ny"\nC=\'lit # not a comment\' # c\nD="say \\"hi\\""\n');
  assert.equal(values.A, 'http://a.local');
  assert.equal(values.B, 'x\\ny');
  assert.equal(values.C, 'lit # not a comment');
  assert.equal(values.D, 'say "hi"');
});

test('updateEnv on an empty file has no leading blank line', () => {
  assert.equal(updateEnv('', { A: '1' }), 'A=1\n');
});

test('diffEnv reports only real changes', () => {
  assert.deepEqual(diffEnv({ A: '1', B: '2' }, { A: '1', B: '3', C: null }), [{ key: 'B', from: '2', to: '3' }]);
  assert.deepEqual(diffEnv({ C: 'x' }, { C: null }), [{ key: 'C', from: 'x', to: null }]);
});

test('formatValue leaves simple values bare', () => {
  assert.equal(formatValue('http://cars.local'), 'http://cars.local');
  assert.equal(formatValue(''), '');
  assert.equal(formatValue('a b'), '"a b"');
});
