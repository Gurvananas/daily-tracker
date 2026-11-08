// Copy the web app into www/ (the folder Capacitor packages into the Android app).
import { cp, rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'www');
const files = ['index.html', 'styles.css', 'manifest.webmanifest', 'sw.js', 'icons', 'src'];

await rm(out, { recursive: true, force: true });
await mkdir(out);
for (const f of files) await cp(join(root, f), join(out, f), { recursive: true });
console.log(`www/ prêt (${files.join(', ')})`);
