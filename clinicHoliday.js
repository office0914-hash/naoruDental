// -------------------------------------------
// Clinic Holiday Calendar Modal (clinicHoliday.js)
// -------------------------------------------

class ClinicHolidayModal {
  constructor() {
    this.currentDate = new Date();
    this.weekdays = ['日', '月', '火', '水', '木', '金', '土'];

    this.init();
  }

  init() {
    // 1. モーダルHTMLを動的に生成してbodyに追加
    this.createModalDOM();

    this.modalEl = document.getElementById('clinicHolidayModal');
    this.triggerBtn = document.getElementById('btnHolidaySettings');
    this.closeBtn = document.getElementById('btnModalClose');
    this.footerSaveBtn = document.getElementById('btnModalFooterSave');
    this.prevBtn = document.getElementById('btnModalCalPrev');
    this.nextBtn = document.getElementById('btnModalCalNext');

    // 2. 開くボタン
    if (this.triggerBtn) {
      this.triggerBtn.onclick = (e) => {
        e.preventDefault();
        this.open();
      };
    }

    // 3. 閉じるボタン（✕）
    if (this.closeBtn) {
      this.closeBtn.onclick = () => this.close();
    }

    // 4. 「保存してカレンダーに反映」ボタン
    if (this.footerSaveBtn) {
      this.footerSaveBtn.onclick = () => {
        if (window.dbManager) {
          window.dbManager.saveToStorage();
        }
        this.close();
      };
    }

    // 5. 前後月送りボタン
    if (this.prevBtn) {
      this.prevBtn.onclick = () => this.prevMonth();
    }
    if (this.nextBtn) {
      this.nextBtn.onclick = () => this.nextMonth();
    }

    // 6. オーバーレイクリックで閉じる
    if (this.modalEl) {
      this.modalEl.onclick = (e) => {
        if (e.target === this.modalEl) {
          this.close();
        }
      };
    }
  }

  // モーダルのDOM構造を動的作成
  createModalDOM() {
    if (document.getElementById('clinicHolidayModal')) return;

    const modalHTML = `
      <div id="clinicHolidayModal" class="modal-overlay">
        <div class="modal-container">
          
          <div class="modal-header">
            <div>
              <div class="modal-title">
                <span>📅</span> 医院 休診日 設定
              </div>
              <p class="modal-header-desc">
                💡 日付をクリックすると休診日（赤色）に切り替わります。曜日ボタンを押すと該当曜日が一括で休日になります。
              </p>
            </div>
            <button type="button" id="btnModalClose" class="modal-close-btn">&times;</button>
          </div>

          <div class="modal-body">
            <div class="modal-cal-card">
              <div class="modal-cal-header">
                <div class="modal-cal-title" id="modalCalTitle"></div>
                <div class="modal-cal-nav">
                  <button type="button" id="btnModalCalPrev" class="modal-cal-btn">&#9664;</button>
                  <button type="button" id="btnModalCalNext" class="modal-cal-btn">&#9654;</button>
                </div>
              </div>

              <!-- 曜日ボタンヘッダー -->
              <div class="modal-cal-weekdays" id="modalCalWeekdays"></div>

              <!-- 日付グリッド -->
              <div class="modal-cal-days" id="modalCalDays"></div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" id="btnModalFooterSave" class="modal-btn-primary">
              💾 保存してカレンダーに反映
            </button>
          </div>

        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }

  open() {
    this.currentDate = new Date();
    this.renderCalendar();
    if (this.modalEl) {
      this.modalEl.classList.add('show');
    }
  }

  close() {
    if (this.modalEl) {
      this.modalEl.classList.remove('show');
    }
    // メイン画面の2連カレンダーを再描画して休診日を反映
    if (window.dualCalendar) {
      window.dualCalendar.renderAll();
    }
  }

  // -------------------------------------------
  // モーダル内カレンダーの描画
  // -------------------------------------------
  renderCalendar() {
    const titleEl = document.getElementById('modalCalTitle');
    const weekdaysContainer = document.getElementById('modalCalWeekdays');
    const daysGrid = document.getElementById('modalCalDays');
    if (!daysGrid || !titleEl || !weekdaysContainer) return;

    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    titleEl.innerText = `${year}年 ${month + 1}月`;
    weekdaysContainer.innerHTML = '';
    daysGrid.innerHTML = '';

    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    // 1. 曜日ヘッダーボタン (日〜土)
    this.weekdays.forEach((dayName, dayIndex) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'modal-weekday-btn';
      btn.innerText = dayName;
      btn.title = `クリックで当月の全ての【${dayName}曜日】を一括設定/解除`;

      if (dayIndex === 0) btn.classList.add('sun');
      if (dayIndex === 6) btn.classList.add('sat');

      // 曜日クリック時の一括トグル
      btn.onclick = (e) => {
        e.preventDefault();
        this.toggleWeekdayHolidays(dayIndex, year, month, lastDate);
      };

      weekdaysContainer.appendChild(btn);
    });

    // 2. 空白セル（前月余白）
    for (let i = 0; i < firstDayIndex; i++) {
      const emptyCell = document.createElement('div');
      emptyCell.className = 'modal-cal-cell empty';
      daysGrid.appendChild(emptyCell);
    }

    // 3. 当月の日付セル
    for (let day = 1; day <= lastDate; day++) {
      const cell = document.createElement('div');
      cell.className = 'modal-cal-cell';
      cell.innerText = day;

      const dateObj = new Date(year, month, day);
      const dayOfWeek = dateObj.getDay();
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      if (dayOfWeek === 0) cell.classList.add('sun');
      if (dayOfWeek === 6) cell.classList.add('sat');

      // 今日ハイライト
      if (
        dateObj.getFullYear() === today.getFullYear() &&
        dateObj.getMonth() === today.getMonth() &&
        dateObj.getDate() === today.getDate()
      ) {
        cell.classList.add('today');
      }

      // 休診日判定
      if (window.dbManager && window.dbManager.isClinicClosed(dateStr)) {
        cell.classList.add('closed');
      }

      // 日付クリック時の即座な色反転（トグル）
      cell.onclick = (e) => {
        e.preventDefault();
        if (window.dbManager) {
          const isNowClosed = window.dbManager.toggleHoliday(dateStr);
          if (isNowClosed) {
            cell.classList.add('closed');
          } else {
            cell.classList.remove('closed');
          }
        }
      };

      daysGrid.appendChild(cell);
    }
  }

  // 曜日ボタンクリック時の一括トグル
  toggleWeekdayHolidays(dayOfWeek, year, month, lastDate) {
    if (!window.dbManager) return;

    const targetDates = [];
    for (let day = 1; day <= lastDate; day++) {
      const d = new Date(year, month, day);
      if (d.getDay() === dayOfWeek) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        targetDates.push(dateStr);
      }
    }

    const allClosed = targetDates.every(dateStr => window.dbManager.isClinicClosed(dateStr));

    if (allClosed) {
      targetDates.forEach(dateStr => window.dbManager.removeHoliday(dateStr));
    } else {
      targetDates.forEach(dateStr => window.dbManager.addHoliday(dateStr));
    }

    this.renderCalendar();
  }

  prevMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() - 1);
    this.renderCalendar();
  }

  nextMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() + 1);
    this.renderCalendar();
  }
}

// グローバルインスタンス
window.clinicHolidayModal = null;

document.addEventListener('DOMContentLoaded', () => {
  window.clinicHolidayModal = new ClinicHolidayModal();
});
