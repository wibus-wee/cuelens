import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const source = join(repositoryRoot, 'docs');
const destination = join(repositoryRoot, 'dist', 'docs');

await rm(destination, { recursive: true, force: true });
await mkdir(join(repositoryRoot, 'dist'), { recursive: true });
await cp(source, destination, {
  recursive: true,
  filter: (sourcePath) => relative(source, sourcePath).split(sep)[0] !== 'exec-plans',
});
await cp(join(repositoryRoot, 'install.md'), join(destination, 'install.md'));
