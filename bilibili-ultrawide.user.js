// ==UserScript==
// @name         哔哩哔哩宽屏适配（带鱼屏）
// @namespace    https://github.com/zhangwenqiang/bili-ultrawide
// @version      1.8.0
// @description  B站把内容区宽度写死了，超宽屏左右会白白空掉一大半。本脚本解除宽度上限并按窗口宽度自动算列数。首页/分区页多列；热门页多列；搜索页多列；动态页把左右侧栏收成顶部信息条、动态流瀑布流多列；播放页放大播放器、把评论区搬到右栏（顶掉弹幕列表和推荐列表），并把播放器钉住——滚评论时视频不动。
// @author       zhangwenqiang0214
// @license      MIT
// @homepageURL  https://github.com/zhangwenqiang0214/bili-ultrawide
// @supportURL   https://github.com/zhangwenqiang0214/bili-ultrawide/issues
// @downloadURL  https://raw.githubusercontent.com/zhangwenqiang0214/bili-ultrawide/main/bilibili-ultrawide.user.js
// @updateURL    https://raw.githubusercontent.com/zhangwenqiang0214/bili-ultrawide/main/bilibili-ultrawide.user.js
// @match        *://www.bilibili.com/*
// @match        *://bilibili.com/*
// @match        *://t.bilibili.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  /* ===================== 可调参数（一般只需要改第一个） ===================== */

  // 首页 / 分区页：每张视频卡片的目标宽度（px）。B站原生是 380。
  // 调小 → 每行卡片更多、更小；调大 → 每行更少、更大。
  // 3440 宽的屏幕：380→8列，340→9列，300→10列，440→7列
  const TARGET_CARD_WIDTH = 380;

  // 热门页：每张横条卡片的目标宽度（px）。B站原生是 638（一行 2 张）。
  const POPULAR_CARD_WIDTH = 638;

  // 动态页最多排几列。
  const DYNAMIC_MAX_COLUMNS = 4;

  // 播放页：播放器占内容区宽度的比例（剩下的全给评论区）。
  const PLAYER_RATIO = 0.62;

  // 播放页：是否连「合集 / 分P 列表」也一起隐藏。
  // 默认 false —— 隐藏它会让多P视频和合集失去选集入口，弹幕列表和推荐列表则一律隐藏。
  const HIDE_VIDEO_POD = false;

  // 首页要不要去掉这两样（纯口味问题，改成 false 就保留）
  const HIDE_HOME_BANNER = true;  // 顶部那张大 banner 图，占 176px 高
  const HIDE_HOME_SWIPE  = true;  // 信息流左上角那个 2×2 的大推荐位

  // 页面左右留白（px）。不要小于 60，否则首页右边的「换一换」按钮会顶出横向滚动条。
  const SIDE_PADDING = 60;

  /* ======================================================================== */

  const GAP       = 20;   // 首页/分区页 卡片间距
  const POP_GAP   = 10;   // 热门页 卡片间距
  const DYN_CARD  = 724;  // 动态卡片原生宽度
  const DYN_GAP   = 8;    // 动态卡片间距
  const DYN_SIDE  = 264 + 12 + 318 + 12; // 动态页左右侧栏 + 各自外边距
  const DYN_WIDE  = 1700; // 窗口宽于这个值，动态页才把侧栏收成顶部信息条
  const PLAY_WIDE = 2600; // 窗口宽于这个值，播放页才重排（窄屏保持 B站 原样更好用）
  const PLAY_GAP  = 24;   // 播放页 播放器和评论区之间的间距
  const SRCH_GUTTER = 16;  // 搜索页每格左右各 8px 内边距
  const SRCH_CARD   = 273; // 搜索页视频卡的原生宽度（B站 故意做得比首页小、一行塞 7 张，
                           // 所以这里保持它原生大小、只加列数，不套首页那个 380）
  const SRCH_WIDE_MIN = 2200; // 窄于这个值就不改列数 —— 原生响应式在 2200px 才排满 7 列，
                              // 更窄时按原生走，免得反而变少
  const SRCH_WIDE   = 680; // 搜索页「用户/媒体」那种横向卡的原生宽度
  const PLAY_TOP  = 64;   // 顶栏高度，左栏钉住时的吸顶位置
  const PLAY_MIN_W = 640; // 播放器宽度下限，避免极端情况下被压得太小
  // 左栏只留这三样，其余（简介/标签/广告/评论）搬到右栏 —— 左栏总高必须塞进一屏才钉得住
  const PLAY_KEEP_LEFT = ['viewbox_report', 'playerWrap', 'arc_toolbar_report'];

  // 按「页面上有什么」判断页面类型，而不是靠网址白名单：
  // 这样分区页、热门页各个子标签页都自动覆盖，B站以后加新的同款页面也一样生效。
  // :has() 是实时生效的，所以 document-start 就注入样式也不怕元素还没渲染出来。
  const FEED = 'html:has(#app > .bili-feed4)';              // 首页
  const CHAN = 'html:has(#app > .feedchannel)';             // 分区页 /c/xxx/
  const POP  = 'html:has(#app > .popular-container)';       // 热门页 /v/popular/*
  const DYN  = 'html:has(#app > [class^="bili-dyn-home"])'; // 动态页 t.bilibili.com
  const SRCH = 'html:has(#app > .search-layout)';           // 搜索页 search.bilibili.com
  const HOME = `${DYN} [class^="bili-dyn-home"]`;

  const css = `
    /* ---------- 通用：解除最外层容器和顶栏的宽度上限 ---------- */
    #app:has(> .bili-feed4),
    #app:has(> .feedchannel),
    #app:has(> .popular-container),
    #app:has(> .search-layout),
    #app:has(> [class^="bili-dyn-home"]) { max-width: none !important; }

    /* 顶栏：只要页面上有这个顶栏就拉满，不按页面类型限定 —— 播放页、动态页、搜索页等都吃这条。
       #app:has(> #biliMainHeader) 是给播放页解外层 2560px 上限用的；
       search.bilibili.com 实测顶栏拉满、页面内容完全不受影响（它的 #app 直接子节点不是 #biliMainHeader）。 */
    #app:has(> #biliMainHeader),
    #biliMainHeader,
    .bili-header,
    .bili-header__bar,
    .header-channel {
      max-width: none !important;
    }

    /* ---------- 首页 ---------- */
    ${FEED} { --layout-padding: ${SIDE_PADDING}px !important; }
    ${FEED} .bili-feed4-layout,
    ${FEED} .bili-feed4 .bili-header .bili-header__channel {
      max-width: none !important;
      width: auto !important;
    }
    /* 这个吸顶占位块写死了 width:100vw，100vw 含滚动条，会撑出横向滚动条 */
    ${FEED} .fixed-channel-shim { width: 100% !important; }
    ${FEED} .container.is-version8,
    ${FEED} .recommended-container_floor-aside .container {
      grid-template-columns: repeat(var(--uw-cols, 5), minmax(0, 1fr)) !important;
    }
    /* 顶部大 banner：压成 64px 的纯占位而不是 display:none —— 顶栏是 absolute 压在它上面的，
       不留位置会叠到分区导航上。未滚动时顶栏背景本来是透明的、靠 banner 图垫底，所以补个实色。
       实测文字对比度：暗色 12.48、浅色 17.58，都远高于 WCAG AA 的 4.5。 */
    ${HIDE_HOME_BANNER ? `
    ${FEED} .bili-header__banner {
      height: 64px !important; min-height: 0 !important;
      background: transparent !important; overflow: hidden !important;
    }
    ${FEED} .bili-header__banner > * { display: none !important; }
    ${FEED} .bili-header__bar:not(.slide-down) { background-color: var(--bg1_float) !important; }` : ''}
    ${HIDE_HOME_SWIPE ? `${FEED} .recommended-swipe { display: none !important; }` : ''}

    /* 广告位被拦截插件掏空后留下的空壳，收掉让后面的视频补位。
       判据用「没有封面图」，不能用「没有 .bili-video-card」—— 直播卡（floor-card）本来就没有它，会被误杀。
       骨架屏和加载锚点单独排除，免得加载过程中布局乱跳。
       实测 57 张真卡（普通卡/直播卡/bili-feed-card 直挂/骨架屏/加载锚点）全部有 picture 或 img，零误杀。 */
    ${FEED} .feed2 .container > *:not(.recommended-swipe):not(.load-more-anchor):not(:has(picture, img)):not(:has([class*="skeleton"])),
    ${CHAN} .channel-page__body .feed-cards > *:not(:has(picture, img)):not(:has([class*="skeleton"])) {
      display: none !important;
    }

    /* ---------- 分区页（/c/tech/ 这类，和首页是两套完全不同的布局） ---------- */
    ${CHAN} .feedchannel { max-width: none !important; }
    ${CHAN} .feedchannel-main,
    ${CHAN} .channel-header .bili-header__channel,
    ${CHAN} .fixed-side-menu,
    ${CHAN} #biliMainFooter .b-footer-wrap {
      --layout-padding: ${SIDE_PADDING}px !important;
      max-width: none !important;
      width: auto !important;
    }
    ${CHAN} .bili-header__banner .header-banner__inner,
    ${CHAN} .bili-header__channel { max-width: none !important; }
    /* B站把列数放在一个构建哈希命名的变量里（如 --7c7fe7cc），重新打包就会变，
       所以直接覆盖 grid-template-columns，不去碰那个变量 */
    ${CHAN} .channel-page__body .head-cards,
    ${CHAN} .channel-page__body .feed-cards,
    ${CHAN} .channel-page__body .loading-cards {
      grid-template-columns: repeat(var(--uw-cols, 5), minmax(0, 1fr)) !important;
    }

    /* ---------- 热门页（综合热门 / 每周必看 / 入站必刷 / 排行榜） ---------- */
    ${POP} .popular-container {
      max-width: none !important;
      padding-left: ${SIDE_PADDING}px !important;
      padding-right: ${SIDE_PADDING}px !important;
    }
    /* 原生靠 :nth-child(odd) 的 margin 撑两列间距，改列数后会歪，统一换成 flex gap */
    ${POP} .card-list, ${POP} .video-list, ${POP} .rank-list {
      gap: 0 ${POP_GAP}px !important;
      justify-content: flex-start !important;
    }
    ${POP} .card-list .video-card,
    ${POP} .video-list .video-card,
    ${POP} .rank-list .rank-item {
      width: calc((100% - (var(--uw-pop-cols, 2) - 1) * ${POP_GAP}px) / var(--uw-pop-cols, 2)) !important;
      margin-right: 0 !important;
    }

    /* ---------- 搜索页 ---------- */
    /* 所有标签页（综合/视频/番剧/影视/直播/专栏/用户）的外层都是 .i_wrapper，统一卡 2200px，一条就够 */
    ${SRCH} .i_wrapper {
      max-width: none !important;
      padding-left: ${SIDE_PADDING}px !important;
      padding-right: ${SIDE_PADDING}px !important;
    }
    /* 列数只在够宽时才改。原生响应式到 2200px 才排满 7 列（col_xl_1_7 → max-width:14.28%），
       比这更窄的话按我们的算法反而会变少，所以让给原生。 */
    @media (min-width: ${SRCH_WIDE_MIN}px) {
      ${SRCH} .video-list.row > * {
        flex: 0 0 calc(100% / var(--uw-srch-cols, 7)) !important;
        max-width: calc(100% / var(--uw-srch-cols, 7)) !important;
      }
      /* 用户/媒体是横向卡（原生 1/3、约 669px 宽），容器变宽后必须重新分列，
         否则每张会被拉到 1100px 以上、内容撑不满 */
      ${SRCH} .media-list.row > *,
      ${SRCH} .user-list.row > * {
        flex: 0 0 calc(100% / var(--uw-srch-wide-cols, 3)) !important;
        max-width: calc(100% / var(--uw-srch-wide-cols, 3)) !important;
      }
    }

    /* ---------- 动态页 ---------- */
    ${HOME} {
      padding-left: ${SIDE_PADDING}px !important;
      padding-right: ${SIDE_PADDING}px !important;
    }
    /* 动态卡片高度参差不齐，所以是瀑布流（每张卡紧跟上一张，不按横行对齐）。
       位置由下面的 JS 算，这里只负责把容器变成定位参考系。
       uw-masonry 这个类只由脚本加在正确的元素上，所以不需要页面类型守卫。 */
    .uw-masonry { position: relative !important; display: block !important; }
    .uw-masonry > .bili-dyn-list__item {
      position: absolute !important; top: 0; left: 0; margin: 0 !important;
    }
    ${DYN} .bili-dyn-list__item { margin-bottom: 0 !important; }

    /* 窄窗口：保持 B站 原来的左中右三栏，只把中间放宽到刚好放下算出来的列数 */
    @media (max-width: ${DYN_WIDE - 0.1}px) {
      ${HOME} > main {
        width: auto !important;
        flex: 1 1 auto !important;
        max-width: var(--uw-dyn-main, ${DYN_CARD}px) !important;
      }
    }

    /* 宽窗口：把左右侧栏的四个模块收成顶部一条横向信息条，动态流独占整行。
       侧栏本身内容很少却占着一整列的高度，这是超宽屏上最大的浪费。 */
    @media (min-width: ${DYN_WIDE}px) {
      ${HOME} { flex-wrap: wrap !important; align-items: flex-start !important; }
      ${HOME} > aside.left,
      ${HOME} > aside.right {
        order: 1 !important;
        width: auto !important;
        margin: 0 0 12px !important;
        display: flex !important;
        flex-direction: row !important;
        gap: 12px !important;
        align-items: flex-start !important;
      }
      ${HOME} > aside.left  { flex: 2 1 0 !important; margin-right: 12px !important; }
      ${HOME} > aside.right { flex: 3 1 0 !important; }
      /* position:static —— 登录态下热搜那个 section 带 .sticky，横排后会乱飘 */
      ${DYN} aside.left > *, ${DYN} aside.right > * {
        flex: 1 1 0 !important; min-width: 0 !important; margin: 0 !important; position: static !important;
      }
      ${HOME} > main {
        order: 2 !important;
        flex: 0 0 100% !important;
        width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
      }
      /* 「正在直播」竖着排会把信息条撑很高，改成横向滚动，只占一行 */
      ${DYN} .bili-dyn-live-users__body {
        display: flex !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
      }
      ${DYN} .bili-dyn-live-users__container { flex: 0 0 250px !important; }
      /* 热搜 10 条竖排同理，改成按列宽自动分列 */
      ${DYN} .bili-dyn-search-trendings .trending-list {
        column-width: 220px !important;
        column-count: auto !important;
        column-gap: 12px !important;
      }
      ${DYN} .bili-dyn-search-trendings .trending-list .trending { break-inside: avoid !important; }
    }
    /* ---------- 播放页 ---------- */
    /* 播放器尺寸是 B站 按视口高度算的，拉宽容器它不会跟着变大，只会在右边留黑边，
       所以这里显式给它宽高（16:9 + 56px 控制条），实测弹幕层和控制条会一起缩放。
       网页全屏 / 全屏 时必须让开，否则会把那两个模式压回小窗。 */
    html.uw-play:not(:has(.mode-webscreen)):not(:has(.player-full-class)):not(:has(:fullscreen)) #playerWrap {
      height: auto !important;
    }
    html.uw-play:not(:has(.mode-webscreen)):not(:has(.player-full-class)):not(:has(:fullscreen)) #bilibili-player {
      width: 100% !important;
      height: calc(var(--uw-player-w) * 0.5625 + 56px) !important;
    }
    html.uw-play #app.app-v1 { max-width: none !important; }
    html.uw-play .video-container-v1 {
      max-width: none !important; min-width: 0 !important;
      padding-left: ${SIDE_PADDING}px !important; padding-right: ${SIDE_PADDING}px !important;
      justify-content: flex-start !important;
    }
    /* 左栏钉住，滚评论时视频一动不动。
       B站 自带的 .scroll-sticky 是 position:sticky 但不给 top，靠 JS 随滚动渐进上移，
       视频会跟着上下挪 —— 这里直接把 top 写死（作者样式的 !important 优先于它的行内 style）。
       前提是左栏总高塞得进一屏，所以简介/标签/广告都搬去了右栏，播放器高度也按剩余空间反算。 */
    html.uw-play .video-container-v1 { align-items: flex-start !important; }
    html.uw-play .video-container-v1 > .left-container {
      width: var(--uw-player-w) !important; flex: 0 0 auto !important;
      position: sticky !important; top: ${PLAY_TOP}px !important;
      align-self: flex-start !important; height: fit-content !important;
    }
    /* 右栏原本 411px 固定宽、还带 pointer-events:none，放评论区必须都改掉 */
    html.uw-play .video-container-v1 > .right-container {
      width: auto !important; flex: 1 1 auto !important;
      margin-left: ${PLAY_GAP}px !important; pointer-events: auto !important;
    }
    html.uw-play .video-container-v1 > .right-container #danmukuBox,
    html.uw-play .video-container-v1 > .right-container .recommend-list-v1,
    html.uw-play .video-container-v1 > .right-container #right-bottom-banner,
    html.uw-play .video-container-v1 > .right-container .right-bottom-banner,
    html.uw-play .video-container-v1 > .right-container .ad-report { display: none !important; }
    ${HIDE_VIDEO_POD ? 'html.uw-play .video-container-v1 > .right-container .video-pod { display: none !important; }' : ''}
  `;

  const style = document.createElement('style');
  style.id = 'bili-ultrawide';
  style.textContent = css;
  // document-start 时 <head> 可能还不存在，挂到 documentElement 上一样生效
  (document.head || document.documentElement).appendChild(style);

  // B站的列数是靠媒体查询硬编码死的（首页/分区页封顶 5 列，热门页 2 列）。
  // 这里按目标卡片宽度四舍五入算列数，保证不同窗口宽度下卡片大小都接近目标值，
  // 而不是被拉得忽大忽小。
  function applyColumns() {
    const w = document.documentElement.clientWidth;
    const avail = w - SIDE_PADDING * 2;
    const set = (k, v) => document.documentElement.style.setProperty(k, v);

    set('--uw-cols', Math.min(12, Math.max(4,
      Math.round((avail + GAP) / (TARGET_CARD_WIDTH + GAP)))));

    set('--uw-pop-cols', Math.min(8, Math.max(2,
      Math.round((avail + POP_GAP) / (POPULAR_CARD_WIDTH + POP_GAP)))));

    // 搜索页：保持它自己的原生卡片宽度，只把行里塞更多张（跟首页一样的原则，但基准值不同）
    set('--uw-srch-cols', Math.min(16, Math.max(2,
      Math.round(avail / (SRCH_CARD + SRCH_GUTTER)))));
    set('--uw-srch-wide-cols', Math.min(8, Math.max(1,
      Math.round(avail / SRCH_WIDE))));

    // 动态页：宽窗口下侧栏已经搬到顶部，整行都归动态流；窄窗口下要扣掉左右侧栏
    set('--uw-dyn-main', (dynColumns() * DYN_CARD + (dynColumns() - 1) * DYN_GAP) + 'px');

    // 播放页：播放器宽度取「左栏还能塞下的最大 16:9」和「按比例分给播放器的宽度」中的小者。
    // 前者是反算出来的 —— 左栏（标题+播放器+工具栏）必须整体塞进一屏，否则钉不住；
    // 遇到两行标题的视频会自动把播放器缩一点，而不是撑破一屏。
    const budget = leftColumnBudget();
    const byHeight = budget !== null
      ? (budget - 56) / 0.5625                       // 56px 是播放器控制条
      : (window.innerHeight - 300) * 16 / 9;         // 元素还没渲染出来时的兜底
    set('--uw-player-w', Math.max(PLAY_MIN_W,
      Math.round(Math.min(byHeight, avail * PLAYER_RATIO))) + 'px');
  }

  /* ---------- 动态页瀑布流 ---------- */
  // 为什么自己算位置，而不用现成的两种 CSS 方案：
  //   grid          → 行高由该行最高的卡片决定，矮卡片下面留一大块空洞（用户明确反对）
  //   column-count  → 没有空洞，但无限加载时浏览器会把所有卡片重新分配到各列，
  //                   正在看的内容会跳走
  // 这里：每张新卡片放进当前最矮的那一列，已放好的卡片永不移动 —— 既没空洞，加载更多也不跳。
  const M = {box: null, placed: [], heights: [], colW: 0, cols: 0, ro: null, mo: null, raf: 0, dirty: new Set()};

  function dynColumns() {
    const w = document.documentElement.clientWidth;
    const avail = w - SIDE_PADDING * 2;
    // 宽窗口下侧栏已搬到顶部，整行都归动态流；窄窗口下要扣掉左右侧栏
    const feed = w >= DYN_WIDE ? avail : avail - DYN_SIDE;
    return Math.min(DYNAMIC_MAX_COLUMNS, Math.max(1,
      Math.floor((feed + DYN_GAP) / (DYN_CARD + DYN_GAP))));
  }

  const dynItems = () => M.box
    ? [...M.box.children].filter(e => e.classList.contains('bili-dyn-list__item'))
    : [];

  function dynPlace(from) {
    const list = dynItems();
    for (let i = from; i < list.length; i++) {
      const el = list[i];
      let c = 0;
      for (let j = 1; j < M.cols; j++) if (M.heights[j] < M.heights[c] - 0.5) c = j;
      el.style.width = M.colW + 'px';
      el.style.left = Math.round(c * (M.colW + DYN_GAP)) + 'px';
      el.style.top = Math.round(M.heights[c]) + 'px';
      el.dataset.uwCol = c;
      M.heights[c] += el.getBoundingClientRect().height + DYN_GAP;
      M.placed.push(el);
      // border-box：卡片高度变化常常来自 padding 之类的非内容尺寸，默认的 content-box 收不到
      M.ro.observe(el, {box: 'border-box'});
    }
    M.box.style.height = Math.round(Math.max(0, ...M.heights)) + 'px';
  }

  // 某张卡片高度变了（图片加载完、点了「展开」）：只把同一列里它下面的卡片重新码一遍，
  // 其它列一个像素都不动。
  function dynRestack(col) {
    let y = 0;
    M.placed.forEach(el => {
      if (+el.dataset.uwCol !== col) return;
      el.style.top = Math.round(y) + 'px';
      y += el.getBoundingClientRect().height + DYN_GAP;
    });
    M.heights[col] = y;
    M.box.style.height = Math.round(Math.max(0, ...M.heights)) + 'px';
  }

  function dynRelayout() {
    M.placed = [];
    M.heights = new Array(M.cols).fill(0);
    M.ro.disconnect();
    M.colW = (M.box.clientWidth - (M.cols - 1) * DYN_GAP) / M.cols;
    dynPlace(0);
  }

  function dynClear() {
    M.box.classList.remove('uw-masonry');
    M.box.style.height = '';
    dynItems().forEach(el => {
      el.style.width = el.style.left = el.style.top = '';
      delete el.dataset.uwCol;
    });
    M.placed = [];
    M.ro.disconnect();
  }

  function dynApply() {
    if (!M.box) return;
    const cols = dynColumns();
    if (cols <= 1) { M.cols = 1; dynClear(); return; } // 单列就交还给原生流式布局
    M.cols = cols;
    M.box.classList.add('uw-masonry');
    dynRelayout();
  }

  // DOM 变了：末尾追加就只排新增的（老卡片不动）；出现插队/删除/整体刷新则全量重排
  function dynSync() {
    const list = dynItems();
    if (!M.box.classList.contains('uw-masonry')) return;
    let appendOnly = list.length >= M.placed.length;
    if (appendOnly) {
      for (let i = 0; i < M.placed.length; i++) {
        if (list[i] !== M.placed[i]) { appendOnly = false; break; }
      }
    }
    if (!appendOnly) dynRelayout();
    else if (list.length > M.placed.length) dynPlace(M.placed.length);
  }

  function setupMasonry() {
    const box = document.querySelector('.bili-dyn-list__items');
    if (!box) return false;
    M.box = box;
    if (!M.ro) {
      M.ro = new ResizeObserver(entries => {
        entries.forEach(en => {
          const c = en.target.dataset.uwCol;
          if (c !== undefined) M.dirty.add(+c);
        });
        // 攒到下一帧再重排：图片批量加载时会有几十个回调，逐个重排会抖
        if (!M.raf) M.raf = requestAnimationFrame(() => {
          M.raf = 0;
          const cols = [...M.dirty]; M.dirty.clear();
          cols.forEach(dynRestack);
        });
      });
    }
    if (!M.mo) {
      M.mo = new MutationObserver(dynSync);
      M.mo.observe(box, {childList: true});
    }
    dynApply();
    return true;
  }

  // 播放页需要一次 DOM 搬运：评论区在左栏里面，纯 CSS 没法把它挪到右栏
  // （试过 grid + display:contents，UP 卡片会把共享的表格行撑高、把播放器往下顶 377px）。
  let leftObserver = null;

  const rightInner = () =>
    document.querySelector('.video-container-v1 > .right-container .right-container-inner') ||
    document.querySelector('.video-container-v1 > .right-container');

  // 左栏里除了播放器以外的东西（标题、工具栏）占多高，剩下的就是播放器的高度预算
  function leftColumnBudget() {
    const lc = document.querySelector('.video-container-v1 > .left-container');
    const pw = document.getElementById('playerWrap');
    if (!lc || !pw) return null;
    let other = 0;
    for (const el of lc.children) {
      if (el === pw) continue;
      const r = el.getBoundingClientRect();
      if (!r.height) continue;
      const c = getComputedStyle(el);
      other += r.height + parseFloat(c.marginTop) + parseFloat(c.marginBottom);
    }
    return document.documentElement.clientHeight - PLAY_TOP - other - 8;
  }

  let movedCount = 0;
  function movePlayParts() {
    const lc = document.querySelector('.video-container-v1 > .left-container');
    const right = rightInner();
    if (!lc || !right) return false;
    movedCount = 0;
    for (const el of [...lc.children]) {
      if (!PLAY_KEEP_LEFT.includes(el.id)) { right.appendChild(el); movedCount++; }
    }
    const app = document.getElementById('commentapp');
    if (app && app.parentElement === right) right.appendChild(app); // 评论排在右栏最后
    return !!app;
  }

  function setupPlayPage() {
    if (!document.querySelector('.video-container-v1')) return false;
    if (document.documentElement.clientWidth < PLAY_WIDE) return true; // 窄屏保持 B站 原样
    document.documentElement.classList.add('uw-play');
    // 关键：必须等 <bili-comments> 挂载之后再搬。
    // 搬得太早（document-start 一发现元素就搬）会被 Vue 重新渲染回左栏 —— 实测 50ms 搬走、615ms 就被塞回去了。
    if (!document.querySelector('bili-comments')) return false;
    if (!movePlayParts()) return false;
    applyColumns(); // 左栏变矮了，重算播放器宽度
    // 保险：万一之后又被塞回左栏就再搬一次。只盯左栏的直接子节点增删，
    // 不用 subtree —— 播放页弹幕层每秒都在变，全量监听开销太大。
    const lc = document.querySelector('.video-container-v1 > .left-container');
    if (lc && !leftObserver) {
      // 万一 Vue 之后又把这些节点塞回左栏，再搬一次并重算播放器宽度。
      // 只在真的搬动过时才重算，避免和自己的 DOM 改动互相触发。
      leftObserver = new MutationObserver(() => { if (movePlayParts() && movedCount) applyColumns(); });
      leftObserver.observe(lc, { childList: true });
    }
    return true;
  }

  applyColumns();
  addEventListener('resize', () => { applyColumns(); dynApply(); }, { passive: true });

  // 播放页和动态页都要等元素出现。轮询而不是全页 MutationObserver：
  // 播放页 DOM 变动极其频繁，全量监听不划算。
  let playOk = setupPlayPage(), dynOk = setupMasonry();
  if (!playOk || !dynOk) {
    const iv = setInterval(() => {
      if (!playOk) playOk = setupPlayPage();
      if (!dynOk) dynOk = setupMasonry();
      if (playOk && dynOk) clearInterval(iv);
    }, 200);
    setTimeout(() => clearInterval(iv), 30000);
  }
})();
