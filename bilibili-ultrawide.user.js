// ==UserScript==
// @name         哔哩哔哩宽屏适配（带鱼屏）
// @namespace    https://github.com/zhangwenqiang/bili-ultrawide
// @version      1.4.0
// @description  B站把内容区宽度写死了，超宽屏左右会白白空掉一大半。本脚本解除宽度上限并按窗口宽度自动算列数。首页/分区页多列；热门页多列；动态页把左右侧栏收成顶部信息条、动态流独占整行；播放页放大播放器并把评论区搬到右栏（顶掉弹幕列表和推荐列表）。
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
  const PLAY_RESERVE = 300; // 播放器上下要给顶栏/标题/工具栏留出的高度

  // 按「页面上有什么」判断页面类型，而不是靠网址白名单：
  // 这样分区页、热门页各个子标签页都自动覆盖，B站以后加新的同款页面也一样生效。
  // :has() 是实时生效的，所以 document-start 就注入样式也不怕元素还没渲染出来。
  const FEED = 'html:has(#app > .bili-feed4)';              // 首页
  const CHAN = 'html:has(#app > .feedchannel)';             // 分区页 /c/xxx/
  const POP  = 'html:has(#app > .popular-container)';       // 热门页 /v/popular/*
  const DYN  = 'html:has(#app > [class^="bili-dyn-home"])'; // 动态页 t.bilibili.com
  const HOME = `${DYN} [class^="bili-dyn-home"]`;

  const css = `
    /* ---------- 通用：解除最外层容器和顶栏的宽度上限 ---------- */
    #app:has(> .bili-feed4),
    #app:has(> .feedchannel),
    #app:has(> .popular-container),
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

    /* ---------- 动态页 ---------- */
    ${HOME} {
      padding-left: ${SIDE_PADDING}px !important;
      padding-right: ${SIDE_PADDING}px !important;
    }
    /* 动态卡片高度参差不齐。这里用 grid 而不是 CSS 多列瀑布流：
       多列布局在无限加载时会把已有卡片重新分配，正在看的内容会跳走；
       grid 只往下加新行，上面的卡片不动。align-items:start 防止矮卡片被拉高。 */
    ${DYN} .bili-dyn-list__items,
    ${DYN} .bili-dyn-list:has(> .bili-dyn-list__item) {
      display: grid !important;
      grid-template-columns: repeat(var(--uw-dyn-cols, 1), minmax(0, 1fr)) !important;
      gap: ${DYN_GAP}px !important;
      align-items: start !important;
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
    html.uw-play .video-container-v1 > .left-container {
      width: var(--uw-player-w) !important; flex: 0 0 auto !important;
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

    // 动态页：宽窗口下侧栏已经搬到顶部，整行都归动态流；窄窗口下要扣掉左右侧栏
    const dynAvail = w >= DYN_WIDE ? avail : avail - DYN_SIDE;
    const dynCols = Math.min(DYNAMIC_MAX_COLUMNS, Math.max(1,
      Math.floor((dynAvail + DYN_GAP) / (DYN_CARD + DYN_GAP))));
    set('--uw-dyn-cols', dynCols);
    set('--uw-dyn-main', (dynCols * DYN_CARD + (dynCols - 1) * DYN_GAP) + 'px');

    // 播放页：播放器宽度取「视口高度放得下的最大 16:9」和「按比例分给播放器的宽度」中的小者，
    // 保证整个播放器一屏能看完，剩下的宽度全归评论区。
    set('--uw-player-w', Math.round(Math.min(
      (window.innerHeight - PLAY_RESERVE) * 16 / 9,
      avail * PLAYER_RATIO)) + 'px');
  }

  // 播放页需要一次 DOM 搬运：评论区在左栏里面，纯 CSS 没法把它挪到右栏
  // （试过 grid + display:contents，UP 卡片会把共享的表格行撑高、把播放器往下顶 377px）。
  let leftObserver = null;
  function moveComments() {
    const app = document.getElementById('commentapp');
    const right = document.querySelector('.video-container-v1 > .right-container .right-container-inner')
               || document.querySelector('.video-container-v1 > .right-container');
    if (!app || !right) return false;
    if (app.parentElement !== right) right.appendChild(app);
    return true;
  }

  function setupPlayPage() {
    if (!document.querySelector('.video-container-v1')) return false;
    if (document.documentElement.clientWidth < PLAY_WIDE) return true; // 窄屏保持 B站 原样
    document.documentElement.classList.add('uw-play');
    // 关键：必须等 <bili-comments> 挂载之后再搬。
    // 搬得太早（document-start 一发现元素就搬）会被 Vue 重新渲染回左栏 —— 实测 50ms 搬走、615ms 就被塞回去了。
    if (!document.querySelector('bili-comments')) return false;
    if (!moveComments()) return false;
    // 保险：万一之后又被塞回左栏就再搬一次。只盯左栏的直接子节点增删，
    // 不用 subtree —— 播放页弹幕层每秒都在变，全量监听开销太大。
    const lc = document.querySelector('.video-container-v1 > .left-container');
    if (lc && !leftObserver) {
      leftObserver = new MutationObserver(moveComments);
      leftObserver.observe(lc, { childList: true });
    }
    return true;
  }

  applyColumns();
  addEventListener('resize', applyColumns, { passive: true });

  if (!setupPlayPage()) {
    // 轮询而不是全页 MutationObserver：播放页 DOM 变动极其频繁，全量监听不划算
    const iv = setInterval(() => { if (setupPlayPage()) clearInterval(iv); }, 200);
    setTimeout(() => clearInterval(iv), 30000);
  }
})();
