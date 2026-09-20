// -------------------------------------------
// New Appointment Modal Manager (appNew.js)
// なおる歯科 - 新規予約登録モーダル
// -------------------------------------------

class AppointmentModal {
  constructor() {
    this.currentDateStr = '';
    this.currentTimeStr = '';
    this.currentUnitStr = '';
    this.targetElement = null;

    this.init();
  }

  init() {
    this.createModalDOM();
    this.bindEvents();
  }

  // モーダルのDOMを作成（中身は空、下段のボタンのみ配置）
  createModalDOM() {
    if (document.getElementById('appNewModal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'appNewModal';
    overlay.className = 'app-modal-overlay';

    overlay.innerHTML = `
      <div class="app-modal-container" id="appNewContainer">
        <!-- Header (緑色タイトルバー) -->
        <div class="app-modal-header">
          <div class="app-modal-title-group">
            <span class="app-modal-icon">📅</span>
            <div class="app-modal-title">新規予約</div>
          </div>
          <button type="button" class="app-modal-close-btn" id="btnAppModalClose" title="閉じる">✕</button>
        </div>

        <!-- Body (中身はこれからの指示用に空で保持) -->
        <div class="app-modal-body" id="appModalBody">
          <!-- これから指示されるコンテンツをここに配置します -->
        </div>

        <!-- Footer (下段のボタン) -->
        <div class="app-modal-footer">
          <button type="button" class="btn-cancel" id="btnAppModalCancel">キャンセル</button>
          <button type="button" class="btn-submit" id="btnAppModalSubmit">確定</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
  }

  // イベントバインド
  bindEvents() {
    this.modalEl = document.getElementById('appNewModal');
    this.containerEl = document.getElementById('appNewContainer');
    this.closeBtn = document.getElementById('btnAppModalClose');
    this.cancelBtn = document.getElementById('btnAppModalCancel');
    this.submitBtn = document.getElementById('btnAppModalSubmit');

    // 閉じるボタン（✕）
    if (this.closeBtn) this.closeBtn.onclick = () => this.close();

    // キャンセルボタン
    if (this.cancelBtn) this.cancelBtn.onclick = () => this.close();

    // ※仕様変更：モーダル以外の場所をクリックしてもモーダルが消えないようにする（外側クリックによるcloseは行わない）

    // 確定ボタン
    if (this.submitBtn) {
      this.submitBtn.onclick = () => this.submit();
    }

    // ESCキーで閉じる
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalEl && this.modalEl.classList.contains('show')) {
        this.close();
      }
    });

    // ウィンドウリサイズ時に位置を再計算
    window.addEventListener('resize', () => {
      if (this.modalEl && this.modalEl.classList.contains('show') && this.targetElement) {
        this.positionNearElement(this.targetElement);
      }
    });
  }

  // 選択されたグリッド（セル要素）の周囲にモーダルを配置する
  positionNearElement(el) {
    if (!this.containerEl || !el) return;

    const rect = el.getBoundingClientRect();
    const modalWidth = this.containerEl.offsetWidth || 480;
    const modalHeight = this.containerEl.offsetHeight || 240;

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // 基本はグリッドセルの右側に配置
    let left = rect.right + 10;
    let top = rect.top;

    // 右側に収まらない場合は左側に配置
    if (left + modalWidth > windowWidth - 16) {
      left = rect.left - modalWidth - 10;
    }

    // 左側にも収まらない場合は画面右端からマージンを取って配置
    if (left < 16) {
      left = Math.max(16, windowWidth - modalWidth - 16);
    }

    // 画面下部からはみ出る場合は上にシフト
    if (top + modalHeight > windowHeight - 16) {
      top = Math.max(16, windowHeight - modalHeight - 16);
    }

    // 画面上部からはみ出る場合
    if (top < 16) {
      top = 16;
    }

    this.containerEl.style.left = `${left}px`;
    this.containerEl.style.top = `${top}px`;
  }

  // モーダルを開く
  open(dateStr, timeStr, unitName, targetEl) {
    if (!this.modalEl) {
      this.createModalDOM();
      this.bindEvents();
    }

    this.currentDateStr = dateStr || '';
    this.currentTimeStr = timeStr || '';
    this.currentUnitStr = unitName || '';
    this.targetElement = targetEl || null;

    this.modalEl.classList.add('show');

    // 選択セルの周囲に即座に配置
    if (this.targetElement) {
      // レンダリング後の寸法で正確に位置計算
      requestAnimationFrame(() => {
        this.positionNearElement(this.targetElement);
      });
    } else {
      // ターゲットが無い場合は画面中央
      if (this.containerEl) {
        this.containerEl.style.left = '50%';
        this.containerEl.style.top = '50%';
        this.containerEl.style.transform = 'translate(-50%, -50%)';
      }
    }
  }

  // モーダルを閉じる
  close() {
    if (this.modalEl) {
      this.modalEl.classList.remove('show');
    }
  }

  // 確定処理
  submit() {
    this.close();
  }
}

// グローバルインスタンス & 初期化
window.appointmentModal = null;

document.addEventListener('DOMContentLoaded', () => {
  window.appointmentModal = new AppointmentModal();
});
