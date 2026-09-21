// -------------------------------------------
// New Appointment Modal Manager (appNew.js)
// なおる歯科 - 新規予約登録モーダル & 患者検索サジェスト
// -------------------------------------------
const html = String.raw;

class AppointmentModal {
  constructor() {
    this.currentDateStr = '';
    this.currentTimeStr = '';
    this.currentUnitStr = '';
    this.targetElement = null;
    this.currentSlots = [];

    // 患者マスタ
    this.patientList = [];
    this.patientMap = new Map();

    // 候補者選択用インデックス
    this.activeCandidateIndex = -1;
    this.currentCandidates = [];

    this.init();
    this.loadPatientMaster();
  }

  init() {
    this.createModalDOM();
    this.bindEvents();
  }

  // -------------------------------------------
  // 1. 患者マスタ読み込み & パース
  // -------------------------------------------

  async loadPatientMaster() {
    try {
      const response = await fetch('PatList.csv');
      if (!response.ok) {
        console.warn('PatList.csvの読み込みに失敗しました:', response.status);
        return;
      }
      const text = await response.text();
      this.parsePatientCsv(text);
    } catch (e) {
      console.error('PatList.csv読み込みエラー:', e);
    }
  }

  toKatakana(str) {
    if (!str) return '';
    return str.replace(/[\u3041-\u3096]/g, m => String.fromCharCode(m.charCodeAt(0) + 0x60));
  }

  parsePatientCsv(csvText) {
    const lines = csvText.split(/\r?\n/);
    this.patientList = [];
    this.patientMap.clear();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(',');
      if (cols.length >= 2) {
        const chartNo = (cols[0] || '').trim();
        const name = (cols[1] || '').trim();
        const kana = (cols[2] || '').trim();
        const rawDob = (cols[3] || '').trim();
        const sex = (cols[4] || '').trim();

        const digitsDob = rawDob.replace(/\D/g, '');
        let formattedDob = '';
        if (rawDob) {
          const parts = rawDob.split(/[\/\-]/);
          if (parts.length === 3) {
            formattedDob = `${parts[0].padStart(4, '0')}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          }
        }

        const patient = {
          chartNo,
          name,
          normName: name.replace(/\s+/g, ''),
          kana,
          normKana: kana.replace(/\s+/g, ''),
          dob: formattedDob,
          rawDob,
          digitsDob,
          sex
        };

        this.patientList.push(patient);
        this.patientMap.set(chartNo, patient);

        const numKey = String(parseInt(chartNo, 10));
        if (numKey && numKey !== 'NaN') {
          this.patientMap.set(numKey, patient);
          this.patientMap.set(numKey.padStart(4, '0'), patient);
        }
      }
    }
    console.log(`患者マスタ読み込み完了: ${this.patientList.length} 件`);
  }

  // -------------------------------------------
  // 2. DOM生成
  // -------------------------------------------

  createModalDOM() {
    if (document.getElementById('appNewModal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'appNewModal';
    overlay.className = 'app-modal-overlay';

    overlay.innerHTML = html`
      <div class="app-modal-container" id="appNewContainer">
        <div class="app-modal-header">
          <div class="app-modal-title-group">
            <span class="app-modal-icon">📅</span>
            <div class="app-modal-title">新規予約</div>
          </div>
          <button type="button" class="app-modal-close-btn" id="btnAppModalClose" title="閉じる">✕</button>
        </div>
        <div class="app-modal-body" id="appModalBody">
          <div class="app-modal-slot-info" id="appModalSlotInfo">
            <span class="slot-badge date-badge" id="appModalSlotDate">----/--/--</span>
            <span class="slot-badge time-badge" id="appModalSlotTime">--:--</span>
            <span class="slot-badge unit-badge" id="appModalSlotUnit">ユニット</span>
          </div>
          <div class="patient-info-card">
            <div class="patient-card-header">
              <div class="patient-card-title-group">
                <span class="patient-card-icon">👤</span>
                <span class="patient-card-title">患者情報</span>
              </div>
              <div class="patient-card-meta" id="patientCardMeta"></div>
            </div>
            <div class="patient-card-body patient-card-row">
              <div class="form-group form-group-chartno">
                <div class="input-wrapper">
                  <input type="text" id="appPatientChartNo" class="form-input" placeholder="カルテ番号" autocomplete="off">
                </div>
              </div>

              <div class="form-group form-group-name">
                <div class="input-wrapper">
                  <input type="text" id="appPatientName" class="form-input" placeholder="患者氏名" autocomplete="off">
                </div>
              </div>

              <div class="form-group form-group-dob">
                <div class="input-wrapper">
                  <input type="text" id="appPatientDob" class="form-input" placeholder="西暦年/月/日" autocomplete="off">
                </div>
              </div>
            </div>

            <div class="patient-candidates-wrapper" id="patientCandidatesWrapper" style="display: none;">
              <div class="candidates-header">
                <span>🔍 該当する患者候補（クリックまたは上下キーで選択）</span>
                <button type="button" class="btn-close-candidates" id="btnCloseCandidates">✕</button>
              </div>
              <div class="candidates-list" id="patientCandidatesList"></div>
            </div>
          </div>

          <div class="treatment-info-card">
            <div class="treatment-card-header">
              <div class="treatment-card-title-group">
                <span class="treatment-card-icon">🩺</span>
                <span class="treatment-card-title">処置内容</span>
              </div>
            </div>
            <div class="treatment-card-body">
              <div class="form-group form-group-treatment">
                <div class="input-wrapper">
                  <input type="text" id="appTreatmentContent" class="form-input" placeholder="処置内容を入力" autocomplete="off">
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="app-modal-footer">
          <button type="button" class="btn-cancel" id="btnAppModalCancel">キャンセル</button>
          <button type="button" class="btn-submit" id="btnAppModalSubmit">確定</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
  }

  // -------------------------------------------
  // 3. イベントバインド
  // -------------------------------------------

  bindEvents() {
    this.modalEl = document.getElementById('appNewModal');
    this.containerEl = document.getElementById('appNewContainer');
    this.closeBtn = document.getElementById('btnAppModalClose');
    this.cancelBtn = document.getElementById('btnAppModalCancel');
    this.submitBtn = document.getElementById('btnAppModalSubmit');

    this.chartNoInput = document.getElementById('appPatientChartNo');
    this.nameInput = document.getElementById('appPatientName');
    this.dobInput = document.getElementById('appPatientDob');
    this.treatmentInput = document.getElementById('appTreatmentContent');
    this.slotDateEl = document.getElementById('appModalSlotDate');
    this.slotTimeEl = document.getElementById('appModalSlotTime');
    this.slotUnitEl = document.getElementById('appModalSlotUnit');
    this.patientMetaEl = document.getElementById('patientCardMeta');

    this.candidatesWrapper = document.getElementById('patientCandidatesWrapper');
    this.candidatesList = document.getElementById('patientCandidatesList');
    this.closeCandidatesBtn = document.getElementById('btnCloseCandidates');

    if (this.closeCandidatesBtn) this.closeCandidatesBtn.onclick = () => this.hideCandidates();

    // 共通 blur ハンドラー
    const attachBlurHandler = (inputEl) => {
      if (!inputEl) return;
      inputEl.addEventListener('blur', () => {
        setTimeout(() => {
          if (!this.modalEl || !this.modalEl.contains(document.activeElement)) {
            this.hideCandidates();
          }
        }, 200);
      });
    };

    // 1. カルテ番号
    if (this.chartNoInput) {
      this.chartNoInput.addEventListener('input', () => {
        const val = this.chartNoInput.value.trim();
        if (val.length >= 4) {
          const directMatch = this.patientMap.get(val) || this.patientMap.get(val.padStart(4, '0'));
          if (directMatch) {
            this.selectPatient(directMatch, false);
            return;
          }
        }
        this.searchAndShowCandidates(val, 'chartNo');
      });
      this.chartNoInput.addEventListener('keydown', (e) => this.handleKeyNavigation(e, 'chartNo'));
      attachBlurHandler(this.chartNoInput);
    }

    // 2. 氏名
    if (this.nameInput) {
      this.nameInput.addEventListener('input', () => {
        this.searchAndShowCandidates(this.nameInput.value.trim(), 'name');
      });
      this.nameInput.addEventListener('keydown', (e) => this.handleKeyNavigation(e, 'name'));
      attachBlurHandler(this.nameInput);
    }

    // 3. 生年月日
    if (this.dobInput) {
      this.dobInput.addEventListener('input', () => {
        this.searchAndShowCandidates(this.dobInput.value.trim(), 'dob');
      });
      this.dobInput.addEventListener('keydown', (e) => this.handleKeyNavigation(e, 'dob'));
      attachBlurHandler(this.dobInput);
    }

    // 4. 処置内容
    if (this.treatmentInput) {
      this.treatmentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.submit();
        }
      });
    }

    if (this.closeBtn) this.closeBtn.onclick = () => this.close();
    if (this.cancelBtn) this.cancelBtn.onclick = () => this.close();
    if (this.submitBtn) this.submitBtn.onclick = () => this.submit();

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalEl && this.modalEl.classList.contains('show')) {
        if (this.candidatesWrapper && this.candidatesWrapper.style.display !== 'none') {
          this.hideCandidates();
        } else {
          this.close();
        }
      }
    });

    window.addEventListener('resize', () => {
      if (this.modalEl && this.modalEl.classList.contains('show') && this.targetElement) {
        this.positionNearElement(this.targetElement);
      }
    });
  }

  // -------------------------------------------
  // 4. 候補者検索 & サジェスト
  // -------------------------------------------

  searchAndShowCandidates(query, type) {
    if (!query) {
      this.hideCandidates();
      return;
    }

    const trimmed = query.replace(/\s+/g, '');
    const katakanaQuery = this.toKatakana(trimmed);
    const digitsQuery = query.replace(/\D/g, '');

    let results = [];

    if (type === 'chartNo') {
      results = this.patientList.filter(p => p.chartNo.startsWith(query) || p.chartNo.includes(query) || (digitsQuery && p.chartNo.includes(digitsQuery)));
    } else if (type === 'name') {
      results = this.patientList.filter(p => p.normName.includes(trimmed) || p.normKana.includes(katakanaQuery) || p.normKana.includes(trimmed));
    } else if (type === 'dob') {
      results = this.patientList.filter(p => p.rawDob.includes(query) || (p.dob && p.dob.includes(query)) || (digitsQuery && p.digitsDob.includes(digitsQuery)));
    }

    this.currentCandidates = results.slice(0, 15);
    this.activeCandidateIndex = -1;

    if (this.currentCandidates.length > 0) {
      this.renderCandidates(this.currentCandidates);
    } else {
      this.renderNoCandidates();
    }
    this.showCandidates();
  }

  renderCandidates(list) {
    if (!this.candidatesList) return;
    this.candidatesList.innerHTML = '';

    list.forEach((patient, idx) => {
      const item = document.createElement('div');
      item.className = 'candidate-item';
      item.dataset.index = idx;

      const sexBadgeClass = patient.sex === '女' ? 'sex-female' : (patient.sex === '男' ? 'sex-male' : 'sex-other');

      item.innerHTML = `
        <span class="cand-col cand-chartno">${patient.chartNo}</span>
        <span class="cand-col cand-name">${patient.name}</span>
        <span class="cand-col cand-kana">${patient.kana || ''}</span>
        <span class="cand-col cand-dob">${patient.rawDob || patient.dob}</span>
        <span class="cand-col cand-sex ${sexBadgeClass}">${patient.sex || ''}</span>
      `;

      item.onmousedown = (e) => {
        e.preventDefault();
        this.selectPatient(patient, true);
      };

      this.candidatesList.appendChild(item);
    });
  }

  renderNoCandidates() {
    if (!this.candidatesList) return;
    this.candidatesList.innerHTML = `<div class="candidate-empty">該当する患者データが見つかりません</div>`;
  }

  showCandidates() {
    if (this.candidatesWrapper) this.candidatesWrapper.style.display = 'block';
  }

  hideCandidates() {
    if (this.candidatesWrapper) {
      this.candidatesWrapper.style.display = 'none';
      this.activeCandidateIndex = -1;
    }
  }

  handleKeyNavigation(e, sourceInputType) {
    if (!this.candidatesWrapper || this.candidatesWrapper.style.display === 'none') {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (sourceInputType === 'chartNo') {
          const val = this.chartNoInput.value.trim();
          const p = this.patientMap.get(val) || this.patientMap.get(val.padStart(4, '0'));
          if (p) {
            this.selectPatient(p, true);
            return;
          }
        }
        if (this.nameInput && this.nameInput.value && this.submitBtn) {
          this.submitBtn.focus();
        }
      }
      return;
    }

    const items = this.candidatesList.querySelectorAll('.candidate-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.activeCandidateIndex = (this.activeCandidateIndex + 1) % items.length;
      this.updateCandidateHighlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.activeCandidateIndex = (this.activeCandidateIndex - 1 + items.length) % items.length;
      this.updateCandidateHighlight(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.activeCandidateIndex >= 0 && this.activeCandidateIndex < this.currentCandidates.length) {
        this.selectPatient(this.currentCandidates[this.activeCandidateIndex], true);
      } else if (this.currentCandidates.length === 1) {
        this.selectPatient(this.currentCandidates[0], true);
      } else {
        this.hideCandidates();
      }
    }
  }

  updateCandidateHighlight(items) {
    items.forEach((item, idx) => {
      if (idx === this.activeCandidateIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  selectPatient(patient, moveFocus = true) {
    if (!patient) return;

    if (this.chartNoInput) {
      this.chartNoInput.value = patient.chartNo;
      this.chartNoInput.classList.add('match-found');
    }
    if (this.nameInput) {
      this.nameInput.value = patient.name;
      this.nameInput.classList.add('auto-filled');
    }
    if (this.dobInput) {
      this.dobInput.value = patient.rawDob || patient.dob || '';
      this.dobInput.classList.add('auto-filled');
    }

    if (this.patientMetaEl) {
      const metaParts = [];
      if (patient.kana) metaParts.push(patient.kana);
      if (patient.sex) metaParts.push(patient.sex);
      this.patientMetaEl.textContent = metaParts.join(' / ');
      this.patientMetaEl.style.display = 'inline-block';
    }

    this.hideCandidates();

    if (moveFocus && this.submitBtn) {
      this.submitBtn.focus();
    }
  }

  clearPatientInfo(clearChartNo = true) {
    if (clearChartNo && this.chartNoInput) {
      this.chartNoInput.value = '';
      this.chartNoInput.classList.remove('match-found');
    }
    if (this.nameInput) {
      this.nameInput.value = '';
      this.nameInput.classList.remove('auto-filled');
    }
    if (this.dobInput) {
      this.dobInput.value = '';
      this.dobInput.classList.remove('auto-filled');
    }
    if (this.treatmentInput) {
      this.treatmentInput.value = '';
    }
    if (this.patientMetaEl) {
      this.patientMetaEl.textContent = '';
      this.patientMetaEl.style.display = 'none';
    }
    this.hideCandidates();
  }

  // -------------------------------------------
  // 5. モーダル位置決め & 開閉
  // -------------------------------------------

  positionNearElement(el) {
    if (!this.containerEl || !el) return;

    const rect = el.getBoundingClientRect();
    const modalWidth = this.containerEl.offsetWidth || 580;
    const modalHeight = this.containerEl.offsetHeight || 260;

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    let left = rect.right + 10;
    let top = rect.top;

    if (left + modalWidth > windowWidth - 16) left = rect.left - modalWidth - 10;
    if (left < 16) left = Math.max(16, windowWidth - modalWidth - 16);
    if (top + modalHeight > windowHeight - 16) top = Math.max(16, windowHeight - modalHeight - 16);
    if (top < 16) top = 16;

    this.containerEl.style.left = `${left}px`;
    this.containerEl.style.top = `${top}px`;
  }

  getEndTimeOfSlot(timeStr) {
    if (!timeStr || timeStr === '--:--') return '';
    try {
      const parts = timeStr.split(':');
      if (parts.length === 2) {
        let h = parseInt(parts[0], 10);
        let m = parseInt(parts[1], 10) + 30;
        if (m >= 60) {
          h += Math.floor(m / 60);
          m %= 60;
        }
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    } catch (e) { }
    return timeStr;
  }

  open(dateStr, timeStr, unitName, targetEl, slotTimes = []) {
    if (!this.modalEl) {
      this.createModalDOM();
      this.bindEvents();
    }

    this.currentDateStr = dateStr || '';
    this.currentTimeStr = timeStr || '';
    this.currentUnitStr = unitName || '';
    this.targetElement = targetEl || null;
    this.currentSlots = (slotTimes && slotTimes.length > 0) ? slotTimes : (timeStr ? [timeStr] : []);

    if (this.slotDateEl) this.slotDateEl.textContent = this.formatBadgeDate(this.currentDateStr);

    if (this.slotTimeEl) {
      if (this.currentSlots.length > 1) {
        const firstTime = this.currentSlots[0];
        const lastTime = this.currentSlots[this.currentSlots.length - 1];
        const endTime = this.getEndTimeOfSlot(lastTime);
        const durationMin = this.currentSlots.length * 30;
        this.slotTimeEl.textContent = `${firstTime} 〜 ${endTime} (${durationMin}分・${this.currentSlots.length}枠)`;
      } else {
        const singleTime = this.currentTimeStr || '--:--';
        const endTime = singleTime !== '--:--' ? this.getEndTimeOfSlot(singleTime) : '';
        this.slotTimeEl.textContent = endTime ? `${singleTime} 〜 ${endTime} (30分)` : singleTime;
      }
    }

    if (this.slotUnitEl) this.slotUnitEl.textContent = this.currentUnitStr || 'ユニット';

    this.clearPatientInfo(true);
    this.modalEl.classList.add('show');

    if (this.targetElement) {
      requestAnimationFrame(() => {
        this.positionNearElement(this.targetElement);
        if (this.chartNoInput) this.chartNoInput.focus();
      });
    } else {
      if (this.containerEl) {
        this.containerEl.style.left = '50%';
        this.containerEl.style.top = '50%';
        this.containerEl.style.transform = 'translate(-50%, -50%)';
      }
      if (this.chartNoInput) setTimeout(() => this.chartNoInput.focus(), 50);
    }
  }

  formatBadgeDate(dateStr) {
    if (!dateStr) return '----/--/--';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        return `${parts[0]}/${parts[1]}/${parts[2]} (${days[d.getDay()]})`;
      }
    } catch (e) { }
    return dateStr;
  }

  close() {
    this.hideCandidates();
    if (this.modalEl) this.modalEl.classList.remove('show');
    if (window.reservationGrid && typeof window.reservationGrid.clearSelection === 'function') {
      window.reservationGrid.clearSelection();
    }
  }

  // -------------------------------------------
  // 6. 確定・保存
  // -------------------------------------------

  submit() {
    const chartNo = this.chartNoInput ? this.chartNoInput.value.trim() : '';
    const name = this.nameInput ? this.nameInput.value.trim() : '';
    const treatment = this.treatmentInput ? this.treatmentInput.value.trim() : '';

    if (!name && !chartNo) {
      this.close();
      return;
    }

    const displayName = name || (chartNo ? `カルテ: ${chartNo}` : '新規患者');

    if (window.dbManager && typeof window.dbManager.addReservation === 'function') {
      const slotsToBook = (this.currentSlots && this.currentSlots.length > 0) ? this.currentSlots : [this.currentTimeStr];
      slotsToBook.forEach(slot => {
        window.dbManager.addReservation(
          null,
          this.currentDateStr,
          slot,
          this.currentUnitStr,
          displayName,
          '',
          treatment,
          chartNo
        );
      });
    }

    if (window.reservationGrid && typeof window.reservationGrid.render === 'function') {
      window.reservationGrid.render();
    }

    this.close();
  }
}

// グローバルインスタンス & 初期化
window.appointmentModal = null;

document.addEventListener('DOMContentLoaded', () => {
  window.appointmentModal = new AppointmentModal();
});
