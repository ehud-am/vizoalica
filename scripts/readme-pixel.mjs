// node scripts/readme-pixel.mjs <file> <path>
// Fills the pixel block of a README from VIZOALICA_INGEST_ENDPOINT and VIZOALICA_WEBSITE_KEY. Used by the README workflow; the npm build does the same inline.
import { readFileSync, writeFileSync } from 'node:fs';
import { applyReadmePixel, settingsFromEnv } from './lib/readme-pixel.mjs';

const [file, path] = process.argv.slice(2);
if (!file || !path) throw new Error('Usage: node scripts/readme-pixel.mjs <file> <path>');
const before = readFileSync(file, 'utf8');
const after = applyReadmePixel(before, settingsFromEnv(process.env, path));
if (after !== before) writeFileSync(file, after);
console.log(after === before ? 'README unchanged' : 'README updated');
