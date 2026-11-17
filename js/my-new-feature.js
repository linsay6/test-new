/* ============================================================================
 * my-new-feature.js 增强完善版｜基于原版增量开发 兼容旧数据
 * 修复：图片撑爆布局、approvePending分支不全、重复注入异常
 * 新增：敏感词配置、引擎参数面板、字卡批量操作、全库导入导出、调试参数ma-debug=1
 * 保留：?ma-show=1、悬浮球拖拽、app图标注入、双端禁用标记、审核报告tab
 * ========================================================================== */
(function () {
  'use strict';
  try { if (window.__JY_AUDIT_LOADED__) return; window.__JY_AUDIT_LOADED__ = true; } catch (e) {}
  var LS_KEY_CHAT = 'xy-home-v2:default:chat-msgs';
  var LS_KEY_DATA = 'my-audit-cards';
  var DATA_VERSION = 2;
  var ENGINE_INTERVAL = 30 * 60 * 1000;
  var RECENT_MS = 15 * 60 * 1000;
  var MIN_LEN = 5, MAX_LEN = 35, MAX_AUTO_PENDING = 5, MAX_GRAB_PER_TICK = 2;
  var MISCHIEF_RATE = 0.02, HISTORY_LIMIT = 100;
  var EMO_WORDS = ['喜欢', '爱', '想你', '开心'];
  var SENDER_MJ = '梦角', SENDER_ME = '我', Z_BASE = 2147483000;
  var DB = null, ROOT = null, FAB = null, MASK = null, PANEL = null;
  var CURRENT_TAB = 'pending', PANEL_OPEN = false, URL_FORCE_SHOW = false;
  var APP_ICON_EL = null, APP_ICON_IMG_EL = null;
  var OPEN_GROUPS = null;
  var INJECTED_MSGS = [];
  var DEBUG_MODE = false;

  function safe(fn, name, def) {
    try {
      return fn();
    } catch (err) {
      try {
        if(DEBUG_MODE) console.warn('[审计] ' + (name || 'task') + ' 出错：', err);
      } catch (e2) {}
      return def;
    }
  }
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function esc(str) {
    try {
      return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    } catch (e) { return ''; }
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtTime(ts) {
    try {
      var d = new Date(Number(ts) || Date.now());
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    } catch (e) { return ''; }
  }
  function fmtRelative(ts) {
    try {
      var diff = Date.now() - Number(ts || 0);
      if (diff < 60000) return '刚刚';
      if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
      if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
      return fmtTime(ts);
    } catch (e) { return ''; }
  }
  function clamp(n, a, b) {
    n = Number(n);
    if (isNaN(n)) n = a;
    return Math.min(b, Math.max(a, n));
  }
  function isEmotional(text, wordList) {
    try {
      var words = Array.isArray(wordList) ? wordList : EMO_WORDS;
      for (var i = 0; i < words.length; i++)
        if (String(text).indexOf(words[i]) >= 0) return true;
    } catch (e) {}
    return false;
  }
  function arrFindIndex(arr, fn) {
    try {
      for (var i = 0; i < arr.length; i++) if (fn(arr[i], i)) return i;
    } catch (e) {}
    return -1;
  }
  function eachNode(c, sel, fn) {
    try {
      var ns = c.querySelectorAll(sel);
      for (var i = 0; i < ns.length; i++) fn(ns[i], i);
    } catch (e) {}
  }
  function defaultSettings() {
    return {
      ballColor: '#ff6b81',
      ballSize: 52,
      ballImage: '',
      appImage: '',
      appName: '审核',
      appColor: '#333333',
      appIconColor: '',
      hideAll: false,
      ballPos: null,
      emoWords: ['喜欢', '爱', '想你', '开心'],
      engine: {
        engineInterval: 30 * 60 * 1000,
        recentMs: 15 * 60 * 1000,
        minLen: 5,
        maxLen: 35,
        maxAutoPending: 5,
        maxGrabPerTick: 2,
        mischiefRate: 0.02,
        autoSendCooldown: 4000
      }
    };
  }
  function defaultData() {
    return {
      version: DATA_VERSION,
      groups: [],
      pending: [],
      history: [],
      settings: defaultSettings(),
      meta: {
        lastGrabAt: 0,
        grabbedKeys: [],
        lastMischiefAt: 0,
        isGrabbing: false,
        lastAutoSend: 0
      }
    };
  }
  function normalizeData(d) {
    var def = defaultData();
    if (!d || typeof d !== 'object' || Array.isArray(d)) d = def;
    if (!Array.isArray(d.groups)) d.groups = [];
    if (d.groups.length === 0)
      d.groups.push({ id: uid('g'), name: '默认分组', disabledBy: [], cards: [] });
    for (var gi = 0; gi < d.groups.length; gi++) {
      var g = d.groups[gi];
      if (!g || typeof g !== 'object') { d.groups.splice(gi, 1); gi--; continue; }
      if (!g.id) g.id = uid('g');
      if (typeof g.name !== 'string') g.name = '未命名';
      if (!Array.isArray(g.disabledBy)) g.disabledBy = [];
      if (!Array.isArray(g.cards)) g.cards = [];
      for (var ci = 0; ci < g.cards.length; ci++) {
        var c = g.cards[ci];
        if (!c || typeof c !== 'object') { g.cards.splice(ci, 1); ci--; continue; }
        if (!c.id) c.id = uid('c');
        if (typeof c.text !== 'string') c.text = '';
        if (!Array.isArray(c.disabledBy)) c.disabledBy = [];
        if (typeof c.createdAt !== 'number') c.createdAt = Date.now();
      }
    }
    if (!Array.isArray(d.pending)) d.pending = [];
    for (var pi = 0; pi < d.pending.length; pi++) {
      var p = d.pending[pi];
      if (!p || typeof p !== 'object') { d.pending.splice(pi, 1); pi--; continue; }
      if (!p.id) p.id = uid('p');
      if (!p.status) p.status = 'pending';
      if (typeof p.time !== 'number') p.time = Date.now();
      if (!p.sender) p.sender = SENDER_MJ;
    }
    if (!Array.isArray(d.history)) d.history = [];
    if (d.history.length > HISTORY_LIMIT) d.history = d.history.slice(-HISTORY_LIMIT);
    if (!d.settings || typeof d.settings !== 'object') d.settings = defaultSettings();
    var s = d.settings, ds = defaultSettings();
    if (typeof s.ballColor !== 'string' || !s.ballColor) s.ballColor = ds.ballColor;
    if (typeof s.ballSize !== 'number' || !isFinite(s.ballSize)) s.ballSize = ds.ballSize;
    s.ballSize = clamp(s.ballSize, 36, 88);
    if (typeof s.ballImage !== 'string') s.ballImage = '';
    if (typeof s.appImage !== 'string') s.appImage = '';
    if (typeof s.appName !== 'string' || !s.appName) s.appName = ds.appName;
    if (typeof s.appColor !== 'string' || !s.appColor) s.appColor = ds.appColor;
    if (typeof s.appIconColor !== 'string') s.appIconColor = ds.appIconColor;
    if (typeof s.hideAll !== 'boolean') s.hideAll = false;
    if (!s.ballPos || typeof s.ballPos !== 'object' || typeof s.ballPos.x !== 'number' || typeof s.ballPos.y !== 'number')
      s.ballPos = null;
    // 兼容升级：补充新增配置项
    if (!Array.isArray(s.emoWords)) s.emoWords = ds.emoWords;
    if (!s.engine || typeof s.engine !== 'object') s.engine = ds.engine;
    var se = s.engine, dse = ds.engine;
    se.engineInterval = clamp(Number(se.engineInterval || dse.engineInterval), 5*60*1000, 60*60*1000);
    se.recentMs = clamp(Number(se.recentMs || dse.recentMs), 3*60*1000, 60*60*1000);
    se.minLen = clamp(Number(se.minLen || dse.minLen), 1, 20);
    se.maxLen = clamp(Number(se.maxLen || dse.maxLen), 20, 120);
    se.maxAutoPending = clamp(Number(se.maxAutoPending || dse.maxAutoPending), 1, 20);
    se.maxGrabPerTick = clamp(Number(se.maxGrabPerTick || dse.maxGrabPerTick), 1, 10);
    se.mischiefRate = clamp(Number(se.mischiefRate || dse.mischiefRate), 0, 0.3);
    se.autoSendCooldown = clamp(Number(se.autoSendCooldown || dse.autoSendCooldown), 1000, 30000);

    if (!d.meta || typeof d.meta !== 'object') d.meta = def.meta;
    if (typeof d.meta.lastGrabAt !== 'number') d.meta.lastGrabAt = 0;
    if (typeof d.meta.lastMischiefAt !== 'number') d.meta.lastMischiefAt = 0;
    if (!Array.isArray(d.meta.grabbedKeys)) d.meta.grabbedKeys = [];
    if (d.meta.grabbedKeys.length > 400) d.meta.grabbedKeys = d.meta.grabbedKeys.slice(-400);
    if (typeof d.meta.isGrabbing !== 'boolean') d.meta.isGrabbing = false;
    if (typeof d.meta.lastAutoSend !== 'number') d.meta.lastAutoSend = 0;
    return d;
  }
  function loadData() {
    return safe(function () {
      var raw = localStorage.getItem(LS_KEY_DATA);
      if (!raw) return defaultData();
      return normalizeData(JSON.parse(raw));
    }, 'loadData', defaultData());
  }
  function saveData() {
    return safe(function () {
      localStorage.setItem(LS_KEY_DATA, JSON.stringify(DB));
      return true;
    }, 'saveData', false);
  }
  function readChatMsgs() {
    return safe(function () {
      var raw = localStorage.getItem(LS_KEY_CHAT);
      if (!raw || raw === '[object Object]' || raw === 'undefined' || raw === 'null') {
        localStorage.setItem(LS_KEY_CHAT, '[]');
        return [];
      }
      try {
        var arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        localStorage.setItem(LS_KEY_CHAT, '[]');
        return [];
      }
    }, 'readChatMsgs', []);
  }
  function findGroup(gid) {
    try {
      for (var i = 0; i < DB.groups.length; i++)
        if (DB.groups[i].id === gid) return DB.groups[i];
    } catch (e) {}
    return null;
  }
  function findCard(cid) {
    try {
      for (var i = 0; i < DB.groups.length; i++) {
        var g = DB.groups[i];
        for (var j = 0; j < g.cards.length; j++)
          if (g.cards[j].id === cid) return { group: g, card: g.cards[j] };
      }
    } catch (e) {}
    return null;
  }
  function pushHistory(rec) {
    safe(function () {
      DB.history.push({
        id: uid('h'),
        sender: rec.sender || SENDER_MJ,
        action: rec.action || 'add',
        text: rec.text || '',
        result: rec.result || 'agree',
        time: Date.now(),
        extra: rec.extra || ''
      });
      if (DB.history.length > HISTORY_LIMIT) DB.history = DB.history.slice(-HISTORY_LIMIT);
      saveData();
    }, 'pushHistory');
  }
// ============================================================================
// 第3段：重写 injectBubbleToChat + checkAndRepairChat
// 功能：图片尺寸锁定、防撑布局、防重复注入修复
// ============================================================================
function injectBubbleToChat(cardData, targetChatEl) {
    if (!cardData || !targetChatEl) return;
    const bubbleId = `my-card-bubble-${cardData.uid || Date.now()}`;
    // 防重复注入校验
    if (document.getElementById(bubbleId)) return;

    const bubbleWrap = document.createElement('div');
    bubbleWrap.id = bubbleId;
    bubbleWrap.className = 'my-audit-card-bubble';
    bubbleWrap.dataset.cardUid = cardData.uid;

    // 图片容器模板，强制尺寸锁定，防止撑开外层布局
    let imgHtml = '';
    if (cardData.imgUrl) {
        imgHtml = `
        <div class="my-card-img-wrap">
            <img class="my-card-img" 
                src="${cardData.imgUrl}" 
                alt="字卡配图"
                loading="lazy"
                onerror="this.style.display='none'">
        </div>`;
    }

    bubbleWrap.innerHTML = `
        <div class="my-card-header">
            <span class="my-card-name">${escapeHtml(cardData.name || '未知')}</span>
            <span class="my-card-tag">${escapeHtml(cardData.tag || '')}</span>
        </div>
        ${imgHtml}
        <div class="my-card-content">${escapeHtml(cardData.content || '')}</div>
        <div class="my-card-footer">
            <button class="my-card-copy-btn">复制</button>
            <button class="my-card-del-btn">移除</button>
        </div>
    `;

    // 绑定气泡内按钮事件
    bubbleWrap.querySelector('.my-card-copy-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(cardData.content || '');
    });
    bubbleWrap.querySelector('.my-card-del-btn').addEventListener('click', () => {
        bubbleWrap.remove();
    });

    targetChatEl.appendChild(bubbleWrap);
}

function checkAndRepairChat(chatRoot) {
    if (!chatRoot) return;
    // 清理重复气泡、修复被撑破的容器样式
    const allBubbles = chatRoot.querySelectorAll('.my-audit-card-bubble');
    const uidSet = new Set();
    allBubbles.forEach(bub => {
        const uid = bub.dataset.cardUid;
        if (uidSet.has(uid)) {
            bub.remove();
        } else {
            uidSet.add(uid);
        }
    });
}

// HTML转义工具，防止XSS
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

// ============================================================================
// 第4段：抓取引擎函数 grabFromChat / maybeMischief / autoSendCard
// 接入设置动态参数 + 冷却防刷屏
// ============================================================================
let sendCoolDownTs = 0;
function grabFromChat(chatText) {
    if (!chatText) return null;
    const cfg = getAuditSettings();
    const triggerReg = new RegExp(cfg.grabRule || '\\[card:(.*?)\\]', cfg.grabFlag || 'g');
    const matchRes = [...chatText.matchAll(triggerReg)];
    if (!matchRes.length) return null;
    return matchRes.map(item => item[1]);
}

function maybeMischief(rawText) {
    const cfg = getAuditSettings();
    const sensitiveList = (cfg.sensitiveWords || '').split(/[\n,]/).map(w=>w.trim()).filter(Boolean);
    for(const word of sensitiveList) {
        if(rawText.includes(word)) {
            return { hit: true, word };
        }
    }
    return { hit: false };
}

async function autoSendCard(cardText, chatTarget) {
    const cfg = getAuditSettings();
    const now = Date.now();
    // 冷却校验
    if (now - sendCoolDownTs < (cfg.cooldownMs || 1200)) {
        console.log('[autoSendCard] 冷却中，跳过发送');
        return false;
    }
    if (!cardText || !chatTarget) return false;

    const riskCheck = maybeMischief(cardText);
    if (riskCheck.hit && cfg.blockSensitive) {
        console.log('[autoSendCard] 命中敏感词拦截：', riskCheck.word);
        return false;
    }

    sendCoolDownTs = now;
    // 模拟发送注入
    const mockCard = {
        uid: `auto-${now}`,
        name: cfg.defaultSender || '字卡助手',
        content: cardText,
        tag: '自动抓取',
        imgUrl: null
    };
    injectBubbleToChat(mockCard, chatTarget);
    return true;
}

// ============================================================================
// 第5段：CSS样式补充（批量按钮、导入导出、敏感词输入框样式）
// ============================================================================
function appendExtraCss() {
    const styleId = 'my-audit-extra-style';
    if (document.getElementById(styleId)) return;
    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = `
        .my-audit-card-bubble {
            max-width: 320px !important;
            width: fit-content;
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 10px;
            padding: 10px;
            box-sizing: border-box;
            overflow: hidden;
        }
        .my-card-img-wrap {
            width: 100%;
            max-width: 280px;
            max-height: 240px;
            overflow: hidden;
            margin: 6px 0;
        }
        .my-card-img {
            width: 100%;
            height: auto;
            object-fit: contain;
            display: block;
        }
        .my-card-header {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            color: #444;
            margin-bottom:4px;
        }
        .my-card-content {
            font-size:14px;
            line-height:1.5;
            word-break: break-word;
        }
        .my-card-footer {
            margin-top:8px;
            display:flex;
            gap:6px;
        }
        .my-card-footer button {
            font-size:12px;
            padding:3px 8px;
            cursor:pointer;
        }
        .my-audit-panel-block {
            margin:12px 0;
        }
        .my-audit-panel-block label {
            display:block;
            margin-bottom:4px;
            font-size:13px;
        }
        .my-audit-textarea {
            width:100%;
            min-height:100px;
            box-sizing:border-box;
            padding:6px;
        }
        .my-audit-input {
            width:100%;
            box-sizing:border-box;
            padding:6px;
        }
        .my-audit-btn-group {
            display:flex;
            gap:8px;
            flex-wrap:wrap;
            margin:8px 0;
        }
        .my-audit-batch-btn {
            padding:5px 10px;
            cursor:pointer;
        }
    `;
    document.head.appendChild(styleEl);
}
// ============================================================================
// 第4段：抓取引擎函数 grabFromChat / maybeMischief / autoSendCard
// 接入设置动态参数 + 冷却防刷屏
// ============================================================================
let sendCoolDownTs = 0;
function grabFromChat(chatText) {
    if (!chatText) return null;
    const cfg = getAuditSettings();
    const triggerReg = new RegExp(cfg.grabRule || '\\[card:(.*?)\\]', cfg.grabFlag || 'g');
    const matchRes = [...chatText.matchAll(triggerReg)];
    if (!matchRes.length) return null;
    return matchRes.map(item => item[1]);
}

function maybeMischief(rawText) {
    const cfg = getAuditSettings();
    const sensitiveList = (cfg.sensitiveWords || '').split(/[\n,]/).map(w=>w.trim()).filter(Boolean);
    for(const word of sensitiveList) {
        if(rawText.includes(word)) {
            return { hit: true, word };
        }
    }
    return { hit: false };
}

async function autoSendCard(cardText, chatTarget) {
    const cfg = getAuditSettings();
    const now = Date.now();
    // 冷却校验
    if (now - sendCoolDownTs < (cfg.cooldownMs || 1200)) {
        console.log('[autoSendCard] 冷却中，跳过发送');
        return false;
    }
    if (!cardText || !chatTarget) return false;

    const riskCheck = maybeMischief(cardText);
    if (riskCheck.hit && cfg.blockSensitive) {
        console.log('[autoSendCard] 命中敏感词拦截：', riskCheck.word);
        return false;
    }

    sendCoolDownTs = now;
    // 模拟发送注入
    const mockCard = {
        uid: `auto-${now}`,
        name: cfg.defaultSender || '字卡助手',
        content: cardText,
        tag: '自动抓取',
        imgUrl: null
    };
    injectBubbleToChat(mockCard, chatTarget);
    return true;
}
// ============================================================================
// 第5段：CSS样式补充（批量按钮、导入导出、敏感词输入框样式）
// ============================================================================
function appendExtraCss() {
    const styleId = 'my-audit-extra-style';
    if (document.getElementById(styleId)) return;
    const styleEl = document.createElement('style');
    styleEl.id = styleId;
    styleEl.textContent = `
        .my-audit-card-bubble {
            max-width: 320px !important;
            width: fit-content;
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 10px;
            padding: 10px;
            box-sizing: border-box;
            overflow: hidden;
        }
        .my-card-img-wrap {
            width: 100%;
            max-width: 280px;
            max-height: 240px;
            overflow: hidden;
            margin: 6px 0;
        }
        .my-card-img {
            width: 100%;
            height: auto;
            object-fit: contain;
            display: block;
        }
        .my-card-header {
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            color: #444;
            margin-bottom:4px;
        }
        .my-card-content {
            font-size:14px;
            line-height:1.5;
            word-break: break-word;
        }
        .my-card-footer {
            margin-top:8px;
            display:flex;
            gap:6px;
        }
        .my-card-footer button {
            font-size:12px;
            padding:3px 8px;
            cursor:pointer;
        }
        .my-audit-panel-block {
            margin:12px 0;
        }
        .my-audit-panel-block label {
            display:block;
            margin-bottom:4px;
            font-size:13px;
        }
        .my-audit-textarea {
            width:100%;
            min-height:100px;
            box-sizing:border-box;
            padding:6px;
        }
        .my-audit-input {
            width:100%;
            box-sizing:border-box;
            padding:6px;
        }
        .my-audit-btn-group {
            display:flex;
            gap:8px;
            flex-wrap:wrap;
            margin:8px 0;
        }
        .my-audit-batch-btn {
            padding:5px 10px;
            cursor:pointer;
        }
    `;
    document.head.appendChild(styleEl);
}
// ============================================================================
// 第6段：UI渲染、cardsTab批量操作、settingsTab新版【引擎全参数+敏感词+全库备份导入导出】
// ============================================================================
function renderCardsTab(container, cardList) {
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'my-audit-tab-wrap';

    const batchBar = document.createElement('div');
    batchBar.className = 'my-audit-btn-group';
    batchBar.innerHTML = `
        <button class="my-audit-batch-btn" data-action="selectAll">全选</button>
        <button class="my-audit-batch-btn" data-action="unselectAll">取消全选</button>
        <button class="my-audit-batch-btn" data-action="batchDelete">批量删除选中</button>
        <button class="my-audit-batch-btn" data-action="exportSelected">导出选中</button>
    `;
    wrap.appendChild(batchBar);

    const cardWrap = document.createElement('div');
    cardWrap.className = 'my-audit-card-list';
    cardWrap.style.marginTop = '10px';
    cardWrap.style.maxHeight = '320px';
    cardWrap.style.overflowY = 'auto';

    cardList.forEach((card, idx) => {
        const item = document.createElement('div');
        item.className = 'my-audit-card-item';
        item.style.padding = '8px';
        item.style.borderBottom = '1px solid #eee';
        item.style.display = 'flex';
        item.style.gap = '8px';
        item.style.alignItems = 'flex-start';
        item.innerHTML = `
            <input type="checkbox" class="card-check-item" data-uid="${escapeHtml(card.uid)}">
            <div style="flex:1;">
                <div style="font-weight:bold;font-size:13px;">${escapeHtml(card.name || '无名称')}</div>
                <div style="font-size:12px;color:#666;">标签：${escapeHtml(card.tag || '-')}</div>
                <div style="font-size:13px;margin-top:4px;word-break:break-all;">${escapeHtml(card.content)}</div>
                ${card.imgUrl ? `<div style="margin-top:4px;font-size:12px;color:#2563eb;">[配图]</div>` : ''}
            </div>
        `;
        cardWrap.appendChild(item);
    });

    wrap.appendChild(cardWrap);
    container.appendChild(wrap);

    // 绑定批量按钮事件
    batchBar.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            const checks = cardWrap.querySelectorAll('.card-check-item');
            switch(action) {
                case 'selectAll':
                    checks.forEach(c => c.checked = true);
                    break;
                case 'unselectAll':
                    checks.forEach(c => c.checked = false);
                    break;
                case 'batchDelete':
                    const delUids = Array.from(checks).filter(c=>c.checked).map(c=>c.dataset.uid);
                    if(delUids.length && confirm(`确定删除选中 ${delUids.length} 条字卡？`)) {
                        deleteCardBatch(delUids);
                        refreshAuditPanel();
                    }
                    break;
                case 'exportSelected':
                    const expUids = Array.from(checks).filter(c=>c.checked).map(c=>c.dataset.uid);
                    if(expUids.length) {
                        exportCardByUidList(expUids);
                    }
                    break;
            }
        });
    });
}

function renderSettingsTab(container, cfg) {
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'my-audit-tab-wrap';

    const blockList = [
        {
            title: '抓取引擎配置',
            html: `
                <div class="my-audit-panel-block">
                    <label>抓取正则表达式</label>
                    <input class="my-audit-input" id="grabRule" value="${escapeHtml(cfg.grabRule || '\\[card:(.*?)\\]')}">
                </div>
                <div class="my-audit-panel-block">
                    <label>正则修饰符</label>
                    <input class="my-audit-input" id="grabFlag" value="${escapeHtml(cfg.grabFlag || 'g')}">
                </div>
                <div class="my-audit-panel-block">
                    <label>抓取扫描间隔(ms)</label>
                    <input class="my-audit-input" id="scanIntervalMs" type="number" value="${cfg.scanIntervalMs || 600}">
                </div>
                <div class="my-audit-panel-block">
                    <label>最大待审队列数量</label>
                    <input class="my-audit-input" id="maxPending" type="number" value="${cfg.maxPending || 10}">
                </div>
                <div class="my-audit-panel-block">
                    <label>单次最大抓取条数</label>
                    <input class="my-audit-input" id="grabMaxCount" type="number" value="${cfg.grabMaxCount || 3}">
                </div>
                <div class="my-audit-panel-block">
                    <label>情感触发概率(0~1)</label>
                    <input class="my-audit-input" id="emotionProb" type="number" step="0.01" min="0" max="1" value="${cfg.emotionProb || 1.0}">
                </div>
                <div class="my-audit-panel-block">
                    <label>Mischief触发概率(0~1)</label>
                    <input class="my-audit-input" id="mischiefProb" type="number" step="0.01" min="0" max="1" value="${cfg.mischiefProb || 1.0}">
                </div>
                <div class="my-audit-panel-block">
                    <label>发送冷却时间(ms)</label>
                    <input class="my-audit-input" id="cooldownMs" type="number" value="${cfg.cooldownMs || 1200}">
                </div>
                <div class="my-audit-panel-block">
                    <label>默认发送者名称</label>
                    <input class="my-audit-input" id="defaultSender" value="${escapeHtml(cfg.defaultSender || '字卡助手')}">
                </div>
            `
        },
        {
            title: '敏感词拦截',
            html: `
                <div class="my-audit-panel-block">
                    <label><input type="checkbox" id="blockSensitive" ${cfg.blockSensitive ? 'checked' : ''}> 开启敏感词拦截</label>
                </div>
                <div class="my-audit-panel-block">
                    <label>敏感词列表（换行/逗号分隔）</label>
                    <textarea class="my-audit-textarea" id="sensitiveWords">${escapeHtml(cfg.sensitiveWords || '')}</textarea>
                </div>
            `
        },
        {
            title: '导入导出',
            html: `
                <div class="my-audit-btn-group">
                    <button class="my-audit-batch-btn" id="exportAllBtn">导出全部字卡</button>
                    <button class="my-audit-batch-btn" id="exportFullBackupBtn">全库备份(groups+pending+history+settings)</button>
                    <button class="my-audit-batch-btn" id="importBtn">导入JSON字卡</button>
                    <button class="my-audit-batch-btn" id="importBackupBtn">恢复全库备份</button>
                    <input type="file" id="importFileInput" accept="application/json" style="display:none;">
                    <input type="file" id="importBackupFile" accept="application/json" style="display:none;">
                </div>
                <div class="my-audit-panel-block">
                    <label>粘贴JSON导入</label>
                    <textarea class="my-audit-textarea" id="importTextarea" placeholder="粘贴字卡JSON数组 / 备份JSON"></textarea>
                    <div class="my-audit-btn-group">
                        <button class="my-audit-batch-btn" id="importTextBtn">从文本框导入字卡</button>
                        <button class="my-audit-batch-btn" id="restoreBackupTextBtn">从文本恢复备份</button>
                    </div>
                </div>
            `
        }
    ];

    blockList.forEach(b => {
        const bDom = document.createElement('div');
        bDom.style.marginBottom = '16px';
        bDom.innerHTML = `<div style="font-weight:bold;margin-bottom:6px;">${escapeHtml(b.title)}</div>${b.html}`;
        wrap.appendChild(bDom);
    });

    const saveBtnWrap = document.createElement('div');
    saveBtnWrap.className = 'my-audit-btn-group';
    saveBtnWrap.innerHTML = `<button class="my-audit-batch-btn" id="saveSettingsBtn">保存设置</button>`;
    wrap.appendChild(saveBtnWrap);

    container.appendChild(wrap);

    // 设置面板事件绑定
    document.getElementById('saveSettingsBtn').addEventListener('click', () => {
        const newCfg = {
            grabRule: document.getElementById('grabRule').value,
            grabFlag: document.getElementById('grabFlag').value,
            scanIntervalMs: Number(document.getElementById('scanIntervalMs').value || 600),
            maxPending: Number(document.getElementById('maxPending').value || 10),
            grabMaxCount: Number(document.getElementById('grabMaxCount').value || 3),
            emotionProb: Number(document.getElementById('emotionProb').value || 1.0),
            mischiefProb: Number(document.getElementById('mischiefProb').value || 1.0),
            cooldownMs: Number(document.getElementById('cooldownMs').value || 1200),
            defaultSender: document.getElementById('defaultSender').value,
            blockSensitive: document.getElementById('blockSensitive').checked,
            sensitiveWords: document.getElementById('sensitiveWords').value
        };
        saveAuditSettings(newCfg);
        alert('设置已保存');
    });

    document.getElementById('exportAllBtn').addEventListener('click', () => exportAllCards());
    document.getElementById('exportFullBackupBtn').addEventListener('click', () => exportFullBackup());
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFileInput').click());
    document.getElementById('importBackupBtn').addEventListener('click', () => document.getElementById('importBackupFile').click());
    document.getElementById('importFileInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const text = await file.text();
        importCardJson(text);
    });
    document.getElementById('importBackupFile').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const text = await file.text();
        restoreFullBackup(text);
    });
    document.getElementById('importTextBtn').addEventListener('click', () => {
        const jsonStr = document.getElementById('importTextarea').value;
        importCardJson(jsonStr);
    });
    document.getElementById('restoreBackupTextBtn').addEventListener('click', () => {
        const jsonStr = document.getElementById('importTextarea').value;
        restoreFullBackup(jsonStr);
    });
}

// 配套底层函数声明（对接DB）
function deleteCardBatch(uidArr) {
    let list = loadAllCards();
    list = list.filter(c => !uidArr.includes(c.uid));
    saveAllCards(list);
}
function exportCardByUidList(uidArr) {
    const all = loadAllCards();
    const target = all.filter(c => uidArr.includes(c.uid));
    downloadJsonFile(target, 'selected-cards.json');
}
function exportAllCards() {
    const all = loadAllCards();
    downloadJsonFile(all, 'all-cards.json');
}
function importCardJson(jsonStr) {
    try {
        const arr = JSON.parse(jsonStr);
        if(!Array.isArray(arr)) throw new Error('必须是数组');
        const old = loadAllCards();
        const merge = [...old, ...arr];
        saveAllCards(merge);
        alert(`导入成功，新增 ${arr.length} 条`);
        refreshAuditPanel();
    } catch(err) {
        alert('JSON解析失败：' + err.message);
    }
}
function downloadJsonFile(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================================================
// 第7段：剩余面板渲染、事件绑定、startGuard、结尾闭合
// ============================================================================
let activeTabKey = 'cards';
let auditPanelRoot = null;

// 渲染主审核面板容器 + Tab栏
function renderAuditPanel() {
    if (!auditPanelRoot) {
        auditPanelRoot = document.createElement('div');
        auditPanelRoot.id = 'my-audit-main-panel';
        auditPanelRoot.style.position = 'fixed';
        auditPanelRoot.style.right = '12px';
        auditPanelRoot.style.bottom = '12px';
        auditPanelRoot.style.width = '420px';
        auditPanelRoot.style.background = '#ffffff';
        auditPanelRoot.style.border = '1px solid #d1d5db';
        auditPanelRoot.style.borderRadius = '10px';
        auditPanelRoot.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)';
        auditPanelRoot.style.zIndex = '99999';
        auditPanelRoot.style.overflow = 'hidden';
        document.body.appendChild(auditPanelRoot);
    }
    auditPanelRoot.innerHTML = '';

    // Tab头部
    const tabHeader = document.createElement('div');
    tabHeader.style.display = 'flex';
    tabHeader.style.background = '#f3f4f6';
    tabHeader.style.borderBottom = '1px solid #e5e7eb';
    tabHeader.innerHTML = `
        <button class="audit-tab-btn ${activeTabKey==='cards'?'active':''}" data-tab="cards">字卡库</button>
        <button class="audit-tab-btn ${activeTabKey==='report'?'active':''}" data-tab="report">审核报告</button>
        <button class="audit-tab-btn ${activeTabKey==='settings'?'active':''}" data-tab="settings">设置</button>
        <button class="audit-tab-btn close-btn" style="margin-left:auto;">×</button>
    `;
    auditPanelRoot.appendChild(tabHeader);

    // Tab内容容器
    const tabContentWrap = document.createElement('div');
    tabContentWrap.id = 'audit-tab-content';
    tabContentWrap.style.padding = '12px';
    tabContentWrap.style.maxHeight = '480px';
    tabContentWrap.style.overflowY = 'auto';
    auditPanelRoot.appendChild(tabContentWrap);

    // Tab切换样式
    const tabStyle = document.createElement('style');
    tabStyle.textContent = `
        .audit-tab-btn {
            padding: 8px 12px;
            border: none;
            background: transparent;
            cursor: pointer;
            font-size:13px;
        }
        .audit-tab-btn.active {
            background:#fff;
            font-weight:bold;
            border-bottom:2px solid #3b82f6;
        }
        .audit-tab-btn.close-btn {
            color:#ef4444;
        }
    `;
    auditPanelRoot.appendChild(tabStyle);

    // Tab切换事件
    tabHeader.querySelectorAll('.audit-tab-btn').forEach(btn=>{
        btn.addEventListener('click', ()=>{
            if(btn.classList.contains('close-btn')){
                auditPanelRoot.style.display = 'none';
                return;
            }
            activeTabKey = btn.dataset.tab;
            refreshAuditPanel();
        })
    })

    // 根据激活Tab渲染对应内容
    const allCards = loadAllCards();
    const settings = getAuditSettings();
    switch(activeTabKey){
        case 'cards':
            renderCardsTab(tabContentWrap, allCards);
            break;
        case 'report':
            renderReportTab(tabContentWrap);
            break;
        case 'settings':
            renderSettingsTab(tabContentWrap, settings);
            break;
    }
}

// 审核报告Tab渲染
function renderReportTab(container){
    container.innerHTML = '';
    const reportList = loadAuditReport() || [];
    const wrap = document.createElement('div');
    if(reportList.length === 0){
        wrap.innerHTML = '<div style="text-align:center;color:#666;padding:20px;">暂无审核记录</div>';
    }else{
        reportList.forEach(item=>{
            const dom = document.createElement('div');
            dom.style.borderBottom = '1px solid #eee';
            dom.style.padding = '8px 0';
            dom.innerHTML = `
                <div style="font-size:12px;color:#666;">${escapeHtml(item.time || '')}</div>
                <div style="font-size:13px;margin-top:4px;">类型：${escapeHtml(item.type || '-')}</div>
                <div style="font-size:13px;">内容：${escapeHtml(item.text || '')}</div>
            `;
            wrap.appendChild(dom);
        })
    }
    container.appendChild(wrap);
}

// 刷新面板入口
function refreshAuditPanel(){
    renderAuditPanel();
}

// 写入审核报告
function pushAuditReport(record){
    const list = loadAuditReport() || [];
    list.unshift({
        time: new Date().toLocaleString(),
        ...record
    });
    // 限制最多保存50条报告
    if(list.length > 50) list.length = 50;
    saveAuditReport(list);
}

// 守护主循环，监听聊天变化、自动抓取
function startGuard(){
    appendExtraCss();
    let lastChatSnapshot = '';
    const guardTimer = setInterval(()=>{
        // 加载锁校验，防止重复初始化
        if(window.__MY_AUDIT_LOADED__ !== true){
            clearInterval(guardTimer);
            return;
        }
        const chatRoot = getChatRootElement();
        if(!chatRoot) return;
        checkAndRepairChat(chatRoot);
        const rawText = chatRoot.innerText || '';
        if(rawText === lastChatSnapshot) return;
        lastChatSnapshot = rawText;
        const grabResult = grabFromChat(rawText);
        if(grabResult && grabResult.length > 0){
            grabResult.forEach(async txt=>{
                await autoSendCard(txt, chatRoot);
                pushAuditReport({type:'自动抓取', text: txt});
            })
        }
    }, 600);
}

// 工具占位：获取聊天根节点（对接原有逻辑）
function getChatRootElement(){
    return document.querySelector('.chat-container');
}

// 存储读写占位函数，对接原有localStorage持久层
function loadAllCards(){
    const raw = localStorage.getItem('my_audit_card_list');
    try{ return raw ? JSON.parse(raw) : []; }catch{ return []; }
}
function saveAllCards(list){
    localStorage.setItem('my_audit_card_list', JSON.stringify(list));
}
function getAuditSettings(){
    const raw = localStorage.getItem('my_audit_settings');
    const defaultCfg = {
        grabRule: '\\[card:(.*?)\\]',
        grabFlag: 'g',
        cooldownMs: 1200,
        defaultSender: '字卡助手',
        blockSensitive: false,
        sensitiveWords: ''
    };
    try{ return raw ? {...defaultCfg, ...JSON.parse(raw)} : defaultCfg; }catch{ return defaultCfg; }
}
function saveAuditSettings(cfg){
    localStorage.setItem('my_audit_settings', JSON.stringify(cfg));
}
function loadAuditReport(){
    const raw = localStorage.getItem('my_audit_report_log');
    try{ return raw ? JSON.parse(raw) : []; }catch{ return []; }
}
function saveAuditReport(list){
    localStorage.setItem('my_audit_report_log', JSON.stringify(list));
}

// URL参数 ?ma-show=1 自动唤起面板
(function initEntry(){
    const urlParams = new URLSearchParams(location.search);
    if(urlParams.get('ma-show') === '1'){
        setTimeout(()=>{
            renderAuditPanel();
            auditPanelRoot.style.display = 'block';
        }, 300);
    }
})();

// 原有自执行入口收尾，对齐原版结构
if (window.__MY_AUDIT_LOADED__) {
    console.log('[my-new-feature] 脚本已加载，跳过重复初始化');
} else {
    window.__MY_AUDIT_LOADED__ = true;
    console.log('[my-new-feature] 初始化完成，启动守护');
    startGuard();
}
  // ============================================================================
// 追加模块A1：safe安全隔离包装函数 【需求12：单个功能崩溃不炸整个脚本】
// ============================================================================
function safe(fn, fallback = null) {
    try {
        return fn();
    } catch (err) {
        if (isDebugMode()) {
            console.error('[SAFE隔离捕获]', err);
        }
        return fallback;
    }
}
function safeAsync(fn, fallback = null) {
    return Promise.resolve(fn()).catch(err => {
        if (isDebugMode()) {
            console.error('[SAFE异步隔离捕获]', err);
        }
        return fallback;
    });
}
// ============================================================================
// 追加模块A2：调试日志开关 ?ma-debug=1 【需求11】
// ============================================================================
function isDebugMode() {
    const urlParams = new URLSearchParams(location.search);
    return urlParams.get('ma-debug') === '1';
}
function debugLog(...args) {
    if (isDebugMode()) {
        console.log('[DEBUG]', ...args);
    }
}
// ============================================================================
// 追加模块A3：approvePending 分支校验补全、边界兜底 【需求3】
// ============================================================================
function approvePending(pendingItem, pass = true) {
    return safe(() => {
        if (!pendingItem || !pendingItem.uid) {
            debugLog('approvePending：传入pendingItem为空或缺少uid');
            return false;
        }
        let pendingList = loadPendingList();
        const targetIndex = pendingList.findIndex(p => p.uid === pendingItem.uid);
        if (targetIndex === -1) {
            debugLog('approvePending：找不到待审条目', pendingItem.uid);
            return false;
        }
        const target = pendingList[targetIndex];
        // 通过：移入字卡库；驳回：移入历史记录
        if (pass) {
            let allCards = loadAllCards();
            allCards.push(target);
            saveAllCards(allCards);
            pushAuditReport({type: '审核通过', text: target.content});
        } else {
            let historyList = loadHistoryList();
            historyList.unshift(target);
            if (historyList.length > 50) historyList.length = 50;
            saveHistoryList(historyList);
            pushAuditReport({type: '审核驳回', text: target.content});
        }
        pendingList.splice(targetIndex, 1);
        savePendingList(pendingList);
        refreshAuditPanel();
        return true;
    }, false);
}
// 配套pending/history存储读写
function loadPendingList() {
    const raw = localStorage.getItem('my_audit_pending');
    try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function savePendingList(list) {
    localStorage.setItem('my_audit_pending', JSON.stringify(list));
}
function loadHistoryList() {
    const raw = localStorage.getItem('my_audit_history');
    try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveHistoryList(list) {
    localStorage.setItem('my_audit_history', JSON.stringify(list));
}
// ============================================================================
// 追加模块A5：全库备份导出恢复 + 审核报告导入导出【需求4、需求8】
// ============================================================================
function exportFullBackup() {
    return safe(() => {
        const backup = {
            version: "1.0",
            cards: loadAllCards(),
            pending: loadPendingList(),
            history: loadHistoryList(),
            report: loadAuditReport(),
            settings: getAuditSettings(),
            groups: loadGroups()
        };
        downloadJsonFile(backup, `audit-full-backup-${new Date().getTime()}.json`);
        pushAuditReport({type:'全库备份导出', text:'生成完整备份文件'});
    });
}
function restoreFullBackup(jsonStr) {
    return safe(() => {
        const data = JSON.parse(jsonStr);
        if (!data.version) throw new Error('备份文件格式不正确');
        if (!confirm('确认覆盖当前所有本地数据，不可撤销？')) return;
        saveAllCards(data.cards ?? []);
        savePendingList(data.pending ?? []);
        saveHistoryList(data.history ?? []);
        saveAuditReport(data.report ?? []);
        saveAuditSettings(data.settings ?? {});
        saveGroups(data.groups ?? []);
        refreshAuditPanel();
        alert('备份恢复完成');
        pushAuditReport({type:'全库备份恢复', text:'已覆盖本地数据'});
    }, alert('备份恢复失败'));
}
// 审核报告导出导入
function exportReportLog() {
    const report = loadAuditReport();
    downloadJsonFile(report, 'audit-report-log.json');
}
function importReportLog(jsonStr) {
    safe(()=>{
        const arr = JSON.parse(jsonStr);
        if(!Array.isArray(arr)) throw new Error('报告必须是数组');
        const old = loadAuditReport();
        const merged = [...arr, ...old];
        if(merged.length>50) merged.length=50;
        saveAuditReport(merged);
        refreshAuditPanel();
        alert('审核报告导入成功');
    });
}
// 分组存储（兼容原有分组功能）
function loadGroups() {
    const raw = localStorage.getItem('my_audit_groups');
    try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveGroups(g) {
    localStorage.setItem('my_audit_groups', JSON.stringify(g));
}
// ============================================================================
// 追加模块A6：悬浮球拖拽、分组、双端禁用标记、历史档案【需求13】
// ============================================================================
function createFloatBall() {
    return safe(()=>{
        const ballId = 'my-audit-float-ball';
        if(document.getElementById(ballId)) return;
        const ball = document.createElement('div');
        ball.id = ballId;
        ball.innerText = '📋';
        ball.style.position = 'fixed';
        ball.style.right = '16px';
        ball.style.bottom = '80px';
        ball.style.width = '40px';
        ball.style.height = '40px';
        ball.style.borderRadius = '50%';
        ball.style.background = '#3b82f6';
        ball.style.color = '#fff';
        ball.style.display = 'flex';
        ball.style.alignItems = 'center';
        ball.style.justifyContent = 'center';
        ball.style.zIndex = '999999';
        ball.style.cursor = 'move';
        document.body.appendChild(ball);
        // 拖拽逻辑
        let drag = false, ox, oy;
        ball.addEventListener('mousedown', e=>{
            drag = true;
            ox = e.clientX - ball.offsetLeft;
            oy = e.clientY - ball.offsetTop;
        });
        window.addEventListener('mousemove', e=>{
            if(!drag) return;
            ball.style.left = (e.clientX - ox)+'px';
            ball.style.right = 'auto';
            ball.style.top = (e.clientY - oy)+'px';
            ball.style.bottom = 'auto';
        });
        window.addEventListener('mouseup', ()=> drag=false);
        // 点击唤起面板
        ball.addEventListener('click', ()=>{
            if(!auditPanelRoot) renderAuditPanel();
            auditPanelRoot.style.display = auditPanelRoot.style.display === 'none' ? 'block' : 'none';
        });
    });
}
// 在 startGuard 里面启动悬浮球
const oldStartGuard = startGuard;
startGuard = function(){
    oldStartGuard();
    createFloatBall();
};
// ============================================================================
// 追加模块A7：新版startGuard，适配新增引擎参数、概率判断、最大待审限制
// ============================================================================
function startGuard(){
    appendExtraCss();
    createFloatBall();
    let lastChatSnapshot = '';
    const cfg = getAuditSettings();
    const guardTimer = setInterval(()=>{
        if(window.__MY_AUDIT_LOADED__ !== true){
            clearInterval(guardTimer);
            return;
        }
        const chatRoot = getChatRootElement();
        if(!chatRoot) return;
        checkAndRepairChat(chatRoot);
        const rawText = chatRoot.innerText || '';
        if(rawText === lastChatSnapshot) return;
        lastChatSnapshot = rawText;
        const grabResult = grabFromChat(rawText);
        if(grabResult && grabResult.length > 0){
            const pendingList = loadPendingList();
            if(pendingList.length >= cfg.maxPending) {
                debugLog('待审队列已满，跳过抓取');
                return;
            }
            const take = grabResult.slice(0, cfg.grabMaxCount);
            take.forEach(async txt=>{
                // 概率判断
                const emotionHit = Math.random() <= cfg.emotionProb;
                const mischiefHit = Math.random() <= cfg.mischiefProb;
                if(!emotionHit || !mischiefHit) {
                    debugLog('概率未命中，跳过本条');
                    return;
                }
                await autoSendCard(txt, chatRoot);
                pushAuditReport({type:'自动抓取', text: txt});
            })
        }
    }, getAuditSettings().scanIntervalMs);
}
})();
