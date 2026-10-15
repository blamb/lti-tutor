/**
 * Grounding materials: instructor-provided text (pasted, imported by URL,
 * uploaded, or pulled from the LMS course) scoped to one course. Both apps
 * store materials the same way, so the importers, the Moodle backup import
 * and the live sync produce rows either app can use.
 */

import { z } from 'zod';
import { query } from './db.js';
import { rechunkMaterial } from './chunks.js';

/** The longest body a material may hold; importers cut to their own limit first (fitMaterial). */
export const MATERIAL_BODY_MAX_CHARS = 2_000_000;

/** The course a request is for: platform issuer + LTI course id. */
export interface Scope {
  iss: string;
  contextId: string;
}

/**
 * What a material is. Readings are the default; the other roles tell the
 * model to use the material for what it is: the course's own activities and
 * study questions become probes before the model invents any, and an
 * assignment description is the task itself, never a source. A course import
 * sets the role from the course structure; by hand it is a selector.
 */
export const MATERIAL_ROLES = ['reading', 'activities', 'assignment', 'other'] as const;
export type MaterialRole = (typeof MATERIAL_ROLES)[number];
export const MATERIAL_ROLE_LABELS: Record<MaterialRole, string> = {
  reading: 'Reading, notes or transcript',
  activities: 'Activities and study questions',
  assignment: 'Assignment description and criteria',
  other: 'Other',
};

export interface Material {
  id: number;
  lti_iss: string;
  lti_context_id: string;
  title: string;
  body: string;
  /** Where it came from (URL import or upload); empty for pasted text. */
  source_url: string;
  /** e.g. "CC BY 4.0"; empty if unknown. */
  license: string;
  /** Who to credit, e.g. "Concepts of Biology by …, CC BY 4.0". */
  attribution: string;
  /** What the material is (see MATERIAL_ROLES). */
  role: MaterialRole;
  /** The course unit (section) it came from, for grouping; '' for hand-added materials. */
  unit: string;
  unit_order: number;
  /** Stable identity for imported materials (e.g. "moodle:page-412"), so a re-import updates in place. */
  source_key: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export const MaterialInput = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(MATERIAL_BODY_MAX_CHARS),
  source_url: z.string().trim().max(2000).default(''),
  license: z.string().trim().max(200).default(''),
  attribution: z.string().trim().max(500).default(''),
  role: z.enum(MATERIAL_ROLES).default('reading'),
  unit: z.string().trim().max(200).default(''),
  unit_order: z.number().int().min(0).max(10000).default(0),
  source_key: z.string().trim().max(200).default(''),
});
export type MaterialInput = z.infer<typeof MaterialInput>;

export async function listMaterials(ctx: Scope): Promise<Material[]> {
  return query<Material>(
    `select * from material where lti_iss = $1 and lti_context_id = $2 order by unit_order, created_at`,
    [ctx.iss, ctx.contextId]
  );
}

/** The given materials, in the order of `ids`; missing or out-of-course ids are dropped. */
export async function getMaterials(ids: number[], ctx: Scope): Promise<Material[]> {
  if (ids.length === 0) return [];
  const rows = await query<Material>(
    `select * from material where id = any($1::bigint[]) and lti_iss = $2 and lti_context_id = $3`,
    [ids, ctx.iss, ctx.contextId]
  );
  const byId = new Map(rows.map((m) => [m.id, m]));
  return ids.map((id) => byId.get(id)).filter((m): m is Material => !!m);
}

export async function createMaterial(ctx: Scope, input: MaterialInput, createdBy: number | null): Promise<Material> {
  const rows = await query<Material>(
    `insert into material (lti_iss, lti_context_id, title, body, source_url, license, attribution, role, unit, unit_order, source_key, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
    [ctx.iss, ctx.contextId, input.title, input.body, input.source_url, input.license, input.attribution, input.role, input.unit, input.unit_order, input.source_key, createdBy]
  );
  await rechunkMaterial(rows[0]!.id, rows[0]!.body);
  return rows[0]!;
}

/** Create, or update in place when a material with the same source_key already exists in this course. */
export async function upsertMaterialBySourceKey(ctx: Scope, input: MaterialInput, createdBy: number): Promise<{ material: Material; updated: boolean }> {
  if (input.source_key) {
    // Keys were "moodle_backup:…" before the live sync existed; match those too.
    const keys = [input.source_key, ...(input.source_key.startsWith('moodle:') ? [input.source_key.replace(/^moodle:/, 'moodle_backup:')] : [])];
    const existing = await query<{ id: number }>(
      `select id from material where lti_iss = $1 and lti_context_id = $2 and source_key = any($3::text[]) order by id limit 1`,
      [ctx.iss, ctx.contextId, keys]
    );
    if (existing[0]) {
      const material = await updateMaterial(existing[0].id, ctx, input);
      if (material) return { material, updated: true };
    }
  }
  return { material: await createMaterial(ctx, input, createdBy), updated: false };
}

/** Source keys already present in this course, so a preview can say which items will update rather than add. */
export async function existingSourceKeys(ctx: Scope): Promise<Set<string>> {
  const rows = await query<{ source_key: string }>(
    `select source_key from material where lti_iss = $1 and lti_context_id = $2 and source_key <> ''`,
    [ctx.iss, ctx.contextId]
  );
  return new Set(rows.map((r) => r.source_key.replace(/^moodle_backup:/, 'moodle:')));
}

export async function updateMaterial(id: number, ctx: Scope, input: MaterialInput): Promise<Material | null> {
  const rows = await query<Material>(
    `update material set title = $4, body = $5, source_url = $6, license = $7, attribution = $8, role = $9, unit = $10, unit_order = $11,
       source_key = case when $12 = '' then source_key else $12 end, updated_at = now()
     where id = $1 and lti_iss = $2 and lti_context_id = $3 returning *`,
    [id, ctx.iss, ctx.contextId, input.title, input.body, input.source_url, input.license, input.attribution, input.role, input.unit, input.unit_order, input.source_key]
  );
  if (rows[0]) await rechunkMaterial(rows[0].id, rows[0].body);
  return rows[0] ?? null;
}

/** Deletes the row. Apps that reference materials by id elsewhere clean those references up themselves. */
export async function deleteMaterial(id: number, ctx: Scope): Promise<boolean> {
  const rows = await query<{ id: number }>(
    `delete from material where id = $1 and lti_iss = $2 and lti_context_id = $3 returning id`,
    [id, ctx.iss, ctx.contextId]
  );
  return rows.length > 0;
}
