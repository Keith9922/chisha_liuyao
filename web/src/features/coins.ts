import type { YaoValue } from '../api.js';

export type CoinFace = 'yang' | 'yin'; // 背(3)记阳 / 字(2)记阴
export interface YaoToss {
  coins: [CoinFace, CoinFace, CoinFace];
  value: YaoValue; // 6/7/8/9
  isYang: boolean;
  isMoving: boolean;
}

const tossCoin = (): CoinFace => (Math.random() < 0.5 ? 'yang' : 'yin');
const coinValue = (f: CoinFace): number => (f === 'yang' ? 3 : 2);

function tossYao(): YaoToss {
  const coins: [CoinFace, CoinFace, CoinFace] = [tossCoin(), tossCoin(), tossCoin()];
  const value = (coinValue(coins[0]) + coinValue(coins[1]) + coinValue(coins[2])) as YaoValue;
  return {
    coins,
    value,
    isYang: value === 7 || value === 9,
    isMoving: value === 6 || value === 9,
  };
}

// 摇六爻(下→上)。前端真实生成,既驱动动画也作为请求发给后端。
export function castSixYao(): YaoToss[] {
  return Array.from({ length: 6 }, tossYao);
}

export const yaoValues = (tosses: YaoToss[]): YaoValue[] => tosses.map((t) => t.value);
