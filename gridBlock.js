// ==========================================================================
// Grid Block Manager (gridBlock.js)
// なおる歯科 - 予約グリッド ブロック機能 (Shift+B / Bキー操作 & 複数ドラッグブロック)
// ==========================================================================

class GridBlockManager {
  constructor() {
    // モード状態
    this.isShiftBMode = false;  // Shift+Bによる固定ブロックモード
    this.isBKeyDown = false;    // Bキー単体押下による一時ブロックモード

    // ドラッグ操作状態
    this.isDragging = false;
    this.dragMode = 'add';      // 'add' (一括ブロック) または 'remove' (一括解除)
    this.dragStartRow = -1;
    this.dragStartCol = -1;
    this.dragCurrentRow = -1;
    this.dragCurrentCol = -1;

    // 禁止通知タイマー
    this.forbiddenTimer = null;
    this.forbiddenBadgeEl = null;

    this.init();
  }

  init() {
    this.createHeaderBadgeDOM();
    this.createForbiddenBadgeDOM();
    this.bindKeyboardEvents();
    this.bindMouseEvents();
  }

  // --------------------------------------------------------------------------
  // 1. DOM生成
  // --------------------------------------------------------------------------

  // ヘッダー内の「ブロックモード中」インジケーター
  createHeaderBadgeDOM() {
    if (document.getElementById('headerBlockModeBadge')) return;

    const header = document.getElementById('header');
    if (!header) {
      document.addEventListener('DOMContentLoaded', () => this.createHeaderBadgeDOM());
      return;
    }

    const badge = document.createElement('div');
    badge.id = 'headerBlockModeBadge';
    badge.className = 'header-block-mode-badge';
    badge.innerHTML = `
      <span class="lock-icon-pulse">🔒</span>
      <span>ブロックモード中（クリック/ドラッグで枠をブロック・解除）</span>
      <span class="badge-tag">Shift+B</span>
    `;

    // ヘッダー日付ボックスの隣に挿入
    const dateBox = header.querySelector('.header-date-box');
    if (dateBox && dateBox.nextSibling) {
      header.insertBefore(badge, dateBox.nextSibling);
    } else {
      header.appendChild(badge);
    }
  }

  // 通常モード時にブロック枠をクリックした際の禁止マークバッジ
  createForbiddenBadgeDOM() {
    if (document.getElementById('gridBlockForbiddenBadge')) {
      this.forbiddenBadgeEl = document.getElementById('gridBlockForbiddenBadge');
      return;
    }

    const badge = document.createElement('div');
    badge.id = 'gridBlockForbiddenBadge';
    badge.className = 'grid-block-forbidden-badge';
    badge.style.display = 'none';
    badge.innerHTML = `
      <span class="forbidden-icon">🚫</span>
      <span>この枠は予約ブロックされています</span>
    `;
    document.body.appendChild(badge);
    this.forbiddenBadgeEl = badge;
  }

  // --------------------------------------------------------------------------
  // 2. モード判定 & UI同期
  // --------------------------------------------------------------------------

  isBlockMode() {
    return this.isShiftBMode || this.isBKeyDown;
  }

  updateBlockModeUI() {
    const isActive = this.isBlockMode();
    const badge = document.getElementById('headerBlockModeBadge');

    if (isActive) {
      document.body.classList.add('block-mode-active');
      if (badge) {
        badge.classList.add('active');
        // Bキー単体押下中か固定モードかでタグテキストを切り替え
        const tag = badge.querySelector('.badge-tag');
        if (tag) {
          tag.innerText = this.isShiftBMode ? '固定中 (Shift+B)' : 'Bキー押下中';
        }
      }
    } else {
      document.body.classList.remove('block-mode-active');
      if (badge) {
        badge.classList.remove('active');
      }
      this.clearDragHighlights();
    }
  }

  // --------------------------------------------------------------------------
  // 3. キーボードイベント (Shift+B / Bキー単体)
  // --------------------------------------------------------------------------

  bindKeyboardEvents() {
    // フォーカスが入力フォームにあるか判定
    const isInputFocused = () => {
      const active = document.activeElement;
      if (!active) return false;
      const tag = active.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || active.isContentEditable;
    };

    // keydown
    window.addEventListener('keydown', (e) => {
      if (isInputFocused()) return;

      // Shift + B: 固定ブロックモード トグル
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        this.isShiftBMode = !this.isShiftBMode;
        this.updateBlockModeUI();
        return;
      }

      // Bキー単体（Shift/Ctrlなし）: 押下中のみブロックモード有効
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
        if (!this.isBKeyDown) {
          this.isBKeyDown = true;
          this.updateBlockModeUI();
        }
      }
    });

    // keyup
    window.addEventListener('keyup', (e) => {
      if (e.key === 'b' || e.key === 'B') {
        if (this.isBKeyDown) {
          this.isBKeyDown = false;
          this.updateBlockModeUI();
        }
      }
    });

    // ウィンドウフォーカス喪失時の安全リセット
    window.addEventListener('blur', () => {
      if (this.isBKeyDown) {
        this.isBKeyDown = false;
        this.updateBlockModeUI();
      }
    });
  }

  // --------------------------------------------------------------------------
  // 4. マウス操作イベント（ブロック・解除・禁止通知）
  // --------------------------------------------------------------------------

  bindMouseEvents() {
    const container = document.getElementById('reservationGrid');
    if (!container) {
      document.addEventListener('DOMContentLoaded', () => this.bindMouseEvents());
      return;
    }

    // 1. mousedown: ドラッグブロック/解除開始
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // 左クリックのみ

      const cell = e.target.closest('td.grid-slot-cell');
      if (!cell || !container.contains(cell)) return;

      // 予約済みのセル（booked）はブロック操作の対象外
      if (cell.classList.contains('booked')) return;

      if (this.isBlockMode()) {
        // ブロックモード中の操作
        e.preventDefault();
        e.stopPropagation();

        const rowIndex = parseInt(cell.dataset.row, 10);
        const colIndex = parseInt(cell.dataset.col, 10);

        this.isDragging = true;
        this.dragStartRow = rowIndex;
        this.dragStartCol = colIndex;
        this.dragCurrentRow = rowIndex;
        this.dragCurrentCol = colIndex;

        // 起点セルが既にブロックされている場合は一括「解除」モード、空き枠なら一括「追加」モード
        const isBlocked = cell.classList.contains('grid-slot-blocked');
        this.dragMode = isBlocked ? 'remove' : 'add';

        document.body.style.userSelect = 'none';
        this.updateDragHighlights();
      } else {
        // 通常モード時のブロック枠クリック処理
        if (cell.classList.contains('grid-slot-blocked')) {
          e.preventDefault();
          e.stopPropagation();
          this.showForbiddenFeedback(cell, e.clientX, e.clientY);
        }
      }
    }, true); // captureフェーズで優先処理

    // 2. mousemove: ドラッグ範囲を滑らかに更新（複数行・複数列の矩形選択）
    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging || !this.isBlockMode()) return;

      // マウス直下のセル要素を取得（子要素や隙間も透過してtdセルを特定）
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el ? el.closest('td.grid-slot-cell') : null;
      if (!cell || !container.contains(cell)) return;

      const rowIndex = parseInt(cell.dataset.row, 10);
      const colIndex = parseInt(cell.dataset.col, 10);

      if (!isNaN(rowIndex) && !isNaN(colIndex)) {
        if (this.dragCurrentRow !== rowIndex || this.dragCurrentCol !== colIndex) {
          this.dragCurrentRow = rowIndex;
          this.dragCurrentCol = colIndex;
          this.updateDragHighlights();
        }
      }
    });

    // 3. mouseup: ドラッグ確定（DBへ保存 & グリッド更新）
    document.addEventListener('mouseup', (e) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      document.body.style.userSelect = '';

      if (this.isBlockMode()) {
        e.preventDefault();
        this.commitDragBlock();
      } else {
        this.clearDragHighlights();
      }
    }, true);
  }

  // --------------------------------------------------------------------------
  // 5. ドラッグハイライト & 確定処理
  // --------------------------------------------------------------------------

  updateDragHighlights() {
    this.clearDragHighlights();

    const container = document.getElementById('reservationGrid');
    if (!container) return;

    const minRow = Math.min(this.dragStartRow, this.dragCurrentRow);
    const maxRow = Math.max(this.dragStartRow, this.dragCurrentRow);
    const minCol = Math.min(this.dragStartCol, this.dragCurrentCol);
    const maxCol = Math.max(this.dragStartCol, this.dragCurrentCol);
    const highlightClass = this.dragMode === 'add' ? 'block-drag-add' : 'block-drag-remove';

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = container.querySelector(`.grid-slot-cell[data-row="${r}"][data-col="${c}"]`);
        if (cell && !cell.classList.contains('booked')) {
          cell.classList.add(highlightClass);
        }
      }
    }
  }

  clearDragHighlights() {
    const container = document.getElementById('reservationGrid');
    if (!container) return;
    const cells = container.querySelectorAll('.block-drag-add, .block-drag-remove');
    cells.forEach(c => c.classList.remove('block-drag-add', 'block-drag-remove'));
  }

  commitDragBlock() {
    const container = document.getElementById('reservationGrid');
    if (!container) return;

    const minRow = Math.min(this.dragStartRow, this.dragCurrentRow);
    const maxRow = Math.max(this.dragStartRow, this.dragCurrentRow);
    const minCol = Math.min(this.dragStartCol, this.dragCurrentCol);
    const maxCol = Math.max(this.dragStartCol, this.dragCurrentCol);

    const targetCells = [];
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = container.querySelector(`.grid-slot-cell[data-row="${r}"][data-col="${c}"]`);
        if (cell && !cell.classList.contains('booked')) {
          targetCells.push(cell);
        }
      }
    }

    this.clearDragHighlights();

    if (targetCells.length === 0) return;

    const blocksToProcess = targetCells.map(c => ({
      date: c.dataset.date,
      time: c.dataset.time,
      unit: c.dataset.unit
    }));

    if (window.dbManager) {
      if (this.dragMode === 'add') {
        if (typeof window.dbManager.addGridBlocksBatch === 'function') {
          window.dbManager.addGridBlocksBatch(blocksToProcess);
        } else {
          blocksToProcess.forEach(b => window.dbManager.addGridBlock(b.date, b.time, b.unit));
        }
      } else {
        if (typeof window.dbManager.removeGridBlocksBatch === 'function') {
          window.dbManager.removeGridBlocksBatch(blocksToProcess);
        } else {
          blocksToProcess.forEach(b => window.dbManager.removeGridBlock(b.date, b.time, b.unit));
        }
      }
    }

    // グリッドを再描画してブロック表示を同期
    if (window.reservationGrid && typeof window.reservationGrid.render === 'function') {
      window.reservationGrid.render();
    }
  }

  // --------------------------------------------------------------------------
  // 6. 通常モード時の禁止マーク通知 (🚫)
  // --------------------------------------------------------------------------

  showForbiddenFeedback(cellEl, mouseX, mouseY) {
    // セルを揺らすアニメーション
    cellEl.classList.remove('blocked-shake');
    // リフロー強制
    void cellEl.offsetWidth;
    cellEl.classList.add('blocked-shake');

    if (!this.forbiddenBadgeEl) {
      this.createForbiddenBadgeDOM();
    }

    const badge = this.forbiddenBadgeEl;
    if (badge) {
      badge.style.left = `${mouseX}px`;
      badge.style.top = `${mouseY - 10}px`;
      badge.style.display = 'flex';

      clearTimeout(this.forbiddenTimer);
      this.forbiddenTimer = setTimeout(() => {
        badge.style.display = 'none';
      }, 1500);
    }
  }
}

// グローバルインスタンス & 初期化
window.gridBlockManager = new GridBlockManager();
