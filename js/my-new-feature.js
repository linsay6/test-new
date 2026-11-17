/* ============================================================================
 * my-new-feature.js 尺寸绝对锁定版 (彻底解决图片撑爆布局)｜最终修复版
 * 修复：approvePending分支不全、新增审核报告字卡库Tab、防止JS异常脚本终止
 * 新增：URL参数 ?ma-show=1 自动打开审核面板，绕过隐藏设置
 * ========================================================================== */
(function () {
  'use strict';
  try { if (window.__MY_AUDIT_LOADED__) return; window.__MY_AUDIT_LOADED__ = true; } catch (e) {}
  var LS_KEY_CHAT = 'xy-home-v2:default:chat-msgs';
  var LS_KEY_DATA = 'my-audit-cards';
  var DATA_VERSION = 1;
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
  function safe(fn, name, def) { try { return fn(); } catch (err) { try { console.warn('[审计] ' + (name || 'task') + ' 出错：', err); } catch (e2) {} return def; } }
  function uid(prefix) { return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
  function esc(str) { try { return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); } catch (e) { return ''; } }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtTime(ts) { try { var d = new Date(Number(ts) || Date.now()); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); } catch (e) { return ''; } }
  function fmtRelative(ts) { try { var diff = Date.now() - Number(ts || 0); if (diff < 60000) return '刚刚'; if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前'; if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前'; return fmtTime(ts); } catch (e) { return ''; } }
  function clamp(n, a, b) { n = Number(n); if (isNaN(n)) n = a; return Math.min(b, Math.max(a, n)); }
  function isEmotional(text) { try { for (var i = 0; i < EMO_WORDS.length; i++) if (String(text).indexOf(EMO_WORDS[i]) >= 0) return true; } catch (e) {} return false; }
  function arrFindIndex(arr, fn) { try { for (var i = 0; i < arr.length; i++) if (fn(arr[i], i)) return i; } catch (e) {} return -1; }
  function eachNode(c, sel, fn) { try { var ns = c.querySelectorAll(sel); for (var i = 0; i < ns.length; i++) fn(ns[i], i); } catch (e) {} }
  function defaultSettings() { return { ballColor: '#ff6b81', ballSize: 52, ballImage: '', appImage: '', appName: '审核', appColor: '#333333', appIconColor: '', hideAll: false, ballPos: null }; }
  function defaultData() { return { version: DATA_VERSION, groups: [], pending: [], history: [], settings: defaultSettings(), meta: { lastGrabAt: 0, grabbedKeys: [], lastMischiefAt: 0, isGrabbing: false } }; }
  function normalizeData(d) {
    var def = defaultData(); if (!d || typeof d !== 'object' || Array.isArray(d)) d = def;
    if (!Array.isArray(d.groups)) d.groups = [];
    if (d.groups.length === 0) d.groups.push({ id: uid('g'), name: '默认分组', disabledBy: [], cards: [] });
    for (var gi = 0; gi < d.groups.length; gi++) {
      var g = d.groups[gi]; if (!g || typeof g !== 'object') { d.groups.splice(gi, 1); gi--; continue; }
      if (!g.id) g.id = uid('g'); if (typeof g.name !== 'string') g.name = '未命名'; if (!Array.isArray(g.disabledBy)) g.disabledBy = []; if (!Array.isArray(g.cards)) g.cards = [];
      for (var ci = 0; ci < g.cards.length; ci++) {
        var c = g.cards[ci]; if (!c || typeof c !== 'object') { g.cards.splice(ci, 1); ci--; continue; }
        if (!c.id) c.id = uid('c'); if (typeof c.text !== 'string') c.text = ''; if (!Array.isArray(c.disabledBy)) c.disabledBy = []; if (typeof c.createdAt !== 'number') c.createdAt = Date.now();
      }
    }
    if (!Array.isArray(d.pending)) d.pending = [];
    for (var pi = 0; pi < d.pending.length; pi++) { var p = d.pending[pi]; if (!p || typeof p !== 'object') { d.pending.splice(pi, 1); pi--; continue; } if (!p.id) p.id = uid('p'); if (!p.status) p.status = 'pending'; if (typeof p.time !== 'number') p.time = Date.now(); if (!p.sender) p.sender = SENDER_MJ; }
    if (!Array.isArray(d.history)) d.history = []; if (d.history.length > HISTORY_LIMIT) d.history = d.history.slice(-HISTORY_LIMIT);
    if (!d.settings || typeof d.settings !== 'object') d.settings = defaultSettings();
    var s = d.settings, ds = defaultSettings();
    if (typeof s.ballColor !== 'string' || !s.ballColor) s.ballColor = ds.ballColor; if (typeof s.ballSize !== 'number' || !isFinite(s.ballSize)) s.ballSize = ds.ballSize; s.ballSize = clamp(s.ballSize, 36, 88);
    if (typeof s.ballImage !== 'string') s.ballImage = ''; if (typeof s.appImage !== 'string') s.appImage = '';
    if (typeof s.appName !== 'string' || !s.appName) s.appName = ds.appName;
    if (typeof s.appColor !== 'string' || !s.appColor) s.appColor = ds.appColor;
    if (typeof s.appIconColor !== 'string') s.appIconColor = ds.appIconColor;
    if (typeof s.hideAll !== 'boolean') s.hideAll = false;
    if (!s.ballPos || typeof s.ballPos !== 'object' || typeof s.ballPos.x !== 'number' || typeof s.ballPos.y !== 'number') s.ballPos = null;
    if (!d.meta || typeof d.meta !== 'object') d.meta = def.meta; if (typeof d.meta.lastGrabAt !== 'number') d.meta.lastGrabAt = 0; if (typeof d.meta.lastMischiefAt !== 'number') d.meta.lastMischiefAt = 0; if (!Array.isArray(d.meta.grabbedKeys)) d.meta.grabbedKeys = []; if (d.meta.grabbedKeys.length > 400) d.meta.grabbedKeys = d.meta.grabbedKeys.slice(-400); if (typeof d.meta.isGrabbing !== 'boolean') d.meta.isGrabbing = false;
    return d;
  }
  function loadData() { return safe(function () { var raw = localStorage.getItem(LS_KEY_DATA); if (!raw) return defaultData(); return normalizeData(JSON.parse(raw)); }, 'loadData', defaultData()); }
  function saveData() { return safe(function () { localStorage.setItem(LS_KEY_DATA, JSON.stringify(DB)); return true; }, 'saveData', false); }
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
  function findGroup(gid) { try { for (var i = 0; i < DB.groups.length; i++) if (DB.groups[i].id === gid) return DB.groups[i]; } catch (e) {} return null; }
  function findCard(cid) { try { for (var i = 0; i < DB.groups.length; i++) { var g = DB.groups[i]; for (var j = 0; j < g.cards.length; j++) if (g.cards[j].id === cid) return { group: g, card: g.cards[j] }; } } catch (e) {} return null; }
  function pushHistory(rec) { safe(function () { DB.history.push({ id: uid('h'), sender: rec.sender || SENDER_MJ, action: rec.action || 'add', text: rec.text || '', result: rec.result || 'agree', time: Date.now(), extra: rec.extra || '' }); if (DB.history.length > HISTORY_LIMIT) DB.history = DB.history.slice(-HISTORY_LIMIT); saveData(); }, 'pushHistory'); }

  function injectBubbleToChat(text) {
    var renderSuccess = false;
    try {
      var now = Date.now();
      var newMsg = { side: 'in', text: text, time: now };

      try {
        var cid = 'default';
        var store = null;
        try {
          if (window.storeFor) store = window.storeFor(cid);
          else if (window.xyStore) store = window.xyStore('xy-home-v2:' + cid);
        } catch (e) {}
        var storeData = null;
        if (store && typeof store.get === 'function') {
          try {
            storeData = store.get('chat-msgs');
            var targetArr = null;
            if (Array.isArray(storeData)) targetArr = storeData;
            else if (storeData && typeof storeData === 'object') {
              for (var k in storeData) { if (Array.isArray(storeData[k])) { targetArr = storeData[k]; break; } }
            }
            if (targetArr) {
              targetArr.push(newMsg);
              if (typeof store.set === 'function') store.set('chat-msgs', storeData);
              else if (typeof store.save === 'function') store.save('chat-msgs', storeData);
            }
          } catch (err) {}
        }
        var LS_KEY = 'xy-home-v2:' + cid + ':chat-msgs';
        try {
          var raw = localStorage.getItem(LS_KEY);
          var parsed = null;
          if (raw && raw !== '[object Object]' && raw !== 'undefined' && raw !== 'null') {
            try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
          }
          if (!parsed) {
            localStorage.setItem(LS_KEY, JSON.stringify([newMsg]));
          } else {
            var lsTarget = null;
            if (Array.isArray(parsed)) {
              lsTarget = parsed;
              lsTarget.push(newMsg);
              localStorage.setItem(LS_KEY, JSON.stringify(lsTarget));
            } else if (parsed && typeof parsed === 'object') {
              for (var k in parsed) { if (Array.isArray(parsed[k])) { lsTarget = parsed[k]; break; } }
              if (lsTarget) {
                lsTarget.push(newMsg);
                localStorage.setItem(LS_KEY, JSON.stringify(parsed));
              }
            }
          }
        } catch (e) {}
        INJECTED_MSGS.push(newMsg);
        if (INJECTED_MSGS.length > 50) INJECTED_MSGS.shift();
      } catch (dataErr) {}

      var chatBody = document.getElementById('chat-body');
      if (!chatBody) return true;
      if (typeof window.renderWindow === 'function') {
        try {
          window.renderWindow(false, false, true);
          if (typeof window.scrollToBottom === 'function') window.scrollToBottom();
          return true;
        } catch (e) {}
      }

      try {
        var bubbleStyle = {
          backgroundColor: '#ffffff', color: '#333333', borderRadius: '8px',
          padding: '10px 14px', fontSize: '15px', lineHeight: '1.5',
          maxWidth: '70%', boxSizing: 'border-box', wordBreak: 'break-all',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)', display: 'inline-block'
        };
        var sampleBubble = null;
        var allCandidates = chatBody.querySelectorAll('.bubble, [class*="bubble"], [class*="msg-content"], .text');
        for (var bIdx = allCandidates.length - 1; bIdx >= 0; bIdx--) {
          var b = allCandidates[bIdx];
          if (b.closest('[data-ma-injected="1"]')) continue;
          var cls = (b.className || '').toLowerCase();
          if (cls.indexOf('out') >= 0 || cls.indexOf('right') >= 0) continue;
          var rect = b.getBoundingClientRect();
          var parentRect = chatBody.getBoundingClientRect();
          var bg = window.getComputedStyle(b).backgroundColor;
          if (rect.left - parentRect.left < 100 && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
            sampleBubble = b;
            break;
          }
        }
        if (sampleBubble) {
          var s = window.getComputedStyle(sampleBubble);
          bubbleStyle.backgroundColor = s.backgroundColor;
          bubbleStyle.color = s.color;
          bubbleStyle.borderRadius = s.borderRadius || '8px';
          var fs = parseInt(s.fontSize, 10);
          if (fs > 12 && fs < 20) bubbleStyle.fontSize = s.fontSize;
        }
        var avatarW = '38px', avatarH = '38px', avatarRadius = '4px', marginRight = '12px', leftColWidth = '48px';
        var sampleAvatar = null;
        var imgs = chatBody.querySelectorAll('img');
        for (var i = 0; i < imgs.length; i++) {
          if (imgs[i].getBoundingClientRect().left - chatBody.getBoundingClientRect().left < 100) {
            sampleAvatar = imgs[i];
            break;
          }
        }
        if (sampleAvatar) {
          var sa = window.getComputedStyle(sampleAvatar);
          if (sa.width && sa.width !== 'auto') avatarW = sa.width;
          if (sa.height && sa.height !== 'auto') avatarH = sa.height;
          if (sa.borderRadius && sa.borderRadius !== '0px') avatarRadius = sa.borderRadius;
          var parent = sampleAvatar.parentElement;
          if (parent && parent !== chatBody) {
            var pStyle = window.getComputedStyle(parent);
            if (pStyle.width && pStyle.width !== 'auto') leftColWidth = pStyle.width;
            if (pStyle.marginRight && pStyle.marginRight !== '0px') marginRight = pStyle.marginRight;
          }
        }
        var wrapper = document.createElement('div');
        wrapper.setAttribute('data-ma-injected', '1');
        wrapper.style.cssText = 'display: flex; align-items: flex-start; margin-bottom: 15px; padding: 10px 0; width: 100%; box-sizing: border-box;';
        var leftCol = document.createElement('div');
        leftCol.style.cssText = 'display: flex; flex-direction: column; align-items: center; margin-right: ' + marginRight + '; flex-shrink: 0; width: ' + leftColWidth + ';';
        var avatarEl;
        if (sampleAvatar) {
          avatarEl = sampleAvatar.cloneNode();
          avatarEl.style.cssText = 'width: ' + avatarW + '; height: ' + avatarH + '; border-radius: ' + avatarRadius + '; object-fit: cover;';
        } else {
          avatarEl = document.createElement('div');
          avatarEl.style.cssText = 'width: ' + avatarW + '; height: ' + avatarH + '; border-radius: ' + avatarRadius + '; background: #ddd;';
        }
        var timeEl = document.createElement('div');
        timeEl.style.cssText = 'font-size: 10px; color: #999; margin-top: 6px; white-space: nowrap; transform: scale(0.9);';
        var d = new Date();
        timeEl.textContent = (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() + ':' + (d.getSeconds() < 10 ? '0' : '') + d.getSeconds();
        leftCol.appendChild(avatarEl);
        leftCol.appendChild(timeEl);
        var bubble = document.createElement('div');
        Object.assign(bubble.style, bubbleStyle);
        bubble.textContent = text;
        bubble.className = 'bubble msg-content';
        wrapper.appendChild(leftCol);
        wrapper.appendChild(bubble);
        chatBody.appendChild(wrapper);
        try { chatBody.scrollTop = chatBody.scrollHeight; window.scrollTo(0, document.body.scrollHeight); } catch (e) {}
        renderSuccess = true;
      } catch (domErr) {}
    } catch (globalErr) {}
    return renderSuccess;
  }

  function checkAndRepairChat() {
    var chatBody = document.getElementById('chat-body');
    if (!chatBody || INJECTED_MSGS.length === 0) return;
    var bubbleStyle = {
      backgroundColor: '#ffffff', color: '#333333', borderRadius: '8px',
      padding: '10px 14px', fontSize: '15px', lineHeight: '1.5',
      maxWidth: '70%', boxSizing: 'border-box', wordBreak: 'break-all', display: 'inline-block'
    };
    var sampleBubble = null;
    var allCandidates = chatBody.querySelectorAll('.bubble, [class*="bubble"], [class*="msg-content"]');
    for (var bIdx = allCandidates.length - 1; bIdx >= 0; bIdx--) {
      var b = allCandidates[bIdx];
      if (b.closest('[data-ma-injected="1"]')) continue;
      var cls = (b.className || '').toLowerCase();
      if (cls.indexOf('out') >= 0 || cls.indexOf('right') >= 0) continue;
      var rect = b.getBoundingClientRect();
      var parentRect = chatBody.getBoundingClientRect();
      if (rect.left - parentRect.left < 100) { sampleBubble = b; break; }
    }
    if (sampleBubble) {
      var s = window.getComputedStyle(sampleBubble);
      bubbleStyle.backgroundColor = s.backgroundColor;
      bubbleStyle.color = s.color;
      bubbleStyle.borderRadius = s.borderRadius || '8px';
    }
    var avatarW = '38px', avatarH = '38px', currentAvatarRadius = '4px', marginRight = '12px', leftColWidth = '48px';
    var sampleAvatar = chatBody.querySelector('img');
    if (sampleAvatar) {
      var sa = window.getComputedStyle(sampleAvatar);
      if (sa.width && sa.width !== 'auto') avatarW = sa.width;
      if (sa.height && sa.height !== 'auto') avatarH = sa.height;
      if (sa.borderRadius && sa.borderRadius !== '0px') currentAvatarRadius = sa.borderRadius;
      var parent = sampleAvatar.parentElement;
      if (parent && parent !== chatBody) {
        var pStyle = window.getComputedStyle(parent);
        if (pStyle.width && pStyle.width !== 'auto') leftColWidth = pStyle.width;
        if (pStyle.marginRight && pStyle.marginRight !== '0px') marginRight = pStyle.marginRight;
      }
    }
    var injectedNodes = chatBody.querySelectorAll('[data-ma-injected="1"]');
    if (injectedNodes.length !== INJECTED_MSGS.length) {
      for (var i = 0; i < injectedNodes.length; i++) injectedNodes[i].remove();
      for (var m = 0; m < INJECTED_MSGS.length; m++) {
        var msg = INJECTED_MSGS[m];
        var wrapper = document.createElement('div');
        wrapper.setAttribute('data-ma-injected', '1');
        wrapper.style.cssText = 'display: flex; align-items: flex-start; margin-bottom: 15px; padding: 10px 0; width: 100%; box-sizing: border-box;';
        var avatarEl;
        if (sampleAvatar) {
          avatarEl = sampleAvatar.cloneNode();
          avatarEl.style.cssText = 'width: ' + avatarW + '; height: ' + avatarH + '; border-radius: ' + currentAvatarRadius + '; object-fit: cover;';
        } else {
          avatarEl = document.createElement('div');
          avatarEl.style.cssText = 'width: ' + avatarW + '; height: ' + avatarH + '; border-radius: ' + currentAvatarRadius + '; background: #ddd;';
        }
        var leftCol = document.createElement('div');
        leftCol.style.cssText = 'display: flex; flex-direction: column; align-items: center; margin-right: ' + marginRight + '; flex-shrink: 0; width: ' + leftColWidth + ';';
        var timeEl = document.createElement('div');
        timeEl.style.cssText = 'font-size: 10px; color: #999; margin-top: 6px; white-space: nowrap; transform: scale(0.9);';
        var d = new Date(msg.time);
        timeEl.textContent = (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes() + ':' + (d.getSeconds() < 10 ? '0' : '') + d.getSeconds();
        leftCol.appendChild(avatarEl);
        leftCol.appendChild(timeEl);
        var bubble = document.createElement('div');
        Object.assign(bubble.style, bubbleStyle);
        bubble.textContent = msg.text;
        bubble.className = 'bubble msg-content';
        wrapper.appendChild(leftCol);
        wrapper.appendChild(bubble);
        chatBody.appendChild(wrapper);
      }
      try { chatBody.scrollTop = chatBody.scrollHeight; } catch (e) {}
    } else {
      for (var i = 0; i < injectedNodes.length; i++) {
        var node = injectedNodes[i];
        if (sampleBubble) {
          var bubble = node.querySelector('.bubble, [class*="msg-content"]');
          if (bubble) {
            var s = window.getComputedStyle(sampleBubble);
            bubble.style.backgroundColor = s.backgroundColor;
            bubble.style.color = s.color;
          }
        }
        var img = node.querySelector('img');
        if (img) {
          img.style.borderRadius = currentAvatarRadius;
          img.style.width = avatarW;
          img.style.height = avatarH;
        }
      }
    }
  }

  function autoPendingCount() { var n = 0; try { for (var i = 0; i < DB.pending.length; i++) { var p = DB.pending[i]; if (p.status === 'pending' && p.sender === SENDER_MJ && p.action === 'add') n++; } } catch (e) {} return n; }
  function pendingCount() { var n = 0; try { for (var i = 0; i < DB.pending.length; i++) if (DB.pending[i].status === 'pending') n++; } catch (e) {} return n; }

  function grabFromChat() {
    safe(function () {
      if (!DB || DB.meta.isGrabbing) return;
      if (autoPendingCount() >= MAX_AUTO_PENDING) return;
      DB.meta.isGrabbing = true;
      try {
        var msgs = readChatMsgs(), now = Date.now(), cands = [];
        for (var i = 0; i < msgs.length; i++) {
          var m = msgs[i]; if (!m || typeof m !== 'object' || m.side !== 'out' || typeof m.text !== 'string') continue;
          var t = m.text.trim(), len = t.length; if (len < MIN_LEN || len > MAX_LEN) continue;
          var tm = Number(m.time) || 0; if (!tm || now - tm > RECENT_MS || now - tm < -60000) continue;
          var key = t + '@@' + tm; if (DB.meta.grabbedKeys.indexOf(key) >= 0) continue;
          cands.push({ text: t, time: tm, key: key });
        }
        if (!cands.length) return;
        cands.sort(function () { return Math.random() - 0.5; });
        var added = 0;
        for (var j = 0; j < cands.length; j++) {
          if (added >= MAX_GRAB_PER_TICK || autoPendingCount() + added >= MAX_AUTO_PENDING) break;
          var c = cands[j], emo = isEmotional(c.text), pass = emo ? (Math.random() > 0.7) : (Math.random() > 0.95);
          DB.meta.grabbedKeys.push(c.key); if (!pass) continue;
          DB.pending.push({ id: uid('p'), action: 'add', text: c.text, cardId: '', fromGroupId: '', fromGroupName: '', toGroupId: '', toGroupName: '', sender: SENDER_MJ, auto: true, emo: emo, time: Date.now(), status: 'pending', note: emo ? '含情感词' : '常规抓取' });
          added++;
        }
        if (DB.meta.grabbedKeys.length > 400) DB.meta.grabbedKeys = DB.meta.grabbedKeys.slice(-400);
        DB.meta.lastGrabAt = Date.now();
      } finally {
        DB.meta.isGrabbing = false;
      }
    }, 'grabFromChat');
  }

  function maybeMischief() {
    safe(function () {
      if (!DB || Math.random() > MISCHIEF_RATE) return;
      var pool = []; for (var i = 0; i < DB.groups.length; i++) { var g = DB.groups[i]; for (var j = 0; j < g.cards.length; j++) pool.push({ group: g, card: g.cards[j] }); }
      if (!pool.length) return; var pick = pool[Math.floor(Math.random() * pool.length)], group = pick.group, card = pick.card;
      var groupDisabled = (group.disabledBy || []).length > 0, cardDisabled = (card.disabledBy || []).length > 0, isDisabled = groupDisabled || cardDisabled;
      var actions = isDisabled ? ['enable', 'delete', 'move'] : ['disable', 'delete', 'move'], action = actions[Math.floor(Math.random() * actions.length)], toGroupId = '', toGroupName = '';
      if (action === 'move') {
        var others = []; for (var k = 0; k < DB.groups.length; k++) if (DB.groups[k].id !== group.id) others.push(DB.groups[k]);
        if (!others.length) action = isDisabled ? 'enable' : 'disable'; else { var tgt = others[Math.floor(Math.random() * others.length)]; toGroupId = tgt.id; toGroupName = tgt.name; }
      }
      DB.pending.push({ id: uid('p'), action: action, text: card.text, cardId: card.id, fromGroupId: group.id, fromGroupName: group.name, toGroupId: toGroupId, toGroupName: toGroupName, sender: SENDER_MJ, auto: true, time: Date.now(), status: 'pending', note: '随机整理申请' });
      DB.meta.lastMischiefAt = Date.now();
    }, 'maybeMischief');
  }

  function autoSendCard() {
    safe(function () {
      if (!DB || !DB.groups) return; var validCards = [];
      try { for (var i = 0; i < DB.groups.length; i++) { var g = DB.groups[i]; if (g.disabledBy && g.disabledBy.length > 0) continue; for (var j = 0; j < g.cards.length; j++) { var c = g.cards[j]; if (c.disabledBy && c.disabledBy.length > 0) continue; if (c.text && c.text.trim()) validCards.push(c.text.trim()); } } } catch (e) { return; }
      if (validCards.length === 0) return; var randomText = validCards[Math.floor(Math.random() * validCards.length)];
      var ok = injectBubbleToChat(randomText); if (ok) console.log('[审计] 梦角自动发送成功：', randomText);
    }, 'autoSendCard');
  }

  function sendCardToChat(cid) {
    safe(function () {
      var f = findCard(cid);
      if (!f) { toast('不存在'); return; }
      var text = f.card.text;
      if (!text) { toast('为空'); return; }
      var ok = injectBubbleToChat(text);
      if (ok) toast('已发送'); else toast('发送失败，请重试');
    }, 'sendCardToChat');
  }

  function tickEngine() { safe(function () { grabFromChat(); maybeMischief(); autoSendCard(); saveData(); updateBadge(); if (PANEL_OPEN && CURRENT_TAB === 'pending') renderPanelBody(); }, 'tickEngine'); }
  function startEngine() { safe(function () { var now = Date.now(); if (!DB.meta.lastGrabAt || (now - DB.meta.lastGrabAt) > ENGINE_INTERVAL) tickEngine(); else { maybeMischief(); saveData(); updateBadge(); } setInterval(function () { safe(tickEngine, 'tickEngine:interval'); }, ENGINE_INTERVAL); }, 'startEngine'); }

  function injectCSS() {
    safe(function () {
      if (document.getElementById('ma-style')) return;
      var css = [
        '#ma-root{position:static;margin:0;padding:0;}',
        '#ma-root,#ma-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}',
        '#ma-fab{position:fixed;top:0;left:0;z-index:' + (Z_BASE + 10) + ';display:flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font-size:13px;font-weight:700;cursor:pointer;user-select:none;background-color:#ff6b81;background-size:cover;background-position:center;box-shadow:none;border:none;touch-action:none;will-change:transform;}',
        '#ma-fab:active{transform:scale(.94);}',
        '#ma-fab.ma-hidden{display:none!important;}',
        '#ma-fab .ma-fab-dot{position:absolute;top:-2px;right:-2px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:#ff2d55;display:none;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;border:1px solid #fff;}',
        '#ma-fab .ma-fab-dot.on{display:flex;}',
        '#ma-fab.ma-has-img .ma-fab-txt{display:none;}',
        '#ma-app-icon{position:relative;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;}',
        '.ma-app-custom-icon{width:48px;height:48px;margin:0 auto;border-radius:14px;background-size:cover;background-position:center;background-repeat:no-repeat;flex-shrink:0;overflow:hidden;box-sizing:border-box;}',
        '#ma-app-icon .ma-app-dot{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#fff !important;display:none;align-items:center;justify-content:center;color:#333 !important;font-size:11px;font-weight:600;border:1px solid #e0e0e0 !important;box-shadow:0 1px 3px rgba(0,0,0,0.15) !important;z-index:10;box-sizing:border-box;}',
        '#ma-app-icon .ma-app-dot.on{display:flex !important;}',
        '#ma-mask{position:fixed;left:0;top:0;right:0;bottom:0;z-index:' + (Z_BASE + 100) + ';background:rgba(0,0,0,.42);display:none;align-items:center;justify-content:center;}',
        '#ma-mask.on{display:flex;}',
        '#ma-panel{width:min(560px,94vw);max-height:86vh;display:flex;flex-direction:column;background:#fff;border-radius:16px;overflow:hidden;font-size:14px;color:#222;box-shadow:0 12px 40px rgba(0,0,0,.22);}',
        '.ma-header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #f0f0f0;background:#fafafa;flex-shrink:0;}',
        '.ma-title{font-size:16px;font-weight:700;}',
        '.ma-close{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;color:#999;cursor:pointer;}',
        '.ma-tabs{display:flex;border-bottom:1px solid #eee;background:#fff;overflow-x:auto;flex-shrink:0;}',
        '.ma-tab{flex:1 0 auto;padding:10px 12px;text-align:center;cursor:pointer;font-size:13px;color:#666;white-space:nowrap;border-bottom:2px solid transparent;}',
        '.ma-tab.on{color:#ff4d6d;border-bottom-color:#ff4d6d;font-weight:600;}',
        '.ma-tab-badge{display:inline-block;min-width:16px;height:16px;line-height:16px;padding:0 4px;border-radius:8px;background:#ff2d55;color:#fff;font-size:10px;margin-left:4px;font-weight:600;vertical-align:middle;}',
        '.ma-body{flex:1;overflow-y:auto;padding:12px 14px 20px;}',
        '.ma-btn{display:inline-flex;align-items:center;justify-content:center;padding:6px 14px;border-radius:8px;border:1px solid #ddd;background:#fff;color:#333;font-size:13px;cursor:pointer;white-space:nowrap;}',
        '.ma-btn.primary{background:#ff4d6d;border-color:#ff4d6d;color:#fff;}',
        '.ma-btn.danger{background:#fff;border-color:#ffb3c0;color:#e0355a;}',
        '.ma-btn.sm{padding:3px 9px;font-size:12px;}',
        '.ma-input,.ma-select,.ma-textarea{width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:8px;font-size:13px;outline:none;}',
        '.ma-row{display:flex;align-items:center;gap:8px;margin-bottom:10px;}',
        '.ma-empty{text-align:center;color:#bbb;padding:40px 10px;font-size:13px;}',
        '.ma-pending-item{border:1px solid #f0f0f0;border-radius:12px;padding:10px 12px;margin-bottom:10px;}',
        '.ma-pending-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}',
        '.ma-act-tag{display:inline-block;padding:1px 8px;border-radius:6px;font-size:11px;font-weight:600;background:#eef4ff;color:#2b6cff;}',
        '.ma-act-tag.add{background:#e9f9ef;color:#12a150;}',
        '.ma-act-tag.del{background:#ffeef1;color:#e0355a;}',
        '.ma-group{border:1px solid #eee;border-radius:12px;margin-bottom:10px;overflow:hidden;}',
        '.ma-group-head{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:#fafafa;cursor:pointer;}',
        '.ma-group-title{display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px;}',
        '.ma-group-body{display:none;padding:8px 10px;}',
        '.ma-group.open .ma-group-body{display:block;}',
        '.ma-card{display:flex;align-items:flex-start;gap:8px;padding:7px 8px;border-radius:8px;}',
        '.ma-card-check{margin-top:3px;}',
        '.ma-card-main{flex:1;min-width:0;}',
        '.ma-card-text{font-size:13px;}',
        '.ma-card.disabled .ma-card-text{color:#b5b5b5;text-decoration:line-through;}',
        '.ma-card-ops{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;}',
        '.ma-badge-dis{display:inline-block;padding:0 6px;border-radius:5px;font-size:10px;line-height:16px;font-weight:600;}',
        '.ma-badge-dis.user{background:#ffeef1;color:#e0355a;}',
        '.ma-badge-dis.mj{background:#f0edff;color:#6c4cf0;}',
        '.ma-badge-dis.both{background:#3a3a3a;color:#fff;}',
        '.ma-bulkbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;background:#fafafa;border-radius:10px;margin-bottom:10px;font-size:12px;color:#666;}',
        '.ma-set-block{border:1px solid #eee;border-radius:12px;padding:12px;margin-bottom:12px;}',
        '.ma-thumb{width:52px;height:52px;border-radius:50%;background:#f0f0f0 center/cover no-repeat;}',
        '.ma-thumb.square{border-radius:14px;}',
        '.ma-switch{position:relative;width:44px;height:24px;border-radius:12px;background:#ddd;cursor:pointer;}',
        '.ma-switch.on{background:#ff4d6d;}',
        '.ma-switch::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;transition:.2s;}',
        '.ma-switch.on::after{left:22px;}',
        '#ma-crop-mask{position:fixed;left:0;top:0;right:0;bottom:0;z-index:' + (Z_BASE + 200) + ';background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;}',
        '#ma-crop-mask.on{display:flex;}',
        '.ma-crop-box{width:min(340px,92vw);background:#fff;border-radius:16px;overflow:hidden;}',
        '.ma-crop-stage{padding:18px 0;display:flex;justify-content:center;background:#f7f7f8;}',
        '#ma-modal-mask{position:fixed;left:0;top:0;right:0;bottom:0;z-index:' + (Z_BASE + 300) + ';background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;}',
        '#ma-modal-mask.on{display:flex;}',
        '.ma-modal{width:min(360px,90vw);background:#fff;border-radius:14px;overflow:hidden;}',
        '.ma-modal-title{padding:14px 16px 6px;font-size:15px;font-weight:700;}',
        '.ma-modal-body{padding:6px 16px 14px;font-size:13px;color:#555;}',
        '.ma-modal-actions{display:flex;gap:10px;padding:0 16px 16px;}',
        '.ma-modal-actions .ma-btn{flex:1;}',
        '#ma-toast{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);z-index:' + (Z_BASE + 400) + ';background:rgba(0,0,0,.8);color:#fff;padding:8px 18px;border-radius:20px;font-size:13px;opacity:0;transition:.25s;pointer-events:none;}',
        '#ma-toast.on{opacity:1;}'
      ].join('\n');
      var style = document.createElement('style'); style.id = 'ma-style'; style.appendChild(document.createTextNode(css)); (document.head || document.documentElement).appendChild(style);
    }, 'injectCSS');
  }
  function ensureRoot() { if (ROOT && document.body && document.body.contains(ROOT)) return ROOT; ROOT = document.createElement('div'); ROOT.id = 'ma-root'; (document.body || document.documentElement).appendChild(ROOT); return ROOT; }
  function toast(msg, ms) { safe(function () { ensureRoot(); var el = document.getElementById('ma-toast'); if (!el) { el = document.createElement('div'); el.id = 'ma-toast'; ROOT.appendChild(el); } el.textContent = String(msg == null ? '' : msg); el.classList.add('on'); clearTimeout(el.__maTimer); el.__maTimer = setTimeout(function () { el.classList.remove('on'); }, ms || 1800); }, 'toast'); }

  function buildFab() {
    safe(function () {
      ensureRoot(); var old = document.getElementById('ma-fab'); if (old && old.parentNode) old.parentNode.removeChild(old);
      FAB = document.createElement('div'); FAB.id = 'ma-fab'; FAB.innerHTML = '<span class="ma-fab-txt">审</span><i class="ma-fab-dot"></i>'; ROOT.appendChild(FAB);
      applyFabPosition(); bindFabDrag();
      FAB.addEventListener('click', function (e) { if (FAB.__maMoved) { FAB.__maMoved = false; return; } try { e.stopPropagation(); } catch (err) {} openPanel(); });
    }, 'buildFab');
  }
  function applyFabPosition() {
    safe(function () {
      if (!FAB) return; var s = DB.settings, size = s.ballSize || 52, w = window.innerWidth, h = window.innerHeight, x, y;
      if (s.ballPos && typeof s.ballPos.x === 'number') { x = clamp(s.ballPos.x, 4, Math.max(4, w - size - 4)); y = clamp(s.ballPos.y, 4, Math.max(4, h - size - 4)); }
      else { x = w - size - 18; y = h - size - 96; }
      FAB.style.width = size + 'px'; FAB.style.height = size + 'px';
      FAB.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0)';
    }, 'applyFabPosition');
  }
  function bindFabDrag() {
    safe(function () {
      if (!FAB || FAB.__maDragBound) return; FAB.__maDragBound = true;
      var dragging = false, startX = 0, startY = 0, originX = 0, originY = 0, rafId = null, cachedSize = 52, cachedW = 0, cachedH = 0;
      function onDown(e) {
        dragging = true; FAB.__maMoved = false;
        var r = FAB.getBoundingClientRect();
        startX = e.clientX; startY = e.clientY; originX = r.left; originY = r.top;
        cachedSize = FAB.offsetWidth || 52; cachedW = window.innerWidth; cachedH = window.innerHeight;
        FAB.style.transition = 'none';
        e.preventDefault();
      }
      function onMove(e) {
        if (!dragging) return;
        var dx = e.clientX - startX, dy = e.clientY - startY;
        if (!FAB.__maMoved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) FAB.__maMoved = true;
        if (!FAB.__maMoved) return;
        if (rafId) return;
        rafId = requestAnimationFrame(function () {
          var x = clamp(originX + dx, 4, Math.max(4, cachedW - cachedSize - 4));
          var y = clamp(originY + dy, 4, Math.max(4, cachedH - cachedSize - 4));
          FAB.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0)';
          rafId = null;
        });
        e.preventDefault();
      }
      function onUp(e) {
        if (!dragging) return;
        dragging = false; FAB.style.transition = '';
        if (FAB.__maMoved) {
          var mat = FAB.style.transform.match(/translate3d\(([^p]+)px, ([^p]+)px/);
          if (mat) { DB.settings.ballPos = { x: parseFloat(mat[1]), y: parseFloat(mat[2]) }; saveData(); }
        }
      }
      if (window.PointerEvent) { FAB.addEventListener('pointerdown', onDown); FAB.addEventListener('pointermove', onMove); FAB.addEventListener('pointerup', onUp); }
    }, 'bindFabDrag');
  }
  function injectAppIcon() {
    return safe(function () {
      if (APP_ICON_EL && document.body.contains(APP_ICON_EL)) return true;
      var natives = document.querySelectorAll('.app:not([data-ma-clone])'); if (!natives.length) return false;
      var src = natives[0];
      var clone = document.createElement('div');
      clone.className = src.className || 'app';
      clone.setAttribute('data-ma-clone', '1');
      clone.id = 'ma-app-icon';
      var iconBox = document.createElement('div');
      iconBox.className = 'ma-app-custom-icon';
      iconBox.setAttribute('data-ma-icon', '1');
      var nameEl = document.createElement('div');
      nameEl.setAttribute('data-ma-name', '1');
      nameEl.style.cssText = 'font-size:12px;line-height:1.4;text-align:center;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:4px;';
      var dot = document.createElement('i'); dot.className = 'ma-app-dot';
      clone.appendChild(iconBox);
      clone.appendChild(nameEl);
      clone.appendChild(dot);
      var grid = document.querySelector('.app-grid'); if (grid) grid.appendChild(clone);
      APP_ICON_EL = clone;
      APP_ICON_IMG_EL = iconBox;
      clone.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); openPanel(); });
      applyAppearance();
      updateBadge();
      return true;
    }, 'injectAppIcon', false);
  }
  function startAppIconGuard() {
    safe(function () {
      injectAppIcon();
      var observer = new MutationObserver(function () {
        if (!APP_ICON_EL || !document.body.contains(APP_ICON_EL)) {
          APP_ICON_EL = null;
          APP_ICON_IMG_EL = null;
          injectAppIcon();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }, 'startAppIconGuard');
  }
  function applyVisibility() {
    safe(function () {
      var hide = !!(DB.settings.hideAll && !URL_FORCE_SHOW);
      if (FAB) { if (hide) FAB.classList.add('ma-hidden'); else FAB.classList.remove('ma-hidden'); }
      if (APP_ICON_EL) { APP_ICON_EL.classList.remove('ma-hidden'); }
      bindNativeHijack(hide);
    }, 'applyVisibility');
  }
  function bindNativeHijack(on) {
    safe(function () {
      var natives = document.querySelectorAll('.app:not([data-ma-clone])');
      for (var i = 0; i < natives.length; i++) {
        var el = natives[i];
        if (on) {
          if (!el.__maHijack) {
            el.__maHijack = function (e) { try { if (!DB.settings.hideAll) return; e.preventDefault(); e.stopPropagation(); openPanel(); } catch (err) {} };
            el.addEventListener('click', el.__maHijack, true);
          }
        } else if (el.__maHijack) { try { el.removeEventListener('click', el.__maHijack, true); } catch (e2) {} el.__maHijack = null; }
      }
    }, 'bindNativeHijack');
  }
  function applyAppearance() {
    safe(function () {
      var s = DB.settings;
      if (FAB) {
        var size = clamp(s.ballSize || 52, 36, 88); FAB.style.width = size + 'px'; FAB.style.height = size + 'px'; FAB.style.fontSize = Math.max(11, Math.round(size * 0.30)) + 'px';
        if (s.ballImage) { FAB.style.backgroundImage = 'url("' + s.ballImage + '")'; FAB.style.backgroundColor = 'transparent'; FAB.classList.add('ma-has-img'); }
        else { FAB.style.backgroundImage = ''; FAB.style.backgroundColor = s.ballColor || '#ff6b81'; FAB.classList.remove('ma-has-img'); }
      }
      if (APP_ICON_EL) {
        var nameEl = APP_ICON_EL.querySelector('[data-ma-name]');
        if (nameEl) {
          nameEl.textContent = s.appName || '审核';
          nameEl.style.color = s.appColor || '#333333';
        }
        var holder = APP_ICON_IMG_EL;
        if (holder) {
          if (s.appImage) {
            holder.style.backgroundImage = 'url("' + s.appImage + '")';
            holder.style.backgroundColor = 'transparent';
          } else {
            holder.style.backgroundImage = 'none';
            holder.style.backgroundColor = s.appIconColor || '#f5f5f5';
          }
        }
      }
    }, 'applyAppearance');
  }

  function updateBadge() {
    safe(function () {
      var n = pendingCount();
      var f = FAB ? FAB.querySelector('.ma-fab-dot') : null;
      if (f) { if (n > 0) { f.textContent = n > 99 ? '99+' : n; f.classList.add('on'); } else { f.textContent = ''; f.classList.remove('on'); } }
      var a = APP_ICON_EL ? APP_ICON_EL.querySelector('.ma-app-dot') : null;
      if (a) {
        if (n > 0) { a.textContent = n > 99 ? '99+' : n; a.classList.add('on'); a.style.cssText = ''; }
        else { a.textContent = ''; a.classList.remove('on'); a.style.cssText = 'display:none !important;'; }
      }
      var t = PANEL ? PANEL.querySelector('.ma-tab[data-tab="pending"] .ma-tab-badge') : null;
      if (t) { t.textContent = n > 99 ? '99+' : String(n); t.style.display = n > 0 ? 'inline-block' : 'none'; }
    }, 'updateBadge');
  }

  var TAB_DEF = [
    { key: 'pending', label: '待审核' },
    { key: 'cards', label: '字卡库' },
    { key: 'auditreport', label: '审核报告字卡库' },
    { key: 'history', label: '历史档案' },
    { key: 'settings', label: '设置' }
  ];

  function buildUI() {
    safe(function () {
      ensureRoot(); var oldMask = document.getElementById('ma-mask'); if (oldMask && oldMask.parentNode) oldMask.parentNode.removeChild(oldMask);
      MASK = document.createElement('div'); MASK.id = 'ma-mask'; PANEL = document.createElement('div'); PANEL.id = 'ma-panel';
      var tabHtml = '';
      for (var i = 0; i < TAB_DEF.length; i++) {
        var t = TAB_DEF[i];
        tabHtml += '<div class="ma-tab' + (t.key === CURRENT_TAB ? ' on' : '') + '" data-tab="' + t.key + '">' + t.label + (t.key === 'pending' ? '<span class="ma-tab-badge" style="display:none;">0</span>' : '') + '</div>';
      }
      PANEL.innerHTML = '<div class="ma-header"><div class="ma-title">审核中心</div><div class="ma-close" id="ma-close">×</div></div><div class="ma-tabs" id="ma-tabs">' + tabHtml + '</div><div class="ma-body" id="ma-body"></div>';
      MASK.appendChild(PANEL); ROOT.appendChild(MASK);
      var cb = PANEL.querySelector('#ma-close'); if (cb) cb.addEventListener('click', closePanel);
      MASK.style.pointerEvents = 'none';
      MASK.addEventListener('click', function (e) { if (e.target === MASK) closePanel(); });
      var tb = PANEL.querySelector('#ma-tabs');
      if (tb) tb.addEventListener('click', function (e) {
        var el = e.target;
        while (el && el !== tb && !el.getAttribute('data-tab')) el = el.parentNode;
        if (!el || el === tb) return;
        CURRENT_TAB = el.getAttribute('data-tab');
        renderTabs();
        renderPanelBody();
      });
      if (!document.getElementById('ma-crop-mask')) { var cm = document.createElement('div'); cm.id = 'ma-crop-mask'; ROOT.appendChild(cm); }
      if (!document.getElementById('ma-modal-mask')) { var mm = document.createElement('div'); mm.id = 'ma-modal-mask'; ROOT.appendChild(mm); }
      if (!document.getElementById('ma-toast')) { var tt = document.createElement('div'); tt.id = 'ma-toast'; ROOT.appendChild(tt); }
    }, 'buildUI');
  }
  function renderTabs() { safe(function () { if (!PANEL) return; var ts = PANEL.querySelectorAll('.ma-tab'); for (var i = 0; i < ts.length; i++) { if (ts[i].getAttribute('data-tab') === CURRENT_TAB) ts[i].classList.add('on'); else ts[i].classList.remove('on'); } updateBadge(); }, 'renderTabs'); }
  function openPanel() { safe(function () { ensureRoot(); if (!MASK) buildUI(); if (!MASK) return; MASK.classList.add('on'); PANEL.style.pointerEvents = 'auto'; PANEL_OPEN = true; renderTabs(); renderPanelBody(); updateBadge(); }, 'openPanel'); }
  function closePanel() { safe(function () { if (MASK) MASK.classList.remove('on'); PANEL.style.pointerEvents = 'none'; PANEL_OPEN = false; }, 'closePanel'); }


  function renderPanelBody() {
    safe(function () {
      if (!PANEL) return; var body = PANEL.querySelector('#ma-body'); if (!body) return; var html = '';
      if (CURRENT_TAB === 'pending') html = renderPendingTab();
      else if (CURRENT_TAB === 'cards') html = renderCardsTab();
      else if (CURRENT_TAB === 'auditreport') html = renderAuditReportTab();
      else if (CURRENT_TAB === 'history') html = renderHistoryTab();
      else html = renderSettingsTab();
      body.innerHTML = html || '';
      if (CURRENT_TAB === 'pending') bindPendingEvents(body);
      else if (CURRENT_TAB === 'cards') bindCardsEvents(body);
      else if (CURRENT_TAB === 'auditreport') bindAuditReportEvents(body);
      else if (CURRENT_TAB === 'settings') bindSettingsEvents(body);
    }, 'renderPanelBody');
  }

  function renderPendingTab() {
    var pending = []; for (var pi = 0; pi < DB.pending.length; pi++) if (DB.pending[pi].status === 'pending') pending.push(DB.pending[pi]);
    if (!pending.length) return '<div class="ma-empty">暂无待审核记录</div>';
    pending.sort(function (a, b) { return (b.time || 0) - (a.time || 0); });
    var h = '';
    h += '<div class="ma-bulkbar" style="margin-bottom:10px;">';
    h += '<label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" id="ma-pending-all"> 全选</label>';
    h += '<span id="ma-pending-count" style="color:#888;">已选 0 个</span>';
    h += '<button class="ma-btn sm" id="ma-pending-reject-checked" style="color:#e0355a; border-color:#ffb3c0;">勾选拒绝</button>';
    h += '<button class="ma-btn sm primary" id="ma-pending-approve-checked">勾选同意</button>';
    h += '<div style="flex:1;"></div>';
    h += '<button class="ma-btn sm" id="ma-pending-reject-all" style="color:#e0355a;">全部拒绝</button>';
    h += '<button class="ma-btn sm primary" id="ma-pending-approve-all">全部同意</button>';
    h += '</div>';
    var actM = { add: '新增', delete: '删除', disable: '禁用', enable: '启用', move: '迁移' }, clsM = { add: 'add', delete: 'del', disable: 'dis', enable: 'en', move: 'mv' };
    for (var i = 0; i < pending.length; i++) {
      var p = pending[i];
      h += '<div class="ma-pending-item" data-pid="' + esc(p.id) + '">';
      h += '<div class="ma-pending-top"><div style="display:flex;align-items:center;gap:8px;"><input type="checkbox" class="ma-pending-check" data-pid="' + esc(p.id) + '"><span class="ma-act-tag ' + (clsM[p.action] || '') + '">' + (actM[p.action] || p.action) + '</span></div><span class="ma-sender">来自 <b>' + esc(p.sender) + '</b> · ' + esc(fmtRelative(p.time)) + '</span></div>';
      h += '<div class="ma-pending-text">' + esc(p.text) + '</div>';
      if (p.note) h += '<div class="ma-pending-note" style="font-size:11px;color:#aaa;margin-bottom:8px;">' + esc(p.note) + '</div>';
      if (p.action === 'add') {
        h += '<div class="ma-row" style="margin:4px 0 6px;"><span class="ma-label">存入分类：</span><select class="ma-select" data-sel-group style="flex:1;">';
        if (!DB.groups.length) h += '<option value="">(自动创建默认分类)</option>';
        else for (var gi = 0; gi < DB.groups.length; gi++) h += '<option value="' + esc(DB.groups[gi].id) + '"' + (DB.groups[gi].id === p.toGroupId ? ' selected' : '') + '>' + esc(DB.groups[gi].name) + '</option>';
        h += '</select></div>';
      }
      if (p.action === 'move') h += '<div style="font-size:12px;color:#888;margin:2px 0 6px;">迁移：<b>' + esc(p.fromGroupName) + '</b> → <b>' + esc(p.toGroupName) + '</b></div>';
      h += '<div class="ma-pending-actions" style="display:flex;justify-content:flex-end;gap:8px;"><button class="ma-btn sm" data-pact="reject">拒绝</button><button class="ma-btn sm primary" data-pact="approve">同意</button></div></div>';
    }
    return h;
  }

  function bindPendingEvents(body) {
    safe(function () {
      var checkboxes = body.querySelectorAll('.ma-pending-check');
      var countEl = body.querySelector('#ma-pending-count');
      var allCb = body.querySelector('#ma-pending-all');
      function updatePendingCount() {
        var n = 0, total = checkboxes.length;
        for (var i = 0; i < total; i++) { if (checkboxes[i].checked) n++; }
        if (countEl) countEl.textContent = '已选 ' + n + ' 个';
        if (allCb) allCb.checked = (n > 0 && n === total);
      }
      if (allCb) allCb.addEventListener('change', function () { for (var i = 0; i < checkboxes.length; i++) checkboxes[i].checked = allCb.checked; updatePendingCount(); });
      for (var i = 0; i < checkboxes.length; i++) checkboxes[i].addEventListener('change', updatePendingCount);
      var btnAppChecked = body.querySelector('#ma-pending-approve-checked');
      if (btnAppChecked) btnAppChecked.addEventListener('click', function () { safe(function () {
          var cbs = body.querySelectorAll('.ma-pending-check:checked'); if (!cbs.length) { toast('请先勾选'); return; }
          var cnt = 0;
          for (var i = 0; i < cbs.length; i++) {
              var pid = cbs[i].getAttribute('data-pid'), p = null;
              for (var k = 0; k < DB.pending.length; k++) if (DB.pending[k].id === pid) { p = DB.pending[k]; break; }
              if (!p) continue;
              var itemNode = cbs[i].closest('.ma-pending-item');
              var sel = itemNode ? itemNode.querySelector('[data-sel-group]') : null;
              var targetGid = sel ? sel.value : (DB.groups.length > 0 ? DB.groups[0].id : '');
              if (approvePending(p, targetGid)) { DB.pending = DB.pending.filter(function (x) { return x.id !== pid; }); cnt++; }
          }
          saveData(); renderPanelBody(); updateBadge(); toast('已同意 ' + cnt + ' 条');
      }, 'bulkApproveChecked'); });
      var btnRejChecked = body.querySelector('#ma-pending-reject-checked');
      if (btnRejChecked) btnRejChecked.addEventListener('click', function () { safe(function () {
          var cbs = body.querySelectorAll('.ma-pending-check:checked'); if (!cbs.length) { toast('请先勾选'); return; }
          var cnt = 0;
          for (var i = 0; i < cbs.length; i++) {
              var pid = cbs[i].getAttribute('data-pid'), p = null;
              for (var k = 0; k < DB.pending.length; k++) if (DB.pending[k].id === pid) { p = DB.pending[k]; break; }
              if (!p) continue;
              rejectPending(p); DB.pending = DB.pending.filter(function (x) { return x.id !== pid; }); cnt++;
          }
          saveData(); renderPanelBody(); updateBadge(); toast('已拒绝 ' + cnt + ' 条');
      }, 'bulkRejectChecked'); });
      var btnAppAll = body.querySelector('#ma-pending-approve-all');
      if (btnAppAll) btnAppAll.addEventListener('click', function () { safe(function () {
          var cnt = 0; var list = DB.pending.slice();
          for (var i = 0; i < list.length; i++) { var p = list[i]; if (p.status !== 'pending') continue; var targetGid = DB.groups.length > 0 ? DB.groups[0].id : ''; if (approvePending(p, targetGid)) cnt++; DB.pending = DB.pending.filter(function (x) { return x.id !== p.id; }); }
          saveData(); renderPanelBody(); updateBadge(); toast('已批量同意 ' + cnt + ' 条');
      }, 'bulkApproveAll'); });
      var btnRejAll = body.querySelector('#ma-pending-reject-all');
      if (btnRejAll) btnRejAll.addEventListener('click', function () { safe(function () {
          var cnt = 0; var list = DB.pending.slice();
          for (var i = 0; i < list.length; i++) { var p = list[i]; if (p.status !== 'pending') continue; rejectPending(p); DB.pending = DB.pending.filter(function (x) { return x.id !== p.id; }); cnt++; }
          saveData(); renderPanelBody(); updateBadge(); toast('已批量拒绝 ' + cnt + ' 条');
      }, 'bulkRejectAll'); });
      eachNode(body, '.ma-pending-item', function (item) {
        var pid = item.getAttribute('data-pid'), p = null; for (var i = 0; i < DB.pending.length; i++) if (DB.pending[i].id === pid) { p = DB.pending[i]; break; } if (!p) return;
        var ab = item.querySelector('[data-pact="approve"]'), rb = item.querySelector('[data-pact="reject"]');
        if (ab) ab.addEventListener('click', function () { safe(function () { var sel = item.querySelector('[data-sel-group]'); if (approvePending(p, sel ? sel.value : '')) { DB.pending = DB.pending.filter(function (x) { return x.id !== pid; }); saveData(); renderPanelBody(); updateBadge(); toast('已同意并入库'); } else toast('操作失败'); }, 'approve'); });
        if (rb) rb.addEventListener('click', function () { safe(function () { rejectPending(p); DB.pending = DB.pending.filter(function (x) { return x.id !== pid; }); saveData(); renderPanelBody(); updateBadge(); toast('已拒绝'); }, 'reject'); });
      });
    }, 'bindPendingEvents');
  }
  function approvePending(p, targetGid) {
    if (!p) return false;
    var ok = false;
    if (p.action === 'add') {
      var g = targetGid ? findGroup(targetGid) : null;
      if (!g) {
        if (!DB.groups.length) {
          g = { id: uid('g'), name: '默认', disabledBy: [], cards: [] };
          DB.groups.push(g);
        } else {
          g = DB.groups[0];
        }
      }
      g.cards.push({ id: uid('c'), text: p.text, disabledBy: [], createdAt: Date.now() });
      ok = true;
      pushHistory({ sender: p.sender || SENDER_MJ, action: 'add', text: p.text, result: 'agree', extra: 'group:' + g.id });
    } else if (p.action === 'delete') {
      var f1 = findCard(p.cardId);
      if (f1) {
        f1.group.cards = f1.group.cards.filter(function (x) { return x.id !== f1.card.id; });
        ok = true;
        pushHistory({ sender: p.sender || SENDER_MJ, action: 'delete', text: p.text, result: 'agree', extra: 'card:' + f1.card.id });
      }
    } else if (p.action === 'disable') {
      var f2 = findCard(p.cardId);
      if (f2) {
        if (f2.card.disabledBy.indexOf('mj') < 0) f2.card.disabledBy.push('mj');
        ok = true;
        pushHistory({ sender: p.sender || SENDER_MJ, action: 'disable', text: p.text, result: 'agree', extra: 'card:' + f2.card.id });
      }
    } else if (p.action === 'enable') {
      var f3 = findCard(p.cardId);
      if (f3) {
        f3.card.disabledBy = f3.card.disabledBy.filter(function (x) { return x !== 'mj'; });
        ok = true;
        pushHistory({ sender: p.sender || SENDER_MJ, action: 'enable', text: p.text, result: 'agree', extra: 'card:' + f3.card.id });
      }
    } else if (p.action === 'move') {
      var f4 = findCard(p.cardId);
      var tg = findGroup(p.toGroupId);
      if (f4 && tg) {
        f4.group.cards = f4.group.cards.filter(function (x) { return x.id !== f4.card.id; });
        tg.cards.push(f4.card);
        ok = true;
        pushHistory({ sender: p.sender || SENDER_MJ, action: 'move', text: p.text, result: 'agree', extra: 'from:' + f4.group.id + ',to:' + tg.id });
      }
    }
    return ok;
  }

  function rejectPending(p) {
    if (!p) return false;
    pushHistory({ sender: p.sender || SENDER_MJ, action: p.action || 'unknown', text: p.text, result: 'reject', extra: '' });
    return true;
  }

  function renderCardsTab() {
    var h = '';
    h += '<div class="ma-bulkbar" style="margin-bottom:10px;">';
    h += '<button class="ma-btn sm primary" id="ma-card-add">+ 新增字卡</button>';
    h += '<button class="ma-btn sm" id="ma-group-add">+ 新建分类</button>';
    h += '<div style="flex:1;"></div>';
    h += '<button class="ma-btn sm" id="ma-cards-toggle-all">展开/收起</button>';
    h += '</div>';
    if (!DB.groups.length) return '<div class="ma-empty">还没有分类，点击“新建分类”开始</div>';
    for (var gi = 0; gi < DB.groups.length; gi++) {
      var g = DB.groups[gi];
      var open = OPEN_GROUPS && OPEN_GROUPS[g.id];
      h += '<div class="ma-group' + (open ? ' open' : '') + '" data-gid="' + esc(g.id) + '">';
      h += '<div class="ma-group-head"><div class="ma-group-title"><input type="checkbox" class="ma-group-check" data-gid="' + esc(g.id) + '"><span>' + esc(g.name) + '</span><span style="color:#888;font-weight:400;">(' + g.cards.length + ')</span></div><div style="display:flex;gap:6px;align-items:center;"><button class="ma-btn sm" data-act="group-rename" data-gid="' + esc(g.id) + '">重命名</button><button class="ma-btn sm danger" data-act="group-delete" data-gid="' + esc(g.id) + '">删除</button></div></div>';
      h += '<div class="ma-group-body">';
      if (!g.cards.length) h += '<div class="ma-empty" style="padding:16px 0;">这个分类还没有字卡</div>';
      for (var ci = 0; ci < g.cards.length; ci++) {
        var c = g.cards[ci];
        var disabled = (c.disabledBy || []).length > 0;
        var disUser = c.disabledBy.indexOf('user') >= 0;
        var disMj = c.disabledBy.indexOf('mj') >= 0;
        h += '<div class="ma-card' + (disabled ? ' disabled' : '') + '" data-cid="' + esc(c.id) + '">';
        h += '<input type="checkbox" class="ma-card-check" data-cid="' + esc(c.id) + '">';
        h += '<div class="ma-card-main"><div class="ma-card-text">' + esc(c.text) + '</div>';
        h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">';
        if (disUser) h += '<span class="ma-badge-dis user">我禁用</span>';
        if (disMj) h += '<span class="ma-badge-dis mj">梦角禁用</span>';
        if (disUser && disMj) h += '<span class="ma-badge-dis both">双方禁用</span>';
        h += '</div></div>';
        h += '<div class="ma-card-ops"><button class="ma-btn sm" data-act="card-send" data-cid="' + esc(c.id) + '">发送</button><button class="ma-btn sm" data-act="card-edit" data-cid="' + esc(c.id) + '">编辑</button><button class="ma-btn sm" data-act="card-toggle" data-cid="' + esc(c.id) + '">' + (disabled ? '启用' : '禁用') + '</button><button class="ma-btn sm danger" data-act="card-delete" data-cid="' + esc(c.id) + '">删除</button></div>';
        h += '</div>';
      }
      h += '</div></div>';
    }
    return h;
  }

  function bindCardsEvents(body) {
    safe(function () {
      if (!OPEN_GROUPS) OPEN_GROUPS = {};
      eachNode(body, '.ma-group-head', function (head) {
        head.addEventListener('click', function (e) {
          if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
          var group = head.parentElement;
          var gid = group.getAttribute('data-gid');
          group.classList.toggle('open');
          OPEN_GROUPS[gid] = group.classList.contains('open');
        });
      });
      var btnAdd = body.querySelector('#ma-card-add');
      if (btnAdd) btnAdd.addEventListener('click', function () {
        var text = prompt('请输入新字卡内容：');
        if (!text) return;
        text = text.trim();
        if (!text) return;
        var gid = DB.groups.length > 0 ? DB.groups[0].id : '';
        var g = findGroup(gid);
        if (!g) {
          g = { id: uid('g'), name: '默认', disabledBy: [], cards: [] };
          DB.groups.push(g);
        }
        g.cards.push({ id: uid('c'), text: text, disabledBy: [], createdAt: Date.now() });
        saveData();
        renderPanelBody();
        toast('已新增字卡');
      });
      var btnGroupAdd = body.querySelector('#ma-group-add');
      if (btnGroupAdd) btnGroupAdd.addEventListener('click', function () {
        var name = prompt('请输入新分类名称：');
        if (!name) return;
        name = name.trim();
        if (!name) return;
        DB.groups.push({ id: uid('g'), name: name, disabledBy: [], cards: [] });
        saveData();
        renderPanelBody();
        toast('已新建分类');
      });
      var btnToggleAll = body.querySelector('#ma-cards-toggle-all');
      if (btnToggleAll) btnToggleAll.addEventListener('click', function () {
        var groups = body.querySelectorAll('.ma-group');
        var anyClosed = false;
        for (var i = 0; i < groups.length; i++) if (!groups[i].classList.contains('open')) anyClosed = true;
        for (var i = 0; i < groups.length; i++) {
          var gid = groups[i].getAttribute('data-gid');
          if (anyClosed) { groups[i].classList.add('open'); OPEN_GROUPS[gid] = true; }
          else { groups[i].classList.remove('open'); OPEN_GROUPS[gid] = false; }
        }
      });
      eachNode(body, '.ma-card', function (row) {
        var cid = row.getAttribute('data-cid');
        var f = findCard(cid);
        if (!f) return;
        var btnSend = row.querySelector('[data-act="card-send"]');
        var btnEdit = row.querySelector('[data-act="card-edit"]');
        var btnToggle = row.querySelector('[data-act="card-toggle"]');
        var btnDelete = row.querySelector('[data-act="card-delete"]');
        if (btnSend) btnSend.addEventListener('click', function () { sendCardToChat(cid); });
        if (btnEdit) btnEdit.addEventListener('click', function () {
          var newText = prompt('编辑字卡内容：', f.card.text);
          if (newText === null) return;
          newText = newText.trim();
          if (!newText) { toast('内容不能为空'); return; }
          f.card.text = newText;
          saveData();
          renderPanelBody();
          toast('已保存');
        });
        if (btnToggle) btnToggle.addEventListener('click', function () {
          var idx = f.card.disabledBy.indexOf('user');
          if (idx >= 0) f.card.disabledBy.splice(idx, 1); else f.card.disabledBy.push('user');
          saveData();
          renderPanelBody();
          toast('已切换禁用状态');
        });
        if (btnDelete) btnDelete.addEventListener('click', function () {
          if (!confirm('确定删除这条字卡？')) return;
          f.group.cards = f.group.cards.filter(function (x) { return x.id !== f.card.id; });
          saveData();
          renderPanelBody();
          toast('已删除');
        });
      });
      eachNode(body, '[data-act="group-rename"]', function (btn) {
        btn.addEventListener('click', function () {
          var gid = btn.getAttribute('data-gid');
          var g = findGroup(gid);
          if (!g) return;
          var name = prompt('重命名分类：', g.name);
          if (!name) return;
          name = name.trim();
          if (!name) return;
          g.name = name;
          saveData();
          renderPanelBody();
          toast('已重命名');
        });
      });
      eachNode(body, '[data-act="group-delete"]', function (btn) {
        btn.addEventListener('click', function () {
          var gid = btn.getAttribute('data-gid');
          var g = findGroup(gid);
          if (!g) return;
          if (DB.groups.length <= 1) { toast('至少保留一个分类'); return; }
          if (!confirm('删除分类“' + g.name + '”及其全部字卡？')) return;
          DB.groups = DB.groups.filter(function (x) { return x.id !== gid; });
          saveData();
          renderPanelBody();
          toast('已删除分类');
        });
      });
    }, 'bindCardsEvents');
  }

  function renderAuditReportTab() {
    var h = '';
    h += '<div class="ma-bulkbar" style="margin-bottom:10px;">';
    h += '<span style="color:#666;">审核报告字卡库：审核通过归档内容</span>';
    h += '<div style="flex:1;"></div>';
    h += '<button class="ma-btn sm primary" id="ma-audit-add">+ 新增报告字卡</button>';
    h += '</div>';
    var reportCards = safe(function () {
      return DB.history.filter(function (x) { return x.result === 'agree'; }).slice(-50);
    }, 'auditReportCards', []);
    if (!reportCards.length) return '<div class="ma-empty">还没有审核通过记录</div>';
    h += '<div style="display:flex;flex-direction:column;gap:8px;">';
    for (var i = 0; i < reportCards.length; i++) {
      var r = reportCards[i];
      h += '<div class="ma-pending-item" style="margin-bottom:0;">';
      h += '<div class="ma-pending-top"><span class="ma-act-tag add">' + esc(r.action || 'agree') + '</span><span class="ma-sender">来自 <b>' + esc(r.sender) + '</b> · ' + esc(fmtRelative(r.time)) + '</span></div>';
      h += '<div class="ma-pending-text">' + esc(r.text) + '</div>';
      h += '<div class="ma-pending-actions" style="display:flex;justify-content:flex-end;gap:8px;">';
      h += '<button class="ma-btn sm" data-act="report-copy" data-text="' + esc(r.text) + '">复制</button>';
      h += '<button class="ma-btn sm primary" data-act="report-send" data-text="' + esc(r.text) + '">发送到聊天</button>';
      h += '</div></div>';
    }
    h += '</div>';
    return h;
  }

  function bindAuditReportEvents(body) {
    safe(function () {
      var btnAdd = body.querySelector('#ma-audit-add');
      if (btnAdd) {
        btnAdd.addEventListener('click', function () {
          var text = prompt('输入审核报告字卡内容：');
          if (!text) return;
          text = text.trim();
          if (!text) return;
          pushHistory({ sender: SENDER_ME, action: 'manual', text: text, result: 'agree', extra: 'audit-report' });
          toast('已新增到报告库');
          renderPanelBody();
        });
      }
      eachNode(body, '[data-act="report-copy"]', function (btn) {
        btn.addEventListener('click', function () {
          var text = btn.getAttribute('data-text');
          safe(function () {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(text).then(function () { toast('已复制'); });
            } else {
              var ta = document.createElement('textarea');
              ta.value = text;
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
              toast('已复制');
            }
          }, 'copy');
        });
      });
      eachNode(body, '[data-act="report-send"]', function (btn) {
        btn.addEventListener('click', function () {
          var text = btn.getAttribute('data-text');
          var ok = injectBubbleToChat(text);
          toast(ok ? '发送成功' : '发送失败');
        });
      });
    }, 'bindAuditReportEvents');
  }

  function renderHistoryTab() {
    var list = safe(function () { return DB.history.slice().reverse(); }, 'historyList', []);
    if (!list.length) return '<div class="ma-empty">暂无历史记录</div>';
    var h = '<div style="display:flex;flex-direction:column;gap:8px;">';
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var resultTag = r.result === 'agree'
        ? '<span class="ma-act-tag add">同意</span>'
        : '<span class="ma-act-tag del">拒绝</span>';
      h += '<div class="ma-pending-item" style="margin-bottom:0;">';
      h += '<div class="ma-pending-top">' + resultTag + '<span class="ma-sender">来自 <b>' + esc(r.sender) + '</b> · ' + esc(fmtTime(r.time)) + '</span></div>';
      h += '<div class="ma-pending-text">' + esc(r.text) + '</div>';
      if (r.extra) h += '<div class="ma-pending-note" style="font-size:11px;color:#aaa;">' + esc(r.extra) + '</div>';
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  function renderSettingsTab() {
    var s = DB.settings;
    var h = '';
    h += '<div class="ma-set-block">';
    h += '<div style="font-weight:700;margin-bottom:8px;">悬浮球样式</div>';
    h += '<div class="ma-row"><span style="width:80px;">颜色</span><input type="color" id="ma-set-ballColor" value="' + esc(s.ballColor) + '" style="width:60px;height:32px;padding:2px;border-radius:6px;border:1px solid #ddd;">';
    h += '<span style="width:60px;margin-left:12px;">大小</span><input type="range" id="ma-set-ballSize" min="36" max="88" value="' + s.ballSize + '" style="flex:1;"><span id="ma-set-ballSize-val" style="width:40px;text-align:right;">' + s.ballSize + 'px</span></div>';
    h += '<div class="ma-row"><span style="width:80px;">悬浮球图片</span><input type="file" id="ma-set-ballImage" accept="image/*" style="flex:1;"></div>';
    if (s.ballImage) h += '<div style="margin-top:6px;"><img id="ma-set-ballImage-preview" src="' + esc(s.ballImage) + '" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:1px solid #eee;"></div>';
    h += '</div>';
    h += '<div class="ma-set-block">';
    h += '<div style="font-weight:700;margin-bottom:8px;">应用图标样式</div>';
    h += '<div class="ma-row"><span style="width:80px;">图标名称</span><input type="text" id="ma-set-appName" class="ma-input" value="' + esc(s.appName) + '"></div>';
    h += '<div class="ma-row"><span style="width:80px;">文字颜色</span><input type="color" id="ma-set-appColor" value="' + esc(s.appColor) + '" style="width:60px;height:32px;padding:2px;border-radius:6px;border:1px solid #ddd;"></div>';
    h += '<div class="ma-row"><span style="width:80px;">图标背景</span><input type="color" id="ma-set-appIconColor" value="' + esc(s.appIconColor || '#f5f5f5') + '" style="width:60px;height:32px;padding:2px;border-radius:6px;border:1px solid #ddd;"></div>';
    h += '<div class="ma-row"><span style="width:80px;">图标图片</span><input type="file" id="ma-set-appImage" accept="image/*" style="flex:1;"></div>';
    if (s.appImage) h += '<div style="margin-top:6px;"><img id="ma-set-appImage-preview" src="' + esc(s.appImage) + '" style="width:80px;height:80px;border-radius:14px;object-fit:cover;border:1px solid #eee;"></div>';
    h += '</div>';
    h += '<div class="ma-set-block">';
    h += '<div style="font-weight:700;margin-bottom:8px;">显示控制</div>';
    h += '<div class="ma-row"><span style="flex:1;">隐藏悬浮球和面板</span><div class="ma-switch' + (s.hideAll ? ' on' : '') + '" id="ma-set-hideAll"></div></div>';
    h += '<div class="ma-row"><button class="ma-btn sm" id="ma-set-reset-pos">重置悬浮球位置</button><button class="ma-btn sm danger" id="ma-set-clear-data">清空所有数据</button></div>';
    h += '</div>';
    return h;
  }

  function bindSettingsEvents(body) {
    safe(function () {
      var s = DB.settings;
      var ballColor = body.querySelector('#ma-set-ballColor');
      if (ballColor) ballColor.addEventListener('input', function () { s.ballColor = ballColor.value; applyAppearance(); saveData(); });
      var ballSize = body.querySelector('#ma-set-ballSize');
      var ballSizeVal = body.querySelector('#ma-set-ballSize-val');
      if (ballSize) ballSize.addEventListener('input', function () {
        s.ballSize = parseInt(ballSize.value, 10);
        if (ballSizeVal) ballSizeVal.textContent = s.ballSize + 'px';
        applyAppearance();
        applyFabPosition();
        saveData();
      });
      var ballImage = body.querySelector('#ma-set-ballImage');
      if (ballImage) ballImage.addEventListener('change', function () {
        var file = ballImage.files && ballImage.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          s.ballImage = String(reader.result || '');
          applyAppearance();
          saveData();
          renderPanelBody();
        };
        reader.readAsDataURL(file);
      });
      var appName = body.querySelector('#ma-set-appName');
      if (appName) appName.addEventListener('change', function () { s.appName = appName.value.trim() || '审核'; applyAppearance(); saveData(); });
      var appColor = body.querySelector('#ma-set-appColor');
      if (appColor) appColor.addEventListener('input', function () { s.appColor = appColor.value; applyAppearance(); saveData(); });
      var appIconColor = body.querySelector('#ma-set-appIconColor');
      if (appIconColor) appIconColor.addEventListener('input', function () { s.appIconColor = appIconColor.value; applyAppearance(); saveData(); });
      var appImage = body.querySelector('#ma-set-appImage');
      if (appImage) appImage.addEventListener('change', function () {
        var file = appImage.files && appImage.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          s.appImage = String(reader.result || '');
          applyAppearance();
          saveData();
          renderPanelBody();
        };
        reader.readAsDataURL(file);
      });
      var hideAll = body.querySelector('#ma-set-hideAll');
      if (hideAll) hideAll.addEventListener('click', function () {
        s.hideAll = !s.hideAll;
        hideAll.classList.toggle('on', s.hideAll);
        applyVisibility();
        saveData();
        toast(s.hideAll ? '已隐藏悬浮球' : '已显示悬浮球');
      });
      var resetPos = body.querySelector('#ma-set-reset-pos');
      if (resetPos) resetPos.addEventListener('click', function () {
        s.ballPos = null;
        applyFabPosition();
        saveData();
        toast('已重置位置');
      });
      var clearData = body.querySelector('#ma-set-clear-data');
      if (clearData) clearData.addEventListener('click', function () {
        if (!confirm('确定清空所有字卡、待审核和历史数据？此操作不可恢复。')) return;
        localStorage.removeItem(LS_KEY_DATA);
        DB = defaultData();
        saveData();
        renderPanelBody();
        toast('已清空数据');
      });
    }, 'bindSettingsEvents');
  }

  function startGuard() {
    safe(function () {
      DB = loadData();
      injectCSS();
      buildFab();
      startAppIconGuard();
      applyAppearance();
      applyVisibility();
      updateBadge();
      startEngine();
      setInterval(function () {
        safe(function () {
          if (!FAB || !document.body.contains(FAB)) buildFab();
          if (!APP_ICON_EL || !document.body.contains(APP_ICON_EL)) injectAppIcon();
          applyAppearance();
          applyVisibility();
          updateBadge();
          checkAndRepairChat();
        }, 'guard');
      }, 2000);
      window.addEventListener('resize', function () { safe(applyFabPosition, 'resize'); });
      safe(function () {
        if (location.href.indexOf('ma-show=1') >= 0) {
          URL_FORCE_SHOW = true;
          applyVisibility();
          setTimeout(function () { openPanel(); }, 800);
        }
      }, 'urlForceShow');
    }, 'startGuard');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { startGuard(); });
  } else {
    startGuard();
  }
})();
