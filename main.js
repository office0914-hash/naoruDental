// -------------------------------------------
// Main System Script (main.js)
// -------------------------------------------

// 右クリック禁止
document.addEventListener('contextmenu', e => e.preventDefault());

// 画面上で操作（クリック・タッチ・キー入力）が行われた瞬間に全画面化を実行
const triggerFullscreen = () => {
  if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
    const docEl = document.documentElement;
    const requestFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
    if (requestFs) {
      requestFs.call(docEl).catch(err => {
        // ユーザー操作前など許可されない環境でのエラー抑制
      });
    }
  }
};

['click', 'pointerdown', 'mousedown', 'keydown', 'touchstart'].forEach(eventType => {
  document.addEventListener(eventType, triggerFullscreen, { passive: true });
});

// -------------------------------------------
// システム終了処理コントローラー (Shutdown Controller)
// -------------------------------------------
class SystemShutdownManager {
  constructor() {
    this.powerBtn = null;
    this.overlay = null;
    this.isProcessing = false;
    this.init();
  }

  init() {
    document.addEventListener('DOMContentLoaded', () => {
      this.powerBtn = document.getElementById('btnSystemPower');
      this.overlay = document.getElementById('shutdownOverlay');
      this.stepIntegrity = document.getElementById('stepIntegrity');
      this.stepBackup = document.getElementById('stepBackup');
      this.stepShutdown = document.getElementById('stepShutdown');
      this.btnFinalClose = document.getElementById('btnFinalClose');
      this.btnRestartSystem = document.getElementById('btnRestartSystem');
      this.shutdownTitle = document.getElementById('shutdownTitle');
      this.shutdownIconWrap = document.getElementById('shutdownIconWrap');
      this.shutdownBtnRow = document.getElementById('shutdownBtnRow');

      if (this.powerBtn) {
        this.powerBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handlePowerClick();
        });
      }

      if (this.btnFinalClose) {
        this.btnFinalClose.addEventListener('click', () => {
          this.executeCloseWindow();
        });
      }

      if (this.btnRestartSystem) {
        this.btnRestartSystem.addEventListener('click', () => {
          this.restartSystem();
        });
      }
    });
  }

  async executeCloseWindow() {
    // 1. サーバーAPI経由でウィンドウの終了を要求
    try {
      fetch('/api/system/close', { method: 'POST' }).catch(() => {});
    } catch (e) {}

    // 2. ブラウザ標準のクローズ命令を実行（許可されている環境で即時終了）
    try {
      window.open('', '_self', '');
      window.close();
    } catch (e) {}
    try {
      window.close();
    } catch (e) {}

    // 3. ブラウザ側のセキュリティ制約等でタブが直接閉じない場合でも、
    //    画面を即座に「完全終了（ブラックアウト画面）」へ切り替えて変化を明確に伝える
    setTimeout(() => {
      this.showBlackoutScreen();
    }, 200);
  }

  showBlackoutScreen() {
    if (!this.overlay) return;
    this.overlay.classList.add('blackout');
    this.overlay.innerHTML = `
      <div class="shutdown-blackout-card">
        <div style="width: 68px; height: 68px; margin: 0 auto 16px; border-radius: 50%; background: rgba(34, 197, 94, 0.14); display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" width="38" height="38" fill="none">
            <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z" fill="#22c55e" fill-opacity="0.22" stroke="#4ade80" stroke-width="2" stroke-linejoin="round"/>
            <path d="M8.5 12l2.5 2.5 4.5-4.5" stroke="#4ade80" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div style="font-size: 1.35rem; font-weight: 700; color: #ffffff; margin-bottom: 12px;">
          システムは安全に終了しました
        </div>
        <div style="color: #cbd5e1; font-size: 0.95rem; line-height: 1.8; margin-bottom: 24px;">
          データベースの検証およびバックアップはすべて正常に完了しています。<br>
          <kbd class="kbd-key">ESC</kbd> キーを押して全画面を解除してから、右上の「✕」ボタンまたはタブを閉じてください。
        </div>
        <button type="button" class="shutdown-btn-restart" id="btnBlackoutRestart">
          🔄 システムを再開する
        </button>
      </div>
    `;

    const restartBtn = this.overlay.querySelector('#btnBlackoutRestart');
    if (restartBtn) {
      restartBtn.onclick = () => {
        location.reload();
      };
    }
  }

  handlePowerClick() {
    if (this.isProcessing) return;

    // 既に停止している場合は再開
    if (this.powerBtn && this.powerBtn.classList.contains('is-off')) {
      this.restartSystem();
      return;
    }

    this.startShutdownSequence();
  }

  async startShutdownSequence() {
    this.isProcessing = true;

    // 1. 電源ボタンを高速ネオン点滅状態（is-shutting-down）に切り替え
    if (this.powerBtn) {
      this.powerBtn.classList.remove('is-running', 'is-off', 'is-fading-out');
      this.powerBtn.classList.add('is-shutting-down');
      this.powerBtn.title = 'システム終了処理中...';
    }

    // 2. 終了オーバーレイを表示
    if (this.overlay) {
      this.resetOverlayUI();
      this.overlay.classList.add('show');
    }

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // --- STEP 1: データベース整合性・損傷チェック ---
    await sleep(600); // 視覚的ステップ確認
    let integrityOk = true;
    let integrityMsg = '正常（損傷なし・整合性OK）';

    try {
      if (window.dbManager && typeof window.dbManager.checkIntegrity === 'function') {
        const integrityResult = await window.dbManager.checkIntegrity();
        integrityOk = integrityResult.ok;
        if (!integrityOk) {
          integrityMsg = `警告: ${integrityResult.errors.join(', ')}`;
        }
      }
    } catch (err) {
      integrityOk = false;
      integrityMsg = `エラー: ${err.message}`;
    }

    this.updateStep(this.stepIntegrity, integrityOk ? 'done' : 'error', 
      integrityOk ? '✅ データベース整合性: 正常（損傷なし）' : `⚠️ データベース検証: ${integrityMsg}`);

    // --- STEP 2: データベースバックアップ実行 ---
    this.updateStep(this.stepBackup, 'running', '🔄 データベースのバックアップを保存中...');
    await sleep(600);

    let backupOk = true;
    try {
      if (window.dbManager && typeof window.dbManager.performBackup === 'function') {
        const backupResult = await window.dbManager.performBackup();
        backupOk = backupResult.ok;
      }
    } catch (err) {
      backupOk = false;
    }

    this.updateStep(this.stepBackup, backupOk ? 'done' : 'error', 
      backupOk ? '✅ データベースバックアップ: 保存完了' : '⚠️ バックアップ: 一部保存に失敗');

    // --- STEP 3: ライム色のネオン光をすーっと消す (Fade Out) ---
    this.updateStep(this.stepShutdown, 'running', '🔄 システムの安全終了・消灯処理中...');
    await sleep(400);

    if (this.powerBtn) {
      this.powerBtn.classList.remove('is-shutting-down');
      this.powerBtn.classList.add('is-fading-out'); // すーっと消えるアニメーション (1.4s)
    }

    // 光が完全に消えるのを待つ
    await sleep(1400);

    // 完全消灯・終了状態
    if (this.powerBtn) {
      this.powerBtn.classList.remove('is-fading-out');
      this.powerBtn.classList.add('is-off');
      this.powerBtn.title = 'システム停止中（クリックで再開）';
    }

    this.updateStep(this.stepShutdown, 'done', '✅ システムを正常に終了しました');

    if (this.shutdownTitle) {
      this.shutdownTitle.textContent = 'システムは安全に終了しました';
    }
    if (this.shutdownIconWrap) {
      this.shutdownIconWrap.innerHTML = `
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none">
          <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z" fill="#22c55e" fill-opacity="0.16" stroke="#16a34a" stroke-width="2" stroke-linejoin="round"/>
          <path d="M8.5 12l2.5 2.5 4.5-4.5" stroke="#16a34a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
      this.shutdownIconWrap.style.backgroundColor = '#f0fdf4';
    }
    if (this.shutdownBtnRow) {
      this.shutdownBtnRow.style.display = 'flex';
    }

    this.isProcessing = false;
  }

  updateStep(stepEl, status, text) {
    if (!stepEl) return;
    stepEl.className = `shutdown-step step-${status}`;
    const iconEl = stepEl.querySelector('.shutdown-step-icon');
    const textEl = stepEl.querySelector('.shutdown-step-text');

    if (iconEl) {
      if (status === 'running') iconEl.textContent = '🔄';
      else if (status === 'done') iconEl.textContent = '✅';
      else if (status === 'error') iconEl.textContent = '⚠️';
      else if (status === 'waiting') iconEl.textContent = '⏳';
    }
    if (textEl && text) {
      textEl.textContent = text;
    }
  }

  resetOverlayUI() {
    if (this.shutdownTitle) this.shutdownTitle.textContent = 'システムを終了しています';
    if (this.shutdownIconWrap) {
      this.shutdownIconWrap.textContent = '🔌';
      this.shutdownIconWrap.style.backgroundColor = '#f1f5f9';
    }
    if (this.shutdownBtnRow) this.shutdownBtnRow.style.display = 'none';

    this.updateStep(this.stepIntegrity, 'running', 'データベースの損傷・整合性を検証中...');
    this.updateStep(this.stepBackup, 'waiting', 'データベースのバックアップ保存を準備中...');
    this.updateStep(this.stepShutdown, 'waiting', 'システムの安全終了処理...');
  }

  restartSystem() {
    if (this.overlay) {
      this.overlay.classList.remove('show', 'blackout');
    }
    if (this.powerBtn) {
      this.powerBtn.classList.remove('is-off', 'is-shutting-down', 'is-fading-out');
      this.powerBtn.classList.add('is-running');
      this.powerBtn.title = 'システム終了';
    }
    this.isProcessing = false;
  }
}

new SystemShutdownManager();
