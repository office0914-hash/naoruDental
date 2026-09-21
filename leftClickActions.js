// ===================================================
// Left Click Actions Manager (leftClickActions.js)
// なおる歯科 - 予約カード左クリック アクションメニュー
// ===================================================

class LeftClickActions {
  constructor() {
    this.menuEl = null;
    this.backdropEl = null;
    this.cancelModalEl = null;

    this.currentBookingData = null;
    this.currentCellEl = null;

    // キャンセル対象の一時保持
    this.cancelTargetData = null;
    this.cancelTargetCell = null;

    // ドラッグ＆ドロップ競合防止用
    this.mouseDownPos = { x: 0, y: 0 };
    this.isDragOccurred = false;

    this.init();
  }

  init() {
    this.createMenuDOM();
    this.createCancelModalDOM();
    this.bindEvents();
  }

  // -------------------------------------------
  // 1. DOM生成
  // -------------------------------------------

  // 4項目ポップアップメニュー
  createMenuDOM() {
    if (document.getElementById('lcaPopupMenu')) {
      this.menuEl = document.getElementById('lcaPopupMenu');
      this.backdropEl = document.getElementById('lcaBackdrop');
      return;
    }

    // バックドロップ (外側クリックで閉じる透明オーバーレイ)
    const backdrop = document.createElement('div');
    backdrop.id = 'lcaBackdrop';
    backdrop.className = 'lca-backdrop';
    document.body.appendChild(backdrop);
    this.backdropEl = backdrop;

    // ポップアップメニュー本体
    const menu = document.createElement('div');
    menu.id = 'lcaPopupMenu';
    menu.className = 'lca-popup-menu';
    menu.innerHTML = `
      <div class="lca-menu-header" id="lcaMenuHeader">
        <div class="lca-header-patient">
          <span class="lca-header-chart" id="lcaHeaderChart">No.---</span>
          <span id="lcaHeaderName">患者氏名</span>
        </div>
        <div class="lca-header-time-info">
          <span class="lca-header-unit-badge" id="lcaHeaderUnit">チェア1</span>
          <span id="lcaHeaderTime">09:00 〜 09:30</span>
        </div>
      </div>

      <div class="lca-menu-list">
        <!-- 1. 新規予約 -->
        <button type="button" class="lca-menu-item lca-item-new" data-action="new">
          <span class="lca-item-icon">➕</span>
          <span class="lca-item-label">新規予約</span>
          <span class="lca-item-arrow">›</span>
        </button>

        <!-- 2. 日時変更 -->
        <button type="button" class="lca-menu-item lca-item-datetime" data-action="datetime">
          <span class="lca-item-icon">📅</span>
          <span class="lca-item-label">日時変更</span>
          <span class="lca-item-arrow">›</span>
        </button>

        <!-- 3. 内容変更 -->
        <button type="button" class="lca-menu-item lca-item-edit" data-action="edit">
          <span class="lca-item-icon">✏️</span>
          <span class="lca-item-label">内容変更</span>
          <span class="lca-item-arrow">›</span>
        </button>

        <!-- 4. キャンセル -->
        <button type="button" class="lca-menu-item lca-item-cancel" data-action="cancel">
          <span class="lca-item-icon">✕</span>
          <span class="lca-item-label">キャンセル</span>
          <span class="lca-item-arrow">›</span>
        </button>
      </div>
    `;

    document.body.appendChild(menu);
    this.menuEl = menu;
  }

  // キャンセル確認モーダルダイアログ
  createCancelModalDOM() {
    if (document.getElementById('lcaCancelModalOverlay')) {
      this.cancelModalEl = document.getElementById('lcaCancelModalOverlay');
      return;
    }

    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'lcaCancelModalOverlay';
    modalOverlay.className = 'lca-cancel-modal-overlay';
    modalOverlay.innerHTML = `
      <div class="lca-cancel-modal-container" role="dialog" aria-modal="true">
        <div class="lca-cancel-modal-header">
          <div class="lca-cancel-icon-circle">✕</div>
          <div class="lca-cancel-modal-title">予約キャンセルの確認</div>
        </div>
        <div class="lca-cancel-main-msg">以下の予約をキャンセルしてもよろしいですか？</div>
        <div class="lca-cancel-target-card">
          <div class="lca-cancel-patient-row">
            <span class="lca-cancel-chart-badge" id="lcaCancelChart">---</span>
            <span class="lca-cancel-patient-name" id="lcaCancelPatient">患者名</span>
          </div>
          <div class="lca-cancel-detail-row">
            <span class="lca-cancel-unit-badge" id="lcaCancelUnit">チェア1</span>
            <span id="lcaCancelDateTime">
              <span class="lca-cancel-date">2026年9月21日</span>
              <span class="lca-cancel-time">09:00 〜 (30分)</span>
            </span>
          </div>
        </div>
        <div class="lca-cancel-modal-footer">
          <button type="button" class="lca-btn-no" id="lcaBtnCancelNo">いいえ</button>
          <button type="button" class="lca-btn-yes" id="lcaBtnCancelYes">はい</button>
        </div>
      </div>
    `;

    document.body.appendChild(modalOverlay);
    this.cancelModalEl = modalOverlay;
  }

  // -------------------------------------------
  // 2. イベント登録
  // -------------------------------------------

  bindEvents() {
    // バックドロップクリックでメニューを閉じる
    if (this.backdropEl) {
      this.backdropEl.addEventListener('click', () => this.hideMenu());
    }

    // ESCキーでモーダルまたはメニューを閉じる
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.cancelModalEl && this.cancelModalEl.classList.contains('active')) {
          this.hideCancelModal();
        } else {
          this.hideMenu();
        }
      }
    });

    // キャンセルモーダルのボタン＆背景クリックイベント
    if (this.cancelModalEl) {
      const btnNo = this.cancelModalEl.querySelector('#lcaBtnCancelNo');
      const btnYes = this.cancelModalEl.querySelector('#lcaBtnCancelYes');

      // 「いいえ」ボタン：警告メッセージを消して、何もしない
      if (btnNo) {
        btnNo.addEventListener('click', (e) => {
          e.stopPropagation();
          this.hideCancelModal();
        });
      }

      // 「はい」ボタン：少しずつ薄くなって消えるアニメーションを実行後、カード削除
      if (btnYes) {
        btnYes.addEventListener('click', (e) => {
          e.stopPropagation();
          this.confirmCancelAppointment();
        });
      }

      // オーバーレイ外枠クリックで閉じる（キャンセル）
      this.cancelModalEl.addEventListener('click', (e) => {
        if (e.target === this.cancelModalEl) {
          this.hideCancelModal();
        }
      });
    }

    // ドラッグ＆ドロップとの競合判定（マウス移動距離を測定）
    document.addEventListener('mousedown', (e) => {
      this.mouseDownPos = { x: e.clientX, y: e.clientY };
      this.isDragOccurred = false;
    }, true);

    document.addEventListener('dragstart', () => {
      this.isDragOccurred = true;
      this.hideMenu();
    }, true);

    // 予約カード（.grid-slot-cell.booked）の左クリックを検知
    document.addEventListener('click', (e) => {
      // メニュー内やモーダル内クリックは除外
      if (this.menuEl && this.menuEl.contains(e.target)) return;
      if (this.cancelModalEl && this.cancelModalEl.contains(e.target)) return;

      // 移動量が大きい場合（ドラッグ後のクリック誤爆防止）
      const dx = Math.abs(e.clientX - this.mouseDownPos.x);
      const dy = Math.abs(e.clientY - this.mouseDownPos.y);
      if (dx > 5 || dy > 5 || this.isDragOccurred) {
        return;
      }

      const bookedCell = e.target.closest('.grid-slot-cell.booked');
      if (bookedCell) {
        e.preventDefault();
        e.stopPropagation();
        this.openForCell(bookedCell, e.clientX, e.clientY);
      } else {
        this.hideMenu();
      }
    });

    // メニュー項目クリックイベント
    if (this.menuEl) {
      this.menuEl.addEventListener('click', (e) => {
        const itemBtn = e.target.closest('.lca-menu-item');
        if (!itemBtn) return;
        const action = itemBtn.dataset.action;
        this.handleActionClick(action);
      });
    }
  }

  // -------------------------------------------
  // 3. メニュー表示 & 位置計算
  // -------------------------------------------

  openForCell(cellEl, mouseX, mouseY) {
    this.currentCellEl = cellEl;
    this.currentBookingData = this.extractBookingData(cellEl);

    // ヘッダー情報の更新（敬称なし）
    const chartNoEl = document.getElementById('lcaHeaderChart');
    const nameEl = document.getElementById('lcaHeaderName');
    const unitEl = document.getElementById('lcaHeaderUnit');
    const timeEl = document.getElementById('lcaHeaderTime');

    if (chartNoEl) chartNoEl.innerText = this.currentBookingData.chartNo ? `No.${this.currentBookingData.chartNo}` : 'カルテ無';
    if (nameEl) nameEl.innerText = this.currentBookingData.patientName;
    if (unitEl) unitEl.innerText = this.currentBookingData.unit || 'チェア';
    if (timeEl) timeEl.innerText = `${this.currentBookingData.time}〜 (${this.currentBookingData.durationMin || 30}分)`;

    // 位置計算
    this.positionMenu(cellEl, mouseX, mouseY);

    // 表示アニメーション
    if (this.backdropEl) this.backdropEl.classList.add('active');
    if (this.menuEl) this.menuEl.classList.add('active');
  }

  positionMenu(cellEl, mouseX, mouseY) {
    const rect = cellEl.getBoundingClientRect();
    const menuWidth = 230;
    const menuHeight = 240;

    let posX = rect.right + 6;
    let posY = rect.top;

    if (posX + menuWidth > window.innerWidth - 10) {
      posX = rect.left - menuWidth - 6;
    }
    if (posX < 10) {
      posX = Math.max(10, Math.min(window.innerWidth - menuWidth - 10, mouseX));
    }
    if (posY + menuHeight > window.innerHeight - 10) {
      posY = Math.max(10, window.innerHeight - menuHeight - 10);
    }

    this.menuEl.style.left = `${Math.round(posX)}px`;
    this.menuEl.style.top = `${Math.round(posY)}px`;
  }

  hideMenu() {
    if (this.backdropEl) this.backdropEl.classList.remove('active');
    if (this.menuEl) this.menuEl.classList.remove('active');
    this.currentBookingData = null;
    this.currentCellEl = null;
  }

  // -------------------------------------------
  // 4. 予約データの抽出
  // -------------------------------------------

  extractBookingData(cellEl) {
    const dateStr = cellEl.dataset.date || '';
    const timeStr = cellEl.dataset.time || '';
    const unitStr = cellEl.dataset.unit || '';
    const groupId = cellEl.dataset.bookingGroup || '';

    // グループ内の先頭セル（表示カードが存在するセル）を探す
    let targetCardCell = cellEl;
    if (groupId) {
      const container = document.getElementById('reservationGrid') || document;
      const topCell = container.querySelector(`.grid-slot-cell[data-booking-group="${groupId}"].booked-top`);
      if (topCell) {
        targetCardCell = topCell;
      } else {
        const firstCell = container.querySelector(`.grid-slot-cell[data-booking-group="${groupId}"]`);
        if (firstCell) targetCardCell = firstCell;
      }
    }

    // DOMからテキストを抽出（reservationGrid.js のクラス名に対応）
    let chartNo = '';
    let patientName = '';
    let treatment = '';

    const chartNoEl = targetCardCell.querySelector('.booked-chart-no, .patient-chart-no');
    const nameEl = targetCardCell.querySelector('.booked-patient-name, .patient-name');
    const treatEl = targetCardCell.querySelector('.booked-treatment, .patient-treatment');

    if (chartNoEl) chartNo = chartNoEl.innerText.trim();
    if (nameEl) patientName = nameEl.innerText.trim();
    if (treatEl) treatment = treatEl.innerText.trim();

    // グループ化されているセルの個数（所要時間計算用）
    let slotCount = 1;
    if (groupId) {
      const container = document.getElementById('reservationGrid');
      if (container) {
        const groupCells = container.querySelectorAll(`[data-booking-group="${groupId}"]`);
        if (groupCells.length > 0) {
          slotCount = groupCells.length;
        }
      }
    }

    // window.dbManager がある場合は詳細オブジェクトを取得して補完
    let dbBooking = null;
    if (window.dbManager && typeof window.dbManager.getReservations === 'function') {
      const allRes = window.dbManager.getReservations() || [];
      dbBooking = allRes.find(r => r.date === dateStr && r.time === timeStr && (r.unit === unitStr || r.group_id === groupId));
      if (!dbBooking && groupId) {
        dbBooking = allRes.find(r => r.date === dateStr && (r.unit === unitStr || r.group_id === groupId));
      }
    }

    if (dbBooking) {
      if (!patientName) patientName = dbBooking.patient_name || dbBooking.name || '';
      if (!chartNo) chartNo = dbBooking.chart_no || '';
      if (!treatment) treatment = dbBooking.menu_name || '';
    }

    const startTimeStr = (targetCardCell && targetCardCell.dataset.time) ? targetCardCell.dataset.time : timeStr;

    return {
      date: dateStr,
      time: startTimeStr,
      unit: unitStr,
      groupId: groupId,
      chartNo: chartNo || '',
      patientName: patientName || '患者名未設定',
      treatment: treatment || '',
      durationMin: slotCount * 30,
      slotCount: slotCount,
      targetCardCell: targetCardCell,
      raw: dbBooking
    };
  }

  // -------------------------------------------
  // 5. アクション実行
  // -------------------------------------------

  handleActionClick(actionKey) {
    const data = this.currentBookingData;
    const cell = this.currentCellEl;
    this.hideMenu();

    if (!data) return;

    console.log(`[LeftClickActions] Action triggered: ${actionKey}`, data);

    switch (actionKey) {
      case 'new':
        this.onNewAppointment(data, cell);
        break;
      case 'datetime':
        this.onDateTimeChange(data, cell);
        break;
      case 'edit':
        this.onEditDetails(data, cell);
        break;
      case 'cancel':
        this.onCancelAppointment(data, cell);
        break;
      default:
        console.warn('Unknown action:', actionKey);
    }
  }

  // --- アクションごとのハンドラー ---

  // 1. 新規予約 (パイロットグリッドへキープ)
  onNewAppointment(data, cell) {
    console.log('[LeftClickActions] 新規予約 (パイロットグリッドへキープ):', data);
    if (window.pilotGridManager && typeof window.pilotGridManager.setBooking === 'function') {
      window.pilotGridManager.setBooking(data, cell);
      this.showFeedbackToast(`【新規予約】 ${data.patientName} をパイロットグリッドにキープしました`);
    } else {
      this.showFeedbackToast(`【新規予約】 ${data.patientName}`);
    }
  }

  // 2. 日時変更 (パイロットグリッドへ移動キープ: 元予約を消去して移動)
  onDateTimeChange(data, cell) {
    console.log('[LeftClickActions] 日時変更 (パイロットグリッドへ移動キープ):', data);
    if (window.pilotGridManager && typeof window.pilotGridManager.setBooking === 'function') {
      window.pilotGridManager.setBooking(data, cell, 'move');
      this.showFeedbackToast(`【日時変更】 ${data.patientName} の移動先枠を選択してください`);
    } else {
      this.showFeedbackToast(`【日時変更】 ${data.patientName} (${data.date} ${data.time}) の移動モードです`);
    }
  }

  // 3. 内容変更
  onEditDetails(data, cell) {
    if (window.appointmentEditModal && typeof window.appointmentEditModal.open === 'function') {
      window.appointmentEditModal.open(data, cell);
    } else {
      this.showFeedbackToast(`【内容変更】 ${data.patientName} のカルテ・処置内容変更を開きます`);
    }
  }

  // 4. キャンセル
  onCancelAppointment(data, cell) {
    this.cancelTargetData = data;
    this.cancelTargetCell = cell;

    // キャンセル確認モーダルの内容を更新
    const chartEl = document.getElementById('lcaCancelChart');
    const patientEl = document.getElementById('lcaCancelPatient');
    const unitEl = document.getElementById('lcaCancelUnit');
    const dateTimeEl = document.getElementById('lcaCancelDateTime');

    // カルテ番号は「No.」を付けずに番号だけ
    if (chartEl) chartEl.innerText = data.chartNo || '---';
    if (patientEl) patientEl.innerText = data.patientName; // 敬称なし
    if (unitEl) unitEl.innerText = data.unit || 'チェア';

    // 日付を「2026年◯月◯日」表記に変換し、少し離して予約時間を設定
    let formattedDate = data.date || '';
    if (formattedDate.includes('-')) {
      const parts = formattedDate.split('-');
      if (parts.length === 3) {
        const y = parts[0];
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        formattedDate = `${y}年${m}月${d}日`;
      }
    }
    const timeText = `${data.time} 〜 (${data.durationMin || 30}分)`;

    if (dateTimeEl) {
      dateTimeEl.innerHTML = `<span class="lca-cancel-date">${formattedDate}</span><span class="lca-cancel-time">${timeText}</span>`;
    }

    // 確認モーダルを表示
    if (this.cancelModalEl) {
      this.cancelModalEl.classList.add('active');
    }
  }

  hideCancelModal() {
    if (this.cancelModalEl) {
      this.cancelModalEl.classList.remove('active');
    }
    this.cancelTargetData = null;
    this.cancelTargetCell = null;
  }

  // 「はい」確定時の消去アニメーション & DB削除
  confirmCancelAppointment() {
    const data = this.cancelTargetData;
    const cell = this.cancelTargetCell;

    if (!data) {
      this.hideCancelModal();
      return;
    }

    // まずモーダルを閉じる
    this.hideCancelModal();

    // 予約グリッド上の対象セル群を特定（複数枠グループも全セル対象）
    const container = document.getElementById('reservationGrid') || document;
    let targetCells = [];

    if (data.groupId) {
      targetCells = Array.from(container.querySelectorAll(`[data-booking-group="${data.groupId}"]`));
    }
    if (!targetCells.length && cell) {
      targetCells = [cell];
    }

    console.log('[LeftClickActions] キャンセルアニメーション開始 対象セル数:', targetCells.length, data);

    // 予約カードが少しずつ薄くなって消えるアニメーション（.lca-card-disappearing）を付与
    targetCells.forEach(el => {
      el.classList.add('lca-card-disappearing');
    });

    // アニメーション完了（約0.65秒）に合わせてDBから削除しグリッドを再描画
    setTimeout(() => {
      try {
        if (window.dbManager) {
          let itemsToDelete = [];

          if (typeof window.dbManager.getReservations === 'function') {
            const allRes = window.dbManager.getReservations() || [];
            const slotTimes = targetCells.map(c => c.dataset.time).filter(Boolean);

            itemsToDelete = allRes.filter(r => 
              r.date === data.date &&
              (slotTimes.includes(r.time) || (data.groupId && r.group_id === data.groupId)) &&
              (r.unit === data.unit || !data.unit)
            );
          }

          if (itemsToDelete.length > 0 && typeof window.dbManager.deleteReservationGroup === 'function') {
            window.dbManager.deleteReservationGroup(itemsToDelete);
          } else if (typeof window.dbManager.deleteReservation === 'function') {
            window.dbManager.deleteReservation(data.date, data.time, data.unit);
          }
        }
      } catch (err) {
        console.error('[LeftClickActions] DB削除処理エラー:', err);
      }

      // グリッドを再描画して完全にクリア
      if (window.reservationGrid && typeof window.reservationGrid.render === 'function') {
        window.reservationGrid.render();
      }

      // 完了トースト表示
      this.showFeedbackToast(`【キャンセル完了】${data.patientName} の予約を取り消しました`);
    }, 4000);
  }

  // 操作フィードバック用トースト通知
  showFeedbackToast(message) {
    let toast = document.getElementById('lcaFeedbackToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'lcaFeedbackToast';
      toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 10000;
        background: #1e293b;
        color: #ffffff;
        padding: 10px 18px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 4px 14px rgba(0,0,0,0.25);
        display: flex;
        align-items: center;
        gap: 8px;
        transition: opacity 0.2s ease, transform 0.2s ease;
        opacity: 0;
        transform: translateY(10px);
        pointer-events: none;
      `;
      document.body.appendChild(toast);
    }

    toast.innerText = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
    }, 2800);
  }
}

// グローバル初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.leftClickActions = new LeftClickActions();
  });
} else {
  window.leftClickActions = new LeftClickActions();
}
