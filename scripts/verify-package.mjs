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

const forbidden = ['src/', 'tests/', 'playground/', 'docs/exec-plans/'];
for (const path of files) {
  assert.ok(
    forbidden.every((prefix) => !path.startsWith(prefix)),
    `Published package contains repository-only path ${path}.`
  );
  assert.ok(!path.includes('/exec-plans/'), `Published package contains execution plan ${path}.`);
}

console.log(`Verified ${report.files.length} files in ${report.filename}.`);
