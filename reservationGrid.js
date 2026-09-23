// -------------------------------------------
// Reservation Grid Manager (reservationGrid.js)
// なおる歯科 - 予約グリッド表示 & 複数枠ドラッグ選択 & カード描画
// -------------------------------------------

class ReservationGrid {
  constructor(containerId = 'reservationGrid') {
    this.container = document.getElementById(containerId);
    this.currentDate = new Date(2026, 8, 21); // 2026年9月21日(月)

    // 列定義 (全5列)
    this.columns = [
      { id: 'time', label: '時間' },
      { id: 'chair1', label: 'チェア１' },
      { id: 'chair2', label: 'チェア２' },
      { id: 'chair3', label: 'チェア３' },
      { id: 'sub', label: '予備' }
    ];

    // 時間スロット (縦19行: 08:30〜17:30, 30分刻み)
    this.timeSlots = [
      '08:30', '09:00', '09:30', '10:00', '10:30',
      '11:00', '11:30', '12:00', '12:30', '13:00',
      '13:30', '14:00', '14:30', '15:00', '15:30',
      '16:00', '16:30', '17:00', '17:30'
    ];

    // 複数枠ドラッグ選択状態
    this.isDragging = false;
    this.dragStartRow = -1;
    this.dragCurrentRow = -1;
    this.dragColIndex = -1;
    this.selectedCells = [];

    this.init();
  }

  init() {
    this.bindGlobalDragEvents();
    this.render();
  }

  // -------------------------------------------
  // 1. ドラッグ複数枠選択イベント
  // -------------------------------------------

  bindGlobalDragEvents() {
    document.addEventListener('mouseup', () => {
      if (!this.isDragging) return;
      this.isDragging = false;

      // ブロックモード中は新規予約モーダルを開かない
      if (window.gridBlockManager && window.gridBlockManager.isBlockMode()) return;

      const minRow = Math.min(this.dragStartRow, this.dragCurrentRow);
      const maxRow = Math.max(this.dragStartRow, this.dragCurrentRow);
      const colIndex = this.dragColIndex;

      let actualMin = minRow;
      let actualMax = maxRow;

      if (this.dragStartRow <= this.dragCurrentRow) {
        for (let r = this.dragStartRow; r <= this.dragCurrentRow; r++) {
          const slot = this.container.querySelector(`.grid-slot-cell[data-row="${r}"][data-col="${colIndex}"]`);
          if (slot && (slot.classList.contains('booked') || slot.classList.contains('grid-slot-blocked'))) break;
          actualMax = r;
        }
      } else {
        for (let r = this.dragStartRow; r >= this.dragCurrentRow; r--) {
          const slot = this.container.querySelector(`.grid-slot-cell[data-row="${r}"][data-col="${colIndex}"]`);
          if (slot && (slot.classList.contains('booked') || slot.classList.contains('grid-slot-blocked'))) break;
          actualMin = r;
        }
      }

      const slotTimes = [];
      let startCell = null;
      for (let r = actualMin; r <= actualMax; r++) {
        const slot = this.container.querySelector(`.grid-slot-cell[data-row="${r}"][data-col="${colIndex}"]`);
        if (slot && !slot.classList.contains('booked') && !slot.classList.contains('grid-slot-blocked')) {
          slotTimes.push(slot.dataset.time);
          if (!startCell) startCell = slot;
        }
      }

      // パイロットグリッド保持時の枠数拡張 & 可否判定 & 複数枠緑色ハイライトの適用
      if (window.pilotGridManager && window.pilotGridManager.hasBooking()) {
        const held = window.pilotGridManager.heldBooking;
        const slotCount = held.slotCount || 1;
        if (slotCount > 1) {
          const canFit = this.canFitPilotBooking(actualMin, colIndex, slotCount);
          if (!canFit) {
            this.clearSelection();
            if (startCell) {
              startCell.classList.add('cell-shake-error');
              setTimeout(() => startCell.classList.remove('cell-shake-error'), 450);
            }
            return;
          }
          slotTimes.length = 0;
          for (let r = actualMin; r < actualMin + slotCount; r++) {
            if (r < this.timeSlots.length) {
              slotTimes.push(this.timeSlots[r]);
            }
          }
          // すべての対象枠を緑色枠（drag-selected / selected）で囲む
          for (let r = actualMin; r < actualMin + slotCount; r++) {
            const slot = this.container.querySelector(`.grid-slot-cell[data-row="${r}"][data-col="${colIndex}"]`);
            if (slot) {
              slot.classList.add('drag-selected', 'selected');
              const tr = slot.closest('tr');
              if (tr) tr.classList.add('selected-row');
            }
          }
        }
      }

      if (slotTimes.length === 0 || !startCell) return;

      const dateStr = startCell.dataset.date;
      const unitLabel = startCell.dataset.unit;

      if (window.appointmentModal && typeof window.appointmentModal.open === 'function') {
        window.appointmentModal.open(dateStr, slotTimes[0], unitLabel, startCell, slotTimes);
      }
    });
  }

  setDate(date) {
    this.currentDate = new Date(date);
    this.render();
  }

  // -------------------------------------------
  // 2. メインレンダリング
  // -------------------------------------------

  render() {
    if (!this.container) return;
    this.container.innerHTML = '';

    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth() + 1;
    const day = this.currentDate.getDate();
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    this.updateHeaderDateDisplay(year, month, day, this.currentDate.getDay());

    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'grid-table-wrapper';
    tableWrapper.addEventListener('mouseleave', () => this.clearPilotHoverPreview());

    const table = document.createElement('table');
    table.className = 'grid-table';

    // テーブルヘッダー
    table.appendChild(this._createTableHeader());

    // テーブルボディ
    const tbody = document.createElement('tbody');
    tbody.appendChild(this._createStaffRow(dateStr));

    const dayReservations = this.getReservationsForDate(dateStr);

    // 時間スロット行 (縦19行)
    this.timeSlots.forEach((time, rowIndex) => {
      const tr = document.createElement('tr');

      // 時間列
      const tdTime = document.createElement('td');
      tdTime.className = 'time-col';
      tdTime.innerText = time;
      tr.appendChild(tdTime);

      // 各チェア枠
      for (let colIndex = 1; colIndex < this.columns.length; colIndex++) {
        const tdSlot = this._createSlotCell(dateStr, rowIndex, colIndex, time, dayReservations);
        tr.appendChild(tdSlot);
      }

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableWrapper.appendChild(table);
    this.container.appendChild(tableWrapper);

    // パイロットグリッド保持中の枠数に応じた配置可否判定・アイコン表示
    this.updatePilotPlacementAvailability();
  }

  // -------------------------------------------
  // 3. 各部生成ヘルパー
  // -------------------------------------------

  _createTableHeader() {
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    this.columns.forEach(col => {
      const th = document.createElement('th');
      th.innerText = col.label;
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    return thead;
  }

  _createStaffRow(dateStr) {
    const staffTr = document.createElement('tr');
    staffTr.className = 'staff-row';

    const tdStaffLabel = document.createElement('td');
    tdStaffLabel.className = 'time-col staff-label-col';
    tdStaffLabel.innerText = '担当';
    staffTr.appendChild(tdStaffLabel);

    for (let colIndex = 1; colIndex < this.columns.length; colIndex++) {
      const col = this.columns[colIndex];
      const tdStaff = document.createElement('td');
      tdStaff.className = 'staff-cell';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'staff-input';
      input.placeholder = '';
      input.maxLength = 10;
      input.dataset.unitId = col.id;

      if (window.dbManager && typeof window.dbManager.getStaffAssignment === 'function') {
        input.value = window.dbManager.getStaffAssignment(dateStr, col.id) || '';
      }

      input.onchange = (e) => {
        if (window.dbManager && typeof window.dbManager.setStaffAssignment === 'function') {
          window.dbManager.setStaffAssignment(dateStr, col.id, e.target.value.trim());
        }
      };

      tdStaff.appendChild(input);
      staffTr.appendChild(tdStaff);
    }

    return staffTr;
  }

  _createSlotCell(dateStr, rowIndex, colIndex, time, dayReservations) {
    const tdSlot = document.createElement('td');
    tdSlot.className = 'grid-slot-cell';
    if (this.columns[colIndex].id === 'sub') {
      tdSlot.classList.add('slot-sub');
    }

    // 休憩・診療外枠の背景パターン判定
    const dayOfWeek = this.currentDate.getDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isSaturday = dayOfWeek === 6;

    const isWeekdayLunch = isWeekday && ['12:00', '12:30', '13:00'].includes(time);
    const isSaturdayAfternoon = isSaturday && time >= '12:00';

    if (isWeekdayLunch || isSaturdayAfternoon) {
      tdSlot.classList.add('slot-break');
    }

    tdSlot.dataset.date = dateStr;
    tdSlot.dataset.row = rowIndex;
    tdSlot.dataset.col = colIndex;
    tdSlot.dataset.time = time;
    tdSlot.dataset.unit = this.columns[colIndex].label;

    const booking = dayReservations.find(r => r.time === time && (r.unit === this.columns[colIndex].label || r.chairIndex === colIndex));

    if (booking) {
      this._setupBookedCell(tdSlot, booking, dateStr, rowIndex, colIndex, time, dayReservations);
    } else {
      // ブロック枠（予約不可）の判定
      const isBlocked = window.dbManager && typeof window.dbManager.isSlotBlocked === 'function' &&
        window.dbManager.isSlotBlocked(dateStr, time, this.columns[colIndex].label);

      if (isBlocked) {
        tdSlot.classList.add('grid-slot-blocked');
        tdSlot.innerHTML = `
          <div class="grid-blocked-content">
            <span class="grid-blocked-lock-icon">🔒</span>
          </div>
        `;
        tdSlot.title = 'ブロック枠';
      }
    }

    // 空き枠ドラッグ範囲選択イベント
    tdSlot.onmousedown = (e) => {
      // ブロックモード中、または予約済み枠、またはブロック枠の場合は通常予約ドラッグを開始しない
      if (e.button !== 0 || booking || tdSlot.classList.contains('grid-slot-blocked')) return;
      if (window.gridBlockManager && window.gridBlockManager.isBlockMode()) return;

      // パイロットグリッド保持中で収まらない枠をクリックした場合：ドラッグを開始せずエラー効果
      let pilotSlotCount = 1;
      if (window.pilotGridManager && window.pilotGridManager.hasBooking()) {
        const held = window.pilotGridManager.heldBooking;
        pilotSlotCount = held.slotCount || 1;
        if (tdSlot.classList.contains('pilot-cannot-fit') || !this.canFitPilotBooking(rowIndex, colIndex, pilotSlotCount)) {
          tdSlot.classList.add('cell-shake-error');
          setTimeout(() => tdSlot.classList.remove('cell-shake-error'), 450);
          return;
        }
      }

      e.preventDefault();
      this.clearPilotHoverPreview();
      this.isDragging = true;
      this.dragStartRow = rowIndex;
      this.dragCurrentRow = (pilotSlotCount > 1) ? Math.min(this.timeSlots.length - 1, rowIndex + pilotSlotCount - 1) : rowIndex;
      this.dragColIndex = colIndex;
      this.clearSelection();
      this.updateDragSelection();
    };

    tdSlot.onmouseenter = () => {
      if (this.isDragging) {
        if (window.gridBlockManager && window.gridBlockManager.isBlockMode()) return;
        if (colIndex !== this.dragColIndex) return;
        this.dragCurrentRow = rowIndex;
        this.updateDragSelection();
      } else {
        this._handlePilotCellHover(tdSlot, rowIndex, colIndex);
      }
    };

    tdSlot.onmouseleave = () => {
      if (!this.isDragging) {
        this.clearPilotHoverPreview();
      }
    };

    return tdSlot;
  }

  _setupBookedCell(tdSlot, booking, dateStr, rowIndex, colIndex, time, dayReservations) {
    tdSlot.classList.add('booked');

    const { hasPrevSame, hasNextSame } = this._checkContinuation(booking, rowIndex, colIndex, dayReservations);

    if (hasPrevSame) tdSlot.classList.add('booked-continuation');
    if (hasNextSame) tdSlot.classList.add('booked-has-next');

    const startBlockTime = this._findBlockStartTime(booking, rowIndex, colIndex, dayReservations);
    const groupId = booking.group_id || `${booking.chart_no || booking.patient_name || 'booking'}_${dateStr}_col${colIndex}_${startBlockTime}`;
    tdSlot.dataset.bookingGroup = groupId;
    tdSlot.dataset.chartNo = booking.chart_no ? String(booking.chart_no).trim() : '';

    // パイロットグリッドにキープ中の元予約であれば点線ボーダーを付与
    if (window.pilotGridManager && window.pilotGridManager.hasBooking()) {
      const held = window.pilotGridManager.heldBooking;
      if (held.date === dateStr && (held.groupId === groupId || (held.chartNo && held.chartNo === booking.chart_no))) {
        tdSlot.classList.add('card-source-dotted');
      }
    }

    // ホバー連動イベント（同一予約ブロックの強調 ＋ 同一カルテNoの別枠予約ハイライト）
    tdSlot.addEventListener('mouseenter', () => {
      // 1. 自身の予約グループセル（連続枠）をホバー強調
      const escapedGroupId = (window.CSS && typeof window.CSS.escape === 'function') ? CSS.escape(groupId) : groupId;
      const groupCells = this.container.querySelectorAll(`[data-booking-group="${escapedGroupId}"]`);
      groupCells.forEach(cell => cell.classList.add('booked-hover'));

      // 2. 同一カルテ番号（chart_no）の別枠予約をハイライト（同姓同名除外・カルテ番号一致のみ）
      const currentChartNo = tdSlot.dataset.chartNo;
      if (currentChartNo) {
        const escapedChartNo = (window.CSS && typeof window.CSS.escape === 'function') ? CSS.escape(currentChartNo) : currentChartNo;
        const samePatientCells = this.container.querySelectorAll(`.grid-slot-cell.booked[data-chart-no="${escapedChartNo}"]`);
        samePatientCells.forEach(cell => {
          if (cell.dataset.bookingGroup !== groupId) {
            cell.classList.add('booked-same-patient-hover');
          }
        });
      }
    });

    tdSlot.addEventListener('mouseleave', () => {
      const escapedGroupId = (window.CSS && typeof window.CSS.escape === 'function') ? CSS.escape(groupId) : groupId;
      const groupCells = this.container.querySelectorAll(`[data-booking-group="${escapedGroupId}"]`);
      groupCells.forEach(cell => cell.classList.remove('booked-hover'));

      const samePatientCells = this.container.querySelectorAll('.grid-slot-cell.booked-same-patient-hover');
      samePatientCells.forEach(cell => cell.classList.remove('booked-same-patient-hover'));
    });

    const chartNoText = booking.chart_no ? `${booking.chart_no} ` : '';
    const patientNameText = booking.patient_name || booking.name || '予約あり';
    const treatmentText = booking.menu_name || '';

    if (hasPrevSame) {
      tdSlot.innerHTML = '';
      tdSlot.title = [chartNoText.trim(), `${patientNameText} 様 (続き)`, treatmentText ? `【処置: ${treatmentText}】` : ''].filter(Boolean).join(' ');
    } else {
      tdSlot.classList.add('booked-top');
      tdSlot.innerHTML = this._buildPatientCardHtml(booking, patientNameText, treatmentText);
      tdSlot.title = [chartNoText.trim(), `${patientNameText} 様`, treatmentText ? `【処置: ${treatmentText}】` : ''].filter(Boolean).join(' ');
    }

    if (window.dragDropManager && typeof window.dragDropManager.attachSlotDragEvents === 'function') {
      window.dragDropManager.attachSlotDragEvents(tdSlot, groupId, dayReservations, this.timeSlots, this.columns);
    }
  }

  _checkContinuation(booking, rowIndex, colIndex, dayReservations) {
    const isSameBooking = (b1, b2) => {
      if (!b1 || !b2) return false;
      return (b1.chart_no && b2.chart_no === b1.chart_no) || (b1.patient_name && b2.patient_name === b1.patient_name);
    };

    const prevTime = rowIndex > 0 ? this.timeSlots[rowIndex - 1] : null;
    const prevBooking = prevTime ? dayReservations.find(r => r.time === prevTime && (r.unit === this.columns[colIndex].label || r.chairIndex === colIndex)) : null;

    const nextTime = rowIndex < this.timeSlots.length - 1 ? this.timeSlots[rowIndex + 1] : null;
    const nextBooking = nextTime ? dayReservations.find(r => r.time === nextTime && (r.unit === this.columns[colIndex].label || r.chairIndex === colIndex)) : null;

    return {
      hasPrevSame: Boolean(prevBooking && isSameBooking(booking, prevBooking)),
      hasNextSame: Boolean(nextBooking && isSameBooking(booking, nextBooking))
    };
  }

  _findBlockStartTime(booking, rowIndex, colIndex, dayReservations) {
    const isSameBooking = (b1, b2) => {
      if (!b1 || !b2) return false;
      return (b1.chart_no && b2.chart_no === b1.chart_no) || (b1.patient_name && b2.patient_name === b1.patient_name);
    };
    let startIdx = rowIndex;
    while (startIdx > 0) {
      const prevTime = this.timeSlots[startIdx - 1];
      const prevBooking = prevTime ? dayReservations.find(r => r.time === prevTime && (r.unit === this.columns[colIndex].label || r.chairIndex === colIndex)) : null;
      if (prevBooking && isSameBooking(booking, prevBooking)) {
        startIdx--;
      } else {
        break;
      }
    }
    return this.timeSlots[startIdx] || this.timeSlots[rowIndex] || '09:00';
  }

  _buildPatientCardHtml(booking, patientNameText, treatmentText) {
    return `
      <div class="booked-patient-content">
        ${booking.chart_no ? `
          <div class="booked-chart-col">
            <span class="booked-chart-no">${booking.chart_no}</span>
          </div>
        ` : ''}
        <div class="booked-info-col">
          <div class="booked-patient-name">${patientNameText}</div>
          ${treatmentText ? `
            <div class="booked-treatment-row">
              <span class="booked-treatment">${treatmentText}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // -------------------------------------------
  // 4. ドラッグ選択・ハイライト更新
  // -------------------------------------------

  updateDragSelection() {
    this.clearSelection();

    const minRow = Math.min(this.dragStartRow, this.dragCurrentRow);
    const maxRow = Math.max(this.dragStartRow, this.dragCurrentRow);

    let actualMin = minRow;
    let actualMax = maxRow;

    if (this.dragStartRow <= this.dragCurrentRow) {
      for (let r = this.dragStartRow; r <= this.dragCurrentRow; r++) {
        const slot = this.container.querySelector(`.grid-slot-cell[data-row="${r}"][data-col="${this.dragColIndex}"]`);
        if (slot && (slot.classList.contains('booked') || slot.classList.contains('grid-slot-blocked'))) break;
        actualMax = r;
      }
    } else {
      for (let r = this.dragStartRow; r >= this.dragCurrentRow; r--) {
        const slot = this.container.querySelector(`.grid-slot-cell[data-row="${r}"][data-col="${this.dragColIndex}"]`);
        if (slot && (slot.classList.contains('booked') || slot.classList.contains('grid-slot-blocked'))) break;
        actualMin = r;
      }
    }

    for (let r = actualMin; r <= actualMax; r++) {
      const slot = this.container.querySelector(`.grid-slot-cell[data-row="${r}"][data-col="${this.dragColIndex}"]`);
      if (slot && !slot.classList.contains('booked') && !slot.classList.contains('grid-slot-blocked')) {
        slot.classList.add('drag-selected', 'selected');
        const tr = slot.closest('tr');
        if (tr) tr.classList.add('selected-row');
      }
    }
  }

  clearSelection() {
    if (this.container) {
      const allSelected = this.container.querySelectorAll('.grid-slot-cell.selected, .grid-slot-cell.drag-selected');
      allSelected.forEach(el => el.classList.remove('selected', 'drag-selected'));
      const allSelectedRows = this.container.querySelectorAll('tr.selected-row');
      allSelectedRows.forEach(tr => tr.classList.remove('selected-row'));
    }
    this.selectedCells = [];
  }

  updateHeaderDateDisplay(year, month, day, dayOfWeekIndex) {
    const headerDateEl = document.getElementById('headerSelectedDate');
    if (!headerDateEl) return;

    const daysArr = ['日', '月', '火', '水', '木', '金', '土'];
    const dayName = daysArr[dayOfWeekIndex];

    let dayClass = '';
    if (dayOfWeekIndex === 0) dayClass = 'day-sun';
    if (dayOfWeekIndex === 6) dayClass = 'day-sat';

    headerDateEl.innerHTML = `${year}年 ${month}月 ${day}日 <span class="${dayClass}">(${dayName})</span>`;
  }

  getReservationsForDate(dateStr) {
    if (window.dbManager && typeof window.dbManager.getReservations === 'function') {
      const all = window.dbManager.getReservations();
      return all.filter(r => r.date === dateStr);
    }
    return [];
  }

  // -------------------------------------------
  // 5. パイロットグリッド保持時の空き枠・配置可否 & 複数枠プレビュー
  // -------------------------------------------

  updatePilotPlacementAvailability() {
    if (!this.container) return;

    // 既存のパイロット配置関連クラス・バッジをクリア
    const allCells = this.container.querySelectorAll('.grid-slot-cell');
    allCells.forEach(cell => {
      cell.classList.remove('pilot-cannot-fit', 'pilot-can-fit', 'pilot-preview-cell', 'pilot-preview-top', 'pilot-preview-bottom', 'pilot-preview-invalid');
      const badge = cell.querySelector('.pilot-no-fit-indicator');
      if (badge) badge.remove();
    });

    if (!window.pilotGridManager || !window.pilotGridManager.hasBooking()) {
      return;
    }

    const held = window.pilotGridManager.heldBooking;
    const slotCount = held.slotCount || 1;

    // slotCount が 2 以上の場合、収まらない枠に 🚫 マークを付与
    if (slotCount >= 2) {
      for (let colIndex = 1; colIndex < this.columns.length; colIndex++) {
        for (let rowIndex = 0; rowIndex < this.timeSlots.length; rowIndex++) {
          const cell = this.container.querySelector(`.grid-slot-cell[data-row="${rowIndex}"][data-col="${colIndex}"]`);
          if (!cell || cell.classList.contains('booked') || cell.classList.contains('grid-slot-blocked')) {
            continue;
          }

          const canFit = this.canFitPilotBooking(rowIndex, colIndex, slotCount);
          if (!canFit) {
            cell.classList.add('pilot-cannot-fit');
            const indicator = document.createElement('div');
            indicator.className = 'pilot-no-fit-indicator';
            indicator.innerHTML = `<span class="no-fit-icon" title="${slotCount * 30}分（${slotCount}枠）の空きが足りません">🚫</span>`;
            cell.appendChild(indicator);
          } else {
            cell.classList.add('pilot-can-fit');
          }
        }
      }
    } else {
      allCells.forEach(cell => {
        if (!cell.classList.contains('booked') && !cell.classList.contains('grid-slot-blocked')) {
          cell.classList.add('pilot-can-fit');
        }
      });
    }
  }

  canFitPilotBooking(startRowIndex, colIndex, slotCount) {
    if (startRowIndex + slotCount > this.timeSlots.length) {
      return false;
    }

    for (let r = startRowIndex; r < startRowIndex + slotCount; r++) {
      const cell = this.container.querySelector(`.grid-slot-cell[data-row="${r}"][data-col="${colIndex}"]`);
      if (!cell) return false;
      if (cell.classList.contains('booked') || cell.classList.contains('grid-slot-blocked')) {
        return false;
      }
    }

    return true;
  }

  _handlePilotCellHover(tdSlot, rowIndex, colIndex) {
    this.clearPilotHoverPreview();

    if (!window.pilotGridManager || !window.pilotGridManager.hasBooking()) {
      return;
    }

    if (this.isDragging) return;

    const held = window.pilotGridManager.heldBooking;
    const slotCount = held.slotCount || 1;

    // 予約済み枠またはブロック枠の上
    if (tdSlot.classList.contains('booked') || tdSlot.classList.contains('grid-slot-blocked')) {
      return;
    }

    const canFit = this.canFitPilotBooking(rowIndex, colIndex, slotCount);

    if (canFit) {
      // 予約枠分のすべてのグリッドの色を変えて複数枠であることをユーザーに通知
      for (let r = rowIndex; r < rowIndex + slotCount; r++) {
        const targetCell = this.container.querySelector(`.grid-slot-cell[data-row="${r}"][data-col="${colIndex}"]`);
        if (targetCell) {
          targetCell.classList.add('pilot-preview-cell');
          if (r === rowIndex) {
            targetCell.classList.add('pilot-preview-top');
            targetCell.dataset.pilotDuration = `${slotCount * 30}分 (${slotCount}枠)`;
          }
          if (r === rowIndex + slotCount - 1) {
            targetCell.classList.add('pilot-preview-bottom');
          }
        }
      }
    } else {
      // 収まらない場合：収まらない枠にエラープレビュー
      tdSlot.classList.add('pilot-preview-invalid');
      const maxRows = Math.min(this.timeSlots.length, rowIndex + slotCount);
      for (let r = rowIndex; r < maxRows; r++) {
        const targetCell = this.container.querySelector(`.grid-slot-cell[data-row="${r}"][data-col="${colIndex}"]`);
        if (targetCell && !targetCell.classList.contains('booked') && !targetCell.classList.contains('grid-slot-blocked')) {
          targetCell.classList.add('pilot-preview-invalid');
        }
      }
    }
  }

  clearPilotHoverPreview() {
    if (!this.container) return;
    const previewCells = this.container.querySelectorAll('.pilot-preview-cell, .pilot-preview-top, .pilot-preview-bottom, .pilot-preview-invalid');
    previewCells.forEach(c => {
      c.classList.remove('pilot-preview-cell', 'pilot-preview-top', 'pilot-preview-bottom', 'pilot-preview-invalid');
    });
  }
}

// グローバルインスタンス & 初期化
window.reservationGrid = null;

document.addEventListener('DOMContentLoaded', () => {
  window.reservationGrid = new ReservationGrid('reservationGrid');
});
