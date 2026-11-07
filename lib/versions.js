'use strict';

function toParts(version) {
  return String(version).split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
}

/** Compares dotted versions numerically: -1, 0 or 1. Only major.minor.patch count. */
function compareVersions(left, right) {
  const a = toParts(left);
  const b = toParts(right);
  for (let i = 0; i < 3; i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }
  return 0;
}

function isAtLeast(version, minimum) {
  return Boolean(version) && compareVersions(version, minimum) >= 0;
}

module.exports = { compareVersions, isAtLeast };
