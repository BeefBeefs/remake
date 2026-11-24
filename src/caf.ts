// Character animation data produced by tools/convert.py (from .caf).
export type CafFrame = [duration: number, pattern: number, flags: number];
export interface CafDir { frames: number; layers: CafFrame[][]; }
export interface CafAnim { attr: number; dirs: CafDir[]; }
export interface Caf { version: number; anims: CafAnim[]; }
export async function loadCaf(url: string): Promise<Caf> { return (await fetch(url)).json(); }
