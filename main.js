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
