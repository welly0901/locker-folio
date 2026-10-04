/* 站点全部文案与作品数据 —— 与参考逐帧核对整理 */

export const SITE = {
  owner: 'WYLIE WANG',
  tagline: 'WYLIE WANG — PORTFOLIO',
  year: '2026',
}

/* ── 顶部导航 ─────────────────────────────────────────── */
export const NAV = [
  { id: 'about', label: 'ABOUT' },
  { id: 'projects', label: 'PROJECTS' },
  { id: 'skills', label: 'SKILLS' },
  { id: 'work', label: 'SELECTED WORK' },
  { id: 'awards', label: 'AWARDS' },
  { id: 'contact', label: 'CONTACT' },
] as const

/* ── ABOUT：工牌 ─────────────────────────────────────── */
export const ABOUT = {
  cardNo: 'NO. 20050901',
  title: ['BASIC', 'INFORMATION'],
  titleCn: '个人简介',
  sub: 'PERSONAL PORTFOLIO ID CARD',
  fields: [
    { k: 'NAME / 姓名', v: '王语轩 WYLIE' },
    { k: 'GENDER / 性别', v: '女' },
    { k: 'AGE / 年龄', v: '21' },
    { k: 'EDUCATION / 学历', v: '上海师范大学 · 本科' },
    { k: 'MAJOR / 专业', v: '广告学' },
  ],
  email: '18872060150@163.com',
  phone: '18872060150',
  stampTop: 'CERTIFIED',
  stampMid: 'xxx',
  stampRing: 'PERSONAL PORTFOLIO · xxx ·',
  tagTop: '微信号',
  tagBody: 'borogoves0901',
  footL: 'IN MY CREATIVE ERA',
  footR: 'PERSONAL DESIGN PORTFOLIO · 2026',
}

/* ── SKILLS：六张卡片 ─────────────────────────────────── */
export type SkillCard = {
  no: string
  kicker: string
  title: string
  desc: string
  rows: { k: string; v: string }[]
  bg: string
  fg: string
}

export const SKILLS: SkillCard[] = [
  {
    no: '01',
    kicker: '01 / VISUAL DESIGN',
    title: '视觉设计',
    desc: '产出品牌物料与社交视觉内容，把控品牌视觉规范与视觉一致性。',
    rows: [
      { k: 'GRAPHIC', v: 'Photoshop / Illustrator' },
      { k: 'LAYOUT', v: 'Canva' },
      { k: 'MOTION', v: '剪映' },
    ],
    bg: '#6b4f3c',
    fg: '#f5eee1',
  },
  {
    no: '02',
    kicker: '02 / DATA ANALYTICS',
    title: '数据分析',
    desc: '追踪营销全链路指标，完成调研、数据汇总与复盘输出，支撑品牌决策。',
    rows: [
      { k: 'DATA-PROCESS', v: 'Excel（数据透视、函数）' },
      { k: 'RESEARCH', v: '问卷调研、用户反馈分析' },
      { k: 'REPORT', v: 'PPT 报告输出、效果复盘拆解' },
    ],
    bg: '#f2e7b6',
    fg: '#4a4023',
  },
  {
    no: '03',
    kicker: '03 / AI-TOOLS',
    title: 'AI 工具',
    desc: '运用 AI 工具赋能内容生产与数据分析等领域，借助 AI 提升效率。',
    rows: [
      { k: 'AI-TOOL', v: 'Cursor、ChatGPT、Trae' },
      { k: 'CAPABILITY', v: 'Vibe coding' },
    ],
    bg: '#f3cfd6',
    fg: '#5a2f3a',
  },
  {
    no: '04',
    kicker: '04 / BRAND & MARKETING OPERATION',
    title: '品牌市场运营',
    desc: '覆盖品牌资产管理、多平台新媒体运营、达人调研、营销项目落地执行。',
    rows: [
      { k: 'BRAND', v: '品牌视觉规范、物料审核、触点项目、品牌资产维护' },
      { k: 'MEDIA', v: '小红书 / 公众号 / 视频号内容策划、账号增长、私信 SOP 搭建' },
      { k: 'PROJECT', v: '营销挑战赛、活动策划、跨成员协同推进' },
    ],
    bg: '#f4d6b2',
    fg: '#4a321d',
  },
  {
    no: '05',
    kicker: '05 / OFFICE PRODUCTIVITY',
    title: '办公能力',
    desc: '熟练办公套件，可独立完成方案撰写、材料整理、项目资料归档交付。',
    rows: [
      { k: 'DOCUMENT', v: 'Word / PowerPoint / Excel' },
      { k: 'COLLABORATE', v: '项目排期、资料归档、多任务并行处理' },
    ],
    bg: '#8198a6',
    fg: '#f7f3ec',
  },
  {
    no: '06',
    kicker: '06 / LANGUAGE COMPETENCE',
    title: '语言能力',
    desc: '具备英文读写应用能力，普通话表达流畅，适配对内对外沟通场景。',
    rows: [
      { k: 'FOREIGN-LANG', v: 'CET-6' },
      { k: 'NATIVE-LANG', v: '普通话二甲' },
    ],
    bg: '#d8e0c4',
    fg: '#39422c',
  },
]

/* ── SELECTED WORK：四个文件夹 ───────────────────────── */
export const FOLDERS = [
  {
    id: 'video',
    en: ['VIDEO'],
    cn: '影像作品',
    bg: '#2f2620',
    fg: '#c26a45',
    cnFg: '#c26a45',
    x: -30,
    y: 12,
    rot: -6,
    z: 1,
  },
  {
    id: 'design',
    en: ['DESIGN'],
    cn: '视觉类设计',
    bg: '#e3d08a',
    fg: '#6b4f3c',
    cnFg: '#6b4f3c',
    x: 0,
    y: 0,
    rot: -7,
    z: 3,
  },
  {
    id: 'photograph',
    en: ['PHOTO', 'GRAPH'],
    cn: '摄影作品',
    bg: '#8198a6',
    fg: '#e6d9a3',
    cnFg: '#f7f2e7',
    x: 30,
    y: -18,
    rot: 3,
    z: 2,
  },
  {
    id: 'website',
    en: ['OPERATIONS/', 'COPYWRITING'],
    cn: '运营/文案作品',
    bg: '#f6f0e6',
    fg: '#2e2a25',
    cnFg: '#2e2a25',
    x: 22,
    y: 20,
    rot: 2,
    z: 2,
  },
] as const

/* ── DESIGN › 01 POSTERS ─────────────────────────────── */
export const POSTERS = [
  { src: 'ad1', title: 'POSTER 01' },
  { src: 'ad2', title: 'POSTER 02' },
  { src: 'ad3', title: 'POSTER 03' },
  { src: 'ad4', title: 'POSTER 04' },
  { src: 'ad5', title: 'POSTER 05' },
  { src: 'ad6', title: 'POSTER 06' },
  { src: 'ad7', title: 'POSTER 07' },
  { src: 'ad8', title: 'POSTER 08' },
  { src: 'ad9', title: 'POSTER 09' },
  { src: 'ad10', title: 'POSTER 10' },
  { src: 'ad11', title: 'POSTER 11' },
  { src: 'ad12', title: 'POSTER 12' },
  { src: 'ad13', title: 'POSTER 13' },
  { src: 'ad14', title: 'POSTER 14' },
  { src: 'ad15', title: 'POSTER 15' },
  { src: 'ad16', title: 'POSTER 16' },
  { src: 'ad17', title: 'POSTER 17' },
]

/* ── DESIGN › 02 CHARACTER POSTER ────────────────────── */
export const CHARACTER_POSTER_PAGES = [
  'cp1',
  'cp2',
  'cp3',
  'cp4',
  'cp5',
  'cp6',
  'cp7',
  'cp8',
]

/* ── DESIGN › 03 IP DESIGN ───────────────────────────── */
export const IP_DESIGN = {
  kicker: '03 / IP DESIGN',
  title: '晶透｜HBN数字生命',
  desc: [
    '围绕 HBN 科技护肤 × 晶透肌肤的品牌概念，将活性成分、透明质感与橙色晶体转化为角色语言。',
    '以精灵为原型，通过晶体装饰、半透明材质与流动光效，表现成分渗透肌肤的生命力，让科技护肤从抽象概念转化为可感知、可延展的数字生命形象。',
  ],
  swatches: [
    { name: 'HBN ORANGE', hex: '#ef7d2e' },
    { name: 'CLEAR WHITE', hex: '#f6f4f0' },
    { name: 'WARM BEIGE', hex: '#e6d5bf' },
  ],
  specs: [
    { k: 'FORM', v: '精灵 / 晶体 / 流动光体' },
    { k: 'MATERIAL', v: '半透明 / 玻璃 / 晶体' },
    { k: 'COLOR', v: 'HBN橙 / 透明白 / 暖米色' },
    { k: 'OUTPUT', v: '3D模型 / 三视图 / 表情 / 服装' },
    { k: 'TOOLS', v: '腾讯混元 / 即梦AI / 3D MAX' },
  ],
}

/* ── DESIGN › 02 PPT DESIGN ──────────────────────────── */
export const PPT_DESIGN = {
  kicker: '02 / PPT DESIGN',
  title: 'PPT DESIGN',
  cn: 'PPT 版式设计',
  pages: ['pp1', 'pp2', 'pp3'],
}

/* ── DESIGN › 04 XIAOHONGSHU COVER ──────────────────── */
export const XHS_COVER = {
  kicker: '05 / XIAOHONGSHU COVER',
  title: 'XIAOHONGSHU COVER',
  cn: '小红书封面设计',
  pages: ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8', 'x9'],
}

/* ── DESIGN › 06 STUDY SHEET DESIGN ─────────────────── */
export const STUDY_SHEET_DESIGN = {
  kicker: '06 / STUDY SHEET DESIGN',
  title: 'STUDY SHEET DESIGN',
  cn: '学习单设计',
  pages: ['ss1', 'ss2'],
}

/* ── DESIGN › 05 FONT DESIGN ─────────────────────────── */
export const FONT_DESIGN = [
  { src: 'f1', title: 'PHOENIX TYPEFACE', cn: '凤凰字体设计' },
  { src: 'f2', title: 'CULTURAL TYPE SYSTEM', cn: '文脉源字体系统' },
  { src: 'f3', title: 'PHOENIX APPLICATIONS', cn: '凤凰品牌延展' },
  { src: 'f4', title: 'CULTURAL CONTEXT POSTER', cn: '文脉源文化海报' },
]

/* ── DESIGN › 08 PACKAGING DESIGN ────────────────────── */
export const PACKAGING_DESIGN = {
  kicker: '08 / PACKAGING DESIGN',
  title: 'PACKAGING DESIGN',
  cn: '包装设计',
  pages: ['pk1', 'pk2'],
}

/* ── PHOTOGRAPH ──────────────────────────────────────── */
export const PHOTOS = [
  'p1', 'p2', 'p3', 'p4',
  'p5', 'p6', 'p7', 'p8',
  'p9', 'p1', 'p2', 'p3',
  'p4', 'p5', 'p6', 'p7',
]

/* ── VIDEO ───────────────────────────────────────────── */
export const VIDEOS = [
  {
    no: '01',
    en: 'ANIMATED AD',
    cn: '纳爱斯品牌动画广告',
    desc: '即梦辅助生成制作纳爱斯产品动画广告短片，获上海赛区动画类优秀奖',
    cover: 'pv1',
    href: 'https://pan.quark.cn/s/ac87160751c3',
  },
  {
    no: '02',
    en: 'VEDIO AD',
    cn: '可画影视广告',
    desc: '编剧、拍摄并剪辑可画广告短片',
    cover: 'pv2',
    href: 'https://pan.quark.cn/s/ac87160751c3',
  },
  {
    no: '03',
    en: 'ANIMATED SHORT',
    cn: '原创动画短片',
    desc: 'AI辅助编剧制作动画短片《附近的人》',
    cover: 'pv3',
    href: 'https://pan.quark.cn/s/ac87160751c3',
  },
]

/* ── WEBSITE & WRITING ───────────────────────────────── */
/* href 是占位：三个站点还没有可公开的正式地址，一律先指向 '#'，
   面板上的 OPEN PROJECT 同时带 aria-disabled。拿到真实链接后只改这三处。
   glow 是每张封面的主色，用来喂 .wsc__glow 的背景光晕 —— 原来那三个值
   （#f6e9c8 / #f7dcd8 / #dceccd）是掺了大量白的浅色，铺在 --paper #f8f7fa 上
   几乎没有色差，看不出光晕；这里往各自封面的主色方向加饱和度。 */
export const WEBSITES = [
  {
    no: '01',
    slug: 'COPYWRITING 文案',
    title: ['保利剧院', '微信公众号文案'],
    kicker: 'COPYWRITING 文案',
    desc: '打造上海保利城市剧院「陈解放脱口秀」全周期传播方案，从预热悬念海报到现场互动活动预告，负责撰写宣传期全四篇文案',
    cover: 'baoli',
    glow: '#f0d4d8', // 保利封面的浅粉
    href: '#',
  },
  {
    no: '02',
    slug: 'COPYWRITING 文案',
    title: ['光影传梦工作室', '微信公众号文案'],
    kicker: 'COPYWRITING 文案',
    desc: '在校融媒体中心期间独立撰写15+篇公众号文案，覆盖新生指南/大型活动纪实/职业发展等多元领域，总阅读量突破4000+',
    cover: 'drama',
    glow: '#f0b9a0',
    href: '#',
  },
  {
    no: '03',
    slug: 'COPYWRITING 文案',
    title: ['上海新东方四六级', '小红书文案'],
    kicker: 'COPYWRITING 文案',
    desc: '独立撰写20+篇小红书硬广文案，将课程信息与用户备考场景结合，并结合高意向搜索词优化内容匹配逻辑；实习期间累计主账号共计599次私信进线、472次有效开口，后期流量与转化呈明显增长趋势。',
    cover: 'wechat',
    glow: '#d7e3a4',
    href: '#',
  },
  {
    no: '04',
    slug: 'OPERATIONS 运营',
    title: ['光影传梦工作室', '微信公众号'],
    kicker: 'OPERATIONS 运营',
    desc: '2023.9 – 2025.6期间，负责公众号光影传梦工作室的运营',
    cover: 'guangying',
    glow: '#e6c8a8',
    href: '#',
  },
  {
    no: '05',
    slug: 'OPERATIONS 运营',
    title: ['上海新东方四六级', '小红书KOB账号'],
    kicker: 'OPERATIONS 运营',
    desc: '2026.3 – 2026.6期间，负责上海新东方大学事业部四六级项目的小红书KOB和KOS账号内容运营',
    cover: 'xhs1',
    glow: '#f0c8c0',
    href: '#',
  },
  {
    no: '06',
    slug: 'OPERATIONS 运营',
    title: ['上海新东方四六级', '小红书KOS账号'],
    kicker: 'OPERATIONS 运营',
    desc: '2026.3 – 2026.6期间，负责上海新东方大学事业部四六级项目的小红书KOB和KOS账号内容运营',
    cover: 'xhs2',
    glow: '#f0c8c0',
    href: '#',
  },
]

/* ── CONTACT：软木板便签 ─────────────────────────────── */
export const NOTE_COLORS = ['#cfe0c3', '#f0e6a8', '#e8b7b7', '#a9c9dd', '#e5cfe0', '#d8cdb8']

export const SEED_NOTES = [
  { id: 's1', text: '', color: '#cfe0c3', x: 14, y: 42, rot: -2 },
  { id: 's2', text: '', title: '简历', hint: '点击下载', href: '/assets/files/resume.pdf', downloadName: 'WYLIE WANG - 简历.pdf', color: '#f0e6a8', x: 70, y: 12, rot: 3 },
  { id: 's3', text: '', title: '作品集', hint: '点击下载', href: '/assets/files/portfolio.pdf', downloadName: 'WYLIE WANG - Portfolio.pdf', color: '#e8b7b7', x: 80, y: 33, rot: -3 },
]
