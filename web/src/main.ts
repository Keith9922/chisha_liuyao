import './styles/main.css';
import { divine, DivineError } from './api.js';
import type { DivineResponse, Restaurant, YaoValue } from './api.js';
import { castSixYao, yaoValues } from './features/coins.js';
import { hexagramSvg } from './features/hexagram.js';
import { icons } from './features/icons.js';

const PREFERENCES = ['清淡', '重辣', '想喝汤', '暖胃', '减脂', '无肉不欢', '下酒', '快手'];

interface State {
  prefs: Set<string>;
  lat: number | null;
  lng: number | null;
  city: string;
}
const state: State = { prefs: new Set(), lat: null, lng: null, city: '' };

const app = document.querySelector<HTMLDivElement>('#app')!;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const reduceMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

function fmtDistance(m: number | null): string {
  if (m == null) return '附近';
  return m < 1000 ? `约 ${m} 米` : `约 ${(m / 1000).toFixed(1)} 公里`;
}
function preferenceString(): string {
  return [...state.prefs].join('、');
}

/* ============================ 问卦视图 ============================ */
function renderIntro(): void {
  const view = document.createElement('div');
  view.className = 'view';
  view.innerHTML = `
    <header class="brand">
      <div class="brand__mark">吃啥六爻</div>
      <div class="brand__sub">问卦寻味 · 天选一餐</div>
      <div class="brand__seal">饭点不决 即可起卦</div>
    </header>
    <section class="panel" aria-label="起卦设置">
      <div class="field">
        <span class="field__label">此刻口味（可选）</span>
        <span class="field__hint">选不选都行，余下交给天意。</span>
        <div class="chips" id="chips"></div>
      </div>
      <div class="field">
        <span class="field__label">你在哪里寻味</span>
        <span class="field__hint">用于寻得你附近的店，二者择一即可。</span>
        <div class="loc">
          <input class="loc__input" id="city" type="text" inputmode="text"
            placeholder="填写城市，如 成都" autocomplete="address-level2" aria-label="城市" />
          <button class="loc__btn" id="geo" type="button">${icons.location()}<span>用我的位置</span></button>
        </div>
      </div>
      <p class="hint" id="hint" role="alert"></p>
      <button class="cast-btn" id="cast" type="button">起 卦</button>
    </section>`;
  app.replaceChildren(view);
  const hint = view.querySelector<HTMLParagraphElement>('#hint')!;
  const clearHint = (): void => {
    hint.textContent = '';
  };

  // 口味 chips
  const chips = view.querySelector<HTMLDivElement>('#chips')!;
  for (const p of PREFERENCES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (state.prefs.has(p) ? ' chip--on' : '');
    b.textContent = p;
    b.setAttribute('aria-pressed', String(state.prefs.has(p)));
    b.addEventListener('click', () => {
      if (state.prefs.has(p)) state.prefs.delete(p);
      else state.prefs.add(p);
      b.classList.toggle('chip--on');
      b.setAttribute('aria-pressed', String(state.prefs.has(p)));
    });
    chips.append(b);
  }

  // 城市输入
  const cityInput = view.querySelector<HTMLInputElement>('#city')!;
  cityInput.value = state.city;
  cityInput.addEventListener('input', () => {
    state.city = cityInput.value;
    clearHint();
  });

  // 定位
  const geoBtn = view.querySelector<HTMLButtonElement>('#geo')!;
  if (state.lat != null) geoBtn.dataset.state = 'ok';
  geoBtn.addEventListener('click', () => {
    void requestGeo(geoBtn).then(() => {
      if (state.lat != null) clearHint();
    });
  });

  // 起卦
  view.querySelector<HTMLButtonElement>('#cast')!.addEventListener('click', () => {
    if (state.lat == null && !state.city.trim()) {
      hint.textContent = '请先授权定位，或填写所在城市。';
      cityInput.focus();
      return;
    }
    void runCast();
  });
}

function requestGeo(btn: HTMLButtonElement): Promise<void> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      btn.dataset.state = '';
      resolve();
      return;
    }
    btn.dataset.state = 'loading';
    const label = btn.querySelector('span')!;
    label.textContent = '定位中…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.lat = pos.coords.latitude;
        state.lng = pos.coords.longitude;
        btn.dataset.state = 'ok';
        label.textContent = '已锁定方位';
        resolve();
      },
      () => {
        btn.dataset.state = '';
        label.textContent = '定位失败，请填城市';
        resolve();
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
  });
}

/* ============================ 起卦动画 ============================ */
async function runCast(): Promise<void> {
  const tosses = castSixYao();
  const lines: YaoValue[] = yaoValues(tosses);

  const view = document.createElement('div');
  view.className = 'view casting';
  view.innerHTML = `
    <div class="coins" id="coins">
      <span class="coin" data-face="☯"></span>
      <span class="coin" data-face="☯"></span>
      <span class="coin" data-face="☯"></span>
    </div>
    <div id="casthex"></div>
    <p class="casting__label" id="clabel">凝神静气，叩问天机…</p>`;
  app.replaceChildren(view);

  const coinEls = [...view.querySelectorAll<HTMLSpanElement>('.coin')];
  const hexHost = view.querySelector<HTMLDivElement>('#casthex')!;
  const label = view.querySelector<HTMLParagraphElement>('#clabel')!;
  const yinyang = tosses.map((t) => (t.isYang ? 1 : 0));
  const moving = tosses.map((t, i) => (t.isMoving ? i + 1 : 0)).filter((n) => n > 0);
  const POS = ['初', '二', '三', '四', '五', '上'];

  // 先发起请求，动画并行
  const pending = divine({
    lines,
    preference: preferenceString() || undefined,
    lat: state.lat,
    lng: state.lng,
    city: state.city.trim() || undefined,
  })
    .then((data): { ok: true; data: DivineResponse } => ({ ok: true, data }))
    .catch((err: unknown): { ok: false; err: unknown } => ({ ok: false, err }));

  hexHost.innerHTML = hexagramSvg(yinyang, moving, 0);
  const reduce = reduceMotion();
  for (let k = 0; k < 6; k++) {
    const t = tosses[k]!;
    coinEls.forEach((c) => {
      c.className = 'coin coin--spin';
      c.dataset.face = '☯';
    });
    label.innerHTML = `正在摇第 <b>${POS[k]}</b> 爻`;
    await sleep(reduce ? 0 : 460);
    coinEls.forEach((c, idx) => {
      const face = t.coins[idx];
      c.className = 'coin' + (face === 'yin' ? ' coin--yin' : '');
      c.dataset.face = face === 'yang' ? '背' : '字';
    });
    hexHost.innerHTML = hexagramSvg(yinyang, moving, k + 1);
    await sleep(reduce ? 0 : 280);
  }

  label.textContent = '卦已成，正推演今日宜食…';
  const result = await pending;
  if (result.ok) renderResult(result.data);
  else renderError(result.err);
}

/* ============================ 结果视图 ============================ */
function ratingHtml(r: Restaurant): string {
  if (r.rating == null) return '';
  const count = r.ratingCount ? `（${r.ratingCount}）` : '';
  return `<span class="rating">${icons.star()}${r.rating.toFixed(1)}${count}</span>`;
}

function pickCard(r: Restaurant, dish: string): HTMLElement {
  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = `
    <div class="eyebrow">${icons.compass()} 天 选</div>
    <div class="pick">
      <div class="pick__thumb-host"></div>
      <div class="pick__body">
        <div class="pick__name">${esc(r.name)}</div>
        <div class="pick__meta">
          ${ratingHtml(r)}
          ${r.type ? `<span class="dot"></span><span>${esc(r.type)}</span>` : ''}
          <span class="dot"></span><span>${fmtDistance(r.distance)}</span>
        </div>
      </div>
    </div>
    <p class="dish">${icons.utensils()} 宜点 · <b>${esc(dish)}</b></p>`;

  // 缩略图带降级
  const host = card.querySelector<HTMLDivElement>('.pick__thumb-host')!;
  if (r.thumbnail) {
    const img = document.createElement('img');
    img.className = 'pick__thumb';
    img.src = r.thumbnail;
    img.alt = r.name;
    img.loading = 'lazy';
    img.addEventListener('error', () => img.replaceWith(placeholderThumb()));
    host.replaceWith(img);
  } else {
    host.replaceWith(placeholderThumb());
  }
  return card;
}
function placeholderThumb(): HTMLElement {
  const ph = document.createElement('div');
  ph.className = 'pick__thumb pick__thumb--ph';
  ph.innerHTML = icons.utensils();
  return ph;
}

function renderResult(d: DivineResponse): void {
  const view = document.createElement('div');
  view.className = 'view';

  // 卦象头
  const head = document.createElement('div');
  head.className = 'result__hex';
  head.innerHTML = `
    <div class="glyph">${esc(d.hexagram.ben.symbol)}</div>
    <div class="hex-name">${esc(d.hexagram.ben.name)}</div>
    <div class="hex-py">${esc(d.hexagram.ben.pinyin)}</div>
    <div class="hex-summary">${esc(d.hexagram.summary)} · ${esc(d.city)} · ${esc(d.cuisine)}</div>
    ${hexagramSvg(d.hexagram.yinyang, d.hexagram.movingLines, 6)}`;
  view.append(head);

  // 运势
  const reading = document.createElement('section');
  reading.className = 'card';
  reading.innerHTML = `
    <div class="eyebrow">${icons.spark()} 今 日 卦 食</div>
    <p class="reading__text">${esc(d.fortune)}</p>
    ${d.cuisineReason ? `<p class="reading__why">${esc(d.cuisineReason)}</p>` : ''}
    <div class="verdict">
      <div class="verdict__item verdict__item--eat"><div class="verdict__k">宜</div><div class="verdict__v">${esc(d.eat)}</div></div>
      <div class="verdict__item verdict__item--avoid"><div class="verdict__k">忌</div><div class="verdict__v">${esc(d.avoid)}</div></div>
    </div>`;
  view.append(reading);

  // 天选餐馆
  if (d.chosen) view.append(pickCard(d.chosen, d.dish));

  // 备选
  const alts = d.restaurants.filter((r) => r.name !== d.chosen?.name).slice(0, 4);
  if (alts.length) {
    const sec = document.createElement('section');
    sec.className = 'card';
    sec.innerHTML = `<div class="eyebrow">${icons.utensils()} 另 备 数 席</div><ul class="alts"></ul>`;
    const ul = sec.querySelector<HTMLUListElement>('.alts')!;
    for (const r of alts) {
      const li = document.createElement('li');
      li.className = 'alt';
      li.innerHTML = `
        <span class="alt__name">${esc(r.name)}${r.type ? ` <span class="alt__type">${esc(r.type)}</span>` : ''}</span>
        <span class="alt__meta">${r.rating != null ? `★ ${r.rating.toFixed(1)} · ` : ''}${fmtDistance(r.distance)}</span>`;
      ul.append(li);
    }
    view.append(sec);
  }

  // 祝语
  const bless = document.createElement('p');
  bless.className = 'blessing';
  bless.textContent = d.blessing;
  view.append(bless);

  // 再卜
  const actions = document.createElement('div');
  actions.className = 'actions';
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'btn btn--primary';
  again.innerHTML = `${icons.refresh()} 再 卜 一 卦`;
  again.addEventListener('click', renderIntro);
  actions.append(again);
  view.append(actions);

  if (d.meta.source === 'fixture') {
    const note = document.createElement('p');
    note.className = 'meta-note';
    note.textContent = '＊当前为离线示例餐馆数据';
    view.append(note);
  }

  app.replaceChildren(view);
  window.scrollTo({ top: 0 });
}

/* ============================ 错误视图 ============================ */
function renderError(err: unknown): void {
  const code = err instanceof DivineError ? err.code : 'INTERNAL';
  const msg = err instanceof Error ? err.message : '卦象推演受阻，请稍后再试。';
  const view = document.createElement('div');
  view.className = 'view';
  view.innerHTML = `
    <header class="brand"><div class="brand__mark">卦象未明</div></header>
    <section class="panel">
      <div class="error-box">
        <div class="error-box__title">${code === 'NEED_LOCATION' ? '尚不知你身在何方' : '天机一时不畅'}</div>
        <p class="error-box__msg">${esc(msg)}</p>
        <button class="btn btn--primary" id="back" type="button">${icons.refresh()} 重 新 起 卦</button>
      </div>
    </section>`;
  app.replaceChildren(view);
  view.querySelector<HTMLButtonElement>('#back')!.addEventListener('click', renderIntro);
}

renderIntro();
