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
    this.legacyGridBlocksKey = 'naoru_dental_grid_blocks_db';

    // メモリキャッシュ（即時同期 & 高速アクセス）
    this.holidaysCache = new Set(['2026-09-21', '2026-09-22', '2026-09-23']);
    this.reservationsCache = [];
    this.staffCache = {};
    this.gridBlocksCache = []; // [{ id, date, time, unit }]

    this.isServerConnected = false;
    this._saveDebounceTimer = null;

    // 起動時の初期ロード（画面描画の安全性を確保）
    this.loadFromFallbackStorage();
  }

  // SQLiteエンジンの初期化
  async init() {
    try {
      if (typeof initSqlJs === 'function') {
        const SQL = await initSqlJs();
        let loadedDbBytes = null;

        // 1. まずローカルサーバー (/api/db) からの取得を試みる
        try {
          const res = await fetch('/api/db', { cache: 'no-store' });
          if (res.ok) {
            const buffer = await res.arrayBuffer();
            if (buffer && buffer.byteLength > 0) {
              loadedDbBytes = new Uint8Array(buffer);
              this.isServerConnected = true;
              console.log(`[Database] ローカルサーバーからDB読み込み成功 (${loadedDbBytes.byteLength} bytes)`);
            }
          } else if (res.status === 404) {
            this.isServerConnected = true;
            console.log('[Database] ローカルサーバー接続OK（DB未作成のため新規作成）');
          }
        } catch (serverErr) {
          console.warn('[Database] ローカルサーバー未接続（ブラウザ内保存モードで稼働）:', serverErr.message);
          this.isServerConnected = false;
        }

        // 2. サーバーから取得できなかった場合は localStorage を確認
        if (!loadedDbBytes) {
          const savedDb = localStorage.getItem(this.sqliteStorageKey);
          if (savedDb) {
            try {
              loadedDbBytes = new Uint8Array(JSON.parse(savedDb));
            } catch (e) {
              console.warn('[Database] LocalStorage SQLite復元失敗:', e);
            }
          }
        }

        // 3. SQLiteインスタンス作成
        if (loadedDbBytes) {
          try {
            this.db = new SQL.Database(loadedDbBytes);
          } catch (e) {
            console.warn('[Database] DBパース失敗、新規作成します:', e);
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
      console.error('[Database] SQLite初期化エラー:', e);
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

      // 4. グリッドブロック（予約不可枠）
      this.gridBlocksCache = [];
      const blockRes = this.db.exec(`SELECT id, date, time, unit FROM grid_blocks;`);
      if (blockRes.length > 0 && blockRes[0].values.length > 0) {
        const cols = blockRes[0].columns;
        blockRes[0].values.forEach(row => {
          const item = {};
          cols.forEach((col, idx) => { item[col] = row[idx]; });
          this.gridBlocksCache.push(item);
        });
      } else {
        const rawBlocks = localStorage.getItem(this.legacyGridBlocksKey);
        if (rawBlocks) {
          this.gridBlocksCache = JSON.parse(rawBlocks);
          const stmt = this.db.prepare(`INSERT OR REPLACE INTO grid_blocks (id, date, time, unit) VALUES (?, ?, ?, ?);`);
          this.gridBlocksCache.forEach(b => {
            stmt.run([b.id || `blk_${b.date}_${b.time}_${b.unit}`, b.date, b.time, b.unit]);
          });
          stmt.free();
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

      // グリッドブロックテーブル (予約不可枠)
      this.db.run(`
        CREATE TABLE IF NOT EXISTS grid_blocks (
          id TEXT PRIMARY KEY,
          date TEXT NOT NULL,
          time TEXT NOT NULL,
          unit TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(date, time, unit)
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



  // 永続化保存（サーバー & ローカル両方への安全保存）
  saveDatabase() {
    try {
      if (this.db) {
        const binaryArray = this.db.export();

        // 1. ローカルサーバーへの非同期同期（デバウンス処理）
        if (this.isServerConnected || window.location.protocol.startsWith('http')) {
          if (this._saveDebounceTimer) {
            clearTimeout(this._saveDebounceTimer);
          }
          this._saveDebounceTimer = setTimeout(async () => {
            try {
              const res = await fetch('/api/db', {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: binaryArray
              });
              if (res.ok) {
                this.isServerConnected = true;
              }
            } catch (postErr) {
              console.warn('[Database] サーバー保存一時失敗（次回リトライ）:', postErr.message);
            }
          }, 300);
        }

        // 2. ブラウザローカルストレージへのバックアップ保存
        try {
          localStorage.setItem(this.sqliteStorageKey, JSON.stringify(Array.from(binaryArray)));
        } catch (storageErr) {
          console.warn('[Database] LocalStorage 5MB上限または保存スキップ:', storageErr.message);
        }
      }

      // レガシーフォールバック保存
      localStorage.setItem(this.legacyHolidaysKey, JSON.stringify(Array.from(this.holidaysCache)));
      localStorage.setItem(this.legacyReservationKey, JSON.stringify(this.reservationsCache));
      localStorage.setItem(this.legacyStaffKey, JSON.stringify(this.staffCache));
      localStorage.setItem(this.legacyGridBlocksKey, JSON.stringify(this.gridBlocksCache));
    } catch (e) {
      console.error('[Database] Database save error:', e);
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
      const rawBlocks = localStorage.getItem(this.legacyGridBlocksKey);
      this.gridBlocksCache = rawBlocks ? JSON.parse(rawBlocks) : [];
    } catch (e) {
      this.holidaysCache = new Set(['2026-09-21', '2026-09-22', '2026-09-23']);
      this.reservationsCache = [];
      this.staffCache = {};
      this.gridBlocksCache = [];
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

  // 予約グループを削除
  deleteReservationGroup(reservationItems) {
    if (!reservationItems || reservationItems.length === 0) return false;
    const ids = reservationItems.map(r => r.id).filter(Boolean);
    this._deleteReservationsByIds(ids);
    this.saveDatabase();
    return true;
  }

  // 1件削除
  deleteReservation(date, time, unit) {
    const target = this.reservationsCache.find(r => r.date === date && r.time === time && r.unit === unit);
    if (target) {
      this._deleteReservationsByIds([target.id]);
      this.saveDatabase();
      return true;
    }
    return false;
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

  /* -------------------------------------------
     グリッドブロック (予約不可枠) 操作 (SQL & Cache)
  ------------------------------------------- */
  isSlotBlocked(dateStr, timeStr, unitStr) {
    if (!dateStr || !timeStr || !unitStr) return false;
    return this.gridBlocksCache.some(b => b.date === dateStr && b.time === timeStr && b.unit === unitStr);
  }

  getGridBlocksForDate(dateStr) {
    if (!dateStr) return [];
    return this.gridBlocksCache.filter(b => b.date === dateStr);
  }

  addGridBlock(dateStr, timeStr, unitStr) {
    if (!dateStr || !timeStr || !unitStr) return false;
    if (this.isSlotBlocked(dateStr, timeStr, unitStr)) return true;

    const blockId = `blk_${dateStr}_${timeStr}_${unitStr}`;
    const item = { id: blockId, date: dateStr, time: timeStr, unit: unitStr };

    if (this.db) {
      try {
        this.db.run(`INSERT OR REPLACE INTO grid_blocks (id, date, time, unit) VALUES (?, ?, ?, ?);`, [blockId, dateStr, timeStr, unitStr]);
      } catch (e) {
        console.error('addGridBlock SQL error:', e);
      }
    }

    this.gridBlocksCache.push(item);
    this.saveDatabase();
    return true;
  }

  removeGridBlock(dateStr, timeStr, unitStr) {
    if (!dateStr || !timeStr || !unitStr) return false;

    if (this.db) {
      try {
        this.db.run(`DELETE FROM grid_blocks WHERE date = ? AND time = ? AND unit = ?;`, [dateStr, timeStr, unitStr]);
      } catch (e) {
        console.error('removeGridBlock SQL error:', e);
      }
    }

    this.gridBlocksCache = this.gridBlocksCache.filter(b => !(b.date === dateStr && b.time === timeStr && b.unit === unitStr));
    this.saveDatabase();
    return true;
  }

  toggleGridBlock(dateStr, timeStr, unitStr) {
    if (this.isSlotBlocked(dateStr, timeStr, unitStr)) {
      this.removeGridBlock(dateStr, timeStr, unitStr);
      return false; // 解除された
    } else {
      this.addGridBlock(dateStr, timeStr, unitStr);
      return true; // ブロックされた
    }
  }

  addGridBlocksBatch(blocks) {
    if (!blocks || blocks.length === 0) return;
    if (this.db) {
      try {
        const stmt = this.db.prepare(`INSERT OR REPLACE INTO grid_blocks (id, date, time, unit) VALUES (?, ?, ?, ?);`);
        blocks.forEach(b => {
          const blockId = b.id || `blk_${b.date}_${b.time}_${b.unit}`;
          stmt.run([blockId, b.date, b.time, b.unit]);
        });
        stmt.free();
      } catch (e) {
        console.error('addGridBlocksBatch SQL error:', e);
      }
    }
    blocks.forEach(b => {
      if (!this.isSlotBlocked(b.date, b.time, b.unit)) {
        this.gridBlocksCache.push({
          id: b.id || `blk_${b.date}_${b.time}_${b.unit}`,
          date: b.date,
          time: b.time,
          unit: b.unit
        });
      }
    });
    this.saveDatabase();
  }

  removeGridBlocksBatch(blocks) {
    if (!blocks || blocks.length === 0) return;
    if (this.db) {
      try {
        const stmt = this.db.prepare(`DELETE FROM grid_blocks WHERE date = ? AND time = ? AND unit = ?;`);
        blocks.forEach(b => {
          stmt.run([b.date, b.time, b.unit]);
        });
        stmt.free();
      } catch (e) {
        console.error('removeGridBlocksBatch SQL error:', e);
      }
    }
    const blockKeys = new Set(blocks.map(b => `${b.date}_${b.time}_${b.unit}`));
    this.gridBlocksCache = this.gridBlocksCache.filter(b => !blockKeys.has(`${b.date}_${b.time}_${b.unit}`));
    this.saveDatabase();
  }
}

// グローバルインスタンス & 初期化
window.dbManager = new DentalDatabase();

document.addEventListener('DOMContentLoaded', async () => {
  await window.dbManager.init();
});
