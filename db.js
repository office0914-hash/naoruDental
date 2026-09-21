// -------------------------------------------
// SQLite Database Manager (db.js)
// なおる歯科 - SQLite (sql.js) & LocalStorage 永続化
// -------------------------------------------

class DentalDatabase {
  constructor() {
    this.db = null;
    this.isReady = false;
    this.sqliteStorageKey = 'naoru_dental_sqlite_binary';
    
    // フォールバック用キー
    this.legacyHolidaysKey = 'naoru_dental_holidays_db';
    this.legacyReservationKey = 'naoru_dental_reservations_db';
    this.legacyStaffKey = 'naoru_dental_staff_db';

    // メモリキャッシュ（即時同期 & 高速アクセス）
    this.holidaysCache = new Set(['2026-09-21', '2026-09-22', '2026-09-23']);
    this.reservationsCache = [];
    this.staffCache = {};

    // 起動時の初期ロード（画面描画の安全性を確保）
    this.loadFromFallbackStorage();
  }

  // SQLiteエンジンの初期化
  async init() {
    try {
      if (typeof initSqlJs === 'function') {
        const SQL = await initSqlJs();
        const savedDb = localStorage.getItem(this.sqliteStorageKey);

        if (savedDb) {
          try {
            const uInt8Array = new Uint8Array(JSON.parse(savedDb));
            this.db = new SQL.Database(uInt8Array);
          } catch (e) {
            console.warn('SQLite復元失敗、新規DBを作成します:', e);
            this.db = new SQL.Database();
          }
        } else {
          this.db = new SQL.Database();
        }

        this.createTables();
        this.seedInitialData();
        this.syncAndLoadData();
      } else {
        this.loadFromFallbackStorage();
      }
    } catch (e) {
      console.error('SQLite初期化エラー:', e);
      this.loadFromFallbackStorage();
    } finally {
      this.isReady = true;
      this.saveDatabase();
      this.notifyRenderers();
    }
  }

  // SQLiteとLocalStorageの完全同期・安全ロード
  syncAndLoadData() {
    if (!this.db) {
      this.loadFromFallbackStorage();
      return;
    }

    try {
      // 1. 休診日
      this.holidaysCache.clear();
      const holidayRes = this.db.exec(`SELECT date FROM clinic_holidays ORDER BY date ASC;`);
      if (holidayRes.length > 0 && holidayRes[0].values.length > 0) {
        holidayRes[0].values.forEach(row => this.holidaysCache.add(row[0]));
      } else {
        // SQLiteに休診日がない場合、LocalStorageから復元
        const rawHolidays = localStorage.getItem(this.legacyHolidaysKey);
        if (rawHolidays) {
          const arr = JSON.parse(rawHolidays);
          arr.forEach(d => {
            this.holidaysCache.add(d);
            this.db.run(`INSERT OR IGNORE INTO clinic_holidays (date, reason) VALUES (?, '休診');`, [d]);
          });
        }
      }

      // 2. 予約データの安全同期
      const resRes = this.db.exec(`SELECT id, date, time, unit, chart_no, patient_name, patient_phone, menu_name, status FROM reservations;`);
      const sqliteReservations = [];
      if (resRes.length > 0 && resRes[0].values.length > 0) {
        const cols = resRes[0].columns;
        resRes[0].values.forEach(row => {
          const item = {};
          cols.forEach((col, idx) => { item[col] = row[idx]; });
          sqliteReservations.push(item);
        });
      }

      // LocalStorage側のバックアップを確認
      const rawRes = localStorage.getItem(this.legacyReservationKey);
      const fallbackReservations = rawRes ? JSON.parse(rawRes) : [];

      if (sqliteReservations.length === 0 && fallbackReservations.length > 0) {
        // SQLiteが空でLocalStorageにデータがある場合、全データをSQLiteへ救出・インポート
        console.log(`LocalStorageから既存予約 ${fallbackReservations.length} 件をSQLiteへインポートします`);
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO reservations 
          (id, date, time, unit, chart_no, patient_name, patient_phone, menu_name, status) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        `);
        fallbackReservations.forEach(item => {
          stmt.run([
            item.id || 'NR-' + Math.floor(1000 + Math.random() * 9000),
            item.date, item.time, item.unit,
            item.chart_no || '', item.patient_name || item.name || '',
            item.patient_phone || item.phone || '',
            item.menu_name || '', item.status || '確定'
          ]);
        });
        stmt.free();
        this.reservationsCache = fallbackReservations;
      } else {
        this.reservationsCache = sqliteReservations;
      }

      // 3. 担当スタッフ
      this.staffCache = {};
      const staffRes = this.db.exec(`SELECT date, unit_id, staff_name FROM staff_assignments;`);
      if (staffRes.length > 0 && staffRes[0].values.length > 0) {
        staffRes[0].values.forEach(row => {
          const d = row[0];
          const u = row[1];
          const name = row[2];
          if (!this.staffCache[d]) this.staffCache[d] = {};
          this.staffCache[d][u] = name;
        });
      } else {
        const rawStaff = localStorage.getItem(this.legacyStaffKey);
        if (rawStaff) {
          this.staffCache = JSON.parse(rawStaff);
          Object.keys(this.staffCache).forEach(d => {
            Object.keys(this.staffCache[d]).forEach(u => {
              this.db.run(`INSERT OR REPLACE INTO staff_assignments (date, unit_id, staff_name) VALUES (?, ?, ?);`, [d, u, this.staffCache[d][u]]);
            });
          });
        }
      }
    } catch (e) {
      console.error('syncAndLoadData error:', e);
      this.loadFromFallbackStorage();
    }
  }

  // テーブル定義
  createTables() {
    if (!this.db) return;
    try {
      // 休診日テーブル
      this.db.run(`
        CREATE TABLE IF NOT EXISTS clinic_holidays (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL UNIQUE,
          reason TEXT DEFAULT '休診',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 予約テーブル
      this.db.run(`
        CREATE TABLE IF NOT EXISTS reservations (
          id TEXT PRIMARY KEY,
          date TEXT NOT NULL,
          time TEXT NOT NULL,
          unit TEXT NOT NULL,
          chart_no TEXT,
          patient_name TEXT NOT NULL,
          patient_phone TEXT,
          menu_name TEXT,
          status TEXT DEFAULT '確定',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 担当スタッフテーブル
      this.db.run(`
        CREATE TABLE IF NOT EXISTS staff_assignments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          unit_id TEXT NOT NULL,
          staff_name TEXT NOT NULL,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(date, unit_id)
        );
      `);

      // 既存DBとの差分マイグレーション（カラム追加等）
      this.migrateTables();
    } catch (e) {
      console.error('テーブル作成エラー:', e);
    }
  }

  // スキーママイグレーション
  migrateTables() {
    if (!this.db) return;
    try {
      // reservations テーブルの既存カラム確認
      const res = this.db.exec(`PRAGMA table_info(reservations);`);
      if (res.length > 0 && res[0].values) {
        const existingColumns = res[0].values.map(col => col[1]);
        if (!existingColumns.includes('chart_no')) {
          this.db.run(`ALTER TABLE reservations ADD COLUMN chart_no TEXT;`);
          console.log('マイグレーション完了: reservations テーブルに chart_no カラムを追加しました');
        }
        if (!existingColumns.includes('patient_phone')) {
          this.db.run(`ALTER TABLE reservations ADD COLUMN patient_phone TEXT;`);
        }
        if (!existingColumns.includes('menu_name')) {
          this.db.run(`ALTER TABLE reservations ADD COLUMN menu_name TEXT;`);
        }
        if (!existingColumns.includes('status')) {
          this.db.run(`ALTER TABLE reservations ADD COLUMN status TEXT DEFAULT '確定';`);
        }
      }
    } catch (e) {
      console.error('マイグレーション実行エラー:', e);
    }
  }

  // 初期データ投入
  seedInitialData() {
    if (!this.db) return;
    try {
      const res = this.db.exec(`SELECT COUNT(*) FROM clinic_holidays;`);
      const count = (res.length > 0 && res[0].values.length > 0) ? res[0].values[0][0] : 0;

      if (count === 0) {
        const initialHolidays = ['2026-09-21', '2026-09-22', '2026-09-23'];
        const stmt = this.db.prepare(`INSERT OR IGNORE INTO clinic_holidays (date, reason) VALUES (?, '休診');`);
        initialHolidays.forEach(d => stmt.run([d]));
        stmt.free();
      }
    } catch (e) {
      console.error('初期データ投入エラー:', e);
    }
  }



  // 永続化保存
  saveDatabase() {
    try {
      if (this.db) {
        const binaryArray = this.db.export();
        localStorage.setItem(this.sqliteStorageKey, JSON.stringify(Array.from(binaryArray)));
      }
      localStorage.setItem(this.legacyHolidaysKey, JSON.stringify(Array.from(this.holidaysCache)));
      localStorage.setItem(this.legacyReservationKey, JSON.stringify(this.reservationsCache));
      localStorage.setItem(this.legacyStaffKey, JSON.stringify(this.staffCache));
    } catch (e) {
      console.error('Database save error:', e);
    }
  }

  saveToStorage() {
    this.saveDatabase();
  }

  // フォールバック読み込み
  loadFromFallbackStorage() {
    try {
      const rawHolidays = localStorage.getItem(this.legacyHolidaysKey);
      this.holidaysCache = rawHolidays ? new Set(JSON.parse(rawHolidays)) : new Set(['2026-09-21', '2026-09-22', '2026-09-23']);
      const rawRes = localStorage.getItem(this.legacyReservationKey);
      this.reservationsCache = rawRes ? JSON.parse(rawRes) : [];
      const rawStaff = localStorage.getItem(this.legacyStaffKey);
      this.staffCache = rawStaff ? JSON.parse(rawStaff) : {};
    } catch (e) {
      this.holidaysCache = new Set(['2026-09-21', '2026-09-22', '2026-09-23']);
      this.reservationsCache = [];
      this.staffCache = {};
    }
  }

  // 描画コンポーネントへの更新通知
  notifyRenderers() {
    try {
      if (window.reservationGrid && typeof window.reservationGrid.render === 'function') {
        window.reservationGrid.render();
      }
      if (window.dualCalendar && typeof window.dualCalendar.renderAll === 'function') {
        window.dualCalendar.renderAll();
      }
    } catch (e) {}
  }

  /* -------------------------------------------
     休診日操作 (SQL)
  ------------------------------------------- */
  isClinicClosed(dateStr) {
    if (this.db) {
      try {
        const stmt = this.db.prepare(`SELECT date FROM clinic_holidays WHERE date = ?;`);
        stmt.bind([dateStr]);
        const hasRow = stmt.step();
        stmt.free();
        return hasRow;
      } catch (e) {
        return this.holidaysCache.has(dateStr);
      }
    }
    return this.holidaysCache.has(dateStr);
  }

  addHoliday(dateStr, reason = '休診') {
    if (this.db) {
      try {
        this.db.run(`INSERT OR REPLACE INTO clinic_holidays (date, reason) VALUES (?, ?);`, [dateStr, reason]);
      } catch (e) {
        console.error('addHoliday error:', e);
      }
    }
    this.holidaysCache.add(dateStr);
    this.saveDatabase();
    return true;
  }

  removeHoliday(dateStr) {
    if (this.db) {
      try {
        this.db.run(`DELETE FROM clinic_holidays WHERE date = ?;`, [dateStr]);
      } catch (e) {
        console.error('removeHoliday error:', e);
      }
    }
    this.holidaysCache.delete(dateStr);
    this.saveDatabase();
    return true;
  }

  toggleHoliday(dateStr, reason = '休診') {
    if (this.isClinicClosed(dateStr)) {
      this.removeHoliday(dateStr);
      return false;
    } else {
      this.addHoliday(dateStr, reason);
      return true;
    }
  }

  getHolidays() {
    if (this.db) {
      try {
        const res = this.db.exec(`SELECT date, reason FROM clinic_holidays ORDER BY date ASC;`);
        if (res.length > 0) {
          return res[0].values.map(row => ({ date: row[0], reason: row[1] }));
        }
        return [];
      } catch (e) {
        console.error('getHolidays error:', e);
      }
    }
    return Array.from(this.holidaysCache).map(date => ({ date, reason: '休診' }));
  }

  /* -------------------------------------------
     予約操作 (SQL & Cache)
  ------------------------------------------- */
  getReservations() {
    if (this.db) {
      try {
        const res = this.db.exec(`SELECT id, date, time, unit, chart_no, patient_name, patient_phone, menu_name, status FROM reservations;`);
        if (res.length > 0) {
          const cols = res[0].columns;
          return res[0].values.map(row => {
            const item = {};
            cols.forEach((col, idx) => { item[col] = row[idx]; });
            return item;
          });
        }
        return [];
      } catch (e) {
        console.error('getReservations error:', e);
      }
    }
    return this.reservationsCache || [];
  }

  clearAllReservations() {
    if (this.db) {
      try {
        this.db.run(`DELETE FROM reservations;`);
      } catch (e) {}
    }
    this.reservationsCache = [];
    this.saveDatabase();
    if (window.reservationGrid) {
      window.reservationGrid.render();
    }
  }

  // 内部ヘルパー: 予約アイテムオブジェクト生成
  _createReservationItem({ id, date, time, unit, patient_name, name, patient_phone, phone, menu_name, menuName, chart_no, chartNo, status }) {
    return {
      id: id || 'NR-' + Math.floor(1000 + Math.random() * 9000),
      date: date || '',
      time: time || '',
      unit: unit || '',
      chart_no: chart_no || chartNo || '',
      patient_name: patient_name || name || '',
      patient_phone: patient_phone || phone || '',
      menu_name: menu_name || menuName || '',
      status: status || '確定'
    };
  }

  // 内部ヘルパー: SQLite & メモリキャッシュから指定ID群を一括削除
  _deleteReservationsByIds(ids) {
    if (!ids || ids.length === 0) return;
    if (this.db) {
      try {
        const placeholders = ids.map(() => '?').join(',');
        this.db.run(`DELETE FROM reservations WHERE id IN (${placeholders});`, ids);
      } catch (e) {
        console.error('_deleteReservationsByIds error:', e);
      }
    }
    this.reservationsCache = this.reservationsCache.filter(r => !ids.includes(r.id));
  }

  // 内部ヘルパー: 複数予約アイテムをSQLite & メモリキャッシュへ一括保存
  _saveReservationItems(items) {
    if (!items || items.length === 0) return;
    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO reservations 
          (id, date, time, unit, chart_no, patient_name, patient_phone, menu_name, status) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        `);
        items.forEach(item => {
          stmt.run([
            item.id, item.date, item.time, item.unit,
            item.chart_no, item.patient_name, item.patient_phone,
            item.menu_name, item.status
          ]);
        });
        stmt.free();
      } catch (e) {
        console.error('_saveReservationItems error:', e);
      }
    }
    this.reservationsCache.push(...items);
    this.saveDatabase();
  }

  // 1件追加
  addReservation(id, date, time, unit, name, phone, menuName, chartNo) {
    const item = this._createReservationItem({ id, date, time, unit, name, phone, menuName, chartNo });
    this._saveReservationItems([item]);
    return item;
  }

  // 予約グループを別のユニット（チェア）へ移動
  moveReservationGroup(reservationItems, targetUnit) {
    if (!reservationItems || reservationItems.length === 0 || !targetUnit) return false;

    this._deleteReservationsByIds(reservationItems.map(r => r.id));

    const newItems = reservationItems.map(r => this._createReservationItem({
      ...r,
      id: null,
      unit: targetUnit
    }));

    this._saveReservationItems(newItems);
    return true;
  }

  // 予約グループを別のユニットおよび別の時間帯へ移動
  moveReservationGroupToSlot(reservationItems, targetUnit, targetSlotTimes) {
    if (!reservationItems || reservationItems.length === 0 || !targetUnit || !targetSlotTimes || targetSlotTimes.length === 0) return false;

    const sortedItems = [...reservationItems].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    this._deleteReservationsByIds(sortedItems.map(r => r.id));

    const newItems = sortedItems.map((r, idx) => this._createReservationItem({
      ...r,
      id: null,
      time: targetSlotTimes[idx] || targetSlotTimes[0],
      unit: targetUnit
    }));

    this._saveReservationItems(newItems);
    return true;
  }

  // 同じ時間帯・同じ枠の長さの予約グループ同士を入れ替える（スワップ）
  swapReservationGroups(sourceItems, targetItems, sourceUnit, targetUnit) {
    if (!sourceItems || !targetItems || !sourceUnit || !targetUnit) return false;

    const allIds = [...sourceItems.map(r => r.id), ...targetItems.map(r => r.id)];
    this._deleteReservationsByIds(allIds);

    const newSourceItems = sourceItems.map(r => this._createReservationItem({
      ...r,
      id: null,
      unit: targetUnit
    }));

    const newTargetItems = targetItems.map(r => this._createReservationItem({
      ...r,
      id: null,
      unit: sourceUnit
    }));

    this._saveReservationItems([...newSourceItems, ...newTargetItems]);
    return true;
  }

  getStaffAssignment(dateStr, unitId) {
    if (this.db) {
      try {
        const stmt = this.db.prepare(`SELECT staff_name FROM staff_assignments WHERE date = ? AND unit_id = ?;`);
        stmt.bind([dateStr, unitId]);
        if (stmt.step()) {
          const row = stmt.get();
          stmt.free();
          return row[0] || '';
        }
        stmt.free();
        return '';
      } catch (e) {
        console.error('getStaffAssignment error:', e);
      }
    }
    return (this.staffCache[dateStr] && this.staffCache[dateStr][unitId]) || '';
  }

  setStaffAssignment(dateStr, unitId, name) {
    if (this.db) {
      try {
        this.db.run(`
          INSERT OR REPLACE INTO staff_assignments (date, unit_id, staff_name, updated_at) 
          VALUES (?, ?, ?, CURRENT_TIMESTAMP);
        `, [dateStr, unitId, name]);
      } catch (e) {
        console.error('setStaffAssignment error:', e);
      }
    }

    if (!this.staffCache[dateStr]) {
      this.staffCache[dateStr] = {};
    }
    this.staffCache[dateStr][unitId] = name;
    this.saveDatabase();
  }
}

// グローバルインスタンス & 初期化
window.dbManager = new DentalDatabase();

document.addEventListener('DOMContentLoaded', async () => {
  await window.dbManager.init();
});
