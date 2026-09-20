// -------------------------------------------
// Dual Continuous Calendar Component (calendar.js)
// -------------------------------------------

class DualCalendarManager {
  constructor(topCalendarId, bottomCalendarId) {
    this.topContainer = document.getElementById(topCalendarId);
    this.bottomContainer = document.getElementById(bottomCalendarId);
    if (!this.topContainer || !this.bottomContainer) return;

    this.baseDate = new Date(); // Represents month for top calendar
    this.selectedDate = new Date(); // Currently selected date (shared)

    this.weekdays = ['日', '月', '火', '水', '木', '金', '土'];

    this.init();
  }

  init() {
    this.renderAll();
  }

  renderAll() {
    // Top calendar: Month N
    const topYear = this.baseDate.getFullYear();
    const topMonth = this.baseDate.getMonth();
    this.renderMonth(this.topContainer, topYear, topMonth);

    // Bottom calendar: Month N + 1 (Continuous)
    const bottomDate = new Date(topYear, topMonth + 1, 1);
    const bottomYear = bottomDate.getFullYear();
    const bottomMonth = bottomDate.getMonth();
    this.renderMonth(this.bottomContainer, bottomYear, bottomMonth);
  }

  renderMonth(container, year, month) {
    container.innerHTML = '';

    // 1. Header (Month title & Navigation buttons)
    const header = document.createElement('div');
    header.className = 'cal-header';

    const title = document.createElement('div');
    title.className = 'cal-title';
    title.innerText = `${year}年 ${month + 1}月`;
    title.title = 'クリックで今月に戻る';
    title.onclick = () => this.goToToday();

    const navButtons = document.createElement('div');
    navButtons.className = 'cal-nav-buttons';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'cal-nav-btn';
    prevBtn.innerHTML = '&#9664;';
    prevBtn.title = '前月';
    prevBtn.onclick = () => this.prevMonth();

    const nextBtn = document.createElement('button');
    nextBtn.className = 'cal-nav-btn';
    nextBtn.innerHTML = '&#9654;';
    nextBtn.title = '翌月';
    nextBtn.onclick = () => this.nextMonth();

    navButtons.appendChild(prevBtn);
    navButtons.appendChild(nextBtn);

    header.appendChild(title);
    header.appendChild(navButtons);
    container.appendChild(header);

    // 2. Weekdays Header
    const weekdaysRow = document.createElement('div');
    weekdaysRow.className = 'cal-weekdays';

    this.weekdays.forEach((day, index) => {
      const dayEl = document.createElement('div');
      dayEl.innerText = day;
      if (index === 0) dayEl.className = 'sun';
      if (index === 6) dayEl.className = 'sat';
      weekdaysRow.appendChild(dayEl);
    });

    container.appendChild(weekdaysRow);

    // 3. Days Grid
    const daysGrid = document.createElement('div');
    daysGrid.className = 'cal-days';

    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    // Empty cells before first day of current month
    for (let i = 0; i < firstDayIndex; i++) {
      const emptyCell = document.createElement('div');
      emptyCell.className = 'cal-cell empty';
      daysGrid.appendChild(emptyCell);
    }

    // Days of current month
    for (let day = 1; day <= lastDate; day++) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell';
      cell.innerText = day;

      const dateObj = new Date(year, month, day);
      const dayOfWeek = dateObj.getDay();
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      // 休診日チェック
      const isHoliday = window.dbManager ? window.dbManager.isClinicClosed(dateStr) : false;

      if (isHoliday) {
        cell.classList.add('holiday');
        cell.title = '休診日';
      }

      if (dayOfWeek === 0 || isHoliday) {
        cell.classList.add('sun');
      } else if (dayOfWeek === 6) {
        cell.classList.add('sat');
      }

      // Check if today
      if (
        dateObj.getFullYear() === today.getFullYear() &&
        dateObj.getMonth() === today.getMonth() &&
        dateObj.getDate() === today.getDate()
      ) {
        cell.classList.add('today');
      }

      // Check if selected (休診日は選択状態にしない)
      if (
        !isHoliday &&
        this.selectedDate &&
        dateObj.getFullYear() === this.selectedDate.getFullYear() &&
        dateObj.getMonth() === this.selectedDate.getMonth() &&
        dateObj.getDate() === this.selectedDate.getDate()
      ) {
        cell.classList.add('selected');
      }

      // Click handler (休診日は選択不可)
      if (!isHoliday) {
        cell.onclick = () => {
          this.selectedDate = new Date(year, month, day);
          this.renderAll();
          this.onDateSelected(this.selectedDate);
        };
      }

      daysGrid.appendChild(cell);
    }

    // Empty cells after last date to complete row
    const totalCellsFilled = firstDayIndex + lastDate;
    const remainingCells = (totalCellsFilled % 7 === 0) ? 0 : 7 - (totalCellsFilled % 7);

    for (let i = 0; i < remainingCells; i++) {
      const emptyCell = document.createElement('div');
      emptyCell.className = 'cal-cell empty';
      daysGrid.appendChild(emptyCell);
    }

    container.appendChild(daysGrid);
  }

  prevMonth() {
    this.baseDate.setMonth(this.baseDate.getMonth() - 1);
    this.renderAll();
  }

  nextMonth() {
    this.baseDate.setMonth(this.baseDate.getMonth() + 1);
    this.renderAll();
  }

  goToToday() {
    this.baseDate = new Date();
    this.selectedDate = new Date();
    this.renderAll();
    this.onDateSelected(this.selectedDate);
  }

  onDateSelected(date) {
    const formatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    console.log('Selected date:', formatted);
    
    // 中央の予約グリッドと連動
    if (window.reservationGrid) {
      window.reservationGrid.setDate(date);
    }
  }
}

// Global instance & Initialize on DOM load
window.dualCalendar = null;
document.addEventListener('DOMContentLoaded', () => {
  window.dualCalendar = new DualCalendarManager('calendar', 'calendar-next');
});
