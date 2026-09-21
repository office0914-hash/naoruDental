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
          <!-- 患者情報 入力行 -->
          <div class="patient-form-row">
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

          <!-- 候補者サジェスト一覧 -->
          <div class="patient-candidates-wrapper" id="patientCandidatesWrapper" style="display: none;">
            <div class="candidates-header">
              <span>🔍 該当する患者候補（クリックまたは上下キーで選択）</span>
              <button type="button" class="btn-close-candidates" id="btnCloseCandidates">✕</button>
            </div>
            <div class="candidates-list" id="patientCandidatesList"></div>
          </div>

          <!-- 処置内容 入力行 -->
          <div class="form-group form-group-treatment">
            <div class="input-wrapper">
              <input type="text" id="appTreatmentContent" class="form-input" placeholder="処置内容を入力" autocomplete="off">
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

    const titleEl = this.modalEl.querySelector('.app-modal-title');
    const submitBtn = this.submitBtn;

    // パイロットグリッドにキープ中の予約があれば初期値として自動コピー
    if (window.pilotGridManager && window.pilotGridManager.hasBooking()) {
      const held = window.pilotGridManager.heldBooking;
      if (this.chartNoInput) this.chartNoInput.value = held.chartNo || '';
      if (this.nameInput) this.nameInput.value = held.patientName || '';
      if (this.treatmentInput) this.treatmentInput.value = held.treatment || '';

      // モードに応じたタイトル・ボタン切り替え
      if (held.mode === 'move') {
        if (titleEl) titleEl.textContent = '日時変更の確定';
        if (submitBtn) submitBtn.textContent = '日時を変更する';
      } else {
        if (titleEl) titleEl.textContent = '新規予約';
        if (submitBtn) submitBtn.textContent = '確定';
      }

      // 生年月日補完
      if (this.dobInput) {
        if (held.chartNo && this.patientMap.has(held.chartNo)) {
          const p = this.patientMap.get(held.chartNo);
          this.dobInput.value = p.dob || p.rawDob || '';
        } else if (held.patientName) {
          const found = this.patientList.find(p => p.name === held.patientName || p.normName === held.patientName.replace(/\s+/g, ''));
          if (found) this.dobInput.value = found.dob || found.rawDob || '';
        }
      }

      // 単一スロット選択の場合、held.slotCount 分のスロットを可能なら拡張
      if (this.currentSlots.length === 1 && held.slotCount > 1) {
        const timeSlots = (window.reservationGrid && window.reservationGrid.timeSlots) || [];
        const startIdx = timeSlots.indexOf(this.currentSlots[0]);
        if (startIdx >= 0) {
          const expandedSlots = [];
          for (let i = 0; i < held.slotCount; i++) {
            if (startIdx + i < timeSlots.length) {
              expandedSlots.push(timeSlots[startIdx + i]);
            }
          }
          if (expandedSlots.length > 0) {
            this.currentSlots = expandedSlots;
            // 時間バッジ更新
            if (this.slotTimeEl) {
              const firstTime = this.currentSlots[0];
              const lastTime = this.currentSlots[this.currentSlots.length - 1];
              const endTime = this.getEndTimeOfSlot(lastTime);
              const durationMin = this.currentSlots.length * 30;
              this.slotTimeEl.textContent = `${firstTime} 〜 ${endTime} (${durationMin}分・${this.currentSlots.length}枠)`;
            }
          }
        }
      }
    } else {
      if (titleEl) titleEl.textContent = '新規予約';
      if (submitBtn) submitBtn.textContent = '確定';
    }

    this.modalEl.classList.add('show');

    if (this.targetElement) {
      requestAnimationFrame(() => {
        this.positionNearElement(this.targetElement);
        if (this.treatmentInput && this.treatmentInput.value) {
          this.treatmentInput.focus();
        } else if (this.chartNoInput) {
          this.chartNoInput.focus();
        }
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
    const slotsToBook = (this.currentSlots && this.currentSlots.length > 0) ? this.currentSlots : [this.currentTimeStr];
    const dateStr = this.currentDateStr;
    const unitStr = this.currentUnitStr;
    const held = (window.pilotGridManager && window.pilotGridManager.hasBooking()) ? window.pilotGridManager.heldBooking : null;

    const finalizeBooking = () => {
      if (window.dbManager && typeof window.dbManager.addReservation === 'function') {
        // 日時変更（mode: move）の場合は元の予約を消去
        if (held && held.mode === 'move') {
          if (held.originalGroupReservations && held.originalGroupReservations.length > 0) {
            window.dbManager.deleteReservationGroup(held.originalGroupReservations);
          } else if (held.date && held.time && held.unit) {
            window.dbManager.deleteReservation(held.date, held.time, held.unit);
          }
        }

        // 新しい日時に予約を登録
        slotsToBook.forEach(slot => {
          window.dbManager.addReservation(
            null,
            dateStr,
            slot,
            unitStr,
            displayName,
            '',
            treatment,
            chartNo
          );
        });
        if (typeof window.dbManager.saveDatabase === 'function') {
          window.dbManager.saveDatabase();
        }
      }

      if (window.reservationGrid && typeof window.reservationGrid.render === 'function') {
        window.reservationGrid.render();
      }

      // パイロットグリッドと元セルの点線をクリア
      if (window.pilotGridManager) {
        window.pilotGridManager.clear();
      }
    };

    const targetEl = this.targetElement;
    this.close();

    // パイロットグリッドから目標セルへのD&D飛行アニメーションを実行
    if (window.pilotGridManager && window.pilotGridManager.hasBooking() && targetEl) {
      window.pilotGridManager.flyToTarget(targetEl, finalizeBooking);
    } else {
      finalizeBooking();
    }
  }
}

// ---------------------------------------------------
// Appointment Edit Modal Manager (AppointmentEditModal)
// なおる歯科 - 予約内容変更モーダル & 枠延長プルダウン
// ---------------------------------------------------

class AppointmentEditModal {
  constructor() {
    this.currentBookingData = null;
    this.targetElement = null;
    this.currentGroupReservations = [];
    this.startIndex = -1;
    this.maxSlots = 1;
    this.currentSlotCount = 1;

    // 患者マスタ
    this.patientList = [];
    this.patientMap = new Map();

    // 候補者選択
    this.activeCandidateIndex = -1;
    this.currentCandidates = [];

    this.timeSlots = [
      '08:30', '09:00', '09:30', '10:00', '10:30',
      '11:00', '11:30', '12:00', '12:30', '13:00',
      '13:30', '14:00', '14:30', '15:00', '15:30',
      '16:00', '16:30', '17:00', '17:30'
    ];

    this.init();
  }

  init() {
    this.createModalDOM();
    this.bindEvents();
    this.loadPatientMaster();
  }

  async loadPatientMaster() {
    if (window.appointmentModal && window.appointmentModal.patientList && window.appointmentModal.patientList.length > 0) {
      this.patientList = window.appointmentModal.patientList;
      this.patientMap = window.appointmentModal.patientMap;
      return;
    }
    try {
      const response = await fetch('PatList.csv');
      if (!response.ok) return;
      const text = await response.text();
      this.parsePatientCsv(text);
    } catch (e) {
      console.error('EditModal: PatList.csv読み込みエラー:', e);
    }
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
  }

  // -------------------------------------------
  // 1. DOM生成
  // -------------------------------------------

  createModalDOM() {
    if (document.getElementById('appEditModal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'appEditModal';
    overlay.className = 'app-modal-overlay';

    overlay.innerHTML = html`
      <div class="app-modal-container" id="appEditContainer">
        <div class="app-modal-header edit-modal-header">
          <div class="app-modal-title-group">
            <span class="app-modal-icon">✏️</span>
            <div class="app-modal-title">予約内容の変更</div>
          </div>
          <button type="button" class="app-modal-close-btn" id="btnAppEditModalClose" title="閉じる">✕</button>
        </div>

        <div class="app-modal-body" id="appEditModalBody">
          <!-- スロット情報バッジ -->
          <div class="app-modal-slot-info" id="appEditModalSlotInfo">
            <span class="slot-badge date-badge" id="appEditModalSlotDate">----/--/--</span>
            <span class="slot-badge time-badge" id="appEditModalSlotTime">--:--</span>
            <span class="slot-badge unit-badge" id="appEditModalSlotUnit">ユニット</span>
          </div>

          <!-- 患者情報 入力行 (横並び: カルテ番号 & 患者氏名) -->
          <div class="patient-form-row">
            <div class="form-group form-group-chartno">
              <div class="input-wrapper">
                <input type="text" id="appEditPatientChartNo" class="form-input" placeholder="カルテ番号" autocomplete="off">
              </div>
            </div>

            <div class="form-group form-group-name">
              <div class="input-wrapper">
                <input type="text" id="appEditPatientName" class="form-input" placeholder="患者氏名" autocomplete="off">
              </div>
            </div>
          </div>

          <!-- 候補者サジェスト一覧 -->
          <div class="patient-candidates-wrapper" id="appEditPatientCandidatesWrapper" style="display: none;">
            <div class="candidates-header">
              <span>🔍 該当する患者候補（クリックまたは上下キーで選択）</span>
              <button type="button" class="btn-close-candidates" id="btnEditCloseCandidates">✕</button>
            </div>
            <div class="candidates-list" id="appEditPatientCandidatesList"></div>
          </div>

          <!-- 処置内容 & 枠の長さ 横並び入力行 -->
          <div class="edit-treatment-row">
            <div class="form-group form-group-treatment">
              <div class="input-wrapper">
                <input type="text" id="appEditTreatmentContent" class="form-input" placeholder="処置内容を入力" autocomplete="off">
              </div>
            </div>

            <div class="form-group form-group-duration">
              <div class="input-wrapper">
                <select id="appEditDurationSelect" class="form-input form-select-duration" title="予約枠の長さを選択">
                  <option value="1">30分 (1枠)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- フッター: 左にキャンセル、右詰めに内容を変更する -->
        <div class="app-modal-footer edit-modal-footer">
          <button type="button" class="btn-cancel" id="btnAppEditModalCancel">キャンセル</button>
          <button type="button" class="btn-edit-submit" id="btnAppEditModalSubmit">内容を変更する</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
  }

  // -------------------------------------------
  // 2. イベントバインド
  // -------------------------------------------

  bindEvents() {
    this.modalEl = document.getElementById('appEditModal');
    this.containerEl = document.getElementById('appEditContainer');
    this.closeBtn = document.getElementById('btnAppEditModalClose');
    this.cancelBtn = document.getElementById('btnAppEditModalCancel');
    this.submitBtn = document.getElementById('btnAppEditModalSubmit');

    this.chartNoInput = document.getElementById('appEditPatientChartNo');
    this.nameInput = document.getElementById('appEditPatientName');
    this.treatmentInput = document.getElementById('appEditTreatmentContent');
    this.durationSelect = document.getElementById('appEditDurationSelect');

    this.slotDateEl = document.getElementById('appEditModalSlotDate');
    this.slotTimeEl = document.getElementById('appEditModalSlotTime');
    this.slotUnitEl = document.getElementById('appEditModalSlotUnit');

    this.candidatesWrapper = document.getElementById('appEditPatientCandidatesWrapper');
    this.candidatesList = document.getElementById('appEditPatientCandidatesList');
    this.closeCandidatesBtn = document.getElementById('btnEditCloseCandidates');

    if (this.closeCandidatesBtn) this.closeCandidatesBtn.onclick = () => this.hideCandidates();
    if (this.closeBtn) this.closeBtn.onclick = () => this.close();
    if (this.cancelBtn) this.cancelBtn.onclick = () => this.close();
    if (this.submitBtn) this.submitBtn.onclick = () => this.submit();

    // 枠数プルダウン変更時に時間バッジをリアルタイム更新
    if (this.durationSelect) {
      this.durationSelect.addEventListener('change', () => {
        this.updateTimeBadge();
      });
    }

    // 入力イベント（サジェスト連携）
    if (this.chartNoInput) {
      this.chartNoInput.addEventListener('input', (e) => this.onChartNoInput(e.target.value));
      this.chartNoInput.addEventListener('keydown', (e) => this.onInputKeyDown(e));
    }
    if (this.nameInput) {
      this.nameInput.addEventListener('input', (e) => this.onNameInput(e.target.value));
      this.nameInput.addEventListener('keydown', (e) => this.onInputKeyDown(e));
    }

    // 外側クリックで閉じる
    if (this.modalEl) {
      this.modalEl.addEventListener('mousedown', (e) => {
        if (e.target === this.modalEl) {
          this.close();
        }
      });
    }

    // Escキーで閉じる
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalEl && this.modalEl.classList.contains('show')) {
        this.close();
      }
    });
  }

  // -------------------------------------------
  // 3. サジェスト機能
  // -------------------------------------------

  onChartNoInput(val) {
    const rawVal = val.trim();
    if (!rawVal) {
      this.hideCandidates();
      return;
    }
    const cleanVal = rawVal.replace(/\D/g, '');
    let matched = this.patientMap.get(rawVal) || (cleanVal ? this.patientMap.get(cleanVal) : null);
    if (!matched && cleanVal) {
      matched = this.patientMap.get(cleanVal.padStart(4, '0'));
    }

    if (matched) {
      this.applyPatientData(matched, false);
      this.hideCandidates();
    } else {
      const filtered = this.patientList.filter(p => p.chartNo.includes(rawVal) || (cleanVal && p.chartNo.includes(cleanVal)));
      if (filtered.length > 0) {
        this.showCandidates(filtered.slice(0, 10));
      } else {
        this.hideCandidates();
      }
    }
  }

  onNameInput(val) {
    const rawVal = val.trim();
    if (!rawVal) {
      this.hideCandidates();
      return;
    }
    const norm = rawVal.replace(/\s+/g, '');
    const kanaNorm = this.toKatakana(norm);

    const filtered = this.patientList.filter(p => {
      return p.normName.includes(norm) || (kanaNorm && p.normKana.includes(kanaNorm)) || p.name.includes(rawVal);
    });

    if (filtered.length > 0) {
      this.showCandidates(filtered.slice(0, 10));
    } else {
      this.hideCandidates();
    }
  }

  onDobInput(val) {
    const rawVal = val.trim();
    if (!rawVal) {
      this.hideCandidates();
      return;
    }
    const cleanDigits = rawVal.replace(/\D/g, '');
    if (cleanDigits.length < 4) {
      this.hideCandidates();
      return;
    }

    const filtered = this.patientList.filter(p => {
      return (p.digitsDob && p.digitsDob.includes(cleanDigits)) || (p.dob && p.dob.includes(rawVal)) || (p.rawDob && p.rawDob.includes(rawVal));
    });

    if (filtered.length > 0) {
      this.showCandidates(filtered.slice(0, 10));
    } else {
      this.hideCandidates();
    }
  }

  toKatakana(str) {
    if (!str) return '';
    return str.replace(/[\u3041-\u3096]/g, m => String.fromCharCode(m.charCodeAt(0) + 0x60));
  }

  applyPatientData(patient, overwriteChart = true) {
    if (!patient) return;
    if (overwriteChart && this.chartNoInput) {
      this.chartNoInput.value = patient.chartNo;
      this.chartNoInput.classList.add('match-found');
    }
    if (this.nameInput) {
      this.nameInput.value = patient.name;
      this.nameInput.classList.add('auto-filled');
    }
    if (this.dobInput) {
      this.dobInput.value = patient.dob || patient.rawDob || '';
      this.dobInput.classList.add('auto-filled');
    }
  }

  showCandidates(candidates) {
    if (!this.candidatesWrapper || !this.candidatesList) return;
    this.currentCandidates = candidates;
    this.activeCandidateIndex = -1;
    this.candidatesList.innerHTML = '';

    candidates.forEach((cand, idx) => {
      const item = document.createElement('div');
      item.className = 'candidate-item';
      item.dataset.index = idx;

      const sexLabel = cand.sex === '男' ? '男' : (cand.sex === '女' ? '女' : '');
      const sexClass = cand.sex === '男' ? 'sex-male' : (cand.sex === '女' ? 'sex-female' : '');

      item.innerHTML = html`
        <span class="cand-chart">${cand.chartNo || '---'}</span>
        <span class="cand-name">${cand.name}</span>
        <span class="cand-kana">${cand.kana || ''}</span>
        <span class="cand-dob">${cand.dob || cand.rawDob || ''}</span>
        ${sexLabel ? `<span class="cand-sex ${sexClass}">${sexLabel}</span>` : ''}
      `;

      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.selectCandidate(idx);
      });

      this.candidatesList.appendChild(item);
    });

    this.candidatesWrapper.style.display = 'block';
  }

  hideCandidates() {
    if (this.candidatesWrapper) {
      this.candidatesWrapper.style.display = 'none';
    }
    this.currentCandidates = [];
    this.activeCandidateIndex = -1;
  }

  selectCandidate(idx) {
    if (idx >= 0 && idx < this.currentCandidates.length) {
      const cand = this.currentCandidates[idx];
      this.applyPatientData(cand, true);
    }
    this.hideCandidates();
  }

  onInputKeyDown(e) {
    if (!this.candidatesWrapper || this.candidatesWrapper.style.display === 'none') {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submit();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.activeCandidateIndex = Math.min(this.activeCandidateIndex + 1, this.currentCandidates.length - 1);
      this.highlightCandidate();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.activeCandidateIndex = Math.max(this.activeCandidateIndex - 1, 0);
      this.highlightCandidate();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.activeCandidateIndex >= 0) {
        this.selectCandidate(this.activeCandidateIndex);
      } else if (this.currentCandidates.length > 0) {
        this.selectCandidate(0);
      }
    } else if (e.key === 'Escape') {
      this.hideCandidates();
    }
  }

  highlightCandidate() {
    const items = this.candidatesList.querySelectorAll('.candidate-item');
    items.forEach((item, idx) => {
      if (idx === this.activeCandidateIndex) {
        item.classList.add('active');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('active');
      }
    });
  }

  // -------------------------------------------
  // 4. モーダルオープン & 枠計算
  // -------------------------------------------

  open(bookingData, targetCell) {
    if (!this.modalEl) {
      this.createModalDOM();
      this.bindEvents();
    }

    this.currentBookingData = bookingData;
    this.targetElement = targetCell || null;

    const dateStr = bookingData.date;
    const unitStr = bookingData.unit;
    const groupId = bookingData.groupId;

    // 対象日・対象ユニットの予約一覧を取得
    const allRes = (window.dbManager && typeof window.dbManager.getReservations === 'function')
      ? window.dbManager.getReservations()
      : [];
    const dayReservations = allRes.filter(r => r.date === dateStr && r.unit === unitStr);

    // このグループに属する既存予約を特定
    this.currentGroupReservations = this.findGroupReservations(bookingData, dayReservations);
    
    // 開始スロット時間と開始インデックスを特定
    let startTime = bookingData.time;
    if (this.currentGroupReservations.length > 0) {
      const sorted = [...this.currentGroupReservations].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      startTime = sorted[0].time;
    }
    this.startIndex = this.timeSlots.indexOf(startTime);
    if (this.startIndex < 0) this.startIndex = 0;

    this.currentSlotCount = Math.max(1, this.currentGroupReservations.length);

    // 最大延長可能枠数を計算（後続に他の予約があればそこまで）
    this.maxSlots = this.calculateMaxSlots(this.startIndex, this.currentGroupReservations, dayReservations);

    // プルダウンを生成
    this.populateDurationSelect(this.maxSlots, this.currentSlotCount);

    // 入力欄に初期値をコピー
    if (this.chartNoInput) this.chartNoInput.value = bookingData.chartNo || '';
    if (this.nameInput) this.nameInput.value = bookingData.patientName || '';
    if (this.treatmentInput) this.treatmentInput.value = bookingData.treatment || '';

    // バッジ情報を設定
    if (this.slotDateEl) this.slotDateEl.textContent = this.formatBadgeDate(dateStr);
    if (this.slotUnitEl) this.slotUnitEl.textContent = unitStr || 'ユニット';
    this.updateTimeBadge();

    this.hideCandidates();
    this.modalEl.classList.add('show');

    // 位置決め
    if (this.targetElement) {
      requestAnimationFrame(() => {
        this.positionNearElement(this.targetElement);
        if (this.treatmentInput) this.treatmentInput.focus();
      });
    } else {
      if (this.containerEl) {
        this.containerEl.style.left = '50%';
        this.containerEl.style.top = '50%';
        this.containerEl.style.transform = 'translate(-50%, -50%)';
      }
      if (this.treatmentInput) setTimeout(() => this.treatmentInput.focus(), 50);
    }
  }

  // 同じ予約グループに属する予約アイテムを抽出
  findGroupReservations(bookingData, dayReservations) {
    if (!dayReservations || dayReservations.length === 0) return [];

    const isSameBooking = (r) => {
      if (bookingData.groupId && r.group_id === bookingData.groupId) return true;
      if (bookingData.chartNo && r.chart_no === bookingData.chartNo) return true;
      if (bookingData.patientName && (r.patient_name === bookingData.patientName || r.name === bookingData.patientName)) return true;
      return false;
    };

    const matched = dayReservations.filter(isSameBooking);
    return matched;
  }

  // 最大延長可能枠数を算出
  calculateMaxSlots(startIndex, currentGroup, dayReservations) {
    const currentGroupIds = new Set(currentGroup.map(r => r.id));
    let count = 0;

    for (let i = startIndex; i < this.timeSlots.length; i++) {
      const slotTime = this.timeSlots[i];
      const existing = dayReservations.find(r => r.time === slotTime);

      if (existing) {
        // 自グループの予約であれば延長可能
        if (currentGroupIds.has(existing.id) || this.isBelongingToGroup(existing, this.currentBookingData)) {
          count++;
        } else {
          // 別の患者の予約が入っているため、これ以上は延長不可！
          break;
        }
      } else {
        // 空きスロットなので延長可能
        count++;
      }
    }

    return Math.max(1, count);
  }

  isBelongingToGroup(r, bookingData) {
    if (!r || !bookingData) return false;
    if (bookingData.groupId && r.group_id === bookingData.groupId) return true;
    if (bookingData.chartNo && r.chart_no === bookingData.chartNo) return true;
    if (bookingData.patientName && (r.patient_name === bookingData.patientName || r.name === bookingData.patientName)) return true;
    return false;
  }

  // 枠数プルダウンの選択肢を生成
  populateDurationSelect(maxSlots, defaultSlotCount) {
    if (!this.durationSelect) return;
    this.durationSelect.innerHTML = '';

    for (let s = 1; s <= maxSlots; s++) {
      const opt = document.createElement('option');
      opt.value = s;
      const min = s * 30;
      opt.textContent = `${min}分 (${s}枠)`;
      if (s === defaultSlotCount) {
        opt.selected = true;
      }
      this.durationSelect.appendChild(opt);
    }
  }

  updateTimeBadge() {
    if (!this.slotTimeEl || this.startIndex < 0) return;

    const selectedSlots = parseInt(this.durationSelect ? this.durationSelect.value : '1', 10) || 1;
    const firstTime = this.timeSlots[this.startIndex] || '--:--';
    const lastIndex = this.startIndex + selectedSlots - 1;
    const lastTime = this.timeSlots[Math.min(lastIndex, this.timeSlots.length - 1)] || firstTime;
    const endTime = this.getEndTimeOfSlot(lastTime);
    const durationMin = selectedSlots * 30;

    this.slotTimeEl.textContent = `${firstTime} 〜 ${endTime} (${durationMin}分・${selectedSlots}枠)`;
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

  close() {
    this.hideCandidates();
    if (this.modalEl) this.modalEl.classList.remove('show');
    if (window.reservationGrid && typeof window.reservationGrid.clearSelection === 'function') {
      window.reservationGrid.clearSelection();
    }
  }

  // -------------------------------------------
  // 5. 保存 & グリッド反映
  // -------------------------------------------

  submit() {
    const chartNo = this.chartNoInput ? this.chartNoInput.value.trim() : '';
    const name = this.nameInput ? this.nameInput.value.trim() : '';
    const treatment = this.treatmentInput ? this.treatmentInput.value.trim() : '';
    const selectedSlotCount = parseInt(this.durationSelect ? this.durationSelect.value : '1', 10) || 1;

    if (!name && !chartNo) {
      this.close();
      return;
    }

    const displayName = name || (chartNo ? `カルテ: ${chartNo}` : '患者');
    const dateStr = this.currentBookingData.date;
    const unitStr = this.currentBookingData.unit;

    // 新しいスロット一覧
    const newSlots = [];
    for (let i = 0; i < selectedSlotCount; i++) {
      const slotIndex = this.startIndex + i;
      if (slotIndex < this.timeSlots.length) {
        newSlots.push(this.timeSlots[slotIndex]);
      }
    }

    if (window.dbManager) {
      // 1. 旧予約グループのレコードを削除
      if (this.currentGroupReservations && this.currentGroupReservations.length > 0) {
        window.dbManager.deleteReservationGroup(this.currentGroupReservations);
      } else if (this.currentBookingData.time) {
        window.dbManager.deleteReservation(dateStr, this.currentBookingData.time, unitStr);
      }

      // 2. 新しいスロット群を登録
      newSlots.forEach(slot => {
        window.dbManager.addReservation(
          null,
          dateStr,
          slot,
          unitStr,
          displayName,
          '',
          treatment,
          chartNo
        );
      });

      // 3. 永続化保存
      if (typeof window.dbManager.saveDatabase === 'function') {
        window.dbManager.saveDatabase();
      }
    }

    // グリッドを再描画
    if (window.reservationGrid && typeof window.reservationGrid.render === 'function') {
      window.reservationGrid.render();
    }

    this.close();
  }
}

// ---------------------------------------------------
// Pilot Edit Modal Manager (PilotEditModal)
// なおる歯科 - パイロットグリッド 予約内容・枠数変更モーダル
// ---------------------------------------------------

class PilotEditModal {
  constructor() {
    this.init();
  }

  init() {
    this.createModalDOM();
    this.bindEvents();
  }

  createModalDOM() {
    if (document.getElementById('pilotEditModal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'pilotEditModal';
    overlay.className = 'app-modal-overlay';

    overlay.innerHTML = html`
      <div class="app-modal-container" id="pilotEditContainer">
        <div class="app-modal-header" style="background: linear-gradient(135deg, #0284c7, #0369a1);">
          <div class="app-modal-title-group">
            <span class="app-modal-icon">📌</span>
            <div class="app-modal-title">パイロットグリッド 予約内容の変更</div>
          </div>
          <button type="button" class="app-modal-close-btn" id="btnPilotEditClose" title="閉じる">✕</button>
        </div>

        <div class="app-modal-body" id="pilotEditModalBody">
          <!-- スロット情報バッジ -->
          <div class="app-modal-slot-info">
            <span class="slot-badge" style="background-color: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;">📌 パイロットグリッド (次回新規予約)</span>
            <span class="slot-badge time-badge" id="pilotEditBadgeDuration">30分 (1枠)</span>
          </div>

          <!-- 患者情報 入力行 (横並び) -->
          <div class="patient-form-row">
            <div class="form-group form-group-chartno">
              <div class="input-wrapper">
                <input type="text" id="pilotEditPatientChartNo" class="form-input" placeholder="カルテ番号" autocomplete="off">
              </div>
            </div>

            <div class="form-group form-group-name">
              <div class="input-wrapper">
                <input type="text" id="pilotEditPatientName" class="form-input" placeholder="患者氏名" autocomplete="off">
              </div>
            </div>
          </div>

          <!-- 処置内容 & 枠の長さ 横並び入力行 -->
          <div class="edit-treatment-row">
            <div class="form-group form-group-treatment">
              <div class="input-wrapper">
                <input type="text" id="pilotEditTreatment" class="form-input" placeholder="処置内容を入力" autocomplete="off">
              </div>
            </div>

            <div class="form-group form-group-duration">
              <div class="input-wrapper">
                <select id="pilotEditDurationSelect" class="form-input form-select-duration" title="予約枠の長さを選択">
                  <option value="1">30分 (1枠)</option>
                  <option value="2">60分 (2枠)</option>
                  <option value="3">90分 (3枠)</option>
                  <option value="4">120分 (4枠)</option>
                  <option value="5">150分 (5枠)</option>
                  <option value="6">180分 (6枠)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- フッター -->
        <div class="app-modal-footer edit-modal-footer">
          <button type="button" class="btn-cancel" id="btnPilotEditCancel">キャンセル</button>
          <button type="button" class="btn-edit-submit" id="btnPilotEditSubmit">パイロットに反映する</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
  }

  bindEvents() {
    this.modalEl = document.getElementById('pilotEditModal');
    this.containerEl = document.getElementById('pilotEditContainer');
    this.closeBtn = document.getElementById('btnPilotEditClose');
    this.cancelBtn = document.getElementById('btnPilotEditCancel');
    this.submitBtn = document.getElementById('btnPilotEditSubmit');

    this.chartNoInput = document.getElementById('pilotEditPatientChartNo');
    this.nameInput = document.getElementById('pilotEditPatientName');
    this.treatmentInput = document.getElementById('pilotEditTreatment');
    this.durationSelect = document.getElementById('pilotEditDurationSelect');
    this.badgeDuration = document.getElementById('pilotEditBadgeDuration');

    if (this.closeBtn) this.closeBtn.onclick = () => this.close();
    if (this.cancelBtn) this.cancelBtn.onclick = () => this.close();
    if (this.submitBtn) this.submitBtn.onclick = () => this.submit();

    if (this.durationSelect) {
      this.durationSelect.addEventListener('change', () => {
        const slots = parseInt(this.durationSelect.value, 10) || 1;
        if (this.badgeDuration) this.badgeDuration.textContent = `${slots * 30}分 (${slots}枠)`;
      });
    }

    if (this.modalEl) {
      this.modalEl.addEventListener('mousedown', (e) => {
        if (e.target === this.modalEl) this.close();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalEl && this.modalEl.classList.contains('show')) {
        this.close();
      }
    });
  }

  open(heldBooking, targetEl) {
    if (!this.modalEl) {
      this.createModalDOM();
      this.bindEvents();
    }

    const titleEl = this.modalEl.querySelector('.app-modal-title');
    const badgeEl = this.modalEl.querySelector('.app-modal-slot-info .slot-badge:first-child');
    const submitBtn = this.submitBtn;

    const isMove = heldBooking.mode === 'move';
    if (titleEl) titleEl.textContent = isMove ? 'パイロットグリッド 予約日時変更' : 'パイロットグリッド 予約内容の変更';
    if (badgeEl) badgeEl.textContent = isMove ? '📅 パイロットグリッド (日時変更)' : '📌 パイロットグリッド (次回新規予約)';
    if (submitBtn) submitBtn.textContent = 'パイロットに反映する';

    if (this.chartNoInput) this.chartNoInput.value = heldBooking.chartNo || '';
    if (this.nameInput) this.nameInput.value = heldBooking.patientName || '';
    if (this.treatmentInput) this.treatmentInput.value = heldBooking.treatment || '';

    const slotCount = heldBooking.slotCount || 1;
    if (this.durationSelect) this.durationSelect.value = String(slotCount);
    if (this.badgeDuration) this.badgeDuration.textContent = `${slotCount * 30}分 (${slotCount}枠)`;

    this.modalEl.classList.add('show');

    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const modalWidth = this.containerEl.offsetWidth || 580;
      let left = Math.max(16, rect.left);
      let top = rect.bottom + 10;
      if (left + modalWidth > window.innerWidth - 16) left = window.innerWidth - modalWidth - 16;
      this.containerEl.style.left = `${left}px`;
      this.containerEl.style.top = `${top}px`;
    } else {
      this.containerEl.style.left = '50%';
      this.containerEl.style.top = '50%';
      this.containerEl.style.transform = 'translate(-50%, -50%)';
    }

    setTimeout(() => {
      if (this.treatmentInput) this.treatmentInput.focus();
    }, 50);
  }

  close() {
    if (this.modalEl) this.modalEl.classList.remove('show');
  }

  submit() {
    const chartNo = this.chartNoInput ? this.chartNoInput.value.trim() : '';
    const name = this.nameInput ? this.nameInput.value.trim() : '';
    const treatment = this.treatmentInput ? this.treatmentInput.value.trim() : '';
    const slotCount = parseInt(this.durationSelect ? this.durationSelect.value : '1', 10) || 1;

    if (window.pilotGridManager) {
      window.pilotGridManager.updateHeldBooking(chartNo, name, treatment, slotCount);
    }
    this.close();
  }
}

// ---------------------------------------------------
// Pilot Grid Manager (PilotGridManager)
// なおる歯科 - パイロットグリッド制御 & D&D飛行アニメーション
// ---------------------------------------------------

class PilotGridManager {
  constructor() {
    this.heldBooking = null;
    this.sourceCell = null;
    this.sourceGroupCells = [];

    this.containerEl = document.getElementById('pilotGridContainer');
    this.emptyEl = document.getElementById('pilotGridEmpty');

    this.init();
  }

  init() {
    if (!this.containerEl) {
      this.containerEl = document.getElementById('pilotGridContainer');
    }
    if (this.containerEl) {
      this.containerEl.addEventListener('click', (e) => {
        // クリアボタンクリック時はモーダルを開かない
        if (e.target.closest('.pilot-clear-btn')) return;
        if (this.hasBooking()) {
          if (window.pilotEditModal) {
            window.pilotEditModal.open(this.heldBooking, this.containerEl);
          }
        }
      });
    }
  }

  hasBooking() {
    return Boolean(this.heldBooking);
  }

  // 新規予約(copy)または日時変更(move)クリック時：元セルからパイロットグリッドへカードをキープ
  setBooking(bookingData, sourceCellEl, mode = 'copy') {
    // 以前のキープがあればクリア
    this.clearSourceDotted();

    // 元の予約グループ（DBレコード群）を特定
    let matchedGroupRes = [];
    if (window.dbManager && typeof window.dbManager.getReservations === 'function') {
      const all = window.dbManager.getReservations();
      matchedGroupRes = all.filter(r => {
        if (r.date !== bookingData.date) return false;
        if (bookingData.groupId && r.group_id === bookingData.groupId) return true;
        if (bookingData.chartNo && r.chart_no === bookingData.chartNo && r.unit === bookingData.unit) return true;
        if (bookingData.patientName && (r.patient_name === bookingData.patientName || r.name === bookingData.patientName) && r.unit === bookingData.unit) return true;
        return false;
      });
    }

    this.heldBooking = {
      chartNo: bookingData.chartNo || '',
      patientName: bookingData.patientName || '',
      treatment: bookingData.treatment || '',
      slotCount: bookingData.slotCount || (matchedGroupRes.length > 0 ? matchedGroupRes.length : 1),
      durationMin: bookingData.durationMin || ((bookingData.slotCount || 1) * 30),
      groupId: bookingData.groupId || '',
      date: bookingData.date || '',
      time: bookingData.time || '',
      unit: bookingData.unit || '',
      mode: mode, // 'copy' (新規予約) or 'move' (日時変更)
      originalGroupReservations: matchedGroupRes
    };

    this.sourceCell = sourceCellEl || null;

    // 元セル（および同一グループセル）を点線ボーダー化
    this.highlightSourceDotted(bookingData, sourceCellEl);

    // D&D飛行アニメーションを実行
    this.flyToPilot(sourceCellEl, () => {
      this.renderPilotCard();
    });
  }

  highlightSourceDotted(bookingData, cellEl) {
    this.sourceGroupCells = [];
    const groupId = bookingData.groupId;
    const container = document.getElementById('reservationGrid') || document;

    if (groupId) {
      const groupCells = container.querySelectorAll(`[data-booking-group="${groupId}"]`);
      groupCells.forEach(cell => {
        cell.classList.add('card-source-dotted');
        this.sourceGroupCells.push(cell);
      });
    } else if (cellEl) {
      cellEl.classList.add('card-source-dotted');
      this.sourceGroupCells.push(cellEl);
    }
  }

  clearSourceDotted() {
    if (this.sourceGroupCells && this.sourceGroupCells.length > 0) {
      this.sourceGroupCells.forEach(cell => cell.classList.remove('card-source-dotted'));
    }
    const allDotted = document.querySelectorAll('.card-source-dotted');
    allDotted.forEach(cell => cell.classList.remove('card-source-dotted'));
    this.sourceGroupCells = [];
    this.sourceCell = null;
  }

  // パイロットグリッドの内容を更新
  updateHeldBooking(chartNo, name, treatment, slotCount) {
    if (!this.heldBooking) return;
    if (chartNo !== undefined) this.heldBooking.chartNo = chartNo;
    if (name !== undefined) this.heldBooking.patientName = name;
    if (treatment !== undefined) this.heldBooking.treatment = treatment;
    if (slotCount !== undefined) {
      this.heldBooking.slotCount = slotCount;
      this.heldBooking.durationMin = slotCount * 30;
    }
    this.renderPilotCard();
  }

  // パイロットカードの描画
  renderPilotCard() {
    if (!this.containerEl) return;
    if (!this.heldBooking) {
      this.containerEl.classList.remove('pilot-active');
      this.containerEl.innerHTML = html`
        <div class="pilot-grid-empty" id="pilotGridEmpty">
          <span class="pilot-empty-icon">📌</span>
          <span class="pilot-empty-text">予約カード  ピン</span>
        </div>
      `;
      return;
    }

    this.containerEl.classList.add('pilot-active');
    const b = this.heldBooking;
    const isMove = b.mode === 'move';
    const durationText = isMove ? `📅 移動: ${b.slotCount * 30}分` : `${b.slotCount * 30}分`;

    this.containerEl.innerHTML = html`
      <div class="pilot-card-content">
        <div class="pilot-card-main">
          ${b.chartNo ? `<span class="pilot-chart-no">${b.chartNo}</span>` : ''}
          <div class="pilot-patient-info">
            <span class="pilot-patient-name">${b.patientName || '新規患者'}</span>
            ${b.treatment ? `<span class="pilot-treatment-tag">${b.treatment}</span>` : ''}
          </div>
        </div>
        <span class="pilot-badge-duration" style="${isMove ? 'color: #0369a1; background-color: #e0f2fe; border-color: #bae6fd;' : ''}">${durationText}</span>
        <button type="button" class="pilot-clear-btn" id="btnPilotClear" title="キープを解除">✕</button>
      </div>
    `;

    const clearBtn = this.containerEl.querySelector('#btnPilotClear');
    if (clearBtn) {
      clearBtn.onclick = (e) => {
        e.stopPropagation();
        this.clear();
      };
    }
  }

  // キープクリア
  clear() {
    this.clearSourceDotted();
    this.heldBooking = null;
    this.renderPilotCard();
  }

  // 元セルからパイロットグリッドへのD&D飛行アニメーション
  flyToPilot(fromEl, callback) {
    if (!fromEl || !this.containerEl) {
      if (callback) callback();
      return;
    }

    const startRect = fromEl.getBoundingClientRect();
    const endRect = this.containerEl.getBoundingClientRect();

    const clone = document.createElement('div');
    clone.className = 'card-flight-clone';
    clone.style.left = `${startRect.left}px`;
    clone.style.top = `${startRect.top}px`;
    clone.style.width = `${startRect.width}px`;
    clone.style.height = `${startRect.height}px`;
    clone.style.opacity = '0.9';

    const b = this.heldBooking;
    clone.innerHTML = html`
      ${b.chartNo ? `<span class="pilot-chart-no" style="margin-right: 6px;">${b.chartNo}</span>` : ''}
      <span style="font-weight: 700; font-size: 0.88rem; color: #0f172a;">${b.patientName}</span>
    `;

    document.body.appendChild(clone);

    // 次のフレームで移動
    requestAnimationFrame(() => {
      clone.style.left = `${endRect.left}px`;
      clone.style.top = `${endRect.top}px`;
      clone.style.width = `${endRect.width}px`;
      clone.style.height = `${endRect.height}px`;
      clone.style.opacity = '1';
      clone.style.transform = 'scale(0.98)';
    });

    setTimeout(() => {
      clone.remove();
      if (callback) callback();
    }, 460);
  }

  // パイロットグリッドから目標予約セルへのD&D飛行アニメーション
  flyToTarget(toEl, callback) {
    if (!toEl || !this.containerEl || !this.heldBooking) {
      if (callback) callback();
      return;
    }

    const startRect = this.containerEl.getBoundingClientRect();
    const endRect = toEl.getBoundingClientRect();

    const clone = document.createElement('div');
    clone.className = 'card-flight-clone';
    clone.style.left = `${startRect.left}px`;
    clone.style.top = `${startRect.top}px`;
    clone.style.width = `${startRect.width}px`;
    clone.style.height = `${startRect.height}px`;
    clone.style.opacity = '1';

    const b = this.heldBooking;
    clone.innerHTML = html`
      ${b.chartNo ? `<span class="pilot-chart-no" style="margin-right: 6px;">${b.chartNo}</span>` : ''}
      <span style="font-weight: 700; font-size: 0.88rem; color: #0f172a;">${b.patientName}</span>
    `;

    document.body.appendChild(clone);

    // 目標セルの高さ（枠数分）
    const slotCount = b.slotCount || 1;
    const targetHeight = endRect.height * slotCount;

    requestAnimationFrame(() => {
      clone.style.left = `${endRect.left}px`;
      clone.style.top = `${endRect.top}px`;
      clone.style.width = `${endRect.width}px`;
      clone.style.height = `${targetHeight}px`;
      clone.style.opacity = '0.95';
      clone.style.transform = 'scale(1)';
    });

    setTimeout(() => {
      clone.remove();
      if (callback) callback();
    }, 460);
  }
}

// グローバルインスタンス & 初期化
window.appointmentModal = null;
window.appointmentEditModal = null;
window.pilotGridManager = null;
window.pilotEditModal = null;

document.addEventListener('DOMContentLoaded', () => {
  window.appointmentModal = new AppointmentModal();
  window.appointmentEditModal = new AppointmentEditModal();
  window.pilotGridManager = new PilotGridManager();
  window.pilotEditModal = new PilotEditModal();
});


