# 吃啥六爻 · PRD（产品需求 + 工程交接文档）

> 一句话：饭点不知道吃什么时，**摇一卦**，让六爻卦象 + AI 解卦结合你附近的真实餐馆，替你"天选"一家店和一道菜。
>
> 本文档用于在**新对话中继续开发**。读完即可接手，无需回溯历史聊天。

---

## 0. 当前状态速览

> **v1.0 架构更新**：项目已**全面 TypeScript 化**(npm workspaces:`server` Express+TS、`web` Vite+TS),
> 前端单页已实现。原"原生单文件 HTML"方案已废弃。下方 §3/§7 为最新结构与���令。

> **v1.1 增量(本次)**：①结果页新增「此方何处」——高德地图(可选,`VITE_AMAP_KEY`)展示你与餐馆位置,
> 无 key/失败时降级为「文字方位」(指南针朝向+直线距离),坐标 WGS-84→GCJ-02 用 `AMap.convertFrom` 纠偏。
> ②接入 MONID 小红书笔记(`tikhub /xiaohongshu/app_v2/search_notes`)→ 结果页「网友怎么说」横滑卡片;
> 界面注明「数据由 MONID 提供」。后端新增 `server/src/lib/social.ts`(缓存优先+夹具兜底+`MONID_SOCIAL_LIVE` 开关)。
> 新增响应字段 `notes`/`noteKeyword`/`meta.socialSource`;前端新增 `web/src/features/amap.ts` + `web/.env.example`。

| 模块 | 状态 | 说明 |
|------|------|------|
| 后端全链路 | ✅ 完成(TS) | 起卦 → LLM定菜系 → 定位 → 觅食 → LLM解卦,严格类型 + 边界拦截 |
| 六爻内核（64卦数据） | ✅ 完成 | 移植自 Qliuyao，权威卦辞/爻辞/彖象 |
| monid 餐馆数据集成 | ✅ 跑通 | CLI 子进程调用 + 缓存，已存夹具 |
| MiniMax 解卦集成 | ✅ 跑通 | Anthropic 兼容接口，MiniMax-M3 |
| **前端页面** | ✅ 完成(Vite+TS) | 铜钱起卦动画 + 卦象SVG + 天选餐馆卡,「子夜问卦」深色国风 |
| lint + build | ✅ 两端通过 | 严格 TS + eslint,无 any |
| Demo 缓存预热 / 上线部署 | ⬜ 待办 | 见 §8 / 部署到 OpenDeploy |

**下一步 = 端到端验收(Playwright 桌面+移动) → 部署上线**。

---

## 1. 产品定义

### 1.1 解决的问题
"吃什么"是高频决策疲劳场景。本产品用**玄学仪式感**把"随机推荐"包装成"天意所选"，消除选择困难，同时提供真实可去的附近餐馆。

### 1.2 核心流程
1. 用户打开网页，（可选）输入口味偏好，授权地理位置（或手填城市）。
2. 点击"起卦"，铜钱动画摇六次，自下而上生成**本卦 / 变卦 / 动爻**。
3. 后端据卦象用 AI 决定"今日宜吃的菜系"，抓取附近该菜系餐馆。
4. AI 结合卦象 + 真实餐馆，给出**运势解读 + 宜/忌 + 天选餐馆 + 招牌菜 + 祝语**。
5. 用户看到结果卡片，可"再卜一卦"。

### 1.3 目标载体
玄学小网页（黑客松项目）。强调**完成度 + 视觉记忆点 + 现场可 demo**。

---

## 2. 技术架构

```
前端单页 (public/, 待建)                 后端 Node/Express (server/, 已完成)
─────────────────────                    ────────────────────────────────────
铜钱起卦动画 ──6爻(6/7/8/9)──┐
偏好 chips                  ├─POST /api/divine─▶ liuyao.castHexagram() 组装富卦象
定位/手填城市 ──────────────┘                   │
                                               ├─并行─┬ interpret.chooseCuisine() ← MiniMax(卦象→菜系)
                                               │      └ geo.resolveCity()        ← Nominatim(经纬度→城市)
                                               ├ forage()         ← monid 抓餐馆(缓存优先) + 算距离 + top6
                                               ├ interpret()      ← MiniMax(卦象+餐馆→解读+天选+招牌菜)
   结果页 ◀────────JSON───────────────────────┘
```

**为什么需要后端**：monid 是 CLI 工具、API key 存本机，浏览器无法直接调；MiniMax key 也不能暴露给前端。后端是薄薄一层编排。

### 2.1 技术栈
- **后端**：Node 22（原生 `fetch`、`--env-file`）+ Express 4。ESM（`"type":"module"`）。
- **前端**（计划）：原生 HTML/CSS/JS **单文件** + GSAP（CDN）做动画。不用打包工具。
- **LLM**：MiniMax-M3（Anthropic 兼容接口）。
- **餐馆数据**：monid CLI → Apify `google-maps-scraper`。
- **反向地理编码**：OSM Nominatim（免费、无 key）。

---

## 3. 目录结构

```
chisha_liuyao/                   # npm workspaces 单仓库
├── .env                         # 密钥与开关（见 §7,gitignored）
├── package.json                 # 根:workspaces[server,web] + 编排脚本(dev/build/lint/start)
├── server/                      # 后端 Express + TypeScript
│   ├── package.json             # scripts: dev(tsx) / build(tsc) / start / lint
│   ├── tsconfig.json            # NodeNext + strict
│   ├── eslint.config.js         # no-explicit-any: error
│   ├── src/
│   │   ├── server.ts            # Express,POST /api/divine + GET /api/health + 静态托管 web/dist + 输入校验
│   │   ├── types.ts             # 领域类型 + API 契约(服务端权威)
│   │   └── lib/
│   │       ├── liuyao.ts        # 六爻起卦 + 组装富卦象(核心),导出 isYaoValue
│   │       ├── data.ts          # 加载 hexagrams/trigrams/wings JSON
│   │       ├── guaAnalysis.ts   # 互/错/综卦 + 当位/中正/应位/承乘
│   │       ├── geo.ts           # 经纬度→城市(Nominatim,含手填兜底)
│   │       ├── forage.ts        # monid 抓餐馆 + 缓存 + 距离 + top6
│   │       └── interpret.ts     # chooseCuisine() + interpret(),调 MiniMax
│   ├── data/*.json              # 易经数据(64卦/八卦/彖象,来自 Qliuyao)
│   ├── fixtures/chengdu_hotpot.json  # 开发夹具
│   ├── cache/                   # 运行期缓存 md5(city|cuisine).json (gitignored)
│   └── dist/                    # tsc 产物 (gitignored)
└── web/                         # 前端 Vite + TypeScript
    ├── package.json             # scripts: dev / build(tsc+vite) / preview / lint
    ├── tsconfig.json            # Bundler + strict + noUnused*
    ├── vite.config.ts           # dev 代理 /api → :3000
    ├── eslint.config.js
    ├── index.html               # 字体 link(Noto Serif/Sans SC + Ma Shan Zheng)
    ├── src/
    │   ├── main.ts              # 状态机 + 三视图(问卦/起卦/结果/错误)渲染与交互
    │   ├── api.ts               # API 契约(镜像服务端) + divine() 调用 + DivineError
    │   ├── styles/main.css      # 「子夜问卦」设计系统
    │   └── features/
    │       ├── coins.ts         # 起卦逻辑(三铜钱×六爻,前端生成真实卦值)
    │       ├── hexagram.ts      # 卦象 SVG(阳实阴断/动爻朱砂/逐爻显现)
    │       └── icons.ts         # 真 SVG 图标
    └── dist/                    # vite 产物 (gitignored,生产由 server 托管)
```

---

## 4. API 契约

### `POST /api/divine`

**请求体**（全部可选，前端通常都会传）：
```json
{
  "lines": [7,8,9,8,7,8],   // 6个数,下→上,值为6/7/8/9(铜钱和)。不传则后端随机摇
  "preference": "想喝点汤",   // 口味偏好,可空
  "lat": 30.66,             // 浏览器 geolocation
  "lng": 104.07,
  "city": "成都市"           // 反查失败时的手填兜底
}
```

**约定**：`lines` 每个元素 = 三枚铜钱之和。`6`=老阴(动)、`7`=少阳、`8`=少阴、`9`=老阳(动)。前端做真实摇卦动画后把结果传进来；不传则后端用 `Math.random` 摇。

**响应体**（节选真实结构）：
```json
{
  "hexagram": {
    "lines": [7,8,9,8,7,8],
    "yinyang": [1,0,1,0,1,0],          // 1阳0阴,下→上,前端画爻线用
    "movingLines": [3],                 // 动爻爻位(1-6)
    "movingTexts": ["九三：高宗伐鬼方..."],
    "ben":  { "name":"既济","symbol":"䷾","pinyin":"jì jì","judgment":"既济：亨小...","lines":[6条爻辞],"tuan":"彖传","daXiang":"大象传","lower":{"name":"离","element":"火",...},"upper":{"name":"坎","element":"水",...} },
    "bian": { "name":"屯", ... },        // 无动爻时为 null
    "summary": "既济之屯",
    "derived": { "hu":{"name":"未济"}, "cuo":{...}, "zong":{...} },
    "structure": { "positions":[...], "correspondences":[...], "neighbors":[...] }
  },
  "city": "锦江区",
  "cuisine": "江浙菜",                   // LLM 据卦象决定
  "cuisineReason": "既济水在火上...宜以水制火",
  "fortune": "既济卦水火相交...宜以清汤柔火",
  "eat": "清淡汤羹",
  "avoid": "辛辣燥热",
  "blessing": "水火既济，万事小亨...",
  "dish": "菌菇清汤锅底配鲜毛肚",
  "chosen": {
    "name":"寄炉火锅","rating":4.8,"ratingCount":5,"type":"火锅店",
    "address":"...","phone":"+86...","thumbnail":"https://...","lat":30.6,"lng":104.1,"distance":1798
  },
  "restaurants": [ /* 最多6家,按评分降序,结构同 chosen */ ],
  "meta": { "source":"cache|live|fixture", "llmCuisineFallback":false, "llmReadFallback":false, "llmError":null }
}
```

### `GET /api/health` → `{ "ok": true }`

---

## 5. 后端模块说明

### 5.1 `liuyao.js` — 起卦与富卦象
- `castHexagram(lines?, rng?)`：六爻起卦，组装**完整卦象对象**（见 §4 响应的 `hexagram`）。
- 二进制约定（**全项目统一**）：6 位字符串，第 0 位=初爻(最下)，`1`=阳 `0`=阴；下卦=`bin[0:3]`、上卦=`bin[3:6]`，三爻**直接**按下→上读（`100`=震）。
- 变卦：动爻(6/9)阴阳互换。

### 5.2 `data.js` / `guaAnalysis.js` — 易经数据与结构分析
- 数据来自 `/Users/ronggang/code/funcode/Qliuyao`（Python 模块 `hexagrams.py`/`trigrams.py`/`hexagram_wings.py`），用 Python `json.dump` 导出，**未手抄、零误差**。
- `guaAnalysis.js` 移植自 `gua_analysis.py`：互卦/错卦/综卦 + 当位/中正/应位/承乘。
- ⚠️ 借这套权威数据时，**修正了早期手写卦名矩阵的一个 bug**（三爻卦位翻转，曾把"既济动三爻"错算成"蹇"，正确应为"屯"）。后续不要退回手写矩阵。

### 5.3 `geo.js` — 定位
- `resolveCity(lat,lng,fallbackCity)`：OSM Nominatim 反查（`zoom=12`，6s 超时，带 UA）。失败回退手填城市，再不行默认"成都市"。免费、无 key。

### 5.4 `forage.js` — 觅食（monid）
- `forage(city,cuisine,lat,lng)` → `{restaurants, source}`，最多 6 家、按评分降序、含 haversine 距离（米）。
- **缓存优先**：`cache/md5(city|cuisine).json`。命中即免费返回。
- `MONID_LIVE=1` 时才真实调用 monid（见 §6）；否则缓存未命中就回退 `fixtures/chengdu_hotpot.json`（保证永不空手）。

### 5.5 `interpret.js` — 解卦（MiniMax，两步）
- `chooseCuisine(hex, preference)` → `{cuisine, eat, avoid, reason}`：**卦象决定吃什么**（玄学灵魂）。失败回退"上卦五行→菜系"粗映射。
- `interpret({hex,preference,restaurants,eatHint,avoidHint})` → `{fortune,eat,avoid,chosenName,dish,blessing}`：结合真实餐馆给解读 + 天选。**强制天选店名必须在候选列表内**，否则纠偏到第一家。失败回退模板。
- 两步任一失败都不挂主流程（对齐"装饰别拖垮核心"）。

---

## 6. 外部集成细节（新对话必读）

### 6.1 monid（餐馆数据）
- 安装：`npm i -g @monid-ai/cli`；key 已配（`monid keys list` 可见 `main`）。
- 端点：`apify` / `/damilo/google-maps-scraper`（**带前导斜杠**）。无需 Google Maps key。
- 调用：
  ```bash
  monid run -p apify -e /damilo/google-maps-scraper \
    -i '{"query":"火锅","location":"成都市","language":"zh-cn","max_results":6}' -w 90 -j
  ```
- 入参：`query`=菜系关键词、`location`=**文字城市名**(非经纬度)、`max_results`。
- 返回字段：`title,address,latitude,longitude,rating,ratingCount,type,types,phoneNumber,thumbnailUrl,placeId`。**无菜品字段**（招牌菜由 LLM 生成）。
- ⚠️ **成本坑**：`max_results` 该 actor **不生效**，实测设 5 仍返回 ~20 条，**每次真实抓取 ≈ $0.09**。

### 6.2 MiniMax（解卦 LLM）
- Anthropic 兼容：`POST https://api.minimaxi.com/anthropic/v1/messages`
- Header：`x-api-key: <MINIMAX_API_KEY>`、`anthropic-version: 2023-06-01`、`content-type: application/json`
- Body：`{ model:"MiniMax-M3", max_tokens, system, messages:[{role,content:[{type:"text",text}]}] }`
- ⚠️ 输出常用 ` ```json ``` ` 代码块包裹 → `interpret.js` 已用正则剥离。

### 6.3 Qliuyao（六爻数据来源，仅借鉴）
- 路径：`/Users/ronggang/code/funcode/Qliuyao`（Python 项目，量子起卦 + DeepSeek 解卦）。
- 已借鉴：64卦数据、八卦象意、彖传大象传、`gua_analysis` 逻辑、解卦 prompt 方法论。
- 如需补充数据（如十翼其它内容），从这里继续 dump。

---

## 7. 环境与运行

`.env`（已就位，**含真实密钥，勿提交**，已在 .gitignore）：
```
MINIMAX_API_KEY=sk-cp-...        # MiniMax 解卦
MONID_LIVE=0                     # 1=真实抓餐馆(每次~$0.09); 0/空=只用缓存
PORT=3000
```
运行：
```bash
npm install          # 安装 server + web 两个 workspace 依赖

# 开发(前后端并行,前端 :5173 代理 /api 到后端 :3000)
npm run dev

# 生产构建 + 启动(后端托管前端 dist,单端口 :3000)
npm run build        # 构建 server(tsc) + web(vite)
npm start            # node --env-file=.env server/dist/server.js

# 质量门
npm run lint         # 两端 eslint

# 测试单个接口:
curl -s -X POST localhost:3000/api/divine -H 'content-type: application/json' \
  -d '{"lines":[7,8,9,8,7,8],"preference":"想喝点汤","lat":30.66,"lng":104.07,"city":"成都市"}'
```

---

## 8. 成本与缓存（重要约束）

- monid 余额：起始 $1.00，已用约 $0.09 验证，**剩约 $0.91（≈ 再 10 次真实抓取）**。
- **开发期一律 `MONID_LIVE=0` 走缓存/夹具，零花费。**
- **缓存键 = `md5(反查城市 | LLM菜系)`**。已知问题：反查会得到"锦江区"这类区名、LLM 菜系多变，**与预存的"成都市|火锅"对不上 → 走 fixture 兜底**。
- **Demo 预热方案**：选 2~3 城市 × 3~4 常见菜系，`MONID_LIVE=1` 提前抓好（约 $0.7~0.9，用掉余额），现场起卦秒出、零网络风险。预热时注意用"反查实际返回的城市名"做 key，或把城市归一化到市级。

---

## 9. 前端需求规格（下一步开发）

### 9.1 页面状态机
`待起卦` → `起卦中(动画)` → `出结果`。

### 9.2 关键交互
- **起卦仪式**：点击后 6 次三枚铜钱翻转动画，逐爻自下而上画出卦象。这段 3~5 秒动画**正好遮住后端抓取延迟**。
- **输入**：偏好为可选 chips（清淡/重辣/想喝汤/减脂…）；定位用 `navigator.geolocation`，失败弹手填城市框。
- **结果页**：卦名 + 卦象符号(`ben.symbol`) + 卦象 SVG（爻线，动爻高亮）+ 运势短文 + 大字「宜 X · 忌 Y」+ **天选餐馆卡**（店名/评分/菜系/缩略图/「距你约 N 米」/招牌菜）+ 祝语 + "再卜一卦"。

### 9.3 视觉与健壮性（遵循用户全局规范 CLAUDE.md）
- **现代国风玄学**：深色 + 烫金；衬线标题；卦象用 SVG 画爻线（实线=阳、断线=阴）。
- **对比度达标**：中文正文 ≥ 400 字重，满足 WCAG AA。不要极淡灰字。
- **动效有度**：GSAP，尊重 `prefers-reduced-motion`；**第三方/动画初始化一律 try/catch**，一个失败不能白屏。
- **真图标**：用 SVG，不用生僻 Unicode。
- 单文件 HTML + CDN 引库。

### 9.4 前端字段映射（直接用 `/api/divine` 响应）
- 卦象：`hexagram.summary` / `hexagram.ben.symbol` / `hexagram.yinyang`(画爻线) / `hexagram.movingLines`(高亮)
- 文案：`fortune` / `eat` / `avoid` / `blessing` / `cuisineReason`
- 天选卡：`chosen.{name,rating,type,thumbnail,distance}` + `dish`
- 列表：`restaurants[]`

---

## 10. 已知问题 / TODO

- [ ] **前端整体未实现**（§9）。
- [ ] 缓存键与"反查城市/LLM菜系"对不上 → 现走 fixture。Demo 前按 §8 预热，或把城市归一化到市级。
- [ ] `max_results` 不生效，单次抓取 ~$0.09，注意余额。
- [ ] `chosen` 的 `thumbnail` 是 Google 图床直链，国内可能加载慢/被墙 → 前端需 `onerror` 占位兜底。
- [ ] 真实城市的 monid 数据尚未预热（目前仅成都火锅夹具）。
- [ ] 可选增强：起卦支持"心中默念问题"输入，融入解卦 prompt。

---

## 11. 配套已装工具（本机 `~/.claude/skills/`）

开发本项目时可用：
- `frontend-logic-design`（含 `atomic-functionality` 全版）— 搭前端时做信息架构 / 功能原子性审查。
- `etoe` + `playwright` MCP — 前端渲染验证 & 端到端找茬（满足"渲染验证别只读代码"）。
- `fullstack-delivery-review` — 交付前完整性审查。
- 用户全局 CLAUDE.md 还要求先看 `frontend-design`/`design-taste-frontend`/`web-motion-design` 等 skill 再动手写 UI。

---

## 12. 新对话接手提示词（可直接复制）

> 我在继续开发"吃啥六爻"玄学餐厅推荐项目，根目录 `/Users/ronggang/code/funcode/chisha_liuyao`。后端已完成，请先读 `PRD.md` 与 `server/` 了解现状。本次目标：实现 §9 的前端单页（铜钱起卦动画 + 卦象 SVG + 天选餐馆卡），对接 `POST /api/divine`，遵循我全局 CLAUDE.md 的视觉与健壮性要求，并用 playwright 做渲染验证。
