import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'docs');
const assets = ['styles.css', 'engine.js', 'persistence.js', 'cloud.js', 'sync.js', 'account-ui.js', 'career-ui.js', 'tutorial.js', 'tutorial-ui.js', 'scene.js', 'app.js', 'favicon.svg', 'vendor/supabase-js-2.117.3.js', 'vendor/SUPABASE-LICENSE.txt', 'vendor/lz-string-1.5.0.js', 'vendor/LZ-STRING-LICENSE.txt'];
const files = await Promise.all(assets.map(async name => ({ name, contents: await readFile(path.join(root, name)) })));
let html = await readFile(path.join(root, 'index.html'), 'utf8');
// Relative, versioned URLs work both at the domain root and under /taf-game/.
for (const file of files) {
  const hash = createHash('sha256').update(file.contents).digest('hex').slice(0, 12);
  html = html.replaceAll(`="${file.name}"`, `="${file.name}?v=${hash}"`);
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(files.map(async file => {
  const target = path.join(output, file.name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, file.contents);
}));
await writeFile(path.join(output, 'index.html'), html);
await writeFile(path.join(output, '.nojekyll'), '');
console.log(`Built ${files.length + 2} static files in docs/`);
