// -------------------------------------------
// Reservation Grid Manager (reservationGrid.js)
// -------------------------------------------

class ReservationGrid {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.currentDate = new Date();
    this.selectedCell = null;

    // 08:30〜17:30までの30分刻み（計19行）
    this.timeSlots = [
      '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
      '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'
    ];

    // 横5列のヘッダー定義（時間列 + チェア1〜3 + 予備）
    this.columns = [
      { id: 'time', label: '時間' },
      { id: 'unit1', label: 'チェア 1' },
      { id: 'unit2', label: 'チェア 2' },
      { id: 'unit3', label: 'チェア 3' },
      { id: 'unit4', label: '予備' } // チェア4 -> 予備に変更
    ];

    this.init();
  }

  init() {
    this.render();
  }

  setDate(date) {
    this.currentDate = new Date(date);
    this.render();
  }

  render() {
    this.container.innerHTML = '';

    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth() + 1;
    const day = this.currentDate.getDate();
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // 1. ヘッダー内の日付表示を更新
    this.updateHeaderDateDisplay(year, month, day, this.currentDate.getDay());

    // 2. テーブルラッパー
    const tableWrapper = document.createElement('div');
    tableWrapper.className = 'grid-table-wrapper';

    const table = document.createElement('table');
    table.className = 'grid-table';

    // テーブルヘッダー (横5列)
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    this.columns.forEach(col => {
      const th = document.createElement('th');
      th.innerText = col.label;
      headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // テーブルボディ
    const tbody = document.createElement('tbody');

    // 3. 担当欄（1行のみ）
    const staffTr = document.createElement('tr');
    staffTr.className = 'staff-row';

    // 1列目: 時間列と同じセル（「担当」）
    const tdStaffLabel = document.createElement('td');
    tdStaffLabel.className = 'time-col staff-label-col';
    tdStaffLabel.innerText = '担当';
    staffTr.appendChild(tdStaffLabel);

    // 2〜5列目: 各チェアの担当記入枠
    for (let colIndex = 1; colIndex < this.columns.length; colIndex++) {
      const col = this.columns[colIndex];
      const tdStaff = document.createElement('td');
      tdStaff.className = 'staff-cell';

      const currentVal = window.dbManager ? window.dbManager.getStaffAssignment(dateStr, col.id) : '';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'staff-input';
      input.value = currentVal;

      input.onchange = (e) => {
        if (window.dbManager) {
          window.dbManager.setStaffAssignment(dateStr, col.id, e.target.value.trim());
        }
      };

      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          input.blur();
        }
      };

      tdStaff.appendChild(input);
      staffTr.appendChild(tdStaff);
    }

    tbody.appendChild(staffTr);

    // 選択日付の予約データを取得
    const dayReservations = this.getReservationsForDate(dateStr);

    // 4. 時間スロット行 (縦19行: 08:30〜17:30)
    this.timeSlots.forEach((time, rowIndex) => {
      const tr = document.createElement('tr');

      // 1列目: 時間
      const tdTime = document.createElement('td');
      tdTime.className = 'time-col';
      tdTime.innerText = time;
      tr.appendChild(tdTime);

      // 2〜5列目: 各チェア・予備の予約枠
      for (let colIndex = 1; colIndex < this.columns.length; colIndex++) {
        const tdSlot = document.createElement('td');
        tdSlot.className = 'grid-slot-cell';
        tdSlot.dataset.row = rowIndex;
        tdSlot.dataset.col = colIndex;
        tdSlot.dataset.time = time;
        tdSlot.dataset.unit = this.columns[colIndex].label;

        // 該当枠に予約があるか確認
        const booking = dayReservations.find(r => r.time === time && (r.unit === this.columns[colIndex].label || r.chairIndex === colIndex));

        if (booking) {
          tdSlot.classList.add('booked');
          tdSlot.innerText = booking.patient_name || booking.name || '予約あり';
          tdSlot.title = `${booking.patient_name} 様 (${booking.menu_name || ''})`;
        }

        // クリックでセル選択＆空グリッドならモーダルを開く
        tdSlot.onclick = () => {
          if (this.selectedCell) {
            this.selectedCell.classList.remove('selected');
            const prevRow = this.selectedCell.closest('tr');
            if (prevRow) prevRow.classList.remove('selected-row');
          }
          tdSlot.classList.add('selected');
          tr.classList.add('selected-row');
          this.selectedCell = tdSlot;
          console.log(`選択枠: ${dateStr} ${time} [${this.columns[colIndex].label}]`);

          // 空グリッドならモーダルWindowを表示（選択セルの周囲に配置）
          if (!booking && window.appointmentModal && typeof window.appointmentModal.open === 'function') {
            window.appointmentModal.open(dateStr, time, this.columns[colIndex].label, tdSlot);
          }
        };

        tr.appendChild(tdSlot);
      }

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableWrapper.appendChild(table);
    this.container.appendChild(tableWrapper);
  }

  // ヘッダー内の日付表示を更新する
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

  // 指定日付の予約データを取得
  getReservationsForDate(dateStr) {
    if (window.dbManager && typeof window.dbManager.getReservations === 'function') {
      const all = window.dbManager.getReservations();
      return all.filter(r => r.date === dateStr);
    }
    return [];
  }
}

// グローバルインスタンス & 初期化
window.reservationGrid = null;

document.addEventListener('DOMContentLoaded', () => {
  window.reservationGrid = new ReservationGrid('reservationGrid');
});
