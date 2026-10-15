/**
 * Conversation storage shared by the apps: a `session` row is the container,
 * `tutor_turn` rows are the alternating user/assistant turns. (The table
 * keeps its original name from the tutor; both apps write to it.)
 */

import { query } from './db.js';

export interface Turn {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

export async function createSession(studentId: number, kind: string): Promise<number> {
  const rows = await query<{ id: number }>(`insert into session (student_id, kind) values ($1, $2) returning id`, [studentId, kind]);
  return rows[0]!.id;
}

export async function getSessionTurns(sessionId: number): Promise<Turn[]> {
  return query<Turn>(
    `select id, role, content, ts from tutor_turn where session_id = $1 order by ts asc, id asc`,
    [sessionId]
  );
}

export async function appendTurn(sessionId: number, role: 'user' | 'assistant', content: string): Promise<void> {
  await query(`insert into tutor_turn (session_id, role, content) values ($1,$2,$3)`, [sessionId, role, content]);
}

export async function endSession(sessionId: number): Promise<void> {
  await query(`update session set ended_at = now() where id = $1 and ended_at is null`, [sessionId]);
}
