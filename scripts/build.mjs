import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'docs');
const assets = ['styles.css', 'engine.js', 'persistence.js', 'scene.js', 'app.js', 'favicon.svg'];
const files = await Promise.all(assets.map(async name => ({ name, contents: await readFile(path.join(root, name)) })));
let html = await readFile(path.join(root, 'index.html'), 'utf8');
// Relative, versioned URLs work both at the domain root and under /taf-game/.
for (const file of files) {
  const hash = createHash('sha256').update(file.contents).digest('hex').slice(0, 12);
  html = html.replaceAll(`="${file.name}"`, `="${file.name}?v=${hash}"`);
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(files.map(file => writeFile(path.join(output, file.name), file.contents)));
await writeFile(path.join(output, 'index.html'), html);
await writeFile(path.join(output, '.nojekyll'), '');
console.log(`Built ${files.length + 2} static files in docs/`);
