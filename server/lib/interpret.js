// 解卦(纯 LLM, MiniMax-M3, Anthropic 兼容接口)。两步：
//  1) chooseCuisine：卦象 → 该吃的菜系关键词(喂给 monid 搜餐馆)
//  2) interpret    ：卦象 + 真实餐馆 → 运势解读 + 天选餐馆 + 招牌菜
// 任一步失败都回退，保证主流程不挂。

const ENDPOINT = 'https://api.minimaxi.com/anthropic/v1/messages';

async function callMiniMax({ system, user, maxTokens = 700, timeout = 30000 }) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error('no api key');
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': apiKey },
    body: JSON.stringify({
      model: 'MiniMax-M3', max_tokens: maxTokens, system,
      messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
    }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`minimax ${res.status}`);
  const j = await res.json();
  return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

function parseJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  return JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1));
}

function hexBrief(hex) {
  const { ben, bian } = hex;
  return [
    `本卦：${ben.name}（${ben.symbol}）下${ben.lower.name}(${ben.lower.element}·${ben.lower.attribute})上${ben.upper.name}(${ben.upper.element}·${ben.upper.attribute})`,
    `卦辞：${ben.judgment}`,
    `大象：${ben.daXiang}`,
    hex.movingLines.length ? `动爻第${hex.movingLines.join('、')}爻 → ${hex.movingTexts.join(' / ')}` : '六爻皆静',
    bian ? `变卦：${bian.name}（${bian.judgment}）` : '无变卦',
    `互卦${hex.derived.hu.name}·错卦${hex.derived.cuo.name}·综卦${hex.derived.zong.name}`,
  ].join('\n');
}

// ── 第一步：卦象 → 菜系关键词 ──
const CUISINE_SYSTEM = `你是一位精通周易与饮食养生的解卦师。根据卦象的上下卦象意(五行)、卦辞、大象传，
为"此刻该吃什么"定一个最契合卦象意象的菜系/口味方向。只返回 JSON，不要解释。`;

export async function chooseCuisine(hex, preference) {
  const user = `${hexBrief(hex)}
用户口味偏好：${preference || '无'}

请据卦象决定今日饮食方向，返回 JSON：
{"cuisine":"用于搜索餐馆的菜系关键词,2-4字,如 火锅/清粥小菜/烧烤/江浙菜","eat":"宜(短词)","avoid":"忌(短词)","reason":"一句话:为何此卦宜此食"}`;
  try {
    const parsed = parseJson(await callMiniMax({ system: CUISINE_SYSTEM, user, maxTokens: 300, timeout: 20000 }));
    if (!parsed.cuisine) throw new Error('no cuisine');
    return parsed;
  } catch (e) {
    // 兜底：用上卦五行粗映射
    const el = hex.ben.upper.element;
    const map = { 火: '火锅', 水: '汤品', 山: '清粥小菜', 雷: '烧烤', 风: '面食', 泽: '甜品', 天: '牛排', 地: '家常菜' };
    return { cuisine: preference?.trim() || map[el] || '家常菜', eat: el, avoid: '生冷', reason: '', _fallback: true };
  }
}

// ── 第二步：卦象 + 真实餐馆 → 解读 + 天选 ──
const READ_SYSTEM = `你是一位精通《周易》、又懂吃的解卦顾问。基于卦象帮求问者解决"现在吃什么"。
方法论(必须遵守)：
1. 先从上下卦象意(八卦五行)切入，点出本卦核心意象，扣到"吃"这件事。
2. 引用卦辞或动爻爻辞原文一句，并用白话点化为饮食建议。
3. 必须从【候选餐馆】里挑一家作为"天选"，店名要与列表完全一致，不得编造。
4. 语气温暖、有玄学韵味但好读；不算命、不预测具体事件、不绝对化吉凶。
只返回 JSON，不要任何解释或代码块标记。`;

export async function interpret({ hex, preference, restaurants, eatHint, avoidHint }) {
  const top = restaurants[0] || { name: '附近小馆', type: '' };
  const fallback = () => ({
    fortune: `${hex.summary}，${hex.ben.daXiang || '万象更新'}，宜顺本心择食。`,
    eat: eatHint || hex.ben.upper.element, avoid: avoidHint || '生冷',
    chosenName: top.name, dish: '招牌菜', blessing: '食得其时，万事顺遂。', _fallback: true,
  });
  if (!restaurants.length) return fallback();

  const list = restaurants.map((r, i) => `${i + 1}. ${r.name}（${r.type}，评分${r.rating ?? '—'}，${r.distance != null ? r.distance + '米' : '距离未知'}）`).join('\n');
  const user = `${hexBrief(hex)}
用户口味偏好：${preference || '无'}
卦象给出的饮食方向：宜「${eatHint || ''}」忌「${avoidHint || ''}」

【候选餐馆】
${list}

返回 JSON：
{
  "fortune":"两三句当下饮食运势解读，扣住卦象意象，引用一句卦辞或动爻爻辞",
  "eat":"宜吃(短词)","avoid":"忌口(短词)",
  "chosenName":"从候选餐馆里选中的店名(必须完全一致)",
  "dish":"为这家店推荐的一道招牌菜",
  "blessing":"一句吉利收尾祝语"
}`;
  try {
    const parsed = parseJson(await callMiniMax({ system: READ_SYSTEM, user, maxTokens: 700 }));
    const chosen = restaurants.find((r) => r.name === parsed.chosenName) || top;
    return { ...parsed, chosenName: chosen.name };
  } catch (e) {
    return { ...fallback(), _error: String(e.message || e) };
  }
}
