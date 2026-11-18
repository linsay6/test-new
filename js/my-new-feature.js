// ==UserScript==
// @name         My Audit Cards 审核字卡与梦角引擎
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  九宫格审核图标入口、梦角拟人引擎、审批面板、独立字卡库管理
// @author       Custom Script
// @match        *://*/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // ==================== 全局基础配置与工具函数 ====================
  const STORAGE_CHAT_KEY = 'xy-home-v2:default:chat-msgs';
  const STORAGE_AUDIT_KEY = 'my-audit-cards';

  // 默认数据结构
  const DEFAULT_DATA = {
    groups: [],
    cards: [],
    auditPending: [],
    auditHistory: [],
    settings: {
      iconCustom: null,
      floatingBall: {
        enabled: true,
        color: '#3b82f6',
        size: 56,
        avatar: null,
        position: { x: 0, y: 0 }
      },
      dreamEngine: {
        enabled: true,
        interval: 30 * 60 * 1000,
        baseProbability: 0.05,
        emotionProbability: 0.3,
        maxPending: 5
      }
    }
  };

  // 存储读取
  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_AUDIT_KEY);
      if (!raw) return deepClone(DEFAULT_DATA);
      const data = JSON.parse(raw);
      return {
        ...deepClone(DEFAULT_DATA),
        ...data,
        settings: {
          ...DEFAULT_DATA.settings,
          ...data.settings,
          floatingBall: { ...DEFAULT_DATA.settings.floatingBall, ...data.settings?.floatingBall },
          dreamEngine: { ...DEFAULT_DATA.settings.dreamEngine, ...data.settings?.dreamEngine }
        }
      };
    } catch (e) {
      console.warn('[Audit] 存储读取失败，使用默认配置', e);
      return deepClone(DEFAULT_DATA);
    }
  }

  // 存储写入
  function saveData(data) {
    try {
      localStorage.setItem(STORAGE_AUDIT_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('[Audit] 存储写入失败', e);
      return false;
    }
  }

  // 深拷贝
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // 注入CSS
  function injectCSS(css, id = 'my-audit-global-css') {
    try {
      if (document.getElementById(id)) return;
      const style = document.createElement('style');
      style.id = id;
      style.textContent = css;
      document.head.appendChild(style);
    } catch (e) {
      console.warn('[Audit] CSS注入失败', e);
    }
  }

  // 时间格式化 HH:mm:ss
  function formatTime(date = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  // 生成唯一ID
  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // 全局状态命名空间
  window.__MY_AUDIT__ = {
    data: loadData(),
    reload() {
      this.data = loadData();
      window.dispatchEvent(new CustomEvent('my-audit-data-updated'));
    },
    save() {
      saveData(this.data);
      window.dispatchEvent(new CustomEvent('my-audit-data-updated'));
    }
  };

  // 全局样式
  injectCSS(`
    /* 审核图标角标 */
    .app[data-app="audit"] { position: relative; }
    .audit-badge {
      position: absolute;
      top: 4px; right: 4px;
      min-width: 18px; height: 18px;
      padding: 0 4px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 9px;
      font-size: 11px; color: #111827;
      line-height: 16px; text-align: center;
      box-sizing: border-box;
      pointer-events: none;
    }
    .audit-badge[data-count="0"] { display: none !important; }

    /* 装修编辑模式同步原生抖动黑框 */
    .edit-mode .app[data-app="audit"],
    .desk-edit .app[data-app="audit"] {
      border: 1px dashed #111;
      animation: audit-shake 0.5s infinite;
    }
    @keyframes audit-shake {
      0%,100% { transform: translateX(0); }
      25% { transform: translateX(-2px); }
      75% { transform: translateX(2px); }
    }

    /* 悬浮球 */
    #audit-floating-ball {
      position: fixed;
      z-index: 99999;
      left: 0; top: 0;
      border-radius: 50%;
      cursor: grab;
      user-select: none;
      transform: translate3d(0,0,0);
      transition: transform 0.1s ease;
      overflow: hidden;
      will-change: transform;
    }
    #audit-floating-ball:active { cursor: grabbing; }
    #audit-floating-ball img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }

    /* 审核面板 */
    #audit-panel-mask {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 100000;
      display: flex;
      align-items: center; justify-content: center;
    }
    #audit-panel {
      width: 720px; max-width: 90vw;
      height: 560px; max-height: 80vh;
      background: #fff;
      border-radius: 12px;
      display: flex; flex-direction: column;
      overflow: hidden;
    }
    .audit-panel-header {
      padding: 16px 20px;
      border-bottom: 1px solid #e5e7eb;
      display: flex; align-items: center; justify-content: space-between;
    }
    .audit-panel-title { font-size: 16px; font-weight: 600; }
    .audit-panel-close { cursor: pointer; font-size: 20px; color: #6b7280; }
    .audit-tabs {
      display: flex; gap: 24px;
      padding: 0 20px;
      border-bottom: 1px solid #e5e7eb;
    }
    .audit-tab {
      padding: 12px 0;
      cursor: pointer;
      color: #6b7280;
      border-bottom: 2px solid transparent;
      font-size: 14px;
    }
    .audit-tab.active {
      color: #111827;
      border-bottom-color: #3b82f6;
      font-weight: 500;
    }
    .audit-tab-content { flex: 1; overflow-y: auto; padding: 16px 20px; }
    .audit-tab-pane { display: none; }
    .audit-tab-pane.active { display: block; }

    /* 待审核列表 */
    .audit-batch-bar {
      display: flex; gap: 8px;
      margin-bottom: 12px; align-items: center;
      font-size: 13px;
    }
    .audit-pending-item {
      padding: 12px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      margin-bottom: 8px;
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px;
    }
    .audit-pending-info { flex: 1; }
    .audit-pending-type {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
      margin-right: 8px;
    }
    .type-add { background: #dcfce7; color: #166534; }
    .type-delete { background: #fee2e2; color: #991b1b; }
    .type-disable { background: #fef3c7; color: #92400e; }
    .type-migrate { background: #dbeafe; color: #1e40af; }
    .type-restore { background: #f3e8ff; color: #6b21a8; }
    .audit-pending-sender { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .audit-pending-actions { display: flex; gap: 8px; }
    .audit-btn {
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid #d1d5db;
      background: #fff;
      cursor: pointer;
      font-size: 13px;
    }
    .audit-btn-primary { background: #3b82f6; color: #fff; border-color: #3b82f6; }
    .audit-btn-danger { background: #ef4444; color: #fff; border-color: #ef4444; }
    .audit-btn-sm { padding: 4px 8px; font-size: 12px; }

    /* 历史档案 */
    .audit-history-item {
      padding: 10px 12px;
      border-bottom: 1px solid #f3f4f6;
      display: flex; justify-content: space-between;
      font-size: 13px;
    }
    .audit-history-result { font-weight: 500; }
    .result-approve { color: #166534; }
    .result-reject { color: #991b1b; }

    /* 设置面板 */
    .settings-section { margin-bottom: 20px; }
    .settings-section h4 { margin: 0 0 12px 0; font-size: 14px; }
    .settings-row {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 10px; font-size: 13px;
    }
    .settings-row input[type="range"] { flex: 1; margin: 0 12px; }
    .settings-row input[type="color"] {
      width: 36px; height: 24px;
      border: none; padding: 0; cursor: pointer;
    }
    .icon-preview {
      width: 48px; height: 48px;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
      overflow: hidden;
      display: flex; align-items: center; justify-content: center;
    }
    .icon-preview img { width: 100%; height: 100%; object-fit: cover; }

    /* 注入气泡标记 */
    [data-ma-injected="1"] { pointer-events: none; }

    /* 模块二字卡Tab */
    #cc-sect-audit { display: flex; flex-direction: column; }
    .audit-group-item { border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
    .audit-group-header {
      padding: 10px 12px;
      background: #f9fafb;
      display: flex; align-items: center; justify-content: space-between;
      cursor: pointer;
    }
    .group-fold-icon { transition: transform 0.2s; display: inline-block; font-size: 10px; }
    .audit-group-cards {
      padding: 8px 12px;
      display: flex; flex-direction: column; gap: 6px;
    }
    .audit-card-item {
      padding: 8px 10px;
      border: 1px solid #f3f4f6;
      border-radius: 6px;
      display: flex; align-items: center; justify-content: space-between;
      gap: 8px;
    }
    .audit-card-item.card-disabled { opacity: 0.5; }
    .card-badge-disable {
      font-size: 10px;
      padding: 0 3px;
      border-radius: 3px;
      border: 1px solid #fecaca;
      color: #ef4444;
      flex-shrink: 0;
    }
    .card-badge-disable.both { color: #991b1b; border-color: #fca5a5; }
  `);

  // ==================== 模块一：专属审核图标入口模块 ====================
  (function Module1_AuditIconEntry() {
    // 原生图标DOM结构（严格保留指定结构）
    const AUDIT_ICON_TEMPLATE = `
      <div class="app" data-app="audit" data-desk-widget="app-audit">
        <div class="app-ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </div>
        <div class="app-name">审核</div>
        <div class="audit-badge" data-count="0"></div>
      </div>
    `;

    let panelMask = null;
    let engineTimer = null;
    let engineLock = false;

    // 查找九宫格容器
    function getDeskContainer() {
      return document.querySelector('.desk-widgets, .app-grid, .widget-container, [data-desk-area="widgets"]');
    }

    // 重建审核图标
    function rebuildAuditIcon() {
      try {
        const container = getDeskContainer();
        if (!container) return;
        let icon = container.querySelector('[data-app="audit"]');
        if (!icon) {
          const wrap = document.createElement('div');
          wrap.innerHTML = AUDIT_ICON_TEMPLATE.trim();
          icon = wrap.firstElementChild;
          container.appendChild(icon);
        }
        // 绑定点击事件
        icon.onclick = () => window.openAuditPanel?.();
        // 应用自定义图标
        applyCustomIcon(icon);
        // 更新角标
        updateBadge();
      } catch (e) {
        console.warn('[Audit] 图标重建失败', e);
      }
    }

    // 应用自定义图标
    function applyCustomIcon(iconEl) {
      try {
        const icoEl = iconEl.querySelector('.app-ico');
        const custom = __MY_AUDIT__.data.settings.iconCustom;
        if (custom) {
          icoEl.innerHTML = `<img src="${custom}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`;
        } else {
          if (!icoEl.querySelector('svg')) {
            icoEl.innerHTML = `
              <svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            `;
          }
        }
      } catch (e) {
        console.warn('[Audit] 自定义图标应用失败', e);
      }
    }

    // 更新角标
    function updateBadge() {
      try {
        const badge = document.querySelector('.app[data-app="audit"] .audit-badge');
        if (!badge) return;
        const count = __MY_AUDIT__.data.auditPending.length;
        badge.dataset.count = count;
        badge.textContent = count > 99 ? '99+' : String(count);
      } catch (e) {
        console.warn('[Audit] 角标更新失败', e);
      }
    }

    // 创建悬浮球
    function createFloatingBall() {
      try {
        if (document.getElementById('audit-floating-ball')) return;
        const settings = __MY_AUDIT__.data.settings.floatingBall;
        const urlParams = new URLSearchParams(window.location.search);
        const forceShow = urlParams.get('show_audit') === 'true';
        if (!settings.enabled && !forceShow) return;

        // 初始化默认位置
        if (settings.position.x === 0 && settings.position.y === 0) {
          settings.position.x = window.innerWidth - settings.size - 24;
          settings.position.y = window.innerHeight - settings.size - 80;
        }

        const ball = document.createElement('div');
        ball.id = 'audit-floating-ball';
        ball.style.width = `${settings.size}px`;
        ball.style.height = `${settings.size}px`;
        ball.style.background = settings.color;
        ball.style.transform = `translate3d(${settings.position.x}px, ${settings.position.y}px, 0)`;

        if (settings.avatar) {
          ball.innerHTML = `<img src="${settings.avatar}" alt="">`;
        }

        // 拖拽逻辑 - 纯transform硬件加速
        let isDragging = false;
        let startX, startY, startPosX, startPosY;

        const onStart = (e) => {
          isDragging = true;
          const point = e.touches ? e.touches[0] : e;
          startX = point.clientX;
          startY = point.clientY;
          startPosX = settings.position.x;
          startPosY = settings.position.y;
          ball.style.transition = 'none';
        };

        const onMove = (e) => {
          if (!isDragging) return;
          e.preventDefault();
          const point = e.touches ? e.touches[0] : e;
          const dx = point.clientX - startX;
          const dy = point.clientY - startY;
          const newX = Math.max(0, Math.min(window.innerWidth - settings.size, startPosX + dx));
          const newY = Math.max(0, Math.min(window.innerHeight - settings.size, startPosY + dy));
          ball.style.transform = `translate3d(${newX}px, ${newY}px, 0)`;
          settings.position.x = newX;
          settings.position.y = newY;
        };

        const onEnd = () => {
          if (!isDragging) return;
          isDragging = false;
          ball.style.transition = 'transform 0.1s ease';
          __MY_AUDIT__.save();
        };

        ball.addEventListener('mousedown', onStart);
        ball.addEventListener('touchstart', onStart, { passive: false });
        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchend', onEnd);

        // 点击打开面板
        ball.addEventListener('click', () => {
          if (!isDragging) window.openAuditPanel();
        });

        document.body.appendChild(ball);
      } catch (e) {
        console.warn('[Audit] 悬浮球创建失败', e);
      }
    }

    // 打开审核面板
    function openAuditPanel() {
      try {
        if (panelMask) {
          panelMask.style.display = 'flex';
          renderPendingList();
          return;
        }

        panelMask = document.createElement('div');
        panelMask.id = 'audit-panel-mask';
        panelMask.innerHTML = `
          <div id="audit-panel">
            <div class="audit-panel-header">
              <div class="audit-panel-title">审核管理</div>
              <div class="audit-panel-close">×</div>
            </div>
            <div class="audit-tabs">
              <div class="audit-tab active" data-tab="pending">待审核</div>
              <div class="audit-tab" data-tab="history">历史档案</div>
              <div class="audit-tab" data-tab="settings">设置</div>
            </div>
            <div class="audit-tab-content">
              <div class="audit-tab-pane active" data-pane="pending">
                <div class="audit-batch-bar">
                  <label><input type="checkbox" id="audit-select-all"> 全选</label>
                  <button class="audit-btn audit-btn-sm audit-btn-primary" id="batch-approve">批量同意</button>
                  <button class="audit-btn audit-btn-sm audit-btn-danger" id="batch-reject">批量拒绝</button>
                </div>
                <div id="pending-list"></div>
              </div>
              <div class="audit-tab-pane" data-pane="history">
                <div id="history-list"></div>
              </div>
              <div class="audit-tab-pane" data-pane="settings">
                <div class="settings-section">
                  <h4>九宫格图标</h4>
                  <div class="settings-row">
                    <span>自定义图标</span>
                    <div style="display:flex;gap:8px;align-items:center;">
                      <div class="icon-preview" id="icon-preview"></div>
                      <input type="file" id="icon-upload" accept="image/*" hidden>
                      <button class="audit-btn audit-btn-sm" id="icon-upload-btn">上传</button>
                      <button class="audit-btn audit-btn-sm" id="icon-reset">恢复默认</button>
                    </div>
                  </div>
                </div>
                <div class="settings-section">
                  <h4>悬浮球</h4>
                  <div class="settings-row">
                    <span>启用悬浮球</span>
                    <input type="checkbox" id="ball-enabled">
                  </div>
                  <div class="settings-row">
                    <span>颜色</span>
                    <input type="color" id="ball-color">
                  </div>
                  <div class="settings-row">
                    <span>大小 <span id="ball-size-text">56px</span></span>
                    <input type="range" id="ball-size" min="32" max="80" value="56">
                  </div>
                  <div class="settings-row">
                    <span>自定义头像</span>
                    <div style="display:flex;gap:8px;align-items:center;">
                      <div class="icon-preview" id="ball-avatar-preview" style="border-radius:50%;"></div>
                      <input type="file" id="ball-avatar-upload" accept="image/*" hidden>
                      <button class="audit-btn audit-btn-sm" id="ball-avatar-btn">上传</button>
                      <button class="audit-btn audit-btn-sm" id="ball-avatar-reset">恢复默认</button>
                    </div>
                  </div>
                </div>
                <div class="settings-section">
                  <h4>梦角引擎</h4>
                  <div class="settings-row">
                    <span>启用自动引擎</span>
                    <input type="checkbox" id="engine-enabled">
                  </div>
                </div>
                <div class="settings-section">
                  <h4>数据备份</h4>
                  <div class="settings-row">
                    <button class="audit-btn" id="data-export">导出全部数据</button>
                    <div style="display:flex;gap:8px;">
                      <input type="file" id="data-import" accept=".json" hidden>
                      <button class="audit-btn" id="data-import-btn">导入数据</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;

        // 关闭事件
        panelMask.querySelector('.audit-panel-close').onclick = closeAuditPanel;
        panelMask.onclick = e => e.target === panelMask && closeAuditPanel();

        // Tab切换
        panelMask.querySelectorAll('.audit-tab').forEach(tab => {
          tab.onclick = () => {
            const name = tab.dataset.tab;
            panelMask.querySelectorAll('.audit-tab').forEach(t => t.classList.remove('active'));
            panelMask.querySelectorAll('.audit-tab-pane').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            panelMask.querySelector(`[data-pane="${name}"]`).classList.add('active');
            if (name === 'pending') renderPendingList();
            if (name === 'history') renderHistoryList();
            if (name === 'settings') renderSettingsPreview();
          };
        });

        bindPanelEvents(panelMask);
        document.body.appendChild(panelMask);

        renderPendingList();
        renderSettingsPreview();
      } catch (e) {
        console.warn('[Audit] 面板打开失败', e);
      }
    }

    function closeAuditPanel() {
      try {
        if (panelMask) panelMask.style.display = 'none';
      } catch (e) {
        console.warn('[Audit] 面板关闭失败', e);
      }
    }

    // 渲染待审核列表
    function renderPendingList() {
      try {
        const list = panelMask.querySelector('#pending-list');
        const pending = __MY_AUDIT__.data.auditPending;
        if (pending.length === 0) {
          list.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:40px 0;">暂无待审核项</div>';
          return;
        }
        list.innerHTML = pending.map((item, idx) => `
          <div class="audit-pending-item">
            <label style="margin-right:8px;">
              <input type="checkbox" class="pending-check" data-index="${idx}">
            </label>
            <div class="audit-pending-info">
              <span class="audit-pending-type type-${item.type}">${getTypeLabel(item.type)}</span>
              <span>${item.text || item.content || '无内容'}</span>
              <div class="audit-pending-sender">申请人：${item.sender} · ${new Date(item.time).toLocaleString()}</div>
            </div>
            <div class="audit-pending-actions">
              <button class="audit-btn audit-btn-sm audit-btn-primary btn-approve" data-index="${idx}">同意</button>
              <button class="audit-btn audit-btn-sm audit-btn-danger btn-reject" data-index="${idx}">驳回</button>
            </div>
          </div>
        `).join('');
      } catch (e) {
        console.warn('[Audit] 待审列表渲染失败', e);
      }
    }

    function getTypeLabel(type) {
      return { add: '新增', delete: '删除', disable: '禁用', migrate: '迁移', restore: '恢复启用' }[type] || type;
    }

    // 渲染历史档案
    function renderHistoryList() {
      try {
        const list = panelMask.querySelector('#history-list');
        const history = __MY_AUDIT__.data.auditHistory.slice().reverse();
        if (history.length === 0) {
          list.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:40px 0;">暂无审批记录</div>';
          return;
        }
        list.innerHTML = history.map(item => `
          <div class="audit-history-item">
            <div>
              <span style="margin-right:8px;">${getTypeLabel(item.type)}</span>
              <span>${item.text || ''}</span>
              <div style="font-size:12px;color:#6b7280;margin-top:4px;">
                申请人：${item.sender} · ${new Date(item.time).toLocaleString()}
              </div>
            </div>
            <div class="audit-history-result result-${item.result}">
              ${item.result === 'approve' ? '已同意' : '已驳回'}
            </div>
          </div>
        `).join('');
      } catch (e) {
        console.warn('[Audit] 历史记录渲染失败', e);
      }
    }

    // 绑定面板交互事件
    function bindPanelEvents(panel) {
      try {
        // 单条审批
        panel.addEventListener('click', e => {
          if (e.target.classList.contains('btn-approve')) {
            approveItem(parseInt(e.target.dataset.index));
          }
          if (e.target.classList.contains('btn-reject')) {
            rejectItem(parseInt(e.target.dataset.index));
          }
        });

        // 全选
        panel.querySelector('#audit-select-all').onchange = e => {
          panel.querySelectorAll('.pending-check').forEach(cb => cb.checked = e.target.checked);
        };

        // 批量操作
        panel.querySelector('#batch-approve').onclick = () => {
          getSelectedIndices().sort((a, b) => b - a).forEach(approveItem);
        };
        panel.querySelector('#batch-reject').onclick = () => {
          getSelectedIndices().sort((a, b) => b - a).forEach(rejectItem);
        };

        // 图标设置
        panel.querySelector('#icon-upload-btn').onclick = () => panel.querySelector('#icon-upload').click();
        panel.querySelector('#icon-upload').onchange = e => processImage(e.target.files[0], 96, 96, base64 => {
          __MY_AUDIT__.data.settings.iconCustom = base64;
          __MY_AUDIT__.save();
          renderSettingsPreview();
          rebuildAuditIcon();
        });
        panel.querySelector('#icon-reset').onclick = () => {
          __MY_AUDIT__.data.settings.iconCustom = null;
          __MY_AUDIT__.save();
          renderSettingsPreview();
          rebuildAuditIcon();
        };

        // 悬浮球设置
        const s = __MY_AUDIT__.data.settings.floatingBall;
        const ballEnabled = panel.querySelector('#ball-enabled');
        ballEnabled.checked = s.enabled;
        ballEnabled.onchange = e => {
          s.enabled = e.target.checked;
          __MY_AUDIT__.save();
          if (e.target.checked) createFloatingBall();
          else document.getElementById('audit-floating-ball')?.remove();
        };

        const ballColor = panel.querySelector('#ball-color');
        ballColor.value = s.color;
        ballColor.oninput = e => {
          s.color = e.target.value;
          const ball = document.getElementById('audit-floating-ball');
          if (ball) ball.style.background = e.target.value;
          __MY_AUDIT__.save();
        };

        const ballSize = panel.querySelector('#ball-size');
        const ballSizeText = panel.querySelector('#ball-size-text');
        ballSize.value = s.size;
        ballSizeText.textContent = `${s.size}px`;
        ballSize.oninput = e => {
          const size = parseInt(e.target.value);
          s.size = size;
          ballSizeText.textContent = `${size}px`;
          const ball = document.getElementById('audit-floating-ball');
          if (ball) {
            ball.style.width = `${size}px`;
            ball.style.height = `${size}px`;
          }
          __MY_AUDIT__.save();
        };

        panel.querySelector('#ball-avatar-btn').onclick = () => panel.querySelector('#ball-avatar-upload').click();
        panel.querySelector('#ball-avatar-upload').onchange = e => processImage(e.target.files[0], 128, 128, base64 => {
          s.avatar = base64;
          __MY_AUDIT__.save();
          renderSettingsPreview();
          const ball = document.getElementById('audit-floating-ball');
          if (ball) ball.innerHTML = `<img src="${base64}" alt="">`;
        }, true);
        panel.querySelector('#ball-avatar-reset').onclick = () => {
          s.avatar = null;
          __MY_AUDIT__.save();
          renderSettingsPreview();
          const ball = document.getElementById('audit-floating-ball');
          if (ball) ball.innerHTML = '';
        };

        // 引擎设置
        const engineEnabled = panel.querySelector('#engine-enabled');
        engineEnabled.checked = __MY_AUDIT__.data.settings.dreamEngine.enabled;
        engineEnabled.onchange = e => {
          __MY_AUDIT__.data.settings.dreamEngine.enabled = e.target.checked;
          __MY_AUDIT__.save();
          e.target.checked ? startDreamEngine() : stopDreamEngine();
        };

        // 数据导入导出
        panel.querySelector('#data-export').onclick = () => {
          const blob = new Blob([JSON.stringify(__MY_AUDIT__.data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `my-audit-cards-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
        };
        panel.querySelector('#data-import-btn').onclick = () => panel.querySelector('#data-import').click();
        panel.querySelector('#data-import').onchange = e => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = ev => {
            try {
              const data = JSON.parse(ev.target.result);
              if (confirm('确认导入？将覆盖全部现有数据')) {
                __MY_AUDIT__.data = data;
                __MY_AUDIT__.save();
                alert('导入成功');
                renderPendingList();
                renderHistoryList();
                rebuildAuditIcon();
                document.getElementById('audit-floating-ball')?.remove();
                createFloatingBall();
              }
            } catch {
              alert('导入失败，文件格式错误');
            }
          };
          reader.readAsText(file);
        };
      } catch (e) {
        console.warn('[Audit] 面板事件绑定失败', e);
      }
    }

    function getSelectedIndices() {
      return Array.from(panelMask.querySelectorAll('.pending-check:checked'))
        .map(cb => parseInt(cb.dataset.index));
    }

    // 同意申请
    function approveItem(index) {
      try {
        const item = __MY_AUDIT__.data.auditPending[index];
        if (!item) return;

        switch (item.type) {
          case 'add':
            __MY_AUDIT__.data.cards.push({
              id: genId(),
              text: item.text,
              groupId: item.groupId || __MY_AUDIT__.data.groups[0]?.id,
              disabled: false,
              disabledType: 'single',
              createTime: Date.now()
            });
            break;
          case 'delete':
            __MY_AUDIT__.data.cards = __MY_AUDIT__.data.cards.filter(c => c.id !== item.cardId);
            break;
          case 'disable':
            const card = __MY_AUDIT__.data.cards.find(c => c.id === item.cardId);
            if (card) {
              card.disabled = true;
              card.disabledType = item.disabledType || 'single';
            }
            break;
          case 'restore':
            const rc = __MY_AUDIT__.data.cards.find(c => c.id === item.cardId);
            if (rc) rc.disabled = false;
            break;
          case 'migrate':
            const mc = __MY_AUDIT__.data.cards.find(c => c.id === item.cardId);
            if (mc && item.targetGroupId) mc.groupId = item.targetGroupId;
            break;
        }

        pushHistory(item, 'approve');
        __MY_AUDIT__.data.auditPending.splice(index, 1);
        __MY_AUDIT__.save();
        renderPendingList();
        updateBadge();
      } catch (e) {
        console.warn('[Audit] 审批同意失败', e);
      }
    }

    // 驳回申请
    function rejectItem(index) {
      try {
        const item = __MY_AUDIT__.data.auditPending[index];
        if (!item) return;
        pushHistory(item, 'reject');
        __MY_AUDIT__.data.auditPending.splice(index, 1);
        __MY_AUDIT__.save();
        renderPendingList();
        updateBadge();
      } catch (e) {
        console.warn('[Audit] 审批驳回失败', e);
      }
    }

    function pushHistory(item, result) {
      __MY_AUDIT__.data.auditHistory.push({
        ...item,
        result,
        auditTime: Date.now()
      });
      if (__MY_AUDIT__.data.auditHistory.length > 100) {
        __MY_AUDIT__.data.auditHistory = __MY_AUDIT__.data.auditHistory.slice(-100);
      }
    }

    // 图片Canvas裁剪处理
    function processImage(file, width, height, callback, isCircle = false) {
      try {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (isCircle) {
              ctx.beginPath();
              ctx.arc(width / 2, height / 2, width / 2, 0, Math.PI * 2);
              ctx.clip();
            }
            const ratio = Math.max(width / img.width, height / img.height);
            const x = (width - img.width * ratio) / 2;
            const y = (height - img.height * ratio) / 2;
            ctx.drawImage(img, x, y, img.width * ratio, img.height * ratio);
            callback(canvas.toDataURL('image/png'));
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      } catch (e) {
        console.warn('[Audit] 图片处理失败', e);
      }
    }

    // 渲染设置预览
    function renderSettingsPreview() {
      try {
        if (!panelMask) return;
        const s = __MY_AUDIT__.data.settings;
        const iconPreview = panelMask.querySelector('#icon-preview');
        iconPreview.innerHTML = s.iconCustom
          ? `<img src="${s.iconCustom}" alt="">`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="#111111" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px;">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>`;

        const avatarPreview = panelMask.querySelector('#ball-avatar-preview');
        avatarPreview.innerHTML = s.floatingBall.avatar ? `<img src="${s.floatingBall.avatar}" alt="">` : '';
      } catch (e) {
        console.warn('[Audit] 设置预览渲染失败', e);
      }
    }

    // ---------- 消息注入能力 ----------
    // 提取原生气泡样式
    function getNativeBubbleStyle(side = 'in') {
      try {
        const selector = side === 'in'
          ? '.bubble-in, .msg-in, .chat-bubble-left, [data-side="in"] .bubble'
          : '.bubble-out, .msg-out, .chat-bubble-right, [data-side="out"] .bubble';
        const bubble = document.querySelector(selector);
        if (!bubble) return null;
        const style = getComputedStyle(bubble);
        return {
          background: style.backgroundColor,
          color: style.color,
          borderRadius: style.borderRadius,
          fontSize: style.fontSize,
          padding: style.padding
        };
      } catch (e) {
        return null;
      }
    }

    // 纯手搓气泡注入
    function injectBubbleToChat(text, side = 'in') {
      try {
        // 第一层兜底：尝试原生渲染API
        if (typeof window.__nativeRenderBubble === 'function') {
          try {
            window.__nativeRenderBubble(text, side);
            writeChatStorage({ side, text, time: Date.now() });
            return true;
          } catch {}
        }

        // 主力方案：纯手搓气泡
        const chatContainer = document.querySelector('.chat-container, .msg-list, .chat-messages, [data-chat-container]');
        if (!chatContainer) return false;

        const bubbleStyle = getNativeBubbleStyle(side) || {
          background: side === 'in' ? '#f3f4f6' : '#3b82f6',
          color: side === 'in' ? '#111827' : '#fff',
          borderRadius: '12px',
          fontSize: '14px',
          padding: '8px 12px'
        };

        const msgItem = document.createElement('div');
        msgItem.dataset.maInjected = '1';
        msgItem.style.cssText = `
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin-bottom: 12px;
          flex-direction: ${side === 'in' ? 'row' : 'row-reverse'};
        `;

        // 头像
        const avatar = document.createElement('div');
        avatar.style.cssText = `
          width: 32px; height: 32px;
          border-radius: 50%;
          background: ${side === 'in' ? '#e5e7eb' : '#3b82f6'};
          flex-shrink: 0;
        `;

        // 内容区
        const contentWrap = document.createElement('div');
        contentWrap.style.cssText = `
          display: flex;
          flex-direction: column;
          align-items: ${side === 'in' ? 'flex-start' : 'flex-end'};
          max-width: 70%;
        `;

        const bubble = document.createElement('div');
        bubble.style.cssText = `
          background: ${bubbleStyle.background};
          color: ${bubbleStyle.color};
          border-radius: ${bubbleStyle.borderRadius};
          font-size: ${bubbleStyle.fontSize};
          padding: ${bubbleStyle.padding};
          word-break: break-word;
        `;
        bubble.textContent = text;

        const timeEl = document.createElement('div');
        timeEl.style.cssText = 'font-size:11px;color:#9ca3af;margin-top:4px;';
        timeEl.textContent = formatTime();

        contentWrap.appendChild(bubble);
        contentWrap.appendChild(timeEl);
        msgItem.appendChild(avatar);
        msgItem.appendChild(contentWrap);

        chatContainer.appendChild(msgItem);
        chatContainer.scrollTop = chatContainer.scrollHeight;

        // 双写存储
        writeChatStorage({ side, text, time: Date.now(), isInjected: true });
        return true;
      } catch (e) {
        console.warn('[Audit] 气泡注入失败', e);
        return false;
      }
    }

    // 聊天记录双写
    function writeChatStorage(msg) {
      try {
        const raw = localStorage.getItem(STORAGE_CHAT_KEY);
        let list = [];
        if (raw) {
          try {
            list = JSON.parse(raw);
            if (!Array.isArray(list)) list = [];
          } catch { list = []; }
        }
        list.push(msg);
        localStorage.setItem(STORAGE_CHAT_KEY, JSON.stringify(list));
      } catch (e) {
        console.warn('[Audit] 聊天存储写入失败，放弃写入避免污染', e);
      }
    }

    // 巡检修复气泡
    function checkAndRepairChat() {
      try {
        const injected = document.querySelectorAll('[data-ma-injected="1"]');
        if (injected.length === 0) return;
        // 同步最新主题样式
        const style = getNativeBubbleStyle('in');
        if (style) {
          injected.forEach(item => {
            const bubble = item.querySelector('div > div:first-child');
            if (bubble) {
              bubble.style.background = style.background;
              bubble.style.color = style.color;
              bubble.style.borderRadius = style.borderRadius;
              bubble.style.fontSize = style.fontSize;
            }
          });
        }
      } catch (e) {
        console.warn('[Audit] 气泡巡检失败', e);
      }
    }

    // 暴露全局发送方法
    window.sendAuditCard = injectBubbleToChat;

    // ---------- 梦角拟人引擎 ----------
    function startDreamEngine() {
      try {
        if (engineTimer) return;
        if (!__MY_AUDIT__.data.settings.dreamEngine.enabled) return;
        const interval = __MY_AUDIT__.data.settings.dreamEngine.interval;
        engineTimer = setInterval(runEngineCycle, interval);
        setTimeout(runEngineCycle, 5000);
      } catch (e) {
        console.warn('[Audit] 梦角引擎启动失败', e);
      }
    }

    function stopDreamEngine() {
      try {
        if (engineTimer) {
          clearInterval(engineTimer);
          engineTimer = null;
        }
      } catch (e) {
        console.warn('[Audit] 梦角引擎停止失败', e);
      }
    }

    function runEngineCycle() {
      if (engineLock) return;
      engineLock = true;
      try {
        const settings = __MY_AUDIT__.data.settings.dreamEngine;
        // 抓取生成待审
        if (__MY_AUDIT__.data.auditPending.length < settings.maxPending) {
          autoGrabChat();
        }
        // 低概率随机申请
        if (Math.random() < 0.1) {
          randomGenerateApplication();
        }
        // 自动发消息
        autoSendMessage();
      } catch (e) {
        console.warn('[Audit] 引擎周期执行失败', e);
      } finally {
        engineLock = false;
      }
    }

    // 自动抓取用户发言
    function autoGrabChat() {
      try {
        const raw = localStorage.getItem(STORAGE_CHAT_KEY);
        if (!raw) return;
        let chatList = [];
        try {
          chatList = JSON.parse(raw);
          if (!Array.isArray(chatList)) return;
        } catch { return; }

        const now = Date.now();
        const timeWindow = 15 * 60 * 1000;
        const candidates = chatList.filter(msg => {
          if (msg.side !== 'out') return false;
          if (now - msg.time > timeWindow) return false;
          const len = msg.text?.length || 0;
          return len >= 5 && len <= 35;
        });

        if (candidates.length === 0) return;

        const settings = __MY_AUDIT__.data.settings.dreamEngine;
        const emotionWords = ['喜欢', '爱', '想你', '开心'];
        const msg = candidates[Math.floor(Math.random() * candidates.length)];

        let prob = settings.baseProbability;
        if (emotionWords.some(w => msg.text.includes(w))) {
          prob = settings.emotionProbability;
        }
        if (Math.random() > prob) return;

        __MY_AUDIT__.data.auditPending.push({
          id: genId(),
          type: 'add',
          text: msg.text,
          sender: '梦角',
          time: Date.now()
        });
        __MY_AUDIT__.save();
        updateBadge();
      } catch (e) {
        console.warn('[Audit] 自动抓取失败', e);
      }
    }

    // 随机生成管理申请
    function randomGenerateApplication() {
      try {
        const cards = __MY_AUDIT__.data.cards;
        if (cards.length === 0) return;
        const types = ['delete', 'disable', 'migrate', 'restore'];
        const type = types[Math.floor(Math.random() * types.length)];
        const card = cards[Math.floor(Math.random() * cards.length)];

        let targetGroupId = null;
        if (type === 'migrate') {
          const groups = __MY_AUDIT__.data.groups.filter(g => g.id !== card.groupId);
          if (groups.length === 0) return;
          targetGroupId = groups[Math.floor(Math.random() * groups.length)].id;
        }

        if (__MY_AUDIT__.data.auditPending.length >= __MY_AUDIT__.data.settings.dreamEngine.maxPending) return;

        __MY_AUDIT__.data.auditPending.push({
          id: genId(),
          type,
          cardId: card.id,
          text: card.text,
          targetGroupId,
          disabledType: 'single',
          sender: '梦角',
          time: Date.now()
        });
        __MY_AUDIT__.save();
        updateBadge();
      } catch (e) {
        console.warn('[Audit] 随机申请生成失败', e);
      }
    }

    // 自动发送消息
    function autoSendMessage() {
      try {
        const enabledGroups = __MY_AUDIT__.data.groups.filter(g => !g.disabled);
        if (enabledGroups.length === 0) return;
        const group = enabledGroups[Math.floor(Math.random() * enabledGroups.length)];
        const cards = __MY_AUDIT__.data.cards.filter(c => c.groupId === group.id && !c.disabled);
        if (cards.length === 0) return;
        const card = cards[Math.floor(Math.random() * cards.length)];
        injectBubbleToChat(card.text, 'in');
      } catch (e) {
        console.warn('[Audit] 自动发消息失败', e);
      }
    }

    // ---------- 自愈监听 ----------
    function initObserver() {
      try {
        const observer = new MutationObserver(() => {
          // 图标自愈
          const container = getDeskContainer();
          if (container && !container.querySelector('[data-app="audit"]')) {
            rebuildAuditIcon();
          }
          // 悬浮球自愈
          const s = __MY_AUDIT__.data.settings.floatingBall;
          const forceShow = new URLSearchParams(window.location.search).get('show_audit') === 'true';
          if ((s.enabled || forceShow) && !document.getElementById('audit-floating-ball')) {
            createFloatingBall();
          }
          // 气泡样式同步
          checkAndRepairChat();
        });

        observer.observe(document.body, { childList: true, subtree: true });
      } catch (e) {
        console.warn('[Audit] 自愈监听初始化失败', e);
      }
    }

    // 模块一初始化
    function init() {
      try {
        rebuildAuditIcon();
        createFloatingBall();
        initObserver();
        startDreamEngine();
        setInterval(checkAndRepairChat, 30000);
      } catch (e) {
        console.warn('[Audit] 模块一初始化失败', e);
      }
    }

    // 暴露全局方法
    window.openAuditPanel = openAuditPanel;

    // 启动
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
      setTimeout(init, 1000);
    } else {
      window.addEventListener('DOMContentLoaded', () => setTimeout(init, 1000));
    }
  })();

  // ==================== 模块二：审核报告字卡库Tab独立模块 ====================
  (function Module2_CardLibraryTab() {
    const PANE_ID = 'cc-sect-audit';
    const TAB_SELECTOR = '[data-ccsel="audit"]';

    // 创建Tab容器
    function ensureTabPane() {
      try {
        let pane = document.getElementById(PANE_ID);
        if (pane) return pane;

        pane = document.createElement('div');
        pane.id = PANE_ID;
        pane.hidden = true;
        pane.className = 'cc-sect-content';
        pane.innerHTML = `
          <div style="margin-bottom:16px;">
            <textarea id="audit-batch-input" placeholder="批量导入字卡，每行一条" style="width:100%;height:80px;padding:8px;border:1px solid #d1d5db;border-radius:6px;resize:vertical;box-sizing:border-box;"></textarea>
            <div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end;">
              <button class="audit-btn audit-btn-sm" id="audit-deduplicate-btn">一键去重</button>
              <button class="audit-btn audit-btn-sm audit-btn-primary" id="audit-import-btn">导入字卡</button>
            </div>
          </div>
          <div style="margin-bottom:12px;">
            <button class="audit-btn audit-btn-sm" id="add-group-btn">+ 新增分类</button>
          </div>
          <div id="audit-groups-wrap" style="display:flex;flex-direction:column;gap:12px;"></div>
        `;

        // 插入到同级Tab内容区
        const ref = document.querySelector('[id^="cc-sect-"]');
        if (ref?.parentNode) {
          ref.parentNode.appendChild(pane);
        }

        bindEvents(pane);
        renderGroups();
        return pane;
      } catch (e) {
        console.warn('[Audit] 字卡Tab创建失败', e);
        return null;
      }
    }

    // Tab切换绑定
    function bindTabSwitch() {
      try {
        document.addEventListener('click', e => {
          // 切换到审核Tab
          if (e.target.closest(TAB_SELECTOR)) {
            switchToAuditTab();
          }
          // 切换到其他Tab
          const otherTab = e.target.closest('[data-ccsel]:not([data-ccsel="audit"])');
          if (otherTab) {
            const pane = document.getElementById(PANE_ID);
            if (pane) pane.hidden = true;
          }
        });
      } catch (e) {
        console.warn('[Audit] Tab切换绑定失败', e);
      }
    }

    function switchToAuditTab() {
      try {
        const pane = ensureTabPane();
        if (!pane) return;
        // 隐藏所有同级Tab内容
        document.querySelectorAll('[id^="cc-sect-"]').forEach(el => el.hidden = true);
        pane.hidden = false;
        renderGroups();
      } catch (e) {
        console.warn('[Audit] Tab切换失败', e);
      }
    }

    // 渲染分组与卡片
    function renderGroups() {
      try {
        const wrap = document.getElementById('audit-groups-wrap');
        if (!wrap) return;
        const groups = __MY_AUDIT__.data.groups;

        if (groups.length === 0) {
          wrap.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:40px 0;">暂无分类，点击上方按钮新增</div>';
          return;
        }

        wrap.innerHTML = groups.map(group => {
          const cards = __MY_AUDIT__.data.cards.filter(c => c.groupId === group.id);
          return `
            <div class="audit-group-item" data-group-id="${group.id}">
              <div class="audit-group-header">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span class="group-fold-icon" style="transform:rotate(${group.collapsed ? 0 : 90}deg);">▶</span>
                  <span style="font-weight:500;${group.disabled ? 'color:#9ca3af;' : ''}">${group.name}</span>
                  <span style="font-size:12px;color:#9ca3af;">(${cards.length})</span>
                  ${group.disabled ? '<span style="font-size:11px;color:#9ca3af;background:#f3f4f6;padding:1px 4px;border-radius:4px;">已禁用</span>' : ''}
                </div>
                <div style="display:flex;gap:4px;">
                  <button class="audit-btn audit-btn-sm group-op" data-op="up">↑</button>
                  <button class="audit-btn audit-btn-sm group-op" data-op="down">↓</button>
                  <button class="audit-btn audit-btn-sm group-op" data-op="rename">重命名</button>
                  <button class="audit-btn audit-btn-sm group-op" data-op="delete">删除</button>
                </div>
              </div>
              <div class="audit-group-cards" style="display:${group.collapsed ? 'none' : 'flex'};">
                ${cards.length === 0
                  ? '<div style="color:#9ca3af;font-size:13px;padding:8px 0;">暂无卡片</div>'
                  : cards.map(card => `
                    <div class="audit-card-item ${card.disabled ? 'card-disabled' : ''}" data-card-id="${card.id}">
                      <div style="flex:1;display:flex;align-items:center;gap:8px;word-break:break-all;">
                        <input type="checkbox" class="card-check" data-card-id="${card.id}">
                        <span style="font-size:13px;">${card.text}</span>
                        ${card.disabled ? `<span class="card-badge-disable ${card.disabledType === 'both' ? 'both' : ''}">${card.disabledType === 'both' ? '双方禁用' : '单方禁用'}</span>` : ''}
                      </div>
                      <div style="display:flex;gap:4px;flex-shrink:0;">
                        <button class="audit-btn audit-btn-sm card-op" data-op="edit">编辑</button>
                        <button class="audit-btn audit-btn-sm card-op" data-op="delete">删除</button>
                      </div>
                    </div>
                  `).join('')
                }
                ${cards.length > 0 ? `
                  <div style="display:flex;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid #f3f4f6;">
                    <label style="font-size:12px;"><input type="checkbox" class="group-select-all"> 全选</label>
                    <button class="audit-btn audit-btn-sm batch-op" data-op="transfer">批量转移</button>
                    <button class="audit-btn audit-btn-sm batch-op" data-op="delete">批量删除</button>
                  </div>
                ` : ''}
              </div>
            </div>
          `;
        }).join('');
      } catch (e) {
        console.warn('[Audit] 分组渲染失败', e);
      }
    }

    // 绑定交互事件
    function bindEvents(pane) {
      try {
        // 批量导入
        pane.querySelector('#audit-import-btn').onclick = () => {
          const text = pane.querySelector('#audit-batch-input').value.trim();
          if (!text) return;
          const lines = text.split('\n').map(l => l.trim()).filter(l => l);
          if (lines.length === 0) return;

          // 默认分组
          let group = __MY_AUDIT__.data.groups[0];
          if (!group) {
            group = { id: genId(), name: '默认分组', disabled: false, collapsed: false, order: 0 };
            __MY_AUDIT__.data.groups.push(group);
          }

          const newCards = lines.map(text => ({
            id: genId(),
            text,
            groupId: group.id,
            disabled: false,
            disabledType: 'single',
            createTime: Date.now()
          }));
          __MY_AUDIT__.data.cards.push(...newCards);
          __MY_AUDIT__.save();
          pane.querySelector('#audit-batch-input').value = '';
          renderGroups();
        };

        // 一键去重
        pane.querySelector('#audit-deduplicate-btn').onclick = () => {
          try {
            const seen = new Set();
            const before = __MY_AUDIT__.data.cards.length;
            __MY_AUDIT__.data.cards = __MY_AUDIT__.data.cards.filter(c => {
              const key = `${c.groupId}-${c.text}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            const removed = before - __MY_AUDIT__.data.cards.length;
            __MY_AUDIT__.save();
            renderGroups();
            alert(`去重完成，移除 ${removed} 条重复卡片`);
          } catch (e) {
            console.warn('[Audit] 去重失败', e);
          }
        };

        // 新增分类
        pane.querySelector('#add-group-btn').onclick = () => {
          const name = prompt('请输入分类名称：');
          if (!name?.trim()) return;
          __MY_AUDIT__.data.groups.push({
            id: genId(),
            name: name.trim(),
            disabled: false,
            collapsed: false,
            order: __MY_AUDIT__.data.groups.length
          });
          __MY_AUDIT__.save();
          renderGroups();
        };

        // 事件委托：分组与卡片操作
        pane.addEventListener('click', e => {
          const groupEl = e.target.closest('.audit-group-item');
          if (!groupEl) return;
          const groupId = groupEl.dataset.groupId;
          const groupIdx = __MY_AUDIT__.data.groups.findIndex(g => g.id === groupId);
          if (groupIdx === -1) return;
          const group = __MY_AUDIT__.data.groups[groupIdx];

          // 折叠/展开
          if (e.target.closest('.audit-group-header') && !e.target.closest('button')) {
            group.collapsed = !group.collapsed;
            __MY_AUDIT__.save();
            renderGroups();
            return;
          }

          // 分组操作
          const groupOp = e.target.closest('.group-op')?.dataset.op;
          if (groupOp) {
            if (groupOp === 'up' && groupIdx > 0) {
              [__MY_AUDIT__.data.groups[groupIdx], __MY_AUDIT__.data.groups[groupIdx - 1]] =
              [__MY_AUDIT__.data.groups[groupIdx - 1], __MY_AUDIT__.data.groups[groupIdx]];
              __MY_AUDIT__.save();
              renderGroups();
            }
            if (groupOp === 'down' && groupIdx < __MY_AUDIT__.data.groups.length - 1) {
              [__MY_AUDIT__.data.groups[groupIdx], __MY_AUDIT__.data.groups[groupIdx + 1]] =
              [__MY_AUDIT__.data.groups[groupIdx + 1], __MY_AUDIT__.data.groups[groupIdx]];
              __MY_AUDIT__.save();
              renderGroups();
            }
            if (groupOp === 'rename') {
              const newName = prompt('输入新名称：', group.name);
              if (newName?.trim()) {
                group.name = newName.trim();
                __MY_AUDIT__.save();
                renderGroups();
              }
            }
            if (groupOp === 'delete') {
              const cardsInGroup = __MY_AUDIT__.data.cards.filter(c => c.groupId === groupId);
              if (cardsInGroup.length > 0) {
                const others = __MY_AUDIT__.data.groups.filter(g => g.id !== groupId);
                if (others.length === 0) {
                  alert('请先创建其他分组再删除非空分组');
                  return;
                }
                const targetName = prompt(`该分组有 ${cardsInGroup.length} 张卡片，请输入目标分组名称转移：\n${others.map(g => g.name).join('、')}`);
                if (!targetName) return;
                const target = others.find(g => g.name === targetName.trim());
                if (!target) { alert('未找到分组'); return; }
                __MY_AUDIT__.data.cards.forEach(c => {
                  if (c.groupId === groupId) c.groupId = target.id;
                });
              }
              if (confirm('确认删除该分组？')) {
                __MY_AUDIT__.data.groups.splice(groupIdx, 1);
                __MY_AUDIT__.save();
                renderGroups();
              }
            }
            return;
          }

          // 卡片操作
          const cardOp = e.target.closest('.card-op')?.dataset.op;
          if (cardOp) {
            const cardEl = e.target.closest('.audit-card-item');
            const cardId = cardEl.dataset.cardId;
            const card = __MY_AUDIT__.data.cards.find(c => c.id === cardId);
            if (!card) return;

            if (cardOp === 'edit') {
              const newText = prompt('编辑卡片内容：', card.text);
              if (newText?.trim()) {
                card.text = newText.trim();
                __MY_AUDIT__.save();
                renderGroups();
              }
            }
            if (cardOp === 'delete') {
              if (confirm('确认删除该卡片？')) {
                __MY_AUDIT__.data.cards = __MY_AUDIT__.data.cards.filter(c => c.id !== cardId);
                __MY_AUDIT__.save();
                renderGroups();
              }
            }
            return;
          }

          // 分组全选
          if (e.target.classList.contains('group-select-all')) {
            groupEl.querySelectorAll('.card-check').forEach(cb => cb.checked = e.target.checked);
            return;
          }

          // 批量操作
          const batchOp = e.target.closest('.batch-op')?.dataset.op;
          if (batchOp) {
            const checked = groupEl.querySelectorAll('.card-check:checked');
            if (checked.length === 0) { alert('请先选择卡片'); return; }
            const ids = Array.from(checked).map(cb => cb.dataset.cardId);

            if (batchOp === 'delete') {
              if (confirm(`确认删除选中的 ${ids.length} 张卡片？`)) {
                __MY_AUDIT__.data.cards = __MY_AUDIT__.data.cards.filter(c => !ids.includes(c.id));
                __MY_AUDIT__.save();
                renderGroups();
              }
            }
            if (batchOp === 'transfer') {
              const others = __MY_AUDIT__.data.groups.filter(g => g.id !== groupId);
              if (others.length === 0) { alert('无其他分组可转移'); return; }
              const targetName = prompt(`输入目标分组名称：\n${others.map(g => g.name).join('、')}`);
              if (!targetName) return;
              const target = others.find(g => g.name === targetName.trim());
              if (!target) { alert('未找到分组'); return; }
              __MY_AUDIT__.data.cards.forEach(c => {
                if (ids.includes(c.id)) c.groupId = target.id;
              });
              __MY_AUDIT__.save();
              renderGroups();
            }
            return;
          }
        });
      } catch (e) {
        console.warn('[Audit] 事件绑定失败', e);
      }
    }

    // ---------- 字卡合并对接函数 ----------
    function getMyAuditCardsRaw() {
      try {
        return deepClone(__MY_AUDIT__.data.cards);
      } catch (e) {
        return [];
      }
    }

    function myAuditCardsToGroups() {
      try {
        const groups = __MY_AUDIT__.data.groups.filter(g => !g.disabled);
        const cards = __MY_AUDIT__.data.cards.filter(c => !c.disabled);
        return groups.map(g => ({
          id: g.id,
          name: g.name,
          disabled: g.disabled,
          cards: cards.filter(c => c.groupId === g.id).map(c => c.text)
        }));
      } catch (e) {
        return [];
      }
    }

    function mergeMyAuditGroups(original = []) {
      try {
        const myGroups = myAuditCardsToGroups();
        const merged = [...original];
        myGroups.forEach(my => {
          const exist = merged.find(g => g.name === my.name);
          if (exist) {
            const set = new Set([...(exist.cards || []), ...my.cards]);
            exist.cards = Array.from(set);
          } else {
            merged.push(my);
          }
        });
        return merged;
      } catch (e) {
        return original;
      }
    }

    // 覆盖原项目字卡池
    function overrideReplyPools() {
      try {
        if (typeof window.replyPoolGroups !== 'undefined') {
          window.replyPoolGroups = mergeMyAuditGroups(window.replyPoolGroups);
        }
        if (typeof window.replyPoolGroupsFor === 'function') {
          const original = window.replyPoolGroupsFor;
          window.replyPoolGroupsFor = function (...args) {
            try {
              const res = original.apply(this, args);
              return mergeMyAuditGroups(res);
            } catch {
              return [];
            }
          };
        }
      } catch (e) {
        console.warn('[Audit] 字卡池覆盖失败', e);
      }
    }

    // 模块二初始化
    function init() {
      try {
        bindTabSwitch();
        overrideReplyPools();
        // 数据变更同步
        window.addEventListener('my-audit-data-updated', () => {
          overrideReplyPools();
          const pane = document.getElementById(PANE_ID);
          if (pane && !pane.hidden) renderGroups();
        });
      } catch (e) {
        console.warn('[Audit] 模块二初始化失败', e);
      }
    }

    // 暴露全局对接函数
    window.getMyAuditCardsRaw = getMyAuditCardsRaw;
    window.myAuditCardsToGroups = myAuditCardsToGroups;
    window.mergeMyAuditGroups = mergeMyAuditGroups;

    // 启动
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
      setTimeout(init, 1500);
    } else {
      window.addEventListener('DOMContentLoaded', () => setTimeout(init, 1500));
    }
  })();
})();
