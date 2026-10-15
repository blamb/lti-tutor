/**
 * Passages for retrieval. Materials are split on paragraph boundaries into
 * chunks of about a thousand characters and indexed with Postgres full-text
 * search (English stemming, stopwords removed). A turn's query is the
 * student's message, reduced to its content lexemes and ORed, ranked by
 * cover density; neighbouring hits in the same material are merged back
 * into one contiguous passage so the model reads text, not fragments.
 */

import { query } from './db.js';

export const CHUNK_TARGET_CHARS = 1100;
export const CHUNK_MAX_CHARS = 1600;

/** Split text into chunks on paragraph, then sentence, boundaries. Pure. */
export function chunkText(text: string, target = CHUNK_TARGET_CHARS, max = CHUNK_MAX_CHARS): string[] {
  const paras = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const pieces: string[] = [];
  for (const p of paras) {
    if (p.length <= max) { pieces.push(p); continue; }
    // A long paragraph: cut on sentence ends, then hard-wrap anything still too long.
    let cur = '';
    for (const s of p.split(/(?<=[.!?…]["”’)]?)\s+/)) {
      if (cur && cur.length + 1 + s.length > max) { pieces.push(cur); cur = ''; }
      if (s.length > max) {
        for (let i = 0; i < s.length; i += max) pieces.push(s.slice(i, i + max));
        continue;
      }
      cur = cur ? `${cur} ${s}` : s;
    }
    if (cur) pieces.push(cur);
  }
  const chunks: string[] = [];
  let cur = '';
  for (const piece of pieces) {
    if (cur && cur.length + 2 + piece.length > target && cur.length >= target * 0.5) { chunks.push(cur); cur = ''; }
    if (cur && cur.length + 2 + piece.length > max) { chunks.push(cur); cur = ''; }
    cur = cur ? `${cur}\n\n${piece}` : piece;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** Replace a material's chunks with a fresh split of its body. */
export async function rechunkMaterial(materialId: number, body: string): Promise<number> {
  const chunks = chunkText(body);
  await query(`delete from material_chunk where material_id = $1`, [materialId]);
  // One multi-row insert per 200 chunks keeps the statement a sane size.
  for (let i = 0; i < chunks.length; i += 200) {
    const slice = chunks.slice(i, i + 200);
    const values = slice.map((_, j) => `($1, $${j * 2 + 2}, $${j * 2 + 3})`).join(', ');
    const params: unknown[] = [materialId];
    slice.forEach((c, j) => params.push(i + j, c));
    await query(`insert into material_chunk (material_id, seq, body) values ${values}`, params);
  }
  return chunks.length;
}

/** Index any material in the course that has no chunks yet (materials created before chunking existed). */
export async function ensureChunks(materialIds: number[]): Promise<void> {
  if (materialIds.length === 0) return;
  const rows = await query<{ id: number; body: string }>(
    `select m.id, m.body from material m where m.id = any($1::bigint[]) and not exists (select 1 from material_chunk c where c.material_id = m.id)`,
    [materialIds]
  );
  for (const r of rows) await rechunkMaterial(r.id, r.body);
}

/** The content lexemes of a text, stemmed and without stopwords, as Postgres sees them. */
export async function lexemesOf(text: string): Promise<string[]> {
  const rows = await query<{ lex: string[] }>(`select tsvector_to_array(to_tsvector('english', $1)) as lex`, [text.slice(0, 4000)]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of rows[0]?.lex ?? []) {
    if (!/^[a-z0-9]+$/.test(l) || l.length < 2 || seen.has(l)) continue;
    seen.add(l);
    out.push(l);
    if (out.length >= 40) break;
  }
  return out;
}

export interface Passage {
  material_id: number;
  /** First and last chunk sequence numbers the passage spans. */
  from: number;
  to: number;
  body: string;
  rank: number;
}

/**
 * The passages in the given materials that best match the query text, merged
 * where hits are adjacent, cut to a character budget. Empty when the query
 * has no content words or nothing matches.
 */
export async function searchPassages(materialIds: number[], queryText: string, opts: { limit?: number; budgetChars?: number } = {}): Promise<Passage[]> {
  if (materialIds.length === 0) return [];
  const lex = await lexemesOf(queryText);
  if (lex.length === 0) return [];
  const limit = opts.limit ?? 12;
  const budget = opts.budgetChars ?? 14_000;
  // Lexemes are already stemmed, so the 'simple' config leaves them alone.
  const tsq = lex.map((l) => `'${l}'`).join(' | ');
  const hits = await query<{ material_id: number; seq: number; body: string; rank: number }>(
    `select material_id, seq, body, ts_rank_cd(tsv, to_tsquery('simple', $2), 32)::float as rank
     from material_chunk where material_id = any($1::bigint[]) and tsv @@ to_tsquery('simple', $2)
     order by rank desc, material_id, seq limit $3`,
    [materialIds, tsq, limit]
  );
  if (hits.length === 0) return [];
  // Merge adjacent chunks of the same material into one passage.
  const sorted = [...hits].sort((a, b) => a.material_id - b.material_id || a.seq - b.seq);
  const merged: Passage[] = [];
  for (const h of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.material_id === h.material_id && h.seq === last.to + 1) {
      last.to = h.seq; last.body += `\n\n${h.body}`; last.rank = Math.max(last.rank, h.rank);
    } else {
      merged.push({ material_id: h.material_id, from: h.seq, to: h.seq, body: h.body, rank: h.rank });
    }
  }
  merged.sort((a, b) => b.rank - a.rank);
  const out: Passage[] = [];
  let used = 0;
  for (const p of merged) {
    if (used + p.body.length > budget) {
      if (out.length === 0) out.push({ ...p, body: p.body.slice(0, budget) });
      break;
    }
    out.push(p); used += p.body.length;
  }
  return out;
}
