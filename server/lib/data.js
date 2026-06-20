// 加载从 Qliuyao 移植的易经数据（64卦卦辞/爻辞、八卦象意、彖传大象传）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

export const HEXAGRAMS = load('hexagrams.json'); // key: 6位二进制(下→上)
export const TRIGRAMS = load('trigrams.json');   // key: 3位二进制(下→上)
export const WINGS = load('wings.json');         // key: 6位二进制

// 二进制卦串 → 卦名（互错综卦用）
export const nameOf = (bin) => HEXAGRAMS[bin]?.name ?? '?';
