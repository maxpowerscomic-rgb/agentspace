// Per-platform post length limits + validation. Used to warn the user before a
// native post is rejected, and to guard the posters.
import type { Platform } from '../types.js';

export const CHAR_LIMITS: Record<Platform, number> = {
  x: 280,
  bs: 300,
  th: 500,
  ma: 500, // conservative default; instances vary (many allow more)
  li: 3000,
};

export interface BlockCheck {
  index: number;
  length: number;
  limit: number;
  over: boolean;
}

export function checkBlocks(blocks: string[], platform: Platform): BlockCheck[] {
  const limit = CHAR_LIMITS[platform];
  return blocks.map((b, index) => ({ index, length: [...b].length, limit, over: [...b].length > limit }));
}

export function anyOver(blocks: string[], platform: Platform): boolean {
  return checkBlocks(blocks, platform).some((c) => c.over);
}
