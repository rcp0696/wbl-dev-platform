// Detected output must look like a real version (major.minor at least) so stray
// digits in unrelated text aren't mistaken for one. Expected values may be
// major-only (e.g. "18" means 18.0.0).
function parseVersion(value, { allowMajorOnly = false } = {}) {
  const pattern = allowMajorOnly ? /(\d+)(?:\.(\d+))?(?:\.(\d+))?/ : /(\d+)\.(\d+)(?:\.(\d+))?/;
  const match = String(value).match(pattern);
  return match ? [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0)] : null;
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

const OPERATORS = {
  '>=': (c) => c >= 0,
  '>': (c) => c > 0,
  '=': (c) => c === 0,
  '<=': (c) => c <= 0,
  '<': (c) => c < 0
};

function satisfies(actualText, expectedText, operator = '>=') {
  const actual = parseVersion(actualText);
  const expected = parseVersion(expectedText, { allowMajorOnly: true });
  if (!actual) return { ok: false, error: 'actual' };
  if (!expected) return { ok: false, error: 'expected' };
  const test = Object.hasOwn(OPERATORS, operator) && OPERATORS[operator];
  const ok = test ? test(compareVersions(actual, expected)) : false;
  return { ok, actual: actual.join('.'), expected: expected.join('.') };
}

module.exports = { satisfies };
