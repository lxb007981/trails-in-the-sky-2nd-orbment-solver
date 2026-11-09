import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'public');
const assets = [
  'index.html',
  'icon.png',
  'src',
  'sora-2nd-orbments.json',
  'sora-2nd-quartz.csv',
  'sora-2nd-arts.csv',
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const asset of assets) {
  await cp(resolve(root, asset), resolve(output, asset), { recursive: true });
}
console.log('Static site built in public/');
