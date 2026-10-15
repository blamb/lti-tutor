/**
 * Seed the two reference personas (Melissa Chang, Rabindranath Tagore) into
 * one course, optionally with a folder of source files attached to Tagore.
 *
 *   APP=persona tsx src/persona/seed.ts --iss <platform issuer> --context <LTI course id> [--sources <dir>]
 *
 * The issuer and course id are what the LTI launch carries (see the
 * student table after one launch). Re-running updates nothing: it adds
 * another copy, so delete the earlier ones in the designer view first.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { close } from '../core/db.js';
import { createMaterial, MaterialInput } from '../core/materials.js';
import { extractFromFile, fitMaterial } from '../core/importers.js';
import { createPersona, PersonaInput } from './server/personas.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const iss = arg('iss');
const contextId = arg('context');
const sourcesDir = arg('sources');
if (!iss || !contextId) {
  console.error('usage: APP=persona tsx src/persona/seed.ts --iss <issuer> --context <course id> [--sources <dir>]');
  process.exit(2);
}
const scope = { iss, contextId };

const materialIds: number[] = [];
if (sourcesDir) {
  for (const file of readdirSync(sourcesDir).sort()) {
    if (!['.pdf', '.docx', '.txt', '.md', '.html'].includes(extname(file).toLowerCase())) continue;
    const { title, text } = await extractFromFile(file, readFileSync(join(sourcesDir, file)));
    if (text.trim().length < 20) { console.log(`  skip ${file}: no readable text`); continue; }
    const fit = fitMaterial(text.trim());
    const m = await createMaterial(scope, MaterialInput.parse({ title, body: fit.text, attribution: file }), null);
    materialIds.push(m.id);
    console.log(`  material ${m.id}: ${title} (${fit.text.length.toLocaleString()} chars${fit.truncated ? `, cut from ${fit.original_chars.toLocaleString()}` : ''})`);
  }
}

for (const name of ['melissa-chang', 'tagore']) {
  const raw = JSON.parse(readFileSync(join(HERE, 'fixtures', `${name}.json`), 'utf8'));
  const input = PersonaInput.parse({ ...raw, material_ids: name === 'tagore' ? materialIds : [] });
  const p = await createPersona(scope, input, null);
  console.log(`  persona ${p.id}: ${p.title} (${p.template}, ${p.status})`);
}
await close();
