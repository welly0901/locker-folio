import { useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import CloseButton from './CloseButton';
import './overlay.css';
import './projects.css';

/* ============================================================
 * ProjectsSection —— 独立可复用的「Projects 时间轴」板块
 * 依赖：
 *   1. react
 *   2. motion（npm i motion）—— 仅用于标题入场动画
 *   3. Tailwind CSS（样式均为 Tailwind 工具类，含任意值写法）
 * 如需增删项目，直接修改下方 projects 数组即可。
 * ========================================================== */

type ToneKey = 'green' | 'rose' | 'sand' | 'purple';

interface ProjectItem {
  id: number;
  date: string;
  title: ReactNode;
  tone: ToneKey;
  /** 展开卡片的最大高度：内容较长时用 max-h-[1200px] */
  maxHeight: 'max-h-[1000px]' | 'max-h-[1200px]';
  role: string;
  keywords: ReactNode;
  intro: string;
  results: ReactNode[];
}

/* 各配色对应的节点 / 卡片 / 文字样式 */
const toneStyles: Record<
  ToneKey,
  { dotActive: string; dotIdle: string; card: string; accent: string }
> = {
  green: {
    dotActive: 'bg-[#86B05D] scale-125',
    dotIdle: 'bg-[#F7E6D4] hover:bg-[#86B05D]',
    card: 'shadow-[0_4px_20px_rgba(134,176,93,0.15)] border-[#86B05D]/20',
    accent: 'text-[#86B05D]',
  },
  rose: {
    dotActive: 'bg-[#C77974] scale-125',
    dotIdle: 'bg-[#F7E6D4] hover:bg-[#C77974]',
    card: 'shadow-[0_4px_20px_rgba(199,121,116,0.15)] border-[#C77974]/20',
    accent: 'text-[#C77974]',
  },
  sand: {
    dotActive: 'bg-[#E7C58A] scale-125',
    dotIdle: 'bg-[#F7E6D4] hover:bg-[#E7C58A]',
    card: 'shadow-[0_4px_20px_rgba(231,197,138,0.15)] border-[#E7C58A]/20',
    accent: 'text-[#E7C58A]',
  },
  purple: {
    dotActive: 'bg-[#5758A6] scale-125',
    dotIdle: 'bg-[#F7E6D4] hover:bg-[#5758A6]',
    card: 'shadow-[0_4px_20px_rgba(87,88,166,0.15)] border-[#5758A6]/20',
    accent: 'text-[#5758A6]',
  },
};

const projects: ProjectItem[] = [
  /* ---------- 项目1：融媒体中心策划部干事 ---------- */
  {
    id: 1,
    date: '2023.09 – 2024.06',
    tone: 'green',
    maxHeight: 'max-h-[1000px]',
    title: (
      <>
        融媒体中心<span className="text-[#86B05D] font-bold">策划部</span>干事
      </>
    ),
    role: '策划部干事',
    keywords: '内容策划 / 数据分析 / 公众号运营 / 用户洞察',
    intro:
      '参与学院公众号主题与活动策划，结合用户评论与互动数据，对不同内容主题进行分析与优化，提升公众号内容传播效果。',
    results: [
      <>
        参与策划学院公众号<span className="font-bold text-[#4B3535]">内容选题</span>与
        <span className="font-bold text-[#4B3535]">活动方案</span>
      </>,
      <>
        策划案采纳率 <span className="font-bold text-[#4B3535]">90%+</span>
      </>,
      <>
        整理 <span className="font-bold text-[#4B3535]">50+ 条</span>内容数据与用户评论
      </>,
      <>
        推动公众号内容传播 总阅读量 <span className="font-bold text-[#4B3535]">1.6W+</span>
      </>,
    ],
  },

  /* ---------- 项目2：融媒体中心策划部部长 ---------- */
  {
    id: 2,
    date: '2024.06 – 2025.06',
    tone: 'rose',
    maxHeight: 'max-h-[1000px]',
    title: (
      <>
        融媒体中心<span className="text-[#C77974] font-bold">策划部</span>/
        <span className="text-[#C77974] font-bold">记者团</span>部长
      </>
    ),
    role: '策划部兼记者团部长',
    keywords: '热点分析 / 内容运营 / 团队管理 / 项目推进',
    intro:
      '负责学院融媒体中心策划部与记者团的内容运营与管理工作，结合平台热点与用户兴趣设计内容选题，并统筹团队完成内容制作与活动执行。',
    results: [
      <>
        追踪 <span className="font-bold text-[#4B3535]">抖音 / B站 / 微博</span>
        热点趋势 优化公众号选题
      </>,
      <>
        参与制作 <span className="font-bold text-[#4B3535]">20+ 篇</span>公众号推文
      </>,
      <>
        单篇推文 最高阅读量 <span className="font-bold text-[#4B3535]">5000+</span>
      </>,
      <>
        账号整体阅读量 提升约<span className="font-bold text-[#4B3535]">20%</span>
      </>,
      <>
        统筹 <span className="font-bold text-[#4B3535]">10人</span>团队 推进部门任务
      </>,
      <>
        活动参与度 提升<span className="font-bold text-[#4B3535]">50%</span>
      </>,
    ],
  },

  /* ---------- 项目3：剧院创意营销活动宣传 ---------- */
  {
    id: 3,
    date: '2024.12',
    tone: 'sand',
    maxHeight: 'max-h-[1000px]',
    title: (
      <>
        剧院<span className="text-[#E7C58A] font-bold">创意营销活动宣传</span>
      </>
    ),
    role: '活动宣传策划成员',
    keywords: '短视频营销 / 活动传播 / 文案策划 / 用户洞察',
    intro:
      '参与保利上海城市剧院“剧院创意营销活动”宣传策划，通过短视频内容与公众号推文结合，提升活动传播效果。',
    results: [
      <>
        制作 <span className="font-bold text-[#4B3535]">3支</span>活动预热短视频
      </>,
      <>
        撰写 <span className="font-bold text-[#4B3535]">4篇</span>公众号推文
      </>,
      <>
        文案采纳率 <span className="font-bold text-[#4B3535]">100%</span>
      </>,
      <>
        推动活动曝光 提升<span className="font-bold text-[#4B3535]">25%</span>
      </>,
      <>
        项目获得 <span className="font-bold text-[#4B3535]">活动优胜组</span>
      </>,
    ],
  },

  /* ---------- 项目4：融里民俗模拟媒介投放 ---------- */
  {
    id: 4,
    date: '2025.05',
    tone: 'purple',
    maxHeight: 'max-h-[1000px]',
    title: (
      <>
        融里民俗<span className="text-[#5758A6] font-bold">模拟媒介投放</span>
      </>
    ),
    role: '媒介投放策略负责人',
    keywords: '媒介策略 / 广告投放 / 预算规划 / 品牌传播',
    intro:
      '基于品牌传播目标制定媒介投放策略，完成媒介渠道选择、预算分配与投放规划，模拟品牌整合传播过程。',
    results: [
      <>
        制定完整 <span className="font-bold text-[#4B3535]">媒介投放策略方案</span>
      </>,
      <>
        规划 <span className="font-bold text-[#4B3535]">海报 / 视频 / 直播</span>广告投放
      </>,
      <>
        完成<span className="font-bold text-[#4B3535]">渠道与预算</span>配置
      </>,
      <>
        最终媒介投方案评分 <span className="font-bold text-[#4B3535]">85+</span>
      </>,
    ],
  },

  /* ---------- 项目5：南上海品牌创新挑战赛 ---------- */
  {
    id: 5,
    date: '2025.10 – 2025.12',
    tone: 'green',
    maxHeight: 'max-h-[1000px]',
    title: (
      <>
        南上海<span className="text-[#86B05D] font-bold">品牌创新挑战赛</span>
      </>
    ),
    role: '账号运营负责人',
    keywords: '账号运营 / 内容策略 / 用户增长 / 市场调研',
    intro:
      '负责品牌挑战赛账号整体运营，制定内容发布策略并结合用户兴趣优化内容方向，同时通过调研分析目标用户需求。',
    results: [
      <>
        账号 总曝光量 <span className="font-bold text-[#4B3535]">5W+</span>
      </>,
      <>
        首页推荐 占比<span className="font-bold text-[#4B3535]">50%+</span>
      </>,
      <>
        1个月粉丝增长 <span className="font-bold text-[#4B3535]">160+</span>
      </>,
      <>
        主页访客 <span className="font-bold text-[#4B3535]">800+</span>
      </>,
      <>
        完成 <span className="font-bold text-[#4B3535]">100+ </span>用户调研样本
      </>,
      <>
        项目获得 <span className="font-bold text-[#4B3535]">比赛三等奖</span>
      </>,
    ],
  },

  /* ---------- 项目6：市场部实习 ---------- */
  {
    id: 6,
    date: '2025.10 – 2026.01',
    tone: 'rose',
    maxHeight: 'max-h-[1000px]',
    title: (
      <>
        <span className="text-[#C77974] font-bold">市场部实习</span>｜上海普爱纳米位移技术有限公司
      </>
    ),
    role: '市场部实习生',
    keywords: '公众号运营 / 行业内容 / 视频号运营 / 平台分析',
    intro:
      '在公司市场部负责公众号内容策划与行业资讯撰写，同时参与视频号内容制作，并进行多平台内容形态与用户行为分析。',
    results: [
      <>
        输出 <span className="font-bold text-[#4B3535]">5+ 篇</span>行业技术类推文
      </>,
      <>
        平均阅读量 <span className="font-bold text-[#4B3535]">500+</span>
      </>,
      <>
        多篇文章被 <span className="font-bold text-[#4B3535]">公司宣传材料</span>收录
      </>,
      <>
        制作产品演示与案例视频 播放<span className="font-bold text-[#4B3535]">1000+</span>
      </>,
      <>
        输出 <span className="font-bold text-[#4B3535]">5份</span>平台内容分析报告
      </>,
      <>
        每周提供<span className="font-bold text-[#4B3535]">数据分析</span>支持优化内容方向
      </>,
    ],
  },

  /* ---------- 项目7：新东方小红书运营实习 ---------- */
  {
    id: 7,
    date: '2026.03 – 2026.06',
    tone: 'purple',
    maxHeight: 'max-h-[1200px]',
    title: (
      <>
        <span className="text-[#5758A6] font-bold">小红书新媒体运营实习生</span>
        ｜上海新东方大学事业部·四六级项目组
      </>
    ),
    role: '小红书新媒体运营实习生',
    keywords: '私信承接｜内容增长｜SEM搜索策略｜数据分析｜线索转化',
    intro:
      '负责四六级项目小红书渠道线上运营，参与用户从内容触达—私信咨询—留资转化的完整运营链路。主要负责私信承接、工单数据分析、小红书硬广内容制作及搜索词体系搭建，通过数据分析与内容优化提升高意向用户转化效率。',
    results: [
      <>
        搭建私信承接SOP，优化用户沟通路径及信息采集流程，用户体验评分由{' '}
        <span className="font-bold text-[#4B3535]">4.3 提升至 4.9</span>，开口留资率由{' '}
        <span className="font-bold text-[#4B3535]">58% 提升至 70%</span>
      </>,
      <>
        建立数据复盘机制，基于进线关键词与工单数据分析不同用户画像及转化情况，反向优化
        <span className="font-bold text-[#4B3535]">前端内容素材</span>与
        <span className="font-bold text-[#4B3535]">后端话术</span>，提高高意向线索识别效率
      </>,
      <>
        参与 <span className="font-bold text-[#4B3535]">20 篇</span>
        小红书图文硬广制作，拆解高转化素材共性，结合搜索流量优化内容结构，使优质素材留资成本由约{' '}
        <span className="font-bold text-[#4B3535]">500元降低至300元</span>，提升线索转工单效率
      </>,
      <>
        构建四六级<span className="font-bold text-[#4B3535]">搜索词体系</span>
        ，结合SEM买词逻辑梳理品类词、长尾词、人群词、地区词及蓝海词，建立用户搜索意图模型，指导内容选题及搜索流量承接策略
      </>,
    ],
  },

  /* ---------- 项目8：品牌管理实习 ---------- */
  {
    id: 8,
    date: '2026.08至今',
    tone: 'sand',
    maxHeight: 'max-h-[1200px]',
    title: (
      <>
        <span className="text-[#E7C58A] font-bold">品牌管理实习生</span>｜蔚来品牌管理团队
      </>
    ),
    role: '品牌管理实习生',
    keywords: '品牌资产｜品牌规范｜海外洞察｜AI工具｜视觉管理',
    intro:
      '参与蔚来全球品牌管理相关工作，负责品牌资产平台运营、品牌视觉规范及全球品牌项目支持。参与 Brand Portal、Canva 等品牌资产管理平台的AI能力接入与应用探索，同时参与海外品牌触点研究，通过品牌规范管理、资产管理及数据分析支持品牌全球化运营与传播一致性。',
    results: [
      <>
        参与品牌资产管理平台运营维护，协助梳理、分类及更新品牌视觉资产与规范文件；参与 Brand
        Portal、Canva 等平台AI能力接入，探索AI在品牌资产管理、检索及内容使用场景中的应用，提升资产管理效率
      </>,
      <>
        参与品牌节点项目视觉规范文书制作与发放，协助开展品牌视觉物料审核及规范落地，同时支持品牌培训材料、课程资料及数据报告整理，推动品牌标准在不同项目与团队中的统一执行
      </>,
      <>
        参与 ABOVE品牌触点提升项目海外部分，协助问卷撰写与分发，围绕海外品牌触点开展品牌契合度评分及用户反馈收集，汇总分析各触点评价并输出报告，为海外品牌传播一致性及触点优化提供数据支持
      </>,
    ],
  },
];

export function ProjectsSection() {
  // 单值状态：同一时间只展开一个项目，点击其他自动收起
  const [activeProject, setActiveProject] = useState<number | null>(null);

  const toggleProject = (id: number) => {
    setActiveProject((prev) => (prev === id ? null : id));
  };

  return (
    <section
      id="projects"
      className="min-h-screen flex items-center justify-center px-6 py-20 bg-transparent"
    >
      <div className="max-w-5xl w-full">
        {/* 标题 - 淡入上滑 */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.5, ease: [0.42, 0, 0.58, 1] }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-[#4B3535] mb-4">Projects</h2>
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: '4rem' }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.42, 0, 0.58, 1] }}
            className="h-1 bg-[#5758A6] mx-auto rounded-full mb-4"
          ></motion.div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.5, delay: 0.3, ease: [0.42, 0, 0.58, 1] }}
            className="text-base text-[#4B3535]/70"
          >
            点击项目卡片可查看详细实习经历介绍
          </motion.p>
        </motion.div>

        {/* 时间轴容器 */}
        <div className="relative">
          {/* 垂直时间轴线 */}
          <div className="absolute left-8 md:left-12 top-0 bottom-0 w-1 bg-[#5758A6]"></div>

          {/* 项目列表 */}
          <div className="space-y-12">
            {projects.map((project) => {
              const tone = toneStyles[project.tone];
              const isActive = activeProject === project.id;

              return (
                <div key={project.id} className="relative">
                  {/* 时间轴节点 */}
                  <button
                    type="button"
                    aria-expanded={isActive}
                    onClick={() => toggleProject(project.id)}
                    className={`absolute left-6 md:left-10 w-6 h-6 rounded-full border-4 border-white transition-all duration-300 ${
                      isActive ? tone.dotActive : tone.dotIdle
                    }`}
                    style={{ top: '8px' }}
                  ></button>

                  <div className="ml-16 md:ml-24">
                    <button
                      type="button"
                      onClick={() => toggleProject(project.id)}
                      className="text-left w-full"
                    >
                      <p className="text-[#5758A6] font-medium mb-1">{project.date}</p>
                      <h3 className="text-xl md:text-2xl font-bold text-[#4B3535] mb-2">
                        {project.title}
                      </h3>
                    </button>

                    {/* 详细卡片 */}
                    <div
                      className={`overflow-hidden transition-all duration-500 ease-in-out ${
                        isActive
                          ? `${project.maxHeight} opacity-100 mt-4`
                          : 'max-h-0 opacity-0'
                      }`}
                    >
                      <div
                        className={`p-6 md:p-8 rounded-xl border bg-transparent ${tone.card}`}
                      >
                        <div className="grid md:grid-cols-2 gap-6 mb-6">
                          <div>
                            <p className="text-[#4B3535]/60 text-sm mb-1">项目角色</p>
                            <p className="text-[#4B3535] font-medium">{project.role}</p>
                          </div>
                          <div>
                            <p className="text-[#4B3535]/60 text-sm mb-1">关键词</p>
                            <p className={`${tone.accent} font-medium`}>{project.keywords}</p>
                          </div>
                        </div>

                        <div className="mb-6">
                          <p className="text-[#4B3535]/60 text-sm mb-2">项目简介</p>
                          <p className="text-[#4B3535]/80 leading-relaxed">{project.intro}</p>
                        </div>

                        <div>
                          <p className="text-[#4B3535]/60 text-sm mb-3">项目成果</p>
                          <ul className="space-y-2 text-[#4B3535]/80">
                            {project.results.map((result, index) => (
                              <li key={index} className="flex items-start">
                                <span className={`${tone.accent} mr-2`}>•</span>
                                <span>{result}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * 浮层适配：PROJECTS 时间轴挂进 OverlayHost。
 * 返回键（CloseButton）保留在右上角，Escape / 状态机关闭逻辑不变。
 */
export default function ProjectsCard() {
  return (
    <div className="ov ov--pj">
      <CloseButton />
      <ProjectsSection />
    </div>
  );
}
