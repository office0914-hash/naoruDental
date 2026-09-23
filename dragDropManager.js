// -------------------------------------------
// Drag & Drop Manager (dragDropManager.js)
// なおる歯科 - 予約カードのD&D移動・時間変更確認・スワップ管理
// -------------------------------------------

class DragDropManager {
  constructor() {
    this.draggedData = null; // 現在ドラッグ中の予約グループ情報
    this.currentDropTarget = null;
    this.timeChangeModalEl = null;
    this.pendingTimeChange = null;
    this.indicatorEl = null; // マウス追従インジケーター

    this.init();
  }

  init() {
    this.createTimeChangeModalDOM();
    this.createIndicatorDOM();
    this.bindContainerEvents();
  }

  // -------------------------------------------
  // 1. DOM生成・初期化
  // -------------------------------------------

  // マウス追従D&Dインジケーター（⚠️注意アイコン / 🚫禁止アイコン等）の作成
  createIndicatorDOM() {
    if (document.getElementById('dragIndicatorBadge')) {
      this.indicatorEl = document.getElementById('dragIndicatorBadge');
      return;
    }
    const indicator = document.createElement('div');
    indicator.id = 'dragIndicatorBadge';
    indicator.className = 'drag-indicator-badge';
    indicator.style.display = 'none';
    document.body.appendChild(indicator);
    this.indicatorEl = indicator;
  }

  // 時間変更確認用ポップアップウィンドウのDOM作成
  createTimeChangeModalDOM() {
    if (document.getElementById('timeChangeConfirmModal')) {
      this.timeChangeModalEl = document.getElementById('timeChangeConfirmModal');
      return;
    }

    const modal = document.createElement('div');
    modal.id = 'timeChangeConfirmModal';
    modal.className = 'time-change-modal-overlay';
    modal.innerHTML = `
      <div class="time-change-modal-container">
        <div class="time-change-modal-header">
          <div class="time-change-modal-title">
            <span class="warning-icon-badge">⚠️</span>
            <span>予約時間の変更確認</span>
          </div>
          <button type="button" class="btn-time-change-close" id="btnTimeChangeClose" title="閉じる">✕</button>
        </div>

        <div class="time-change-modal-body">
          <div class="time-change-alert-box">
            <p class="time-change-alert-text">⚠️ 予約時間を変更しようとしています。よろしいですか？</p>
          </div>

          <div class="time-change-patient-card">
            <div class="patient-card-header-mini">
              <span class="patient-icon">👤</span>
              <span class="patient-name-display" id="tcPatientName">----</span>
              <span class="chart-no-display" id="tcChartNo">No. ----</span>
            </div>

            <div class="time-change-compare-grid">
              <div class="compare-box before-box">
                <div class="compare-label">変更前</div>
                <div class="compare-unit" id="tcBeforeUnit">チェア1</div>
                <div class="compare-time" id="tcBeforeTime">09:00 〜 09:30</div>
              </div>

              <div class="compare-arrow">➔</div>

              <div class="compare-box after-box">
                <div class="compare-label">変更後</div>
                <div class="compare-unit" id="tcAfterUnit">チェア2</div>
                <div class="compare-time" id="tcAfterTime">14:00 〜 14:30</div>
              </div>
            </div>
          </div>
        </div>

        <div class="time-change-modal-footer">
          <button type="button" class="btn-tc-cancel" id="btnTimeChangeCancel">キャンセル</button>
          <button type="button" class="btn-tc-confirm" id="btnTimeChangeConfirm">予約時間変更</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('#btnTimeChangeClose');
    const cancelBtn = modal.querySelector('#btnTimeChangeCancel');
    const confirmBtn = modal.querySelector('#btnTimeChangeConfirm');

    if (closeBtn) closeBtn.onclick = () => this.closeTimeChangeModal();
    if (cancelBtn) cancelBtn.onclick = () => this.closeTimeChangeModal();
    if (confirmBtn) confirmBtn.onclick = () => this.confirmTimeChange();

    this.timeChangeModalEl = modal;
  }

  // -------------------------------------------
  // 2. イベント登録 & 連携
  // -------------------------------------------

  bindContainerEvents() {
    const container = document.getElementById('reservationGrid');
    if (!container) {
      document.addEventListener('DOMContentLoaded', () => this.bindContainerEvents());
      return;
    }

    document.addEventListener('dragover', (e) => {
      if (this.draggedData && this.indicatorEl) {
        this.updateIndicatorPosition(e.clientX, e.clientY);
      }
    });

    container.addEventListener('dragover', (e) => this.handleDragOver(e));
    container.addEventListener('dragleave', (e) => this.handleDragLeave(e));
    container.addEventListener('drop', (e) => this.handleDrop(e));
  }

  attachSlotDragEvents(slotEl, bookingGroup, dayReservations, timeSlots, columns) {
    if (!slotEl || !slotEl.classList.contains('booked')) return;

    slotEl.setAttribute('draggable', 'true');

    slotEl.addEventListener('dragstart', (e) => {
      this.handleDragStart(e, slotEl, bookingGroup, dayReservations, timeSlots, columns);
    });

    slotEl.addEventListener('dragend', (e) => {
      this.handleDragEnd(e);
    });
  }

  _getGroupCells(container, bookingGroup) {
    if (!container || !bookingGroup) return [];
    try {
      if (window.CSS && typeof window.CSS.escape === 'function') {
        const cells = Array.from(container.querySelectorAll(`[data-booking-group="${CSS.escape(bookingGroup)}"]`));
        if (cells.length) return cells;
      }
    } catch (err) { }
    return Array.from(container.querySelectorAll('.grid-slot-cell')).filter(c => c.dataset.bookingGroup === bookingGroup);
  }

  // -------------------------------------------
  // 3. ドラッグ開始 (dragstart)
  // -------------------------------------------

  handleDragStart(e, slotEl, bookingGroup, dayReservations, timeSlots, columns) {
    const dateStr = slotEl.dataset.date;
    const colIndex = parseInt(slotEl.dataset.col, 10);
    const unitLabel = slotEl.dataset.unit;
    const container = document.getElementById('reservationGrid');
    if (!container) return;

    const groupCells = this._getGroupCells(container, bookingGroup);
    if (!groupCells.length) return;

    groupCells.sort((a, b) => parseInt(a.dataset.row, 10) - parseInt(b.dataset.row, 10));

    const startRow = parseInt(groupCells[0].dataset.row, 10);
    const rowSpan = groupCells.length;
    const slotTimes = groupCells.map(c => c.dataset.time);

    const bookingItems = dayReservations.filter(r =>
      slotTimes.includes(r.time) && (r.unit === unitLabel || r.chairIndex === colIndex)
    );

    this.draggedData = {
      bookingGroup,
      dateStr,
      sourceColIndex: colIndex,
      sourceUnit: unitLabel,
      startRow,
      rowSpan,
      slotTimes,
      bookingItems,
      groupCells,
      dayReservations,
      timeSlots
    };

    groupCells.forEach(cell => cell.classList.add('dragging-source'));

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'all';
      e.dataTransfer.setData('text/plain', JSON.stringify({
        type: 'appointment_card',
        bookingGroup,
        unit: unitLabel,
        slotTimes
      }));

      if (groupCells[0]) {
        try {
          e.dataTransfer.setDragImage(groupCells[0], 20, 20);
        } catch (err) { }
      }
    }

    if (this.indicatorEl) {
      this.indicatorEl.style.display = 'flex';
      this.setIndicatorState('move', '移動');
      this.updateIndicatorPosition(e.clientX, e.clientY);
    }
  }

  // -------------------------------------------
  // 4. ドロップ可否・ルール判定 (Evaluation Engine)
  // -------------------------------------------

  evaluateDropTarget(targetRow, targetCol, targetUnit) {
    if (!this.draggedData) return null;

    const container = document.getElementById('reservationGrid');
    const { startRow, sourceColIndex, rowSpan, timeSlots, bookingGroup, dayReservations } = this.draggedData;

    const isSameTime = targetRow === startRow;
    const isDifferentCol = targetCol !== sourceColIndex;
    const isDifferentTime = targetRow !== startRow;

    // 0. ドラッグ元の同一セル内
    if (!isDifferentCol && !isDifferentTime) {
      return { mode: 'original', indicator: { type: 'move', text: '移動' }, dropEffect: 'move' };
    }

    // 連続枠のセルと時刻を走査
    const targetSlotCells = [];
    const targetSlotTimes = [];
    let isAllEmpty = true;
    let targetBookingGroup = null;
    let isSingleMatchingGroup = true;

    for (let i = 0; i < rowSpan; i++) {
      const checkRow = targetRow + i;
      if (checkRow >= timeSlots.length) return null; // 枠外

      const cell = container.querySelector(`.grid-slot-cell[data-row="${checkRow}"][data-col="${targetCol}"]`);
      if (!cell) return null;

      targetSlotCells.push(cell);
      targetSlotTimes.push(timeSlots[checkRow]);

      if (cell.classList.contains('booked')) {
        isAllEmpty = false;
        const bg = cell.dataset.bookingGroup;
        if (!targetBookingGroup) {
          targetBookingGroup = bg;
        } else if (targetBookingGroup !== bg) {
          isSingleMatchingGroup = false;
        }
      } else if (cell.classList.contains('grid-slot-blocked')) {
        isAllEmpty = false;
        isSingleMatchingGroup = false;
      } else if (targetBookingGroup) {
        isSingleMatchingGroup = false;
      }
    }

    if (targetSlotCells.length !== rowSpan) return null;

    // 1. 同じ時間帯（別チェア）
    if (isSameTime && isDifferentCol) {
      if (isAllEmpty) {
        return {
          mode: 'same-time-move',
          targetCol,
          targetUnit,
          targetSlotCells,
          targetSlotTimes,
          highlightClass: 'drop-target-valid',
          indicator: { type: 'valid', text: 'チェア移動' },
          dropEffect: 'move'
        };
      }
      if (isSingleMatchingGroup && targetBookingGroup) {
        const opponentCells = this._getGroupCells(container, targetBookingGroup);
        opponentCells.sort((a, b) => parseInt(a.dataset.row, 10) - parseInt(b.dataset.row, 10));
        const opponentStartRow = parseInt(opponentCells[0].dataset.row, 10);
        const opponentRowSpan = opponentCells.length;

        if (opponentStartRow === startRow && opponentRowSpan === rowSpan) {
          const oppSlotTimes = opponentCells.map(c => c.dataset.time);
          const targetBookingItems = dayReservations.filter(r =>
            oppSlotTimes.includes(r.time) && (r.unit === targetUnit || r.chairIndex === targetCol)
          );
          return {
            mode: 'same-time-swap',
            targetCol,
            targetUnit,
            targetSlotCells,
            targetBookingItems,
            highlightClass: 'drop-target-swap',
            indicator: { type: 'swap', text: '場所の入れ替え' },
            dropEffect: 'move'
          };
        }
      }
      return {
        mode: 'invalid',
        targetSlotCells,
        highlightClass: 'drop-target-invalid',
        indicator: { type: 'forbidden', text: '移動不可（重複）' },
        dropEffect: 'none'
      };
    }

    // 2. 違う時間帯
    if (isDifferentTime) {
      if (isAllEmpty) {
        return {
          mode: 'time-change-warning',
          targetCol,
          targetUnit,
          targetSlotCells,
          targetSlotTimes,
          highlightClass: 'drop-target-time-change',
          indicator: { type: 'warning', text: '予約時間変更' },
          dropEffect: 'move'
        };
      }
      return {
        mode: 'invalid',
        targetSlotCells,
        highlightClass: 'drop-target-invalid',
        indicator: { type: 'forbidden', text: '移動不可（予約あり）' },
        dropEffect: 'none'
      };
    }

    return null;
  }

  // -------------------------------------------
  // 5. ドラッグオーバー (dragover)
  // -------------------------------------------

  handleDragOver(e) {
    if (!this.draggedData) return;
    e.preventDefault();

    this.updateIndicatorPosition(e.clientX, e.clientY);

    const targetCell = e.target.closest('td.grid-slot-cell');
    if (!targetCell) {
      this.clearDropHighlights();
      this.currentDropTarget = null;
      this.setIndicatorState('forbidden', '移動不可');
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
      return;
    }

    const targetCol = parseInt(targetCell.dataset.col, 10);
    const targetRow = parseInt(targetCell.dataset.row, 10);
    const targetUnit = targetCell.dataset.unit;

    this.clearDropHighlights();

    const evaluation = this.evaluateDropTarget(targetRow, targetCol, targetUnit);

    if (!evaluation) {
      this.currentDropTarget = null;
      this.setIndicatorState('forbidden', '枠外');
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
      return;
    }

    this.setIndicatorState(evaluation.indicator.type, evaluation.indicator.text);
    if (e.dataTransfer) e.dataTransfer.dropEffect = evaluation.dropEffect;

    if (evaluation.highlightClass && evaluation.targetSlotCells) {
      evaluation.targetSlotCells.forEach(cell => cell.classList.add(evaluation.highlightClass));
    }

    this.currentDropTarget = evaluation.mode === 'invalid' || evaluation.mode === 'original' ? null : evaluation;
  }

  handleDragLeave(e) {
    if (!e.relatedTarget || !document.getElementById('reservationGrid').contains(e.relatedTarget)) {
      this.clearDropHighlights();
    }
  }

  // -------------------------------------------
  // 6. ドロップ確定 (drop)
  // -------------------------------------------

  handleDrop(e) {
    if (!this.draggedData) return;
    e.preventDefault();

    let target = this.currentDropTarget;
    const dragged = this.draggedData;

    // 安全フェイルセーフ: ドロップ位置からターゲットを再導出
    if (!target && e.target) {
      const targetCell = e.target.closest('td.grid-slot-cell');
      if (targetCell) {
        const targetCol = parseInt(targetCell.dataset.col, 10);
        const targetRow = parseInt(targetCell.dataset.row, 10);
        const targetUnit = targetCell.dataset.unit;
        const reEval = this.evaluateDropTarget(targetRow, targetCol, targetUnit);
        if (reEval && reEval.mode !== 'invalid' && reEval.mode !== 'original') {
          target = reEval;
        }
      }
    }

    this.clearDropHighlights();
    this.clearDragSource();
    this.hideIndicator();

    if (!target) {
      this.draggedData = null;
      this.currentDropTarget = null;
      return;
    }

    if (target.mode === 'same-time-move') {
      if (window.dbManager && typeof window.dbManager.moveReservationGroup === 'function') {
        window.dbManager.moveReservationGroup(dragged.bookingItems, target.targetUnit);
      }
      if (window.reservationGrid && typeof window.reservationGrid.render === 'function') {
        window.reservationGrid.render();
      }
      this.draggedData = null;
      this.currentDropTarget = null;
    } else if (target.mode === 'same-time-swap') {
      if (window.dbManager && typeof window.dbManager.swapReservationGroups === 'function') {
        window.dbManager.swapReservationGroups(
          dragged.bookingItems,
          target.targetBookingItems,
          dragged.sourceUnit,
          target.targetUnit
        );
      }
      if (window.reservationGrid && typeof window.reservationGrid.render === 'function') {
        window.reservationGrid.render();
      }
      this.draggedData = null;
      this.currentDropTarget = null;
    } else if (target.mode === 'time-change-warning') {
      this.showTimeChangeModal(dragged, target);
    }
  }

  // -------------------------------------------
  // 7. 時間変更モーダル制御
  // -------------------------------------------

  showTimeChangeModal(dragged, target) {
    this.pendingTimeChange = { dragged, target };

    const firstBooking = dragged.bookingItems[0] || {};
    const patientName = firstBooking.patient_name || firstBooking.name || '予約患者';
    const chartNo = firstBooking.chart_no ? `No. ${firstBooking.chart_no}` : '';

    const beforeFirst = dragged.slotTimes[0];
    const beforeLast = dragged.slotTimes[dragged.slotTimes.length - 1];
    const beforeTimeText = `${beforeFirst} 〜 ${this.getEndTime(beforeLast)}`;

    const afterFirst = target.targetSlotTimes[0];
    const afterLast = target.targetSlotTimes[target.targetSlotTimes.length - 1];
    const afterTimeText = `${afterFirst} 〜 ${this.getEndTime(afterLast)}`;

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setText('tcPatientName', patientName);
    setText('tcChartNo', chartNo);
    setText('tcBeforeUnit', dragged.sourceUnit);
    setText('tcBeforeTime', beforeTimeText);
    setText('tcAfterUnit', target.targetUnit);
    setText('tcAfterTime', afterTimeText);

    if (this.timeChangeModalEl) {
      this.timeChangeModalEl.classList.add('show');
    }
  }

  confirmTimeChange() {
    if (this.pendingTimeChange) {
      const { dragged, target } = this.pendingTimeChange;

      if (window.dbManager && typeof window.dbManager.moveReservationGroupToSlot === 'function') {
        window.dbManager.moveReservationGroupToSlot(
          dragged.bookingItems,
          target.targetUnit,
          target.targetSlotTimes
        );
      }

      if (window.reservationGrid && typeof window.reservationGrid.render === 'function') {
        window.reservationGrid.render();
      }
    }
    this.closeTimeChangeModal();
  }

  closeTimeChangeModal() {
    if (this.timeChangeModalEl) {
      this.timeChangeModalEl.classList.remove('show');
    }
    this.pendingTimeChange = null;
    this.draggedData = null;
    this.currentDropTarget = null;
  }

  handleDragEnd(e) {
    this.clearDropHighlights();
    this.clearDragSource();
    this.hideIndicator();
    if (!this.pendingTimeChange) {
      this.draggedData = null;
      this.currentDropTarget = null;
    }
  }

  // -------------------------------------------
  // 8. ユーティリティ・スタイル解除
  // -------------------------------------------

  updateIndicatorPosition(x, y) {
    if (!this.indicatorEl || this.indicatorEl.style.display === 'none') return;
    this.indicatorEl.style.left = `${x + 15}px`;
    this.indicatorEl.style.top = `${y + 15}px`;
  }

  setIndicatorState(type, text) {
    if (!this.indicatorEl) return;
    this.indicatorEl.className = `drag-indicator-badge badge-${type}`;
    const icons = { warning: '⚠️', forbidden: '🚫', swap: '⇄', valid: '➔', move: '➔' };
    const icon = icons[type] || '➔';
    this.indicatorEl.innerHTML = `<span class="indicator-icon">${icon}</span> <span class="indicator-text">${text}</span>`;
  }

  hideIndicator() {
    if (this.indicatorEl) {
      this.indicatorEl.style.display = 'none';
    }
  }

  getEndTime(timeStr) {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      let h = parseInt(parts[0], 10);
      let m = parseInt(parts[1], 10) + 30;
      if (m >= 60) {
        h += Math.floor(m / 60);
        m %= 60;
      }
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return timeStr;
  }

  clearDropHighlights() {
    const container = document.getElementById('reservationGrid');
    if (!container) return;
    const highlighted = container.querySelectorAll('.drop-target-valid, .drop-target-swap, .drop-target-time-change, .drop-target-invalid');
    highlighted.forEach(el => el.classList.remove('drop-target-valid', 'drop-target-swap', 'drop-target-time-change', 'drop-target-invalid'));
  }

  clearDragSource() {
    const container = document.getElementById('reservationGrid');
    if (!container) return;
    const sources = container.querySelectorAll('.dragging-source');
    sources.forEach(el => el.classList.remove('dragging-source'));
  }
}

// グローバルインスタンス
window.dragDropManager = new DragDropManager();
