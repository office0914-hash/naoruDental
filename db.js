// -------------------------------------------
// SQLite Database Manager (db.js)
// -------------------------------------------

class DentalDatabase {
  constructor() {
    this.db = null;
    this.isReady = false;
    this.storageKey = 'naoru_dental_holidays_db';
    this.reservationKey = 'naoru_dental_reservations_db';
    this.staffKey = 'naoru_dental_staff_db';
    
    // メモリ上のキャッシュ
    this.holidaysCache = new Set();
    this.reservationsCache = [];
    this.staffCache = {};
    
    this.loadFromStorage();
  }

  // 初期化
  async init() {
    try {
      if (typeof initSqlJs === 'function') {
        const SQL = await initSqlJs();

        const savedDb = localStorage.getItem('naoru_dental_sqlite_binary');
        if (savedDb) {
          const uInt8Array = new Uint8Array(JSON.parse(savedDb));
          this.db = new SQL.Database(uInt8Array);
        } else {
          this.db = new SQL.Database();
          this.createTables();
        }
        this.syncCacheToSqlite();
      }
    } catch (e) {
      console.warn('SQLiteの読み込みをスキップし、LocalStorageモードで動作します:', e);
    } finally {
      this.isReady = true;
    }
  }

  // LocalStorageから読み込み
  loadFromStorage() {
    try {
      const rawHolidays = localStorage.getItem(this.storageKey);
      if (rawHolidays) {
        this.holidaysCache = new Set(JSON.parse(rawHolidays));
      } else {
        this.holidaysCache = new Set(['2026-09-21', '2026-09-22', '2026-09-23']);
      }

      // 予約データを全消去（空にする）
      this.reservationsCache = [];
      localStorage.setItem(this.reservationKey, JSON.stringify([]));

      const rawStaff = localStorage.getItem(this.staffKey);
      if (rawStaff) {
        this.staffCache = JSON.parse(rawStaff);
      } else {
        this.staffCache = {};
      }
      this.saveToStorage();
    } catch (e) {
      this.holidaysCache = new Set(['2026-09-21', '2026-09-22', '2026-09-23']);
      this.reservationsCache = [];
      this.staffCache = {};
    }
  }

  // LocalStorageへ保存
  saveToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(Array.from(this.holidaysCache)));
      localStorage.setItem(this.reservationKey, JSON.stringify(this.reservationsCache));
      localStorage.setItem(this.staffKey, JSON.stringify(this.staffCache));

      if (this.db) {
        this.syncCacheToSqlite();
        const binaryArray = this.db.export();
        localStorage.setItem('naoru_dental_sqlite_binary', JSON.stringify(Array.from(binaryArray)));
      }
    } catch (e) {
      console.error('Storage save error:', e);
    }
  }

  // テーブル作成
  createTables() {
    if (!this.db) return;
    this.db.run(`
      CREATE TABLE IF NOT EXISTS clinic_holidays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE,
        reason TEXT DEFAULT '休診'
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS reservations (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        unit TEXT NOT NULL,
        patient_name TEXT NOT NULL,
        patient_phone TEXT,
        menu_name TEXT,
        status TEXT DEFAULT '確定',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  syncCacheToSqlite() {
    if (!this.db) return;
    try {
      this.createTables();
      this.db.run(`DELETE FROM clinic_holidays;`);
      this.holidaysCache.forEach(dateStr => {
        this.db.run(`INSERT OR REPLACE INTO clinic_holidays (date, reason) VALUES (?, '休診');`, [dateStr]);
      });
      this.db.run(`DELETE FROM reservations;`);
      this.reservationsCache.forEach(r => {
        this.db.run(`INSERT OR REPLACE INTO reservations (id, date, time, unit, patient_name, patient_phone, menu_name, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`, 
          [r.id, r.date, r.time, r.unit, r.patient_name || '', r.patient_phone || '', r.menu_name || '', r.status || '確定']);
      });
    } catch (e) {
      console.error('SQLite sync error:', e);
    }
  }

  /* -------------------------------------------
     休診日操作メソッド
  ------------------------------------------- */
  isClinicClosed(dateStr) {
    return this.holidaysCache.has(dateStr);
  }

  addHoliday(dateStr) {
    this.holidaysCache.add(dateStr);
    this.saveToStorage();
    return true;
  }

  removeHoliday(dateStr) {
    this.holidaysCache.delete(dateStr);
    this.saveToStorage();
    return true;
  }

  toggleHoliday(dateStr) {
    if (this.holidaysCache.has(dateStr)) {
      this.holidaysCache.delete(dateStr);
    } else {
      this.holidaysCache.add(dateStr);
    }
    this.saveToStorage();
    return this.holidaysCache.has(dateStr);
  }

  getHolidays() {
    return Array.from(this.holidaysCache).map(date => ({ date, reason: '休診' }));
  }

  /* -------------------------------------------
     予約操作メソッド
  ------------------------------------------- */
  getReservations() {
    return this.reservationsCache;
  }

  clearAllReservations() {
    this.reservationsCache = [];
    this.saveToStorage();
    if (window.reservationGrid) {
      window.reservationGrid.render();
    }
  }

  addReservation(id, date, time, unit, name, phone, menuName) {
    const item = {
      id: id || 'NR-' + Math.floor(1000 + Math.random() * 9000),
      date,
      time,
      unit,
      patient_name: name,
      patient_phone: phone,
      menu_name: menuName,
      status: '確定'
    };
    this.reservationsCache.push(item);
    this.saveToStorage();
    return item;
  }

  /* -------------------------------------------
     担当者操作メソッド（1行）
  ------------------------------------------- */
  getStaffAssignment(dateStr, unitId) {
    if (this.staffCache[dateStr]) {
      return this.staffCache[dateStr][unitId] || '';
    }
    return '';
  }

  setStaffAssignment(dateStr, unitId, name) {
    if (!this.staffCache[dateStr]) {
      this.staffCache[dateStr] = {};
    }
    this.staffCache[dateStr][unitId] = name;
    this.saveToStorage();
  }
}

// グローバルインスタンス
window.dbManager = new DentalDatabase();

document.addEventListener('DOMContentLoaded', async () => {
  await window.dbManager.init();
});
