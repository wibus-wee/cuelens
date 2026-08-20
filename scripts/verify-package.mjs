import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const packed = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  encoding: 'utf8',
});

assert.equal(packed.status, 0, packed.stderr || 'npm pack --dry-run failed.');

const [report] = JSON.parse(packed.stdout);
assert.equal(report.name, manifest.name, 'Packed package name does not match package.json.');
assert.equal(
  report.version,
  manifest.version,
  'Packed package version does not match package.json.'
);
const files = new Set(report.files.map((file) => file.path));
const required = [
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'install.md',
  'package.json',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/react.js',
  'dist/react.d.ts',
  'dist/docs/README.md',
  'dist/docs/install.md',
  'dist/docs/usage.md',
  'dist/docs/architecture/cuelens.md',
];

for (const path of required) {
  assert.ok(files.has(path), `Published package is missing ${path}.`);
}

const declarationPaths = report.files
  .map((file) => file.path)
  .filter((path) => path.endsWith('.d.ts'));
const declarations = (
  await Promise.all(
    declarationPaths.map((path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8'))
  )
).join('\n');
assert.doesNotMatch(
  declarations,
  /\b(?:Film[A-Z]\w*|(?:create|define|use|validate)Film\w*|filmAnchorProps)\b/,
  'Published declarations expose a legacy Film API alias.'
);

const forbidden = ['src/', 'tests/', 'playground/', 'docs/exec-plans/'];
const legacyFiles = [
  'dist/definition.d.ts',
  'dist/definition.d.ts.map',
  'dist/definition.js',
  'dist/definition.js.map',
];
for (const path of files) {
  assert.ok(
    forbidden.every((prefix) => !path.startsWith(prefix)),
    `Published package contains repository-only path ${path}.`
  );
  assert.ok(!path.includes('/exec-plans/'), `Published package contains execution plan ${path}.`);
  assert.ok(!legacyFiles.includes(path), `Published package contains legacy artifact ${path}.`);
}

console.log(`Verified ${report.files.length} files in ${report.filename}.`);
