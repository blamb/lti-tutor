/**
 * One model of a Moodle course, two sources.
 *
 * A course backup (.mbz, moodle-backup.ts) and a live web-services sync
 * (moodle-ws.ts) both produce a CourseModel: sections in order, each with its
 * modules, each module with its readable text and any attached files. This
 * file turns that model into the preview the instructor reviews, so the two
 * paths behave identically: the same merging of labels per unit, the same
 * role heuristic, the same notes and defaults, and the same `source_key`
 * (`moodle:<modname>-<cmid>`), so a sync updates what a backup imported and
 * the other way round.
 */

import { fitMaterial, extractFromFile } from './importers.js';
import type { MaterialRole } from './tutorials.js';

/** Attached files larger than this are listed in the preview but not read. */
export const ATTACHMENT_MAX_BYTES = 40 * 1024 * 1024;
/** Labels shorter than this (images, dividers, "Welcome!") are dropped. */
export const MIN_CHARS = 80;
export const ATTACHMENT_TYPES = new Set(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown', 'text/html']);

export interface ModelFile {
  filename: string;
  mimetype: string;
  filesize: number;
  /** Fetches the bytes; only called for files of a readable type and size. */
  read: () => Promise<Buffer>;
}

export interface ModelModule {
  /** The course-module id (cmid); the same in a backup of the course and in its web services. */
  id: string;
  modname: string;
  name: string;
  visible: boolean;
  /** Readable text already converted from HTML (intro, content, rubric …). */
  text: string;
  files: ModelFile[];
  /** Where the learner finds it in the course; '' if unknown. */
  url: string;
  /** Extra things the instructor should know about this module. */
  notes?: string[];
}

export interface ModelSection {
  id: string;
  number: number;
  name: string;
  summary: string;
  visible: boolean;
  /** Where the section is in the course; '' if unknown. */
  url: string;
  modules: ModelModule[];
}

export interface CourseModel {
  source: 'backup' | 'sync';
  course: { fullname: string; shortname: string; course_id: string; wwwroot: string; backup_date: string | null; moodle_release: string };
  sections: ModelSection[];
}

export interface BackupItem {
  /** Stable identity across imports, e.g. "moodle:page-412" or "moodle:section-7-activities". */
  key: string;
  unit: string;
  unit_order: number;
  modname: string;
  title: string;
  role: MaterialRole;
  text: string;
  chars: number;
  visible: boolean;
  source_url: string;
  /** Things the instructor should know: hidden in the course, attachment not read, cut to the limit … */
  notes: string[];
  /** Default tick in the preview. */
  include: boolean;
}

export interface BackupUnit { title: string; order: number; visible: boolean; items: BackupItem[] }

export interface BackupPreview {
  source: 'backup' | 'sync';
  course: CourseModel['course'];
  units: BackupUnit[];
  skipped: Array<{ title: string; modname: string; reason: string }>;
}

const ACTIVITY_WORDS = /^\s*(?:#+\s*)?(?:(?:learning\s+)?activit(?:y|ies)|exercises?|study\s+questions?|discussion\s+questions?|review\s+questions?|questions?\s+for\s+(?:review|reflection|discussion)|practice(?:\s+questions?)?|self[-\s]?(?:check|test|assessment)|check\s+your\s+understanding|try\s+(?:it|this)|think\s+about|reflect(?:ion)?\b)/i;

/** Which role a module's content plays, from its type first and its heading second. */
export function roleFor(modname: string, title: string, text: string): MaterialRole {
  if (modname === 'assign') return 'assignment';
  if (modname === 'forum') return 'activities';
  if (modname === 'label' || modname === 'page' || modname === 'book') {
    const firstLine = text.split('\n').find((l) => l.trim()) ?? '';
    if (ACTIVITY_WORDS.test(title) || ACTIVITY_WORDS.test(firstLine)) return 'activities';
    return 'reading';
  }
  if (modname === 'resource' || modname === 'url' || modname === 'lesson' || modname === 'glossary') return 'reading';
  return 'other';
}

/** The preview the instructor reviews, from either source. */
export async function buildPreview(model: CourseModel): Promise<BackupPreview> {
  const skipped: BackupPreview['skipped'] = [];
  const units: BackupUnit[] = [];

  for (const s of model.sections) {
    const name = s.name || (s.number === 0 ? 'General' : `Section ${s.number}`);
    const unit: BackupUnit = { title: name, order: s.number, visible: s.visible, items: [] };
    const merged: Record<'reading' | 'activities', string[]> = { reading: s.summary ? [s.summary] : [], activities: [] };

    for (const m of s.modules) {
      const title = m.name || `${m.modname} ${m.id}`;
      const role = roleFor(m.modname, title, m.text);
      if (m.modname === 'label') {
        if (m.text.length < MIN_CHARS) { skipped.push({ title: title.slice(0, 80), modname: 'label', reason: m.text.length ? 'too short to be useful' : 'no text (an image or a divider)' }); continue; }
        if (!m.visible) { skipped.push({ title: title.slice(0, 80), modname: 'label', reason: 'hidden in the course' }); continue; }
        merged[role === 'activities' ? 'activities' : 'reading'].push(m.text);
        continue;
      }
      const item: BackupItem = {
        key: `moodle:${m.modname}-${m.id}`,
        unit: name, unit_order: s.number, modname: m.modname, title: title.slice(0, 160), role, text: m.text, chars: m.text.length,
        visible: s.visible && m.visible, source_url: m.url, notes: [...(m.notes ?? [])], include: true,
      };
      if (!m.visible) item.notes.push('hidden in the course');
      if (m.modname === 'quiz') item.notes.push('quiz questions are not imported, only the description');
      if (m.modname === 'forum') item.notes.push('forum posts are never imported, only the prompt');
      for (const f of m.files) {
        if (!ATTACHMENT_TYPES.has(f.mimetype)) { item.notes.push(`attached "${f.filename}" is not a text, Word or PDF file and was not read`); continue; }
        if (f.filesize > ATTACHMENT_MAX_BYTES) { item.notes.push(`attached "${f.filename}" is over 40 MB and was not read`); continue; }
        try {
          const data = await f.read();
          const { text } = await extractFromFile(f.filename, data);
          const clean = text.trim();
          if (clean.length < 20) { item.notes.push(`attached "${f.filename}" has no readable text (a scanned PDF needs OCR first)`); continue; }
          item.text = m.modname === 'resource' && !item.text ? clean : `${item.text}\n\n## Attached: ${f.filename}\n\n${clean}`.trim();
          item.notes.push(`includes the text of "${f.filename}"`);
        } catch (e) {
          item.notes.push(`attached "${f.filename}" could not be read: ${(e as Error).message}`);
        }
      }
      unit.items.push(item);
    }

    const mergedItem = (role: 'reading' | 'activities', parts: string[]): BackupItem | null => {
      const text = parts.join('\n\n').trim();
      if (text.length < MIN_CHARS) return null;
      const suffix = role === 'activities' ? 'activities and study questions' : 'text';
      return {
        key: `moodle:section-${s.id}-${role}`,
        unit: name, unit_order: s.number, modname: 'label', title: `${name} — ${suffix}`.slice(0, 160), role, text, chars: text.length,
        visible: s.visible, source_url: s.url, notes: [], include: true,
      };
    };
    const reading = mergedItem('reading', merged.reading);
    const acts = mergedItem('activities', merged.activities);
    if (reading) unit.items.unshift(reading);
    if (acts) unit.items.splice(reading ? 1 : 0, 0, acts);
    if (!s.visible) for (const it of unit.items) it.notes.push('in a hidden section');
    if (unit.items.length) units.push(unit);
  }

  for (const unit of units) {
    for (const item of unit.items) {
      const fit = fitMaterial(item.text);
      if (fit.truncated) item.notes.push(`cut from ${Math.round(fit.original_chars / 1000)}k to the 200,000-character limit`);
      item.text = fit.text;
      item.chars = item.text.length;
      item.include = item.visible && item.chars >= MIN_CHARS;
      if (item.chars < MIN_CHARS) item.notes.push('little or no text');
    }
  }
  return { source: model.source, course: model.course, units, skipped };
}
