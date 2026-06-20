import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HexagramData, TrigramData, WingData } from '../types.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const load = <T>(f: string): T => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as T;

export const HEXAGRAMS = load<HexagramData>('hexagrams.json');
export const TRIGRAMS = load<TrigramData>('trigrams.json');
export const WINGS = load<WingData>('wings.json');

export const nameOf = (binary: string): string => HEXAGRAMS[binary]?.name ?? '?';
