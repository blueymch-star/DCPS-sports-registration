/**
 * 校慶運動競賽管理系統 - 前端核心邏輯
 * 依據大庄國小 71 週年校慶報名表格式動態適應年級項目（三四年級: 60m/100m, 五六年級: 100m/200m）
 * 包含：反向蛇形分組（第3組至第1組）、同班迴避機制、優勢道次排定（4, 5, 3, 2, 1, 6）、預決賽公告輸出與 Google Sheets 同步
 */

// 自動移除 Netlify 浮水印與標章 (Powered by Netlify)
function removeNetlifyBadge() {
  const selectors = [
    '#nl-badge-frame',
    '#nl-hud-frame',
    'iframe[id^="nl-"]',
    'iframe[src*="netlify"]',
    '[data-netlify-deploy-id]',
    '.netlify-badge',
    'a[href*="netlify.com"]'
  ];
  selectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => el.remove());
  });
}
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", removeNetlifyBadge);
  window.addEventListener("load", removeNetlifyBadge);
  window.addEventListener("beforeprint", removeNetlifyBadge);
  try {
    const badgeObserver = new MutationObserver(() => removeNetlifyBadge());
    badgeObserver.observe(document.documentElement, { childList: true, subtree: true });
  } catch(e) {}
}

// 全域狀態
const state = {
  currentRole: "teacher",       // 'teacher' (前台) | 'admin' (後台)
  activePublicNotice: "prelim-roster", // 'prelim-roster' | 'prelim-score' | 'finals-roster' | 'finals-score'
  published: {
    prelimRoster: false,        // 預賽分組名冊是否已發布
    prelimScore: false,         // 預賽完賽成績公告是否已發布
    finalsRoster: false,        // 決賽分組名冊是否已發布
    finalsScore: false          // 決賽成績公告是否已發布
  },
  lockedClasses: {},           // 班級報名防竄改鎖定狀態: { "三甲": true, "六乙": false }
  registrations: [],
  prelimHeats: [],     // 預賽編排：[{ heatNum: 1, lanes: [{lane, athlete, score}] }]
  prelimResults: [],   // 預賽完賽成績
  finalists: [],       // 晉級決賽名單 (8人)
  finalResults: [],    // 決賽完賽結果
  spreadsheetUrl: null
};

// 全校各年級班級清單 (大庄國小三至六年級)
const ALL_SCHOOL_CLASSES = [
  "三甲", "三乙", "三丙", "三丁", "三戊",
  "四甲", "四乙", "四丙", "四丁", "四戊",
  "五甲", "五乙", "五丙", "五丁", "五戊",
  "六甲", "六乙", "六丙", "六丁", "六戊"
];

// 預賽道次順序配置（5 道：第 4、5、3、2、1 道；若選 6 道則為 4, 5, 3, 2, 1, 6）
const PRELIM_LANE_PRIORITY_5 = [4, 5, 3, 2, 1];
const PRELIM_LANE_PRIORITY_6 = [4, 5, 3, 2, 1, 6];

// 決賽道次順序配置（6 道：依成績優先排入 4、5、6、3、2、1 道）
const FINALS_LANE_PRIORITY_6 = [4, 5, 6, 3, 2, 1];

// 年度設定輔助存取函式（自 config.js 集中讀取）
function getSchoolName() {
  return (typeof CONFIG !== "undefined" && CONFIG.SCHOOL_NAME) || "新竹市香山區大庄國民小學";
}
function getShortSchoolName() {
  return (typeof CONFIG !== "undefined" && CONFIG.SHORT_SCHOOL_NAME) || "大庄國小";
}
function getAnniversary() {
  return (typeof CONFIG !== "undefined" && CONFIG.ANNIVERSARY) || "71";
}
function getDeadlineDate() {
  return (typeof CONFIG !== "undefined" && CONFIG.DEADLINE_DATE) || "115年10月12日(一)";
}
function getDefaultCompDate() {
  return (typeof CONFIG !== "undefined" && CONFIG.DEFAULT_COMP_DATE) || "115.11.11";
}

// 自動將 config.js 集中設定同步套用至網頁所有抬頭、標題與預設日期
function applyYearConfig() {
  const school = getSchoolName();
  const shortSchool = getShortSchoolName();
  const year = getAnniversary();
  const deadline = getDeadlineDate();
  const compDate = getDefaultCompDate();

  // 1. 瀏覽器標籤頁標題
  document.title = `${school} ${year} 週年校慶運動競賽報名系統`;

  // 2. 前台頂部導覽列大標題
  const brandH1 = document.querySelector("#teacherNavContainer .brand h1");
  if (brandH1) brandH1.textContent = `${shortSchool} ${year} 週年校慶運動競賽`;

  // 3. 報名表抬頭與大標題
  const schoolTitleEl = document.querySelector(".school-name");
  if (schoolTitleEl) schoolTitleEl.textContent = school;

  const eventTitleEl = document.querySelector(".event-title");
  if (eventTitleEl) eventTitleEl.textContent = `${year} 週年校慶運動競賽報名表`;

  // 4. 截止日期提示
  const deadlineEl = document.querySelector(".deadline-date");
  if (deadlineEl) deadlineEl.textContent = deadline;

  // 5. 比賽預設日期輸入框
  const dateInput = document.getElementById("competitionDateInput");
  if (dateInput && (!dateInput.value || dateInput.value === "115.11.11")) {
    dateInput.value = compDate;
  }
}

// DOM 載入後初始化
document.addEventListener("DOMContentLoaded", () => {
  applyYearConfig();
  initTabs();
  initRoleAndModal();
  initPublicViews();
  initDynamicRegistrationForm();
  initClassLockEvents();
  renderClassLockControlUI();
  initSeedingEvents();
  initScheduleModal();
  initPrelimScoringEvents();
  initFinalsEvents();
  checkCloudStatus();
  updateNoticeDate();
  renderPublicRegistrationTable();
  renderPublicNoticeView();
  updatePublishControlUI();
  loadRegistrationsFromCloud();
});

// 分頁切換（同時支援前台選單與後台選單）
function initTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const parentNav = btn.closest(".tab-bar");
      if (parentNav) {
        parentNav.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      } else {
        tabBtns.forEach(b => b.classList.remove("active"));
      }
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

      btn.classList.add("active");
      const target = document.getElementById(btn.dataset.tab);
      if (target) {
        target.classList.add("active");
        if (btn.dataset.tab === "tab-public-roster") {
          renderPublicRegistrationTable();
        } else if (btn.dataset.tab === "tab-public-notices") {
          renderPublicNoticeView();
        }
      }
    });
  });

  const goFinalsBtn = document.getElementById("btnGoToFinalsTab");
  if (goFinalsBtn) {
    goFinalsBtn.addEventListener("click", () => {
      const targetBtn = document.querySelector('[data-tab="tab-admin-finals"]');
      if (targetBtn) targetBtn.click();
    });
  }
}

// ==========================================
// 角色權限管理與後台登入 Modal 控制
// ==========================================
function initRoleAndModal() {
  const openModalBtn = document.getElementById("btnOpenAdminModal");
  const modal = document.getElementById("adminLoginModal");
  const closeModalBtn = document.getElementById("btnCloseAdminModal");
  const cancelModalBtn = document.getElementById("btnCancelAdminModal");
  const confirmLoginBtn = document.getElementById("btnConfirmAdminLogin");
  const quickLoginBtn = document.getElementById("btnQuickLogin");
  const exitAdminBtn = document.getElementById("btnExitAdmin");
  const pwdInput = document.getElementById("adminPasswordInput");
  const errorMsg = document.getElementById("adminLoginError");

  const showModal = () => {
    if (!modal) return;
    modal.style.display = "flex";
    if (pwdInput) {
      pwdInput.value = "";
      setTimeout(() => pwdInput.focus(), 50);
    }
    if (errorMsg) errorMsg.style.display = "none";
  };

  const hideModal = () => {
    if (!modal) return;
    modal.style.display = "none";
    if (pwdInput) pwdInput.value = "";
    if (errorMsg) errorMsg.style.display = "none";
  };

  if (openModalBtn) openModalBtn.addEventListener("click", showModal);
  if (closeModalBtn) closeModalBtn.addEventListener("click", hideModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener("click", hideModal);

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) hideModal();
    });
  }

  const doLogin = (pwd) => {
    const inputVal = (pwd !== undefined ? pwd : (pwdInput ? pwdInput.value : "")).trim();
    if (inputVal === "183618") {
      hideModal();
      switchRole("admin");
      showStatus("👑 歡迎體育組長登入！現已切換至賽務管理後台控制台。", "success");
    } else {
      if (errorMsg) errorMsg.style.display = "block";
      if (pwdInput) {
        pwdInput.focus();
        pwdInput.select();
      }
    }
  };

  if (confirmLoginBtn) {
    confirmLoginBtn.addEventListener("click", () => doLogin());
  }

  if (pwdInput) {
    pwdInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doLogin();
      }
    });
  }

  if (quickLoginBtn) {
    quickLoginBtn.style.display = "none";
  }

  if (exitAdminBtn) {
    exitAdminBtn.addEventListener("click", () => {
      switchRole("teacher");
      showStatus("已安全登出後台，已切換回教師與全校公開前台。", "info");
    });
  }
}

function switchRole(role) {
  state.currentRole = role;
  const teacherNav = document.getElementById("teacherNavContainer");
  const teacherTabBar = document.getElementById("teacherTabBar");
  const adminNav = document.getElementById("adminNavContainer");
  const adminTabBar = document.getElementById("adminTabBar");

  if (role === "admin") {
    if (teacherNav) teacherNav.style.display = "none";
    if (teacherTabBar) teacherTabBar.style.display = "none";
    if (adminNav) adminNav.style.display = "flex";
    if (adminTabBar) adminTabBar.style.display = "flex";

    // 啟動後台第一個分頁
    const firstAdminTab = adminTabBar ? adminTabBar.querySelector(".tab-btn") : null;
    if (firstAdminTab) firstAdminTab.click();
  } else {
    if (adminNav) adminNav.style.display = "none";
    if (adminTabBar) adminTabBar.style.display = "none";
    if (teacherNav) teacherNav.style.display = "flex";
    if (teacherTabBar) teacherTabBar.style.display = "flex";

    // 啟動前台第一個分頁
    const firstTeacherTab = teacherTabBar ? teacherTabBar.querySelector(".tab-btn") : null;
    if (firstTeacherTab) firstTeacherTab.click();

    renderPublicRegistrationTable();
    renderPublicNoticeView();
  }
}

// 顯示狀態橫幅
function showStatus(message, type = "info") {
  const bar = document.getElementById("statusBar");
  const msg = document.getElementById("statusMessage");
  bar.className = `status-banner ${type} no-print`;
  msg.innerText = message;
  bar.style.display = "flex";
}

// 檢查雲端 API 狀態
async function checkCloudStatus() {
  if (!CONFIG || !CONFIG.GAS_API_URL) return;
  try {
    const res = await fetch(`${CONFIG.GAS_API_URL}?action=ping`);
    const json = await res.json();
    if (json.status === "success") {
      showStatus("✅ 雲端 Google Sheets 連線成功！報名與編排資料可即時同步。", "success");
      if (json.spreadsheetUrl) {
        state.spreadsheetUrl = json.spreadsheetUrl;
        const link = document.getElementById("cloudSheetLink");
        link.href = json.spreadsheetUrl;
        link.style.display = "inline-flex";
      }
    }
  } catch (err) {
    // 靜默處理雲端連線失敗，不覆蓋預設狀態提示
  }
}

function updateNoticeDate() {
  const now = new Date();
  const dStr = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日`;
  const el = document.getElementById("noticeDate");
  if (el) el.innerText = dStr;
}

// ==========================================
// 班級報名防竄改鎖定機制 (前台鎖定 + 後台解鎖)
// ==========================================
function syncClassFormLockState(selectedClass) {
  const lockNoticeEl = document.getElementById("classLockNotice");
  const btnSubmit = document.getElementById("btnSubmitRoster");
  const inputs = document.querySelectorAll(".input-name, .input-score");

  if (!selectedClass) {
    if (lockNoticeEl) {
      lockNoticeEl.style.display = "none";
      lockNoticeEl.innerHTML = "";
    }
    inputs.forEach(input => {
      input.disabled = false;
      input.classList.remove("input-locked");
    });
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.classList.remove("btn-locked");
      btnSubmit.innerText = "送出報名表";
    }
    return;
  }

  const isLocked = !!(state.lockedClasses && state.lockedClasses[selectedClass]);
  const hasExisting = state.registrations.some(r => r.className === selectedClass);

  if (isLocked) {
    if (lockNoticeEl) {
      lockNoticeEl.style.display = "block";
      lockNoticeEl.innerHTML = `
        <div class="lock-alert-box locked">
          <span class="lock-alert-icon">🔒</span>
          <div class="lock-alert-content">
            <strong>【${selectedClass}】報名表已鎖定唯讀（防竄改保護中）</strong>
            <span>本班報名資料已送出並由系統自動鎖定，以避免報名名單被任意修改。如需重新修改名單，請洽學務處體育組長於管理後台「報名資料管理」解開鎖定。</span>
          </div>
        </div>
      `;
    }
    inputs.forEach(input => {
      input.disabled = true;
      input.classList.add("input-locked");
    });
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.classList.add("btn-locked");
      btnSubmit.innerText = "🔒 已鎖定唯讀 (需體育組長解鎖)";
    }
  } else {
    if (hasExisting) {
      if (lockNoticeEl) {
        lockNoticeEl.style.display = "block";
        lockNoticeEl.innerHTML = `
          <div class="lock-alert-box unlocked">
            <span class="lock-alert-icon">🔓</span>
            <div class="lock-alert-content">
              <strong>【${selectedClass}】報名表已開放修改</strong>
              <span>體育組長已解開此班級鎖定，您可以重新編輯選手名單與參考秒數。修改完畢後請點擊下方「送出報名表」，系統將自動再次鎖定。</span>
            </div>
          </div>
        `;
      }
    } else {
      if (lockNoticeEl) {
        lockNoticeEl.style.display = "none";
        lockNoticeEl.innerHTML = "";
      }
    }
    inputs.forEach(input => {
      input.disabled = false;
      input.classList.remove("input-locked");
    });
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.classList.remove("btn-locked");
      btnSubmit.innerText = "送出報名表";
    }
  }
}

function renderClassLockControlUI() {
  const container = document.getElementById("classLockListContainer");
  if (!container) return;

  if (!state.lockedClasses) state.lockedClasses = {};

  container.innerHTML = ALL_SCHOOL_CLASSES.map(cls => {
    const isLocked = !!state.lockedClasses[cls];
    const regCount = state.registrations.filter(r => r.className === cls).length;

    let badgeText = "⚪ 未報名";
    let badgeClass = "unlocked";
    if (isLocked) {
      badgeText = `🔒 已鎖定 (${regCount} 人)`;
      badgeClass = "locked";
    } else if (regCount > 0) {
      badgeText = `🔓 已解鎖開放 (${regCount} 人)`;
      badgeClass = "unlocked";
    }

    return `
      <div class="class-lock-item ${isLocked ? 'is-locked' : 'is-unlocked'}">
        <div class="class-lock-info">
          <span class="class-lock-title">${cls}</span>
          <span class="class-lock-badge ${badgeClass}">${badgeText}</span>
        </div>
        <button type="button" class="btn-toggle-lock ${isLocked ? 'btn-unlock' : 'btn-lock'}" onclick="toggleClassLock('${cls}')">
          ${isLocked ? '🔓 解鎖修改' : '🔒 鎖定班級'}
        </button>
      </div>
    `;
  }).join("");
}

window.toggleClassLock = function(className) {
  if (!state.lockedClasses) state.lockedClasses = {};
  state.lockedClasses[className] = !state.lockedClasses[className];

  renderClassLockControlUI();

  const currentClass = document.getElementById("classSelect")?.value;
  if (currentClass === className) {
    syncClassFormLockState(currentClass);
  }

  const isNowLocked = state.lockedClasses[className];
  showStatus(`🔒 已${isNowLocked ? '鎖定' : '解開'}【${className}】報名表。${isNowLocked ? '導師端已變更為唯讀。' : '導師端現已可重新輸入與修改！'}`, "info");
};

function lockAllClasses() {
  if (!state.lockedClasses) state.lockedClasses = {};
  ALL_SCHOOL_CLASSES.forEach(cls => {
    state.lockedClasses[cls] = true;
  });
  renderClassLockControlUI();
  const currentClass = document.getElementById("classSelect")?.value;
  if (currentClass) syncClassFormLockState(currentClass);
  showStatus("🔒 已全部鎖定所有班級報名表（全校防竄改唯讀中）。", "info");
}

function unlockAllClasses() {
  if (!state.lockedClasses) state.lockedClasses = {};
  ALL_SCHOOL_CLASSES.forEach(cls => {
    state.lockedClasses[cls] = false;
  });
  renderClassLockControlUI();
  const currentClass = document.getElementById("classSelect")?.value;
  if (currentClass) syncClassFormLockState(currentClass);
  showStatus("🔓 已全部解鎖所有班級報名表，各班導師現可重新輸入修改！", "info");
}

function initClassLockEvents() {
  const btnLockAll = document.getElementById("btnLockAllClasses");
  const btnUnlockAll = document.getElementById("btnUnlockAllClasses");
  if (btnLockAll) btnLockAll.addEventListener("click", lockAllClasses);
  if (btnUnlockAll) btnUnlockAll.addEventListener("click", unlockAllClasses);
}

// ==========================================
// 1. 動態報名表單（依圖片格式 + 年級項目切換）
// ==========================================
function initDynamicRegistrationForm() {
  const classSelect = document.getElementById("classSelect");
  const event1Text = document.getElementById("event1NameText");
  const event2Text = document.getElementById("event2NameText");
  const gradeIndicator = document.getElementById("gradeIndicator");
  const btnSubmit = document.getElementById("btnSubmitRoster");

  // 監聽班級下拉切換：五六年級 60m->100m, 100m->200m，並自動帶入既有資料以供編輯覆蓋
  classSelect.addEventListener("change", () => {
    const val = classSelect.value;
    if (!val) {
      syncClassFormLockState("");
      return;
    }

    // 清空現有表單輸入格
    document.querySelectorAll(".input-name, .input-score").forEach(input => {
      input.value = "";
    });

    const gradeChar = val.charAt(0);
    let event1Title = "60 公尺";
    let event2Title = "100 公尺";

    if (gradeChar === "五" || gradeChar === "六") {
      event1Title = "100 公尺";
      event2Title = "200 公尺";
    }

    event1Text.innerText = event1Title;
    event2Text.innerText = event2Title;

    // 檢查該班級先前是否已報名過
    const existing = state.registrations.filter(r => r.className === val);

    if (existing.length > 0) {
      gradeIndicator.innerText = `（${val}：已自動載入該班既有 ${existing.length} 筆資料）`;
      gradeIndicator.style.color = "#d97706";

      // 自動將現有選手帶入表單輸入格
      ["男生組", "女生組"].forEach(gender => {
        [event1Title, event2Title].forEach((evName, slotIdx) => {
          const slot = slotIdx + 1;
          const matched = existing.filter(r => r.category === gender && r.event === evName);
          matched.forEach((athlete, mIdx) => {
            const row = mIdx + 1;
            const nameInput = document.querySelector(`.input-name[data-event-slot="${slot}"][data-gender="${gender}"][data-row="${row}"]`);
            const scoreInput = document.querySelector(`.input-score[data-event-slot="${slot}"][data-gender="${gender}"][data-row="${row}"]`);
            if (nameInput) nameInput.value = athlete.name;
            if (scoreInput) scoreInput.value = athlete.seedScore;
          });
        });
      });
    } else {
      if (gradeChar === "五" || gradeChar === "六") {
        gradeIndicator.innerText = `（${val}：五、六年級項目為 100公尺 與 200公尺）`;
        gradeIndicator.style.color = "#1d4ed8";
      } else {
        gradeIndicator.innerText = `（${val}：三、四年級項目為 60公尺 與 100公尺）`;
        gradeIndicator.style.color = "#047857";
      }
    }

    // 同步鎖定防竄改狀態
    syncClassFormLockState(val);
  });

  // 送出整份報名表（若班級重複報名，自動覆蓋該班舊資料；送出後自動同步寫入 Google 試算表並鎖定）
  btnSubmit.addEventListener("click", async () => {
    const selectedClass = classSelect.value;
    if (!selectedClass) {
      alert("請先於上方選擇報名班級！");
      classSelect.focus();
      return;
    }

    // 檢查是否已被鎖定
    if (state.lockedClasses && state.lockedClasses[selectedClass]) {
      alert(`【${selectedClass}】報名表目前處於鎖定狀態，無法修改或再次送出！\n\n如需重新修改名單，請洽學務處體育組長於後台「報名資料管理」解開鎖定。`);
      return;
    }

    const event1Name = event1Text.innerText.trim();
    const event2Name = event2Text.innerText.trim();
    const newAthletes = [];

    // 收集項目 1
    try {
      collectRosterData(1, event1Name, selectedClass, newAthletes);
      // 收集項目 2
      collectRosterData(2, event2Name, selectedClass, newAthletes);
    } catch (e) {
      return;
    }

    if (newAthletes.length === 0) {
      alert("請至少填寫一位選手的姓名與參考成績！");
      return;
    }

    const prevCount = state.registrations.filter(r => r.className === selectedClass).length;
    const isOverwriting = prevCount > 0;

    // 提示並開始寫入雲端
    btnSubmit.disabled = true;
    const originalBtnText = btnSubmit.innerText;
    btnSubmit.innerText = "⏳ 正在寫入 Google 試算表...";
    showStatus(`⏳ 正在將【${selectedClass}】報名資料即時寫入 Google 試算表...`, "info");

    try {
      const res = await fetch(CONFIG.GAS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "register",
          items: newAthletes
        })
      });
      const json = await res.json();

      if (json.status === "success") {
        // 覆蓋本地資料
        state.registrations = state.registrations.filter(r => r.className !== selectedClass);
        state.registrations.push(...newAthletes);

        if (!state.lockedClasses) state.lockedClasses = {};
        state.lockedClasses[selectedClass] = true;

        renderRegistrationTable();
        renderPublicRegistrationTable();
        updateSeedingEventFilter();
        renderClassLockControlUI();
        syncClassFormLockState(selectedClass);

        if (json.spreadsheetUrl) {
          state.spreadsheetUrl = json.spreadsheetUrl;
          const link = document.getElementById("cloudSheetLink");
          if (link) {
            link.href = json.spreadsheetUrl;
            link.style.display = "inline-flex";
          }
        }

        if (isOverwriting) {
          showStatus(`🔄 【${selectedClass}】報名資料已成功更新寫入 Google 試算表並自動鎖定保護！`, "success");
          alert(`🎉 【${selectedClass}】報名資料已成功更新並寫入 Google 試算表！\n\n🛡️ 為避免名單被未授權修改，系統已自動將該班級鎖定為「唯讀」。\n若後續需要再次修改，需洽體育組長於後台解開鎖定。`);
        } else {
          showStatus(`🎉 成功將【${selectedClass}】報名表（共 ${newAthletes.length} 位選手）寫入 Google 試算表！名單已自動鎖定保護。`, "success");
          alert(`🎉 【${selectedClass}】報名資料已成功寫入 Google 試算表（共 ${newAthletes.length} 位選手）！\n\n🛡️ 為避免名單被未授權修改，系統已自動將該班級鎖定為「唯讀」。\n若後續需要修改選手或參考秒數，需洽體育組長於後台解開鎖定。`);
        }
      } else {
        throw new Error(json.message || "雲端寫入回傳狀態異常");
      }
    } catch (err) {
      console.warn("寫入雲端發生錯誤，轉為本機暫存：", err);
      // 若雲端離線，保留本機資料並告知
      state.registrations = state.registrations.filter(r => r.className !== selectedClass);
      state.registrations.push(...newAthletes);
      if (!state.lockedClasses) state.lockedClasses = {};
      state.lockedClasses[selectedClass] = true;

      renderRegistrationTable();
      renderPublicRegistrationTable();
      updateSeedingEventFilter();
      renderClassLockControlUI();
      syncClassFormLockState(selectedClass);

      showStatus(`⚠️ 【${selectedClass}】資料已暫存於本機，但連線雲端遇到問題。請體育組長後續於後台點擊「☁️ 同步至 Google Sheets」。`, "error");
      alert(`⚠️ 【${selectedClass}】報名資料已暫存於本機！\n但暫時無法連線至 Google 試算表：${err.message || err}\n\n已保留本機紀錄，請稍候洽體育組長於後台點擊「同步至 Google Sheets」。`);
    } finally {
      btnSubmit.disabled = false;
      syncClassFormLockState(selectedClass);
    }
  });

  // 輔助函式：收集特定項目的男女選手
  function collectRosterData(slot, eventName, className, targetArray) {
    ["男生組", "女生組"].forEach(gender => {
      for (let r = 1; r <= 3; r++) {
        const nameInput = document.querySelector(`.input-name[data-event-slot="${slot}"][data-gender="${gender}"][data-row="${r}"]`);
        const scoreInput = document.querySelector(`.input-score[data-event-slot="${slot}"][data-gender="${gender}"][data-row="${r}"]`);

        const name = nameInput ? nameInput.value.trim() : "";
        const scoreVal = scoreInput ? parseFloat(scoreInput.value) : NaN;

        if (name) {
          if (isNaN(scoreVal) || scoreVal <= 0) {
            alert(`請為 ${className} ${gender} 的「${name}」輸入有效的參考成績（秒數）！`);
            scoreInput.focus();
            throw new Error("Invalid score");
          }
          targetArray.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            event: eventName,
            category: gender,
            className: className,
            studentNo: r.toString().padStart(2, '0'),
            name: name,
            seedScore: scoreVal
          });
        }
      }
    });
  }

  // 載入示範選手按鈕 (30人：六年級女生組15人 + 男生組15人，六甲~六戊各3人，完美符合大庄國小官方公文範例)
  document.getElementById("btnSampleData").addEventListener("click", () => {
    state.registrations = [
      // 六年級 100 公尺 女生組 (15人，依據大庄國小官方公文範例)
      { id: "g1", event: "100公尺", category: "女生組", className: "六丁", studentNo: "01", name: "高芷柔", seedScore: 13.80 },
      { id: "g2", event: "100公尺", category: "女生組", className: "六乙", studentNo: "02", name: "張維珈", seedScore: 13.90 },
      { id: "g3", event: "100公尺", category: "女生組", className: "六丙", studentNo: "03", name: "林芷伃", seedScore: 14.00 },
      { id: "g4", event: "100公尺", category: "女生組", className: "六丙", studentNo: "04", name: "林佳儀", seedScore: 14.20 },
      { id: "g5", event: "100公尺", category: "女生組", className: "六甲", studentNo: "05", name: "劉采怡", seedScore: 14.30 },
      { id: "g6", event: "100公尺", category: "女生組", className: "六乙", studentNo: "06", name: "陳昀濃", seedScore: 14.40 },
      { id: "g7", event: "100公尺", category: "女生組", className: "六乙", studentNo: "07", name: "邱祈涵", seedScore: 14.50 },
      { id: "g8", event: "100公尺", category: "女生組", className: "六丙", studentNo: "08", name: "顏孜珉", seedScore: 14.60 },
      { id: "g9", event: "100公尺", category: "女生組", className: "六甲", studentNo: "09", name: "林奐均", seedScore: 14.70 },
      { id: "g10", event: "100公尺", category: "女生組", className: "六戊", studentNo: "10", name: "洪翊瑄", seedScore: 14.80 },
      { id: "g11", event: "100公尺", category: "女生組", className: "六戊", studentNo: "11", name: "陳琬蓁", seedScore: 14.90 },
      { id: "g12", event: "100公尺", category: "女生組", className: "六戊", studentNo: "12", name: "陳拓婕", seedScore: 15.00 },
      { id: "g13", event: "100公尺", category: "女生組", className: "六甲", studentNo: "13", name: "彭璇", seedScore: 15.10 },
      { id: "g14", event: "100公尺", category: "女生組", className: "六丁", studentNo: "14", name: "林致忻", seedScore: 15.20 },
      { id: "g15", event: "100公尺", category: "女生組", className: "六丁", studentNo: "15", name: "孫沛霓", seedScore: 15.30 },

      // 六年級 100 公尺 男生組 (15人，依據大庄國小官方公文範例)
      { id: "b1", event: "100公尺", category: "男生組", className: "六丁", studentNo: "01", name: "陳雋晏", seedScore: 12.80 },
      { id: "b2", event: "100公尺", category: "男生組", className: "六戊", studentNo: "02", name: "張晏銘", seedScore: 12.90 },
      { id: "b3", event: "100公尺", category: "男生組", className: "六乙", studentNo: "03", name: "彭兆紳", seedScore: 13.00 },
      { id: "b4", event: "100公尺", category: "男生組", className: "六丙", studentNo: "04", name: "林暐軒", seedScore: 13.10 },
      { id: "b5", event: "100公尺", category: "男生組", className: "六乙", studentNo: "05", name: "李弦洲", seedScore: 13.20 },
      { id: "b6", event: "100公尺", category: "男生組", className: "六甲", studentNo: "06", name: "吳振福", seedScore: 13.30 },
      { id: "b7", event: "100公尺", category: "男生組", className: "六戊", studentNo: "07", name: "杜威廷", seedScore: 13.40 },
      { id: "b8", event: "100公尺", category: "男生組", className: "六丙", studentNo: "08", name: "樊懿誠", seedScore: 13.50 },
      { id: "b9", event: "100公尺", category: "男生組", className: "六丙", studentNo: "09", name: "李劭倫", seedScore: 13.60 },
      { id: "b10", event: "100公尺", category: "男生組", className: "六乙", studentNo: "10", name: "王柏荃", seedScore: 13.70 },
      { id: "b11", event: "100公尺", category: "男生組", className: "六甲", studentNo: "11", name: "溫秘華", seedScore: 13.80 },
      { id: "b12", event: "100公尺", category: "男生組", className: "六戊", studentNo: "12", name: "饒捷承", seedScore: 13.90 },
      { id: "b13", event: "100公尺", category: "男生組", className: "六甲", studentNo: "13", name: "吳松泉", seedScore: 14.00 },
      { id: "b14", event: "100公尺", category: "男生組", className: "六丁", studentNo: "14", name: "王宥晟", seedScore: 14.10 },
      { id: "b15", event: "100公尺", category: "男生組", className: "六丁", studentNo: "15", name: "陳柏叡", seedScore: 14.20 }
    ];
    // 示範班級（六甲～六戊）自動設為已報名並鎖定防竄改
    if (!state.lockedClasses) state.lockedClasses = {};
    ["六甲", "六乙", "六丙", "六丁", "六戊"].forEach(c => state.lockedClasses[c] = true);
    renderRegistrationTable();
    updateSeedingEventFilter();
    renderClassLockControlUI();
    const curCls = document.getElementById("classSelect")?.value;
    if (curCls) syncClassFormLockState(curCls);
    showStatus("✅ 已載入 30 位大庄國小官方示範選手（六年級女生 15 人＋男生 15 人，六甲～六戊各 3 人，已自動設為鎖定狀態），可立即前往「跑道智慧編排」分頁執行編排！", "success");
  });

  // 重新從 Google 試算表載入最新報名資料按鈕
  const btnRefreshCloud = document.getElementById("btnRefreshCloudReg");
  if (btnRefreshCloud) {
    btnRefreshCloud.addEventListener("click", () => {
      loadRegistrationsFromCloud(true);
    });
  }

  // 清空名單與所有賽務公告資料按鈕（同步徹底清空 Google Sheets 所有工作表）
  document.getElementById("btnClearReg").addEventListener("click", async () => {
    if (confirm("確定要徹底清空目前所有名單與賽務資料嗎？\n\n此操作將同步徹底清空 Google 試算表中的所有工作表（包含【報名清單】、【預賽分組與道次】、【成績總榜】），並重置前後台所有分頁的排道分組、預決賽成績與公告！")) {
      showStatus("⏳ 正在徹底清空 Google 試算表與系統所有名冊資料...", "info");
      try {
        await fetch(CONFIG.GAS_API_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "clearAll" })
        });
      } catch (err) {
        console.warn("清空雲端試算表時發生錯誤：", err);
      }
      resetAllSystemData();
      showStatus("🧹 已徹底清空 Google 試算表所有分頁（報名清單、預賽分組道次、成績總榜）與系統所有公告！", "info");
      alert("🧹 全校報名名冊、預賽分組道次與 Google 試算表已成功徹底清空！");
    }
  });

  // 雲端同步
  document.getElementById("btnSyncCloudReg").addEventListener("click", syncRegistrationsToCloud);
}

// ==========================================
// 從 Google 試算表雙向自動載入最新報名名單
// ==========================================
async function loadRegistrationsFromCloud(showNotify = false) {
  if (showNotify) {
    showStatus("🔄 正在連線 Google 試算表獲取最新報名名冊...", "info");
  }

  try {
    const res = await fetch(`${CONFIG.GAS_API_URL}?action=getRegistrations`);
    const json = await res.json();

    if (json.status === "success" && Array.isArray(json.data)) {
      if (json.data.length > 0) {
        state.registrations = json.data.map((r, idx) => ({
          id: "cloud-" + (idx + 1) + "-" + (r.className || "") + "-" + (r.name || ""),
          event: r.event || "100 公尺",
          category: r.category || "男生組",
          className: r.className || "",
          studentNo: r.studentNo ? r.studentNo.toString().padStart(2, "0") : "",
          name: r.name || "",
          seedScore: parseFloat(r.seedScore) || 0,
          notes: r.notes || "",
          time: r.time || ""
        }));

        // 將已在雲端試算表有名單的班級自動標記為鎖定保護（防竄改）
        if (!state.lockedClasses) state.lockedClasses = {};
        state.registrations.forEach(r => {
          if (r.className) {
            state.lockedClasses[r.className] = true;
          }
        });

        // 重新渲染畫面
        renderRegistrationTable();
        renderPublicRegistrationTable();
        updateSeedingEventFilter();
        renderClassLockControlUI();
        const curCls = document.getElementById("classSelect")?.value;
        if (curCls) syncClassFormLockState(curCls);

        if (showNotify) {
          showStatus(`✅ 雲端同步完成！已從 Google 試算表成功載入 ${state.registrations.length} 位選手資料。`, "success");
        }
      } else {
        // 試算表為空（0 筆資料）
        state.registrations = [];
        state.lockedClasses = {};
        renderRegistrationTable();
        renderPublicRegistrationTable();
        updateSeedingEventFilter();
        renderClassLockControlUI();
        const curCls = document.getElementById("classSelect")?.value;
        if (curCls) syncClassFormLockState(curCls);

        if (showNotify) {
          showStatus("ℹ️ Google 試算表目前為清空狀態（尚無班級報名資料）。", "info");
        }
      }
    }
  } catch (err) {
    console.warn("自動從 Google 試算表載入資料失敗：", err);
    if (showNotify) {
      showStatus("⚠️ 無法連線至 Google 試算表，已維持本機暫存名冊。", "error");
    }
  }

  // 自動嘗試從雲端或本地還原預賽分組與公告狀態（讓手機或其他裝置能即時看到公布的賽程）
  await loadSeedingFromCloud(showNotify);
}

// 本地快取金鑰常數
const STORAGE_KEY_SEEDED = "dcps_seeded_groups_cache";
const STORAGE_KEY_PUBLISHED = "dcps_published_state_cache";

function saveSeedingToLocalStorage() {
  try {
    if (state.seededGroups && state.seededGroups.length > 0) {
      localStorage.setItem(STORAGE_KEY_SEEDED, JSON.stringify(state.seededGroups));
    } else {
      localStorage.removeItem(STORAGE_KEY_SEEDED);
    }
    localStorage.setItem(STORAGE_KEY_PUBLISHED, JSON.stringify(state.published));
  } catch (e) {
    console.warn("無法寫入 localStorage：", e);
  }
}

function restoreSeedingFromLocalStorage() {
  try {
    const savedPublished = localStorage.getItem(STORAGE_KEY_PUBLISHED);
    if (savedPublished) {
      const parsedPub = JSON.parse(savedPublished);
      state.published = Object.assign(state.published || {}, parsedPub);
    }
    const savedSeeded = localStorage.getItem(STORAGE_KEY_SEEDED);
    if (savedSeeded) {
      const parsedGroups = JSON.parse(savedSeeded);
      if (Array.isArray(parsedGroups) && parsedGroups.length > 0) {
        state.seededGroups = parsedGroups;
        if (!state.activeSeededGroup && state.seededGroups.length > 0) {
          state.activeSeededGroup = state.seededGroups[0];
          state.prelimHeats = state.activeSeededGroup.heats;
        }
        renderPrelimNotice();
        renderPrelimScoreInput();
        if (state.published.prelimScore) {
          renderPrelimScoreNoticePaper();
          renderFinalsRosterNoticePaper();
          renderFinalsScoreInput();
        }
        if (state.published.finalsScore) {
          renderFinalsScoreNoticePaper();
        }
        updatePublishControlUI();
        renderPublicNoticeView();
        const btnSave = document.getElementById("btnSaveSeedingCloud");
        if (btnSave) btnSave.style.display = "inline-flex";
        return true;
      }
    }
  } catch (e) {
    console.warn("從 localStorage 還原失敗：", e);
  }
  return false;
}

/**
 * 從 Google 試算表（或本地快取備援）載入已編排的「預賽分組與道次」
 * 解決手機或不同瀏覽器開啟時看不到已公布名單的痛點
 */
async function loadSeedingFromCloud(showNotify = false) {
  // 先嘗試本機快取以求極速渲染
  restoreSeedingFromLocalStorage();

  if (!CONFIG || !CONFIG.GAS_API_URL) return;

  try {
    const res = await fetch(`${CONFIG.GAS_API_URL}?action=getSeeding`);
    const json = await res.json();

    if (json.status === "success" && Array.isArray(json.data) && json.data.length > 0) {
      // 成功從雲端取回預賽道次資料！依照 event -> heat -> lane 進行重組
      const groupDict = new Map();

      json.data.forEach(row => {
        const title = (row.event || "").trim();
        if (!title) return;

        if (!groupDict.has(title)) {
          // 推算 event 與 category
          let evtName = "100公尺";
          if (title.includes("60公尺") || title.includes("60 公尺")) evtName = "60公尺";
          else if (title.includes("200公尺") || title.includes("200 公尺")) evtName = "200公尺";

          let catName = "男生組";
          if (title.includes("女生組") || title.includes("女生")) catName = "女生組";

          groupDict.set(title, {
            title: title,
            event: evtName,
            category: catName,
            heatsMap: new Map()
          });
        }

        const grp = groupDict.get(title);
        // 解析組別數字：例如 "第 1 組" -> 1
        const heatMatch = String(row.heat || "").match(/\d+/);
        const heatNum = heatMatch ? parseInt(heatMatch[0], 10) : 1;

        if (!grp.heatsMap.has(heatNum)) {
          grp.heatsMap.set(heatNum, {
            heatNum: heatNum,
            lanes: []
          });
        }

        const heatObj = grp.heatsMap.get(heatNum);
        // 解析道次數字：例如 "4 道" 或 4 -> 4
        const laneMatch = String(row.lane || "").match(/\d+/);
        const laneNum = laneMatch ? parseInt(laneMatch[0], 10) : 1;

        heatObj.lanes.push({
          lane: laneNum,
          athlete: {
            id: `seed-${row.className}-${row.name}`,
            className: row.className || "",
            studentNo: row.studentNo ? String(row.studentNo).padStart(2, "0") : "",
            name: row.name || "",
            seedScore: parseFloat(row.seedScore) || 0
          }
        });
      });

      // 將 Map 轉換為前端標準的 state.seededGroups 結構
      const reconstructedGroups = [];
      const sortedTitles = Array.from(groupDict.keys()).sort(compareGroupKeys);

      sortedTitles.forEach(title => {
        const grp = groupDict.get(title);
        const sortedHeatNums = Array.from(grp.heatsMap.keys()).sort((a, b) => a - b);
        const heats = sortedHeatNums.map(hn => {
          const h = grp.heatsMap.get(hn);
          // 各組內的道次由小到大排序 (1 到 6 道)
          h.lanes.sort((a, b) => a.lane - b.lane);
          return h;
        });

        reconstructedGroups.push({
          title: grp.title,
          event: grp.event,
          category: grp.category,
          heats: heats
        });
      });

      if (reconstructedGroups.length > 0) {
        state.seededGroups = reconstructedGroups;
        if (!state.activeSeededGroup) {
          state.activeSeededGroup = state.seededGroups[0];
          state.prelimHeats = state.activeSeededGroup.heats;
        }

        // 雲端既然已經有體育組長同步上去的排道資料，預設將預賽名冊公告視為發布
        // (若本機快取已有更細緻的 published 狀態則予以尊重保留)
        if (!state.published) state.published = {};
        if (state.published.prelimRoster !== false) {
          state.published.prelimRoster = true;
        }

        // 同步寫入本機快取
        saveSeedingToLocalStorage();

        // 重新渲染畫面
        renderPrelimNotice();
        renderPrelimScoreInput();
        updatePublishControlUI();
        renderPublicNoticeView();

        const btnSave = document.getElementById("btnSaveSeedingCloud");
        if (btnSave) btnSave.style.display = "inline-flex";

        if (showNotify) {
          showStatus(`✅ 成功從雲端同步 ${state.seededGroups.length} 個項目的預賽分組名冊！`, "success");
        }
      }
    }
  } catch (err) {
    console.warn("自動從雲端獲取預賽排道失敗：", err);
  }
}

// 徹底清空系統所有狀態與前後台畫面
function resetAllSystemData() {
  // 1. 清空全域狀態
  state.registrations = [];
  state.seededGroups = [];
  state.prelimHeats = [];
  state.prelimResults = [];
  state.finalists = [];
  state.finalResults = [];
  state.lockedClasses = {};
  state.published = {
    prelimRoster: false,
    prelimScore: false,
    finalsRoster: false,
    finalsScore: false
  };

  // 2. 重置後台 1：報名名冊與班級鎖定狀態
  renderRegistrationTable();
  updateSeedingEventFilter();
  renderClassLockControlUI();
  syncClassFormLockState(document.getElementById("classSelect")?.value);

  // 3. 重置後台 2：排道編排區塊
  const heatsContainer = document.getElementById("heatsContainer");
  if (heatsContainer) {
    heatsContainer.innerHTML = `<div class="empty-state no-print">請點擊上方「🚀 執行反向蛇形編排」按鈕產出公告名單。</div>`;
  }
  const btnSaveSeeding = document.getElementById("btnSaveSeedingCloud");
  if (btnSaveSeeding) btnSaveSeeding.style.display = "none";

  // 4. 重置後台 3：預賽成績登錄與公告
  const prelimScoreInput = document.getElementById("prelimScoreInputArea");
  if (prelimScoreInput) {
    prelimScoreInput.innerHTML = `<div class="empty-state" id="prelimScoreEmpty">尚未產生預賽排道，請先至「跑道智慧編排」分頁執行編排。</div>`;
  }
  const prelimScoreNoticeSection = document.getElementById("prelimScoreNoticeSection");
  if (prelimScoreNoticeSection) prelimScoreNoticeSection.style.display = "none";
  const prelimScorePaper = document.getElementById("prelimScoreNoticePaper");
  if (prelimScorePaper) prelimScorePaper.innerHTML = "";
  const finalsRosterPaper = document.getElementById("finalsRosterNoticePaper");
  if (finalsRosterPaper) finalsRosterPaper.innerHTML = "";

  // 5. 重置後台 4：決賽成績登錄與公告
  const finalsScoreInput = document.getElementById("finalsScoreInputArea");
  if (finalsScoreInput) {
    finalsScoreInput.innerHTML = `<div class="empty-state" id="finalsScoreEmpty">尚未產生決賽名單，請先至「預賽成績」分頁完成晉級判定。</div>`;
  }
  const finalsScoreNoticeSection = document.getElementById("finalsScoreNoticeSection");
  if (finalsScoreNoticeSection) finalsScoreNoticeSection.style.display = "none";
  const finalsScorePaper = document.getElementById("finalsScoreNoticePaper");
  if (finalsScorePaper) finalsScorePaper.innerHTML = "";
  const finalsResultTableBody = document.getElementById("finalsResultTableBody");
  if (finalsResultTableBody) {
    finalsResultTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">尚未計算決賽名次，請在上方輸入成績後點擊「🏁 計算決賽名次並產出決賽成績公告」。</td></tr>`;
  }
  const printFinalsScoreBtn = document.getElementById("btnPrintFinalsScoreNotice");
  if (printFinalsScoreBtn) printFinalsScoreBtn.style.display = "none";

  // 6. 更新後台所有公告發布控制鍵狀態
  updatePublishControlUI();

  // 7. 同步重置前台全校名單與公告看板並清除快取
  saveSeedingToLocalStorage();
  renderPublicRegistrationTable();
  renderPublicNoticeView();
}

// 更新後台發布/撤回按鈕與狀態標籤
function updatePublishControlUI() {
  // 1. 預賽參賽名單
  const btnPubPrelimRoster = document.getElementById("btnPublishPrelimRoster");
  const btnUnpubPrelimRoster = document.getElementById("btnUnpublishPrelimRoster");
  const badgePrelimRoster = document.getElementById("badgePrelimRosterPublish");
  if (state.published.prelimRoster) {
    if (btnPubPrelimRoster) btnPubPrelimRoster.style.display = "none";
    if (btnUnpubPrelimRoster) btnUnpubPrelimRoster.style.display = "inline-flex";
    if (badgePrelimRoster) {
      badgePrelimRoster.className = "publish-status-badge published";
      badgePrelimRoster.innerText = "🟢 前台已公告";
    }
  } else {
    if (btnPubPrelimRoster) btnPubPrelimRoster.style.display = "inline-flex";
    if (btnUnpubPrelimRoster) btnUnpubPrelimRoster.style.display = "none";
    if (badgePrelimRoster) {
      badgePrelimRoster.className = "publish-status-badge unpublished";
      badgePrelimRoster.innerText = "⚪ 前台未公告";
    }
  }

  // 2. 預賽成績公告與決賽名冊
  const btnPubPrelimScore = document.getElementById("btnPublishPrelimScore");
  const btnUnpubPrelimScore = document.getElementById("btnUnpublishPrelimScore");
  const badgePrelimScore = document.getElementById("badgePrelimScorePublish");
  if (state.published.prelimScore) {
    if (btnPubPrelimScore) btnPubPrelimScore.style.display = "none";
    if (btnUnpubPrelimScore) btnUnpubPrelimScore.style.display = "inline-flex";
    if (badgePrelimScore) {
      badgePrelimScore.className = "publish-status-badge published";
      badgePrelimScore.innerText = "🟢 前台已公告";
    }
  } else {
    if (btnPubPrelimScore) btnPubPrelimScore.style.display = "inline-flex";
    if (btnUnpubPrelimScore) btnUnpubPrelimScore.style.display = "none";
    if (badgePrelimScore) {
      badgePrelimScore.className = "publish-status-badge unpublished";
      badgePrelimScore.innerText = "⚪ 前台未公告";
    }
  }

  // 3. 決賽成績公告
  const btnPubFinalsScore = document.getElementById("btnPublishFinalsScore");
  const btnUnpubFinalsScore = document.getElementById("btnUnpublishFinalsScore");
  const badgeFinalsScore = document.getElementById("badgeFinalsScorePublish");
  if (state.published.finalsScore) {
    if (btnPubFinalsScore) btnPubFinalsScore.style.display = "none";
    if (btnUnpubFinalsScore) btnUnpubFinalsScore.style.display = "inline-flex";
    if (badgeFinalsScore) {
      badgeFinalsScore.className = "publish-status-badge published";
      badgeFinalsScore.innerText = "🟢 前台已公告";
    }
  } else {
    if (btnPubFinalsScore) btnPubFinalsScore.style.display = "inline-flex";
    if (btnUnpubFinalsScore) btnUnpubFinalsScore.style.display = "none";
    if (badgeFinalsScore) {
      badgeFinalsScore.className = "publish-status-badge unpublished";
      badgeFinalsScore.innerText = "⚪ 前台未公告";
    }
  }
}

// 體育組長發布/撤回控制函式
function publishPrelimRoster() {
  if (!state.seededGroups || state.seededGroups.length === 0) {
    alert("尚未執行反向蛇形編排，無預賽名單可發布！請先點擊「🚀 執行反向蛇形編排」。");
    return;
  }
  renderPrelimNotice();
  state.published.prelimRoster = true;
  saveSeedingToLocalStorage();
  updatePublishControlUI();
  renderPublicNoticeView();
  showStatus("📢 預賽分組參賽名單已成功發布至前台！全校師生現已可查看與列印。", "success");
  alert("🎉 預賽分組參賽名單已成功發布至前台！\n全校師生現在可以在「大會即時公告與榜單」查看與列印這份公文。");
}

function unpublishPrelimRoster() {
  if (confirm("確定要撤回/刪除前台的預賽參賽名單公告嗎？\n\n撤回後前台將暫時隱藏此份公告。")) {
    state.published.prelimRoster = false;
    saveSeedingToLocalStorage();
    updatePublishControlUI();
    renderPublicNoticeView();
    showStatus("🗑️ 已撤回前台預賽名冊公告，前台已恢復為未發布狀態。", "info");
    alert("已成功撤回預賽名單公告！\n前台已恢復為未公告狀態。");
  }
}

function publishPrelimScore() {
  const hasScores = state.seededGroups && state.seededGroups.some(g => g.scoresCompleted);
  if (!hasScores) {
    alert("尚未產出預賽完賽成績公告！請先在上方登錄各組成績並點擊「🎯 判定晉級並產出預賽成績公告」。");
    return;
  }
  renderPrelimScoreNoticePaper();
  renderFinalsRosterNoticePaper();
  state.published.prelimScore = true;
  state.published.finalsRoster = true;
  saveSeedingToLocalStorage();
  updatePublishControlUI();
  renderPublicNoticeView();
  showStatus("📢 預賽完賽成績公告與決賽分組名冊已成功發布至前台！", "success");
  alert("🎉 預賽成績公告與決賽分組名冊已成功發布至前台！\n全校師生現在可以在前台查看與列印這兩份公告。");
}

function unpublishPrelimScore() {
  if (confirm("確定要撤回/刪除前台的預賽成績公告與決賽名單嗎？\n\n若成績有誤，撤回後可於後台重新修正再行發布。")) {
    state.published.prelimScore = false;
    state.published.finalsRoster = false;
    saveSeedingToLocalStorage();
    updatePublishControlUI();
    renderPublicNoticeView();
    showStatus("🗑️ 已撤回前台預賽成績與決賽名冊公告。", "info");
    alert("已成功撤回預賽完賽成績公告與決賽名冊！");
  }
}

function publishFinalsScore() {
  const hasFinals = state.seededGroups && state.seededGroups.some(g => g.finalsCompleted);
  if (!hasFinals) {
    alert("尚未產出決賽成績公告！請先在上方登錄決賽成績並點擊「🏁 計算決賽名次並產出決賽成績公告」。");
    return;
  }
  renderFinalsScoreNoticePaper();
  state.published.finalsScore = true;
  saveSeedingToLocalStorage();
  updatePublishControlUI();
  renderPublicNoticeView();
  showStatus("📢 決賽完賽成績公告已成功發布至前台！全校師生現已可查看最終成績與名次。", "success");
  alert("🎉 決賽完賽成績公告已成功發布至前台！\n全校師生現在可以在前台查看最終成績與圈圈名次榜單。");
}

function unpublishFinalsScore() {
  if (confirm("確定要撤回/刪除前台的決賽成績公告嗎？\n\n撤回後前台將隱藏決賽成績公告。")) {
    state.published.finalsScore = false;
    saveSeedingToLocalStorage();
    updatePublishControlUI();
    renderPublicNoticeView();
    showStatus("🗑️ 已撤回前台決賽成績公告。", "info");
    alert("已成功撤回決賽完賽成績公告！");
  }
}

function renderRegistrationTable() {
  const tbody = document.getElementById("regTableBody");
  const countEl = document.getElementById("regCount");
  if (countEl) countEl.innerText = state.registrations.length;

  if (tbody) {
    if (state.registrations.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">目前尚無報名資料，請於上方填寫報名表送出。</td></tr>`;
    } else {
      tbody.innerHTML = state.registrations.map((item, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><span class="badge badge-silver">${item.className}</span></td>
          <td><strong>${item.event}</strong></td>
          <td><span class="badge ${item.category === '男生組' ? 'badge-small-q' : 'badge-bronze'}">${item.category}</span></td>
          <td><strong>${item.name}</strong></td>
          <td><code>${item.seedScore.toFixed(2)} 秒</code></td>
          <td>
            <button class="btn btn-danger-sm" onclick="removeRegistration('${item.id}')">刪除</button>
          </td>
        </tr>
      `).join("");
    }
  }

  // 同步更新前台教師端報名名冊檢視
  renderPublicRegistrationTable();
}

window.removeRegistration = function(id) {
  state.registrations = state.registrations.filter(r => r.id !== id);
  renderRegistrationTable();
  updateSeedingEventFilter();
  renderClassLockControlUI();
  const curCls = document.getElementById("classSelect")?.value;
  if (curCls) syncClassFormLockState(curCls);
};

// ==========================================
// 前台教師與全校名冊檢視 & 即時公告看版邏輯
// ==========================================
function initPublicViews() {
  // 報名名冊篩選監聽
  const gradeFilter = document.getElementById("publicRosterGradeFilter");
  const eventFilter = document.getElementById("publicRosterEventFilter");
  if (gradeFilter) gradeFilter.addEventListener("change", renderPublicRegistrationTable);
  if (eventFilter) eventFilter.addEventListener("change", renderPublicRegistrationTable);

  // 公告分類切換 Pills
  const pills = document.querySelectorAll(".public-notice-pill");
  pills.forEach(pill => {
    pill.addEventListener("click", () => {
      pills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      state.activePublicNotice = pill.dataset.noticeType;

      const infoText = document.getElementById("publicNoticeInfoText");
      const titleMap = {
        "prelim-roster": "📜 目前瀏覽：【預賽分組參賽名冊】",
        "prelim-score": "⏱️ 目前瀏覽：【預賽完賽成績公告 (含●晉級)】",
        "finals-roster": "📜 目前瀏覽：【決賽分組參賽名冊】",
        "finals-score": "🏆 目前瀏覽：【決賽完賽成績公告 (含圈圈名次)】"
      };
      if (infoText) infoText.innerText = titleMap[state.activePublicNotice] || "";

      renderPublicNoticeView();
    });
  });

  // 前台獨立列印按鈕
  const printBtn = document.getElementById("btnPrintCurrentPublicNotice");
  if (printBtn) {
    printBtn.addEventListener("click", () => {
      printPublicNotice(state.activePublicNotice);
    });
  }
}

function renderPublicRegistrationTable() {
  const tbody = document.getElementById("publicRegTableBody");
  const countEl = document.getElementById("publicRegCount");
  if (!tbody) return;

  if (countEl) countEl.innerText = state.registrations.length;

  const gradeFilter = document.getElementById("publicRosterGradeFilter");
  const eventFilter = document.getElementById("publicRosterEventFilter");
  const selectedGrade = gradeFilter ? gradeFilter.value : "ALL";
  const selectedEvent = eventFilter ? eventFilter.value : "ALL";

  let list = [...state.registrations];

  if (selectedGrade !== "ALL") {
    list = list.filter(r => r.className && r.className.startsWith(selectedGrade.charAt(0)));
  }
  if (selectedEvent !== "ALL") {
    list = list.filter(r => r.event && r.event.replace(/\s+/g, '') === selectedEvent.replace(/\s+/g, ''));
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">查無符合篩選條件之已報名選手資料。</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((item, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><span class="badge badge-silver">${item.className}</span></td>
      <td><strong>${item.event}</strong></td>
      <td><span class="badge ${item.category === '男生組' ? 'badge-small-q' : 'badge-bronze'}">${item.category}</span></td>
      <td><strong>${item.name}</strong></td>
      <td><code>${item.seedScore.toFixed(2)} 秒</code></td>
    </tr>
  `).join("");
}

function renderPublicNoticeView() {
  const container = document.getElementById("publicNoticeViewContainer");
  if (!container) return;

  const type = state.activePublicNotice || "prelim-roster";

  if (type === "prelim-roster") {
    const heatsEl = document.getElementById("heatsContainer");
    const hasHeats = heatsEl && heatsEl.querySelector(".official-print-page");
    if (state.published.prelimRoster && hasHeats) {
      container.innerHTML = `<div class="official-roster-paper">${heatsEl.innerHTML}</div>`;
    } else {
      container.innerHTML = `
        <div class="empty-state no-print" style="background:#fff; padding:3.5rem 1.5rem; border-radius:8px; border:1px solid #e2e8f0; text-align:center;">
          <div style="font-size:2.8rem; margin-bottom:0.6rem;">🔒</div>
          <h3 style="color:#1e3a8a; margin-bottom:0.4rem;">大會尚未正式公告預賽分組參賽名冊</h3>
          <p class="text-muted">體育組長賽程智慧編排與校對作業進行中（或公告已暫時撤回），待大會於後台正式點擊「公告」後將即時公開供全校查閱列印。</p>
        </div>
      `;
    }
  } else if (type === "prelim-score") {
    const paperEl = document.getElementById("prelimScoreNoticePaper");
    const hasPaper = paperEl && paperEl.querySelector(".official-print-page");
    if (state.published.prelimScore && hasPaper) {
      container.innerHTML = `<div class="official-roster-paper">${paperEl.innerHTML}</div>`;
    } else {
      container.innerHTML = `
        <div class="empty-state no-print" style="background:#fff; padding:3.5rem 1.5rem; border-radius:8px; border:1px solid #e2e8f0; text-align:center;">
          <div style="font-size:2.8rem; margin-bottom:0.6rem;">🔒</div>
          <h3 style="color:#1e3a8a; margin-bottom:0.4rem;">大會尚未正式公告預賽完賽成績</h3>
          <p class="text-muted">預賽完賽成績輸入與晉級資格覆核中（若有更正體育組長亦可能暫時撤回校對），請稍候大會正式發布。</p>
        </div>
      `;
    }
  } else if (type === "finals-roster") {
    const finalsPaperEl = document.getElementById("finalsRosterNoticePaper");
    const hasPaper = finalsPaperEl && finalsPaperEl.querySelector(".official-print-page");
    if (state.published.finalsRoster && hasPaper) {
      container.innerHTML = `<div class="official-roster-paper">${finalsPaperEl.innerHTML}</div>`;
    } else {
      container.innerHTML = `
        <div class="empty-state no-print" style="background:#fff; padding:3.5rem 1.5rem; border-radius:8px; border:1px solid #e2e8f0; text-align:center;">
          <div style="font-size:2.8rem; margin-bottom:0.6rem;">🔒</div>
          <h3 style="color:#1e3a8a; margin-bottom:0.4rem;">大會尚未正式公告決賽分組參賽名冊</h3>
          <p class="text-muted">預賽賽事告一段落且大會於後台正式發布決賽晉級選手後，將即刻公布於此。</p>
        </div>
      `;
    }
  } else if (type === "finals-score") {
    const finalsScorePaperEl = document.getElementById("finalsScoreNoticePaper");
    const hasPaper = finalsScorePaperEl && finalsScorePaperEl.querySelector(".official-print-page");
    if (state.published.finalsScore && hasPaper) {
      container.innerHTML = `<div class="official-roster-paper">${finalsScorePaperEl.innerHTML}</div>`;
    } else {
      container.innerHTML = `
        <div class="empty-state no-print" style="background:#fff; padding:3.5rem 1.5rem; border-radius:8px; border:1px solid #e2e8f0; text-align:center;">
          <div style="font-size:2.8rem; margin-bottom:0.6rem;">🔒</div>
          <h3 style="color:#1e3a8a; margin-bottom:0.4rem;">大會尚未正式公告決賽完賽成績</h3>
          <p class="text-muted">決賽完賽名次計算與校對作業進行中，體育組長於後台發布後將在此展示決賽成績與名次。</p>
        </div>
      `;
    }
  }
}

function printPublicNotice(type) {
  const container = document.getElementById("publicNoticeViewContainer");

  // 嚴格檢查大會是否已正式發布該公告
  let isPub = false;
  if (type === "prelim-roster") isPub = state.published.prelimRoster;
  else if (type === "prelim-score") isPub = state.published.prelimScore;
  else if (type === "finals-roster") isPub = state.published.finalsRoster;
  else if (type === "finals-score") isPub = state.published.finalsScore;

  if (!isPub || !container || !container.querySelector(".official-print-page")) {
    alert("⚠️ 大會體育組長尚未公告此份公文（或公告校對中已暫時撤回），目前無可列印之正式文件！");
    return;
  }

  document.body.classList.add("print-from-public-notice");
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove("print-from-public-notice");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  setTimeout(cleanup, 2500);

  window.print();
}

function getAthleteGroupKey(r) {
  const gradeChar = r.className.charAt(0);
  const gradeText = ["三", "四", "五", "六"].includes(gradeChar) ? `${gradeChar}年級` : "";
  return `${gradeText}${r.category} ${r.event}`.trim();
}

function compareGroupKeys(a, b) {
  const gradeOrder = { "六年級": 1, "五年級": 2, "四年級": 3, "三年級": 4 };
  const eventOrder = { "60公尺": 1, "100公尺": 2, "200公尺": 3 };
  const catOrder = { "女生組": 1, "男生組": 2 };

  const getRank = (key) => {
    let gRank = 99, eRank = 99, cRank = 99;
    for (let g in gradeOrder) { if (key.includes(g)) { gRank = gradeOrder[g]; break; } }
    for (let e in eventOrder) { if (key.includes(e)) { eRank = eventOrder[e]; break; } }
    for (let c in catOrder) { if (key.includes(c)) { cRank = catOrder[c]; break; } }
    return { gRank, eRank, cRank };
  };

  const ra = getRank(a);
  const rb = getRank(b);

  if (ra.gRank !== rb.gRank) return ra.gRank - rb.gRank;
  if (ra.eRank !== rb.eRank) return ra.eRank - rb.eRank;
  if (ra.cRank !== rb.cRank) return ra.cRank - rb.cRank;
  return a.localeCompare(b, "zh-Hant");
}

function updateSeedingEventFilter() {
  const filter = document.getElementById("seedingEventFilter");
  if (!filter) return;
  
  // 依照年級與項目進行統計與排序
  const groupCounts = {};
  state.registrations.forEach(r => {
    const key = getAthleteGroupKey(r);
    groupCounts[key] = (groupCounts[key] || 0) + 1;
  });

  const sortedKeys = Object.keys(groupCounts).sort(compareGroupKeys);

  filter.innerHTML = `<option value="ALL">全部項目 (${state.registrations.length}人)</option>` +
    sortedKeys.map(k => `<option value="${k}">${k} (${groupCounts[k]}人)</option>`).join("");
}

async function syncRegistrationsToCloud() {
  if (state.registrations.length === 0) {
    alert("目前無報名資料可同步！");
    return;
  }
  showStatus("正在同步報名資料至 Google 試算表...", "info");
  try {
    const res = await fetch(CONFIG.GAS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "register",
        items: state.registrations
      })
    });
    const json = await res.json();
    if (json.status === "success") {
      showStatus("🎉 報名資料已成功寫入 Google 試算表！", "success");
      if (json.spreadsheetUrl) {
        state.spreadsheetUrl = json.spreadsheetUrl;
        const link = document.getElementById("cloudSheetLink");
        link.href = json.spreadsheetUrl;
        link.style.display = "inline-flex";
      }
    }
  } catch (err) {
    showStatus("同步失敗，已保留本地資料。若為首次使用請完成 Apps Script 授權。", "error");
  }
}

// ==========================================
// 2. 蛇形編排演算法與賽道配置
// ==========================================
function initSeedingEvents() {
  document.getElementById("btnRunSeeding").addEventListener("click", runSerpentineSeeding);
  document.getElementById("btnPrintPrelimNotice").addEventListener("click", printPrelimScheduleNotice);
  document.getElementById("btnSaveSeedingCloud").addEventListener("click", saveSeedingToCloud);

  const btnPub = document.getElementById("btnPublishPrelimRoster");
  if (btnPub) btnPub.addEventListener("click", publishPrelimRoster);
  const btnUnpub = document.getElementById("btnUnpublishPrelimRoster");
  if (btnUnpub) btnUnpub.addEventListener("click", unpublishPrelimRoster);

  const dateInput = document.getElementById("competitionDateInput");
  if (dateInput) {
    dateInput.addEventListener("input", () => {
      const dates = document.querySelectorAll(".notice-date-display");
      const currentVal = dateInput.value.trim() || getDefaultCompDate();
      dates.forEach(el => {
        // 若該公告元素未帶特定項目名稱，套用全域備援日期
        if (!el.dataset.event) {
          el.innerText = currentVal;
        }
      });
    });
  }
}

// ==========================================
// 各項目賽程日期排程設定 (彈窗與資料存取)
// ==========================================

// 備援與全域確保函式
window.getEventScheduleMap = function(stage = "prelim") {
  const storageKey = `dcps_event_dates_${stage}`;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) return JSON.parse(saved);
  } catch (e) {}

  if (window._scheduleCache && window._scheduleCache[stage]) {
    return { ...window._scheduleCache[stage] };
  }

  if (typeof CONFIG !== "undefined" && CONFIG.DEFAULT_SCHEDULE && CONFIG.DEFAULT_SCHEDULE[stage]) {
    return { ...CONFIG.DEFAULT_SCHEDULE[stage] };
  }
  return {};
};

window.saveEventScheduleMap = function(map, stage = "prelim") {
  const storageKey = `dcps_event_dates_${stage}`;
  try {
    localStorage.setItem(storageKey, JSON.stringify(map));
  } catch (e) {}
  if (!window._scheduleCache) window._scheduleCache = {};
  window._scheduleCache[stage] = { ...map };
};

window.getEventDate = function(eventName, stage = "prelim") {
  if (!eventName) return typeof getDefaultCompDate === "function" ? getDefaultCompDate() : "115.11.10";
  const norm = eventName.replace(/\s+/g, "").replace(/(預賽名單|決賽名單|預賽成績|決賽成績|參賽名單)$/, "");
  const map = window.getEventScheduleMap(stage);

  if (map[norm]) return map[norm];

  for (const key of Object.keys(map)) {
    if (norm === key || norm.includes(key) || key.includes(norm)) {
      return map[key];
    }
  }

  if (stage === "prelim") {
    if (norm.includes("60公尺") && (norm.includes("三年級") || norm.includes("四年級"))) return "115.10.21";
    if (norm.includes("100公尺") && (norm.includes("三年級") || norm.includes("四年級"))) return "115.10.27";
    if (norm.includes("100公尺") && (norm.includes("五年級") || norm.includes("六年級"))) return "115.10.28";
    if (norm.includes("200公尺") && (norm.includes("五年級") || norm.includes("六年級"))) return "115.10.30";
  } else if (stage === "finals") {
    if ((norm.includes("三年級") || norm.includes("四年級")) && (norm.includes("60公尺") || norm.includes("100公尺"))) return "115.11.10";
    if ((norm.includes("五年級") || norm.includes("六年級")) && (norm.includes("100公尺") || norm.includes("200公尺"))) return "115.11.13";
  }

  return typeof getDefaultCompDate === "function" ? getDefaultCompDate() : "115.11.10";
};

// 16 個標準競賽項目 (依年級與類別排列)
const STANDARD_16_EVENTS = [
  { grade: "三年級", cat: "女生組", name: "三年級女生組60公尺" },
  { grade: "三年級", cat: "男生組", name: "三年級男生組60公尺" },
  { grade: "四年級", cat: "女生組", name: "四年級女生組60公尺" },
  { grade: "四年級", cat: "男生組", name: "四年級男生組60公尺" },
  { grade: "三年級", cat: "女生組", name: "三年級女生組100公尺" },
  { grade: "三年級", cat: "男生組", name: "三年級男生組100公尺" },
  { grade: "四年級", cat: "女生組", name: "四年級女生組100公尺" },
  { grade: "四年級", cat: "男生組", name: "四年級男生組100公尺" },
  { grade: "五年級", cat: "女生組", name: "五年級女生組100公尺" },
  { grade: "五年級", cat: "男生組", name: "五年級男生組100公尺" },
  { grade: "六年級", cat: "女生組", name: "六年級女生組100公尺" },
  { grade: "六年級", cat: "男生組", name: "六年級男生組100公尺" },
  { grade: "五年級", cat: "女生組", name: "五年級女生組200公尺" },
  { grade: "五年級", cat: "男生組", name: "五年級男生組200公尺" },
  { grade: "六年級", cat: "女生組", name: "六年級女生組200公尺" },
  { grade: "六年級", cat: "男生組", name: "六年級男生組200公尺" }
];

window.renderScheduleTableRows = function() {
  const tbodyPrelim = document.getElementById("schedulePrelimTbody");
  const tbodyFinals = document.getElementById("scheduleFinalsTbody");

  if (tbodyPrelim) {
    tbodyPrelim.innerHTML = STANDARD_16_EVENTS.map(item => {
      const curDate = window.getEventDate(item.name, "prelim");
      return `
        <tr>
          <td><span class="badge ${item.grade.includes('三') || item.grade.includes('四') ? 'badge-q' : 'badge-gold'}">${item.grade}</span></td>
          <td>${item.cat}</td>
          <td><strong>${item.name}</strong></td>
          <td>
            <input type="text" class="schedule-input-prelim" data-event="${item.name}" value="${curDate}"
                   style="width: 140px; font-weight: 700; padding: 0.35rem 0.6rem; border: 1px solid #cbd5e1; border-radius: 4px;">
          </td>
        </tr>
      `;
    }).join("");
  }

  if (tbodyFinals) {
    tbodyFinals.innerHTML = STANDARD_16_EVENTS.map(item => {
      const curDate = window.getEventDate(item.name, "finals");
      return `
        <tr>
          <td><span class="badge ${item.grade.includes('三') || item.grade.includes('四') ? 'badge-q' : 'badge-gold'}">${item.grade}</span></td>
          <td>${item.cat}</td>
          <td><strong>${item.name}</strong></td>
          <td>
            <input type="text" class="schedule-input-finals" data-event="${item.name}" value="${curDate}"
                   style="width: 140px; font-weight: 700; padding: 0.35rem 0.6rem; border: 1px solid #cbd5e1; border-radius: 4px;">
          </td>
        </tr>
      `;
    }).join("");
  }
};

window.openScheduleModal = function() {
  const modal = document.getElementById("scheduleModal");
  if (!modal) return;
  window.renderScheduleTableRows();
  modal.style.display = "flex";
};

window.closeScheduleModal = function() {
  const modal = document.getElementById("scheduleModal");
  if (modal) modal.style.display = "none";
};

window.switchScheduleTab = function(tabName) {
  const tabPrelim = document.getElementById("btnTabSchedulePrelim");
  const tabFinals = document.getElementById("btnTabScheduleFinals");
  const secPrelim = document.getElementById("schedulePrelimSection");
  const secFinals = document.getElementById("scheduleFinalsSection");

  if (tabName === "prelim") {
    if (tabPrelim) tabPrelim.className = "btn btn-primary";
    if (tabFinals) tabFinals.className = "btn btn-outline";
    if (secPrelim) secPrelim.style.display = "block";
    if (secFinals) secFinals.style.display = "none";
  } else {
    if (tabPrelim) tabPrelim.className = "btn btn-outline";
    if (tabFinals) tabFinals.className = "btn btn-primary";
    if (secPrelim) secPrelim.style.display = "none";
    if (secFinals) secFinals.style.display = "block";
  }
};

window.applyPresetSchedule = function(stage, presetType, dateVal) {
  const selector = stage === "prelim" ? ".schedule-input-prelim" : ".schedule-input-finals";
  const inputs = document.querySelectorAll(selector);
  inputs.forEach(input => {
    const ev = input.dataset.event || "";
    let match = false;
    if (presetType === "grade34_60") {
      match = (ev.includes("三年級") || ev.includes("四年級")) && ev.includes("60公尺");
    } else if (presetType === "grade34_100") {
      match = (ev.includes("三年級") || ev.includes("四年級")) && ev.includes("100公尺");
    } else if (presetType === "grade56_100") {
      match = (ev.includes("五年級") || ev.includes("六年級")) && ev.includes("100公尺");
    } else if (presetType === "grade56_200") {
      match = (ev.includes("五年級") || ev.includes("六年級")) && ev.includes("200公尺");
    } else if (presetType === "grade34_all") {
      match = ev.includes("三年級") || ev.includes("四年級");
    } else if (presetType === "grade56_all") {
      match = ev.includes("五年級") || ev.includes("六年級");
    }
    if (match) {
      input.value = dateVal;
    }
  });
  if (typeof showStatus === "function") {
    showStatus(`⚡ 已快速帶入賽程日期：${dateVal}`, "info");
  }
};

window.resetOfficialSchedule = function() {
  if (!confirm("確定要重設為大庄國小 71 週年官方預設賽程日期嗎？")) return;
  if (typeof CONFIG !== "undefined" && CONFIG.DEFAULT_SCHEDULE) {
    window.saveEventScheduleMap(CONFIG.DEFAULT_SCHEDULE.prelim, "prelim");
    window.saveEventScheduleMap(CONFIG.DEFAULT_SCHEDULE.finals, "finals");
  }
  window.renderScheduleTableRows();
  alert("🔄 已重設為官方最新排程日期！");
  if (typeof showStatus === "function") {
    showStatus("🔄 已重設為官方最新排程日期！", "info");
  }
};

window.saveScheduleDates = function() {
  try {
    const prelimMap = {};
    document.querySelectorAll(".schedule-input-prelim").forEach(input => {
      const ev = input.dataset.event;
      if (ev) prelimMap[ev] = input.value.trim();
    });
    window.saveEventScheduleMap(prelimMap, "prelim");

    const finalsMap = {};
    document.querySelectorAll(".schedule-input-finals").forEach(input => {
      const ev = input.dataset.event;
      if (ev) finalsMap[ev] = input.value.trim();
    });
    window.saveEventScheduleMap(finalsMap, "finals");

    // 即時刷新畫面上現有的公告紙日期標籤
    document.querySelectorAll(".notice-date-display").forEach(el => {
      const ev = el.dataset.event;
      const stage = el.dataset.stage || "prelim";
      if (ev) {
        el.innerText = window.getEventDate(ev, stage);
      }
    });

    // 重新渲染公告紙與前台名單
    try {
      if (typeof state !== "undefined" && state.seededGroups && state.seededGroups.length > 0 && typeof renderPrelimNoticePaper === "function") {
        renderPrelimNoticePaper();
      }
      if (typeof renderPublicNoticeView === "function") {
        renderPublicNoticeView();
      }
    } catch (renderErr) {
      console.warn("渲染公告紙時提示：", renderErr);
    }

    // 關閉彈窗
    window.closeScheduleModal();

    // 彈出確認視窗與狀態列提示
    alert("✅ 賽程日期排程已成功儲存並同步套用至全系統！");
    if (typeof showStatus === "function") {
      showStatus("🎉 賽程日期排程已儲存並同步套用至全系統！", "success");
    }
  } catch (err) {
    console.error("儲存賽程排程失敗", err);
    alert("儲存時發生錯誤：" + err.message);
  }
};

function initScheduleModal() {
  const modal = document.getElementById("scheduleModal");
  const btnOpen = document.getElementById("btnOpenScheduleModal");
  const btnClose = document.getElementById("btnCloseScheduleModal");
  const btnCancel = document.getElementById("btnCancelScheduleModal");
  const btnSave = document.getElementById("btnSaveScheduleModal");
  const btnReset = document.getElementById("btnResetOfficialSchedule");

  const tabPrelim = document.getElementById("btnTabSchedulePrelim");
  const tabFinals = document.getElementById("btnTabScheduleFinals");

  if (!modal) return;

  if (btnOpen) btnOpen.addEventListener("click", window.openScheduleModal);
  if (btnClose) btnClose.addEventListener("click", window.closeScheduleModal);
  if (btnCancel) btnCancel.addEventListener("click", window.closeScheduleModal);
  if (btnSave) btnSave.addEventListener("click", window.saveScheduleDates);
  if (btnReset) btnReset.addEventListener("click", window.resetOfficialSchedule);

  if (tabPrelim) tabPrelim.addEventListener("click", () => window.switchScheduleTab("prelim"));
  if (tabFinals) tabFinals.addEventListener("click", () => window.switchScheduleTab("finals"));

  modal.addEventListener("click", (e) => {
    if (e.target === modal) window.closeScheduleModal();
  });
}

/**
 * 核心編排演算法：
 * 1. 選手依參考成績排序（最優到最差）
 * 2. 反向蛇形分組：排的時候從第 3 組開始排到第 1 組 (例如 3 組：3->2->1->1->2->3->3->2->1)
 * 3. 同班迴避原則：同班不分配在同一組，若有衝突與相鄰組安全置換
 * 4. 各組道次配置：最優者排第 4 道，次優第 5 道，依序第 3, 2, 1, 6 道
 */
function seedSingleGroup(candidates, heatCount, laneCount) {
  const lanePriority = laneCount === 5 ? PRELIM_LANE_PRIORITY_5 : PRELIM_LANE_PRIORITY_6;

  // 1. 依參考成績由快至慢排序
  const sortedAthletes = [...candidates].sort((a, b) => a.seedScore - b.seedScore);

  // 建立各組容器 (1-indexed: heats[1], heats[2], heats[3])
  const heats = {};
  for (let h = 1; h <= heatCount; h++) {
    heats[h] = [];
  }

  // 2. 產生「從第 3 組倒排至第 1 組」的反向蛇形分組序列
  // 範例 (3組)：[3, 2, 1, 1, 2, 3, 3, 2, 1, 1, 2, 3 ...]
  const serpentineOrder = [];
  let forward = false; // 初始從最大組號(如第3組)倒序開始
  let currentHeat = heatCount;

  while (serpentineOrder.length < sortedAthletes.length) {
    serpentineOrder.push(currentHeat);
    if (!forward) {
      if (currentHeat > 1) {
        currentHeat--;
      } else {
        forward = true;
        currentHeat = 1;
      }
    } else {
      if (currentHeat < heatCount) {
        currentHeat++;
      } else {
        forward = false;
        currentHeat = heatCount;
      }
    }
  }

  // 3. 逐一將選手放入組別，並嚴格實施「同班迴避原則」
  sortedAthletes.forEach((athlete, index) => {
    let targetHeat = serpentineOrder[index];

    // 檢查目標組別是否已有同班同學
    const hasClassConflict = (h, a) => heats[h].some(item => item.className === a.className);

    if (!hasClassConflict(targetHeat, athlete)) {
      heats[targetHeat].push(athlete);
    } else {
      // 發生同班衝突！尋找替代組別避開
      let resolved = false;
      const otherHeats = Object.keys(heats).map(Number).sort((a, b) => Math.abs(a - targetHeat) - Math.abs(b - targetHeat));

      // 策略 A: 放入無衝突且未滿的組別
      for (let altHeat of otherHeats) {
        if (!hasClassConflict(altHeat, athlete) && heats[altHeat].length < laneCount) {
          heats[altHeat].push(athlete);
          resolved = true;
          break;
        }
      }

      // 策略 B: 與相鄰組安全互換 (Swap)
      if (!resolved) {
        for (let altHeat of otherHeats) {
          if (altHeat === targetHeat) continue;
          const swapIdx = heats[altHeat].findIndex(candidate => {
            const heatWithoutCand = heats[altHeat].filter(x => x !== candidate);
            const targetWithoutAthlete = heats[targetHeat];
            return !heatWithoutCand.some(x => x.className === athlete.className) &&
                   !targetWithoutAthlete.some(x => x.className === candidate.className);
          });

          if (swapIdx !== -1) {
            const swappedAthlete = heats[altHeat].splice(swapIdx, 1)[0];
            heats[altHeat].push(athlete);
            heats[targetHeat].push(swappedAthlete);
            resolved = true;
            break;
          }
        }
      }

      // 極限處理（如單班級報名人數超過總組數）
      if (!resolved) {
        heats[targetHeat].push(athlete);
      }
    }
  });

  // 4. 各組道次分配：成績最優者優先指派第 4、5、3、2、1 道 (或 4,5,6,3,2,1)
  const resultHeats = [];
  for (let h = 1; h <= heatCount; h++) {
    const heatAthletes = heats[h].sort((a, b) => a.seedScore - b.seedScore);
    const assignedLanes = [];

    heatAthletes.forEach((athlete, idx) => {
      const laneNumber = lanePriority[idx % lanePriority.length];
      assignedLanes.push({
        lane: laneNumber,
        athlete: athlete,
        priorityRank: idx + 1
      });
    });

    // 依道次 1 至 N 排序，利於賽場檢錄點名
    assignedLanes.sort((a, b) => a.lane - b.lane);

    resultHeats.push({
      heatNum: h,
      lanes: assignedLanes
    });
  }

  return resultHeats;
}

const OFFICIAL_DEMO_PRELIM_SCORES = {
  // 六年級女生組 100公尺 (對齊大庄國小官方公文圖片)
  "高芷柔": 17.11,
  "林佳儀": 17.34,
  "劉采怡": 17.47,
  "邱祈涵": 17.68,
  "林芷伃": 17.75,
  "顏孜珉": 17.83,
  "林致忻": 18.04,
  "張維珈": 18.21,
  "孫沛霓": 18.22,
  "陳拓婕": 18.40,
  "洪翊瑄": 18.44,
  "彭璇": 18.71,
  "陳昀濃": 19.00,
  "陳琬蓁": 19.33,
  "林奐均": 16.20,

  // 六年級男生組 100公尺 (對齊大庄國小官方公文圖片)
  "李劭倫": 15.55,
  "陳雋晏": 15.61,
  "杜威廷": 15.79,
  "樊懿誠": 16.03,
  "吳振福": 16.51,
  "張晏銘": 16.82,
  "彭兆紳": 17.49,
  "李弦洲": 17.50,
  "林暐軒": 17.62,
  "溫秘華": 17.73,
  "吳松泉": 18.86,
  "饒捷承": 19.15,
  "王柏荃": 19.16,
  "王宥晟": "未出賽",
  "陳柏叡": "未出賽"
};

/**
 * 核心晉級判定演算法：
 * 針對任何一組競賽（包含多個 Heats）：
 * 1. 每組（Heat）排第 1 名的選手：保證直接晉級決賽（大 Q）！絕不允許任何一組無人晉級。
 * 2. 扣除各組第 1 名後，其餘所有完賽選手按成績統一排序，擇優取前 3 名晉級（小 q）。
 * 3. 大 Q（共 N 人，標準為3組3人）＋ 小 q（共 3 人）＝ 決賽 6 強！
 */
function calculateQualifiersForGroup(group) {
  if (!group || !group.heats) return [];

  const allResults = [];

  group.heats.forEach(heat => {
    const heatAthletes = [];
    heat.lanes.forEach(l => {
      const rawVal = l.prelimScore !== undefined && l.prelimScore !== null ? String(l.prelimScore).trim() : "";
      const val = parseFloat(rawVal);
      const isDNS = rawVal === "未出賽" || rawVal === "DNS" || rawVal === "棄權" || rawVal === "";

      heatAthletes.push({
        laneObj: l,
        athlete: l.athlete,
        heatNum: heat.heatNum,
        lane: l.lane,
        prelimScore: isDNS ? (rawVal || "未出賽") : val,
        isDNS: isDNS
      });
    });

    // 依完賽秒數由快至慢排序組內正常完賽選手
    const activeAthletes = heatAthletes.filter(x => !x.isDNS && typeof x.prelimScore === "number");
    activeAthletes.sort((a, b) => a.prelimScore - b.prelimScore);
    activeAthletes.forEach((item, idx) => {
      item.heatRank = idx + 1;
      allResults.push(item);
    });

    // 未出賽或缺賽選手
    heatAthletes.filter(x => x.isDNS || typeof x.prelimScore !== "number").forEach(item => {
      item.heatRank = 99;
      item.qualified = false;
      item.qualifyType = "";
      allResults.push(item);
    });
  });

  // 1. 各組第 1 名直接晉級（大 Q，每一組成績最優者必有 1 人直接晉級！）
  const directQualifiers = allResults.filter(x => x.heatRank === 1 && !x.isDNS && typeof x.prelimScore === "number");
  directQualifiers.forEach(x => {
    x.qualified = true;
    x.qualifyType = "Q (組第1名直接晉級)";
  });

  // 2. 擇優前 3 名晉級（小 q：在所有組別的第2名及之後選手中，取秒數最快的前 3 名）
  const remaining = allResults.filter(x => x.heatRank > 1 && !x.isDNS && typeof x.prelimScore === "number")
                              .sort((a, b) => a.prelimScore - b.prelimScore);
  const timeQualifiers = remaining.slice(0, 3);
  timeQualifiers.forEach(x => {
    x.qualified = true;
    x.qualifyType = "q (擇優前3名晉級)";
  });

  remaining.slice(3).forEach(x => {
    x.qualified = false;
    x.qualifyType = "";
  });

  // 未出賽者確保為 false
  allResults.filter(x => x.isDNS || typeof x.prelimScore !== "number").forEach(x => {
    x.qualified = false;
    x.qualifyType = "";
  });

  // 同步回 heat.lanes 物件
  allResults.forEach(r => {
    if (r.laneObj) {
      r.laneObj.prelimScore = r.prelimScore;
      r.laneObj.heatRank = r.heatRank;
      r.laneObj.qualified = r.qualified;
      r.laneObj.qualifyType = r.qualifyType;
    }
  });

  return allResults;
}

function printPrelimScheduleNotice() {
  if (!state.seededGroups || state.seededGroups.length === 0) {
    alert("請先點擊「🚀 執行反向蛇形編排」！");
    return;
  }
  renderPrelimNotice();

  const tabBtn = document.querySelector('.tab-btn[data-tab="tab-admin-seeding"]');
  if (tabBtn) tabBtn.click();

  setTimeout(() => {
    window.print();
  }, 150);
}

function runSerpentineSeeding() {
  if (state.registrations.length === 0) {
    alert("請先完成報名或載入示範名單！");
    return;
  }

  const heatCount = parseInt(document.getElementById("seedingHeatCount").value, 10);
  const laneCount = parseInt(document.getElementById("seedingLaneCount").value, 10);
  const filterVal = document.getElementById("seedingEventFilter").value;

  let candidates = [...state.registrations];
  if (filterVal !== "ALL") {
    candidates = candidates.filter(r => getAthleteGroupKey(r) === filterVal);
  }

  if (candidates.length === 0) {
    alert("所選篩選項目無選手資料！");
    return;
  }

  // 依據年級、項目與組別分組 (例如：「六年級女生組 100 公尺」)
  const groupMap = new Map();
  candidates.forEach(c => {
    const key = getAthleteGroupKey(c);
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        title: key,
        event: c.event,
        category: c.category,
        athletes: []
      });
    }
    groupMap.get(key).athletes.push(c);
  });

  const sortedGroupKeys = Array.from(groupMap.keys()).sort(compareGroupKeys);

  state.seededGroups = [];
  sortedGroupKeys.forEach(key => {
    const g = groupMap.get(key);
    const heats = seedSingleGroup(g.athletes, heatCount, laneCount);
    state.seededGroups.push({
      title: g.title,
      event: g.event,
      category: g.category,
      heats: heats
    });
  });

  // 設定第一組為預設登錄組別，維持與預賽計分流程無縫串接
  if (state.seededGroups.length > 0) {
    state.activeSeededGroup = state.seededGroups[0];
    state.prelimHeats = state.activeSeededGroup.heats;
  }

  state.published.prelimRoster = false;
  saveSeedingToLocalStorage();
  updatePublishControlUI();
  renderPrelimNotice();
  renderPrelimScoreInput();
  document.getElementById("btnSaveSeedingCloud").style.display = "inline-flex";
  showStatus(`🎉 反向蛇形編排完成！已為 ${state.seededGroups.length} 個競賽項目組別完成排道。請於下方校對名單，確認無誤後點擊「📢 公告預賽名單至前台」！`, "success");
}

/**
 * 依「同年級、同一個項目」聚合分組 (例如：六年級 100公尺 包含 女生組 與 男生組)
 * 確保在列印時，同一年級同一個項目嚴格排定在同一頁 (A4 Page)！
 */
function groupSeededGroupsByGradeAndEvent(groups) {
  const map = new Map();
  groups.forEach(g => {
    let grade = "";
    const gradeMatch = g.title.match(/([三四五六]年級)/);
    if (gradeMatch) {
      grade = gradeMatch[1];
    } else if (g.heats && g.heats[0] && g.heats[0].lanes && g.heats[0].lanes[0]) {
      const c = g.heats[0].lanes[0].athlete.className.charAt(0);
      if (["三", "四", "五", "六"].includes(c)) grade = `${c}年級`;
    }

    let event = g.event || "";
    if (!event) {
      const eventMatch = g.title.match(/(60公尺|100公尺|200公尺|60 公尺|100 公尺|200 公尺)/);
      if (eventMatch) event = eventMatch[1].replace(/\s+/g, "");
    }

    const pageKey = `${grade} ${event}`.trim();
    if (!map.has(pageKey)) {
      map.set(pageKey, {
        grade: grade,
        event: event,
        pageKey: pageKey,
        groups: []
      });
    }
    map.get(pageKey).groups.push(g);
  });

  // 每一頁內的組別排序：女生組優先於男生組 (對齊大庄國小官方公文格式)
  map.forEach(page => {
    page.groups.sort((a, b) => {
      const aIsFemale = a.title.includes("女生組") || (a.category && a.category.includes("女"));
      const bIsFemale = b.title.includes("女生組") || (b.category && b.category.includes("女"));
      if (aIsFemale && !bIsFemale) return -1;
      if (!aIsFemale && bIsFemale) return 1;
      return 0;
    });
  });

  // 頁面排序：依六年級 -> 五年級 -> 四年級 -> 三年級；項目依 60m -> 100m -> 200m
  const gradeOrder = { "六年級": 1, "五年級": 2, "四年級": 3, "三年級": 4 };
  const eventOrder = { "60公尺": 1, "100公尺": 2, "200公尺": 3 };

  return Array.from(map.values()).sort((a, b) => {
    const ga = gradeOrder[a.grade] || 99;
    const gb = gradeOrder[b.grade] || 99;
    if (ga !== gb) return ga - gb;
    const ea = eventOrder[a.event] || 99;
    const eb = eventOrder[b.event] || 99;
    return ea - eb;
  });
}

/**
 * 產出 100% 符合大庄國小校慶官方格式的預賽分組參賽名單 (同年級同項目列印在同一頁)
 */
function renderPrelimNotice() {
  const container = document.getElementById("heatsContainer");
  if (!state.seededGroups || state.seededGroups.length === 0) {
    container.innerHTML = `<div class="empty-state no-print">請點擊上方「🚀 執行反向蛇形編排」按鈕產出公告名單。</div>`;
    return;
  }

  const laneCount = parseInt(document.getElementById("seedingLaneCount").value, 10) || 5;
  // 號碼衣顏色配置：第5道橘、第4道紫、第3道黃、第2道藍、第1道紅
  const laneColorMap = {
    5: "橘",
    4: "紫",
    3: "黃",
    2: "藍",
    1: "紅",
    6: "綠"
  };

  // 取得使用者自訂比賽日期
  const dateInput = document.getElementById("competitionDateInput");
  const compDate = (dateInput && dateInput.value.trim()) ? dateInput.value.trim() : getDefaultCompDate();

  // 依圖片格式：道次欄位由左至右為 第 5 道、第 4 道、第 3 道、第 2 道、第 1 道
  const laneOrder = [];
  for (let l = laneCount; l >= 1; l--) {
    laneOrder.push(l);
  }

  // 將所有組別依「同年級、同一個項目」分頁，每一頁（女生組＋男生組）列印在同一頁
  const printPages = groupSeededGroupsByGradeAndEvent(state.seededGroups);

  let html = printPages.map(page => `
    <div class="official-print-page">
      <div class="official-header">
        <div class="official-school-title">${getSchoolName()} ${getAnniversary()} 週年校慶運動競賽參賽名單</div>
      </div>

      ${page.groups.map((group, gIdx) => {
        const groupDate = getEventDate(group.title, "prelim");
        const formattedTitle = group.title.replace(/(\d+)\s*公尺/, "$1 公尺");
        const subTitleText = formattedTitle.endsWith("預賽名單") ? formattedTitle : `${formattedTitle}預賽名單`;
        return `
        <div class="official-competition-section ${gIdx > 0 ? 'mt-2' : ''}">
          <div class="official-sub-bar">
            <span class="sub-title-left">${subTitleText}</span>
            <span class="sub-title-right">日期 <span class="notice-date-display" data-event="${group.title}" data-stage="prelim">${groupDate}</span></span>
          </div>

          ${group.heats.map(heat => `
            <table class="official-seeding-table">
              <thead>
                <tr>
                  <th colspan="2" class="th-lane-title">道　次</th>
                  ${laneOrder.map(laneNum => `<th>第 ${laneNum} 道${laneColorMap[laneNum] || ''}</th>`).join("")}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td rowspan="2" class="heat-label-cell">第 ${heat.heatNum} 組</td>
                  <td class="row-label-cell">姓名</td>
                  ${laneOrder.map(laneNum => {
                    const l = heat.lanes.find(x => x.lane === laneNum);
                    const nameStr = l ? `${l.athlete.className} ${l.athlete.name}` : '&nbsp;';
                    return `<td class="name-cell">${nameStr}</td>`;
                  }).join("")}
                </tr>
                <tr>
                  <td class="row-label-cell">成績</td>
                  ${laneOrder.map(laneNum => {
                    return `<td class="score-blank-cell">&nbsp;</td>`;
                  }).join("")}
                </tr>
              </tbody>
            </table>
          `).join("")}
        </div>
        `;
      }).join("")}
    </div>
  `).join("");

  container.innerHTML = html;
  renderPublicNoticeView();
}

async function saveSeedingToCloud() {
  if (!state.seededGroups || state.seededGroups.length === 0) return;
  showStatus("正在儲存預賽分組與道次至 Google Sheets...", "info");

  const seedings = [];
  state.seededGroups.forEach(group => {
    group.heats.forEach(h => {
      h.lanes.forEach(l => {
        seedings.push({
          event: group.title,
          heat: `第 ${h.heatNum} 組`,
          lane: `${l.lane} 道`,
          className: l.athlete.className,
          studentNo: l.athlete.studentNo || "",
          name: l.athlete.name,
          seedScore: l.athlete.seedScore
        });
      });
    });
  });

  try {
    saveSeedingToLocalStorage();
    const res = await fetch(CONFIG.GAS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "saveSeeding",
        seedings: seedings
      })
    });
    const json = await res.json();
    if (json.status === "success") {
      showStatus("✅ 預賽分組與道次已成功儲存至 Google 試算表！", "success");
    }
  } catch (err) {
    showStatus("分組已完整儲存在本地。若需同步雲端請確認 Apps Script 權限。", "error");
  }
}

// ==========================================
// 3. 預賽成績登錄與決賽晉級判定
// ==========================================
function initPrelimScoringEvents() {
  document.getElementById("btnCalculateQualifiers").addEventListener("click", calculateQualifiers);
  document.getElementById("btnFillSamplePrelimScores").addEventListener("click", fillSamplePrelimScores);
  document.getElementById("btnPrintFinalsNotice").addEventListener("click", printFinalsRosterNotice);
  const printScoreFromTab3 = document.getElementById("btnPrintPrelimScoreNoticeFromTab3");
  if (printScoreFromTab3) {
    printScoreFromTab3.addEventListener("click", printPrelimScoresNotice);
  }

  const btnPub = document.getElementById("btnPublishPrelimScore");
  if (btnPub) btnPub.addEventListener("click", publishPrelimScore);
  const btnUnpub = document.getElementById("btnUnpublishPrelimScore");
  if (btnUnpub) btnUnpub.addEventListener("click", unpublishPrelimScore);

  const btnGoFinals = document.getElementById("btnGoToFinalsTab");
  if (btnGoFinals) {
    btnGoFinals.addEventListener("click", () => {
      const tabBtn = document.querySelector('.tab-btn[data-tab="tab-admin-finals"]');
      if (tabBtn) tabBtn.click();
    });
  }
}

function renderPrelimScoreInput() {
  const area = document.getElementById("prelimScoreInputArea");
  if (!state.seededGroups || state.seededGroups.length === 0) {
    area.innerHTML = `<div class="empty-state no-print">尚未產生預賽排道，請先至「跑道智慧編排」分頁執行編排。</div>`;
    return;
  }

  // 若有多個競賽組別，提供切換選單
  let groupSelectorHtml = "";
  if (state.seededGroups.length > 1) {
    groupSelectorHtml = `
      <div class="filter-group mb-3 no-print" style="margin-bottom: 1.2rem; background: #f8fafc; padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid #cbd5e1;">
        <label><strong>🏃 選擇登錄項目組別：</strong></label>
        <select id="scoringGroupSelect" style="font-weight:700; padding:0.4rem 0.8rem; font-size:1rem;">
          ${state.seededGroups.map((g, idx) => `
            <option value="${idx}" ${state.activeSeededGroup === g ? 'selected' : ''}>${g.title} (${g.heats.length} 組)</option>
          `).join("")}
        </select>
      </div>
    `;
  } else {
    groupSelectorHtml = `<h3 class="mb-3" style="color: var(--primary-color);">${state.activeSeededGroup.title}</h3>`;
  }

  area.innerHTML = groupSelectorHtml + state.prelimHeats.map(heat => `
    <div class="card mt-3">
      <div class="card-header">
        <h3>⏱️ ${state.activeSeededGroup ? state.activeSeededGroup.title + ' - ' : ''}第 ${heat.heatNum} 組完賽秒數登錄</h3>
      </div>
      <div class="card-body">
        <table class="styled-table">
          <thead>
            <tr>
              <th>道次</th>
              <th>班級</th>
              <th>姓名</th>
              <th>參考成績</th>
              <th>預賽完賽成績 (秒)</th>
              <th>組內名次</th>
              <th>晉級狀態</th>
            </tr>
          </thead>
          <tbody>
            ${heat.lanes.map(l => `
              <tr data-athlete-id="${l.athlete.id}" data-heat="${heat.heatNum}" data-lane="${l.lane}">
                <td><span class="lane-chip ${l.lane === 4 ? 'favored' : (l.lane === 5 ? 'favored-2' : '')}">${l.lane}道</span></td>
                <td>${l.athlete.className}</td>
                <td><strong>${l.athlete.name}</strong></td>
                <td>${l.athlete.seedScore.toFixed(2)}s</td>
                <td>
                  <input type="text" class="prelim-score-input"
                         id="score_${heat.heatNum}_${l.lane}" placeholder="輸入秒數或未出賽"
                         value="${l.prelimScore !== undefined ? l.prelimScore : ''}"
                         style="width: 140px; font-weight: 700; padding: 0.35rem 0.5rem; border: 1px solid #cbd5e1; border-radius: 4px;">
                </td>
                <td id="rank_${heat.heatNum}_${l.lane}">${(l.prelimScore === '未出賽' || l.heatRank === 99) ? '<span class="text-muted">未出賽</span>' : (l.heatRank ? `<strong>第 ${l.heatRank} 名</strong>` : '-')}</td>
                <td id="status_${heat.heatNum}_${l.lane}">${(l.prelimScore === '未出賽') ? '<span class="text-muted">未出賽</span>' : (l.qualified ? (l.qualifyType && l.qualifyType.startsWith('Q') ? '<span class="badge badge-q">晉級 (Q)</span>' : '<span class="badge badge-small-q">擇優晉級 (q)</span>') : (l.prelimScore !== undefined && l.prelimScore !== null && l.prelimScore !== '' ? '<span class="text-muted">未晉級</span>' : '-'))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `).join("");

  const selectEl = document.getElementById("scoringGroupSelect");
  if (selectEl) {
    selectEl.addEventListener("change", (e) => {
      const idx = parseInt(e.target.value, 10);
      state.activeSeededGroup = state.seededGroups[idx];
      state.prelimHeats = state.activeSeededGroup.heats;
      renderPrelimScoreInput();
      if (state.activeSeededGroup.scoresCompleted) {
        renderFinalsLaneTable();
        renderPrelimScoreNoticePaper();
        document.getElementById("prelimScoreNoticeSection").style.display = "block";
      } else {
        document.getElementById("prelimScoreNoticeSection").style.display = "none";
      }
    });
  }
}

function fillSamplePrelimScores() {
  if (!state.seededGroups || state.seededGroups.length === 0) {
    alert("尚未產生預賽排道，請先至「蛇形排道」分頁執行編排！");
    return;
  }
  // 為所有組別（涵蓋同年級同項目的女生組與男生組）填入示範成績並計算晉級
  state.seededGroups.forEach(group => {
    group.heats.forEach(heat => {
      heat.lanes.forEach(l => {
        const demo = OFFICIAL_DEMO_PRELIM_SCORES[l.athlete.name];
        if (demo !== undefined) {
          l.prelimScore = demo;
        } else {
          const offset = (Math.random() * 0.5 - 0.2).toFixed(2);
          const score = (parseFloat(l.athlete.seedScore) + parseFloat(offset)).toFixed(2);
          l.prelimScore = Math.max(11.0, score);
        }
      });
    });

    // 為該組別計算晉級名單並排定決賽 6 道道次
    const qualifiers = calculateQualifiersForGroup(group);
    group.scoresCompleted = true;
    const qualifiedAthletes = qualifiers.filter(r => r.qualified && typeof r.prelimScore === "number")
                                        .sort((a, b) => a.prelimScore - b.prelimScore);
    group.finalists = qualifiedAthletes.map((item, idx) => ({
      ...item,
      finalLane: FINALS_LANE_PRIORITY_6[idx],
      seedPriority: idx + 1
    })).sort((a, b) => a.finalLane - b.finalLane);
  });

  if (state.activeSeededGroup && state.activeSeededGroup.finalists) {
    state.finalists = state.activeSeededGroup.finalists;
  }

  // 更新介面
  renderPrelimScoreInput();
  renderPrelimScoreNoticePaper();
  renderFinalsRosterNoticePaper();
  renderFinalsScoreInput();
  document.getElementById("prelimScoreNoticeSection").style.display = "block";
  showStatus("⚡ 已為同年級同項目（女生組＋男生組）填入示範預賽成績，並成功排定決賽 6 強名單！", "success");
}

function calculateQualifiers() {
  if (!state.activeSeededGroup || !state.prelimHeats) {
    alert("尚未產生預賽排道，請先至「蛇形排道」分頁執行編排！");
    return;
  }

  // 1. 嚴格檢查：確保每位選手皆已輸入預賽完賽成績或填入未出賽
  for (let heat of state.prelimHeats) {
    for (let l of heat.lanes) {
      const inputEl = document.getElementById(`score_${heat.heatNum}_${l.lane}`);
      if (!inputEl) continue;
      const rawVal = inputEl.value.trim();
      const isDNS = rawVal === "未出賽" || rawVal === "DNS" || rawVal === "棄權";
      const val = parseFloat(rawVal);

      if (!isDNS && (rawVal === "" || isNaN(val) || val <= 0)) {
        alert(`請先為「第 ${heat.heatNum} 組 ${l.lane} 道 ${l.athlete.name}」填寫預賽成績（秒）或輸入『未出賽』！`);
        inputEl.focus();
        return;
      }
      l.prelimScore = isDNS ? "未出賽" : val;
    }
  }

  // 2. 呼叫統一的核心判定演算法（確保每組第1名必為大 Q 晉級，絕不遺漏！）
  const allResults = calculateQualifiersForGroup(state.activeSeededGroup);
  state.activeSeededGroup.scoresCompleted = true;

  // 3. 更新畫面上的名次與晉級狀態標籤
  allResults.forEach(r => {
    const rankEl = document.getElementById(`rank_${r.heatNum}_${r.lane}`);
    const statusEl = document.getElementById(`status_${r.heatNum}_${r.lane}`);
    if (rankEl) {
      rankEl.innerHTML = (r.isDNS || typeof r.prelimScore !== "number")
        ? `<span class="text-muted">未出賽</span>`
        : `<strong>第 ${r.heatRank} 名</strong>`;
    }
    if (statusEl) {
      if (r.isDNS || typeof r.prelimScore !== "number") {
        statusEl.innerHTML = `<span class="text-muted">未出賽</span>`;
      } else if (r.qualified) {
        if (r.qualifyType && r.qualifyType.startsWith("Q")) {
          statusEl.innerHTML = `<span class="badge badge-q">晉級 (Q)</span>`;
        } else {
          statusEl.innerHTML = `<span class="badge badge-small-q">擇優晉級 (q)</span>`;
        }
      } else {
        statusEl.innerHTML = `<span class="text-muted">未晉級</span>`;
      }
    }
  });

  // 4. 更新所有組別的決賽 6 強名冊
  state.seededGroups.forEach(group => {
    if (group === state.activeSeededGroup || group.scoresCompleted) {
      const q = calculateQualifiersForGroup(group);
      const qa = q.filter(r => r.qualified && typeof r.prelimScore === "number")
                  .sort((a, b) => a.prelimScore - b.prelimScore);
      group.finalists = qa.map((item, idx) => ({
        ...item,
        finalLane: FINALS_LANE_PRIORITY_6[idx],
        seedPriority: idx + 1
      })).sort((a, b) => a.finalLane - b.finalLane);
    }
  });

  if (state.activeSeededGroup && state.activeSeededGroup.finalists) {
    state.finalists = state.activeSeededGroup.finalists;
  }

  state.published.prelimScore = false;
  state.published.finalsRoster = false;
  saveSeedingToLocalStorage();
  updatePublishControlUI();
  renderPrelimScoreNoticePaper();
  renderFinalsRosterNoticePaper();
  renderFinalsScoreInput();
  document.getElementById("prelimScoreNoticeSection").style.display = "block";
  showStatus(`🎉 預賽成績登錄與晉級判定完成！已產出預賽完賽公告與決賽名單。請校對無誤後點擊「📢 公告預賽成績與決賽名冊至前台」！`, "success");
}

/**
 * 產出 100% 符合大庄國小校慶官方格式的【預賽完賽成績公告表】(同年級同項目列印在同一頁，含●晉級標記與附註)
 */
function renderPrelimScoreNoticePaper() {
  const container = document.getElementById("prelimScoreNoticePaper");
  if (!container || !state.seededGroups || state.seededGroups.length === 0) return;

  const laneCount = parseInt(document.getElementById("seedingLaneCount") ? document.getElementById("seedingLaneCount").value : 5, 10) || 5;
  const laneColorMap = {
    5: "橘",
    4: "紫",
    3: "黃",
    2: "藍",
    1: "紅",
    6: "綠"
  };

  const dateInput = document.getElementById("competitionDateInput");
  const compDate = (dateInput && dateInput.value.trim()) ? dateInput.value.trim() : getDefaultCompDate();

  const laneOrder = [];
  for (let l = laneCount; l >= 1; l--) {
    laneOrder.push(l);
  }

  // 將所有組別依「同年級、同一個項目」分頁，每一頁（女生組＋男生組）列印在同一頁 (A4 Page)
  const printPages = groupSeededGroupsByGradeAndEvent(state.seededGroups);

  let html = printPages.map(page => `
    <div class="official-print-page">
      <div class="official-header">
        <div class="official-school-title">${getSchoolName()} ${getAnniversary()} 週年校慶運動競賽參賽名單</div>
      </div>

      ${page.groups.map((group, gIdx) => {
        const groupDate = getEventDate(group.title, "prelim");
        const formattedTitle = group.title.replace(/(\d+)\s*公尺/, "$1 公尺");
        const subTitleText = formattedTitle.endsWith("預賽名單") ? formattedTitle : `${formattedTitle}預賽名單`;
        return `
        <div class="official-competition-section ${gIdx > 0 ? 'mt-2' : ''}">
          <div class="official-sub-bar">
            <span class="sub-title-left">${subTitleText}</span>
            <span class="sub-title-right">日期 <span class="notice-date-display" data-event="${group.title}" data-stage="prelim">${groupDate}</span></span>
          </div>

          ${group.heats.map(heat => `
            <table class="official-seeding-table">
              <thead>
                <tr>
                  <th colspan="2" class="th-lane-title">道　次</th>
                  ${laneOrder.map(laneNum => `<th>第 ${laneNum} 道${laneColorMap[laneNum] || ''}</th>`).join("")}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td rowspan="2" class="heat-label-cell">第 ${heat.heatNum} 組</td>
                  <td class="row-label-cell">姓名</td>
                  ${laneOrder.map(laneNum => {
                    const l = heat.lanes.find(x => x.lane === laneNum);
                    const nameStr = l ? `${l.athlete.className} ${l.athlete.name}` : '&nbsp;';
                    return `<td class="name-cell">${nameStr}</td>`;
                  }).join("")}
                </tr>
                <tr>
                  <td class="row-label-cell">成績</td>
                  ${laneOrder.map(laneNum => {
                    const l = heat.lanes.find(x => x.lane === laneNum);
                    if (!l || l.prelimScore === undefined || l.prelimScore === null || l.prelimScore === "") {
                      return `<td class="score-cell">&nbsp;</td>`;
                    }
                    if (l.prelimScore === "未出賽") {
                      return `<td class="score-cell"><span class="text-muted">未出賽</span></td>`;
                    }
                    const scoreStr = typeof l.prelimScore === "number" ? l.prelimScore.toFixed(2) : l.prelimScore;
                    const text = l.qualified ? `●${scoreStr}` : `${scoreStr}`;
                    return `<td class="score-cell ${l.qualified ? 'qualified-score' : ''}">${text}</td>`;
                  }).join("")}
                </tr>
              </tbody>
            </table>
          `).join("")}

          <div class="official-qualify-legend">●表示晉級決賽</div>
        </div>
        `;
      }).join("")}
    </div>
  `).join("");

  container.innerHTML = html;
  renderPublicNoticeView();
}

function printPrelimScoresNotice() {
  const hasCompleted = state.seededGroups && state.seededGroups.some(g => g.scoresCompleted);
  if (!hasCompleted) {
    alert("⚠️ 尚未輸入預賽完賽成績！請先在上方輸入選手預賽成績，並點擊「🎯 判定晉級並產出預賽成績公告」後，才能產出與列印預賽成績公告！");
    return;
  }

  const finalsArea = document.getElementById("finalsNoticeArea");
  const prelimPaper = document.getElementById("prelimScoreNoticePaper");

  // 物理隱藏決賽名冊，確保只列印預賽完賽成績公告
  if (finalsArea) finalsArea.style.display = "none";
  if (prelimPaper) prelimPaper.style.display = "block";
  document.body.classList.add("print-prelim-score-only");

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (finalsArea) finalsArea.style.display = "";
    document.body.classList.remove("print-prelim-score-only");
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup);
  setTimeout(cleanup, 2500);

  window.print();
}

/**
 * 產出 100% 符合大庄國小校慶官方格式的【決賽參賽名單公告表】(同年級同項目列印在同一頁，6 道配置，手寫留白成績欄)
 */
function renderFinalsRosterNoticePaper() {
  const container = document.getElementById("finalsRosterNoticePaper");
  if (!container || !state.seededGroups || state.seededGroups.length === 0) return;

  const laneColorMap = {
    6: "綠",
    5: "橘",
    4: "紫",
    3: "黃",
    2: "藍",
    1: "紅"
  };

  const dateInput = document.getElementById("competitionDateInput");
  const compDate = (dateInput && dateInput.value.trim()) ? dateInput.value.trim() : getDefaultCompDate();

  // 決賽 6 道由左至右：第 6 道、第 5 道、第 4 道、第 3 道、第 2 道、第 1 道
  const laneOrder = [6, 5, 4, 3, 2, 1];
  const printPages = groupSeededGroupsByGradeAndEvent(state.seededGroups);

  let html = printPages.map(page => `
    <div class="official-print-page">
      <div class="official-header">
        <div class="official-school-title">${getSchoolName()} ${getAnniversary()} 週年校慶運動競賽參賽名單</div>
      </div>

      ${page.groups.map((group, gIdx) => {
        const eventDate = getEventDate(group.title, "finals");
        const formattedTitle = group.title.replace(/(\d+)\s*公尺/, "$1 公尺");
        const subTitleText = formattedTitle.endsWith("決賽名單") ? formattedTitle : `${formattedTitle.replace(/預賽名單$/, "")}決賽名單`;
        const finalists = group.finalists || [];

        return `
        <div class="official-competition-section ${gIdx > 0 ? 'mt-2' : ''}">
          <div class="official-sub-bar">
            <span class="sub-title-left">${subTitleText}</span>
            <span class="sub-title-right">日期 <span class="notice-date-display" data-event="${group.title}" data-stage="finals">${eventDate}</span></span>
          </div>

          <table class="official-seeding-table">
            <thead>
              <tr>
                <th colspan="2" class="th-lane-title">道　次</th>
                ${laneOrder.map(laneNum => `<th>第 ${laneNum} 道${laneColorMap[laneNum] || ''}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td rowspan="2" class="heat-label-cell">決　賽</td>
                <td class="row-label-cell">姓名</td>
                ${laneOrder.map(laneNum => {
                  const f = finalists.find(x => x.finalLane === laneNum);
                  const nameStr = f ? `${f.athlete.className} ${f.athlete.name}` : '&nbsp;';
                  return `<td class="name-cell">${nameStr}</td>`;
                }).join("")}
              </tr>
              <tr>
                <td class="row-label-cell">成績</td>
                ${laneOrder.map(() => `<td class="score-blank-cell">&nbsp;</td>`).join("")}
              </tr>
            </tbody>
          </table>
        </div>
        `;
      }).join("")}
    </div>
  `).join("");

  container.innerHTML = html;
  renderPublicNoticeView();
}

/**
 * 產出 100% 符合大庄國小校慶官方格式的【決賽完賽成績公告表】(成績前帶圈圈外框名次 ①～⑥，無積分制度)
 */
function renderFinalsScoreNoticePaper() {
  const container = document.getElementById("finalsScoreNoticePaper");
  if (!container || !state.seededGroups || state.seededGroups.length === 0) return;

  const laneColorMap = {
    6: "綠",
    5: "橘",
    4: "紫",
    3: "黃",
    2: "藍",
    1: "紅"
  };

  const dateInput = document.getElementById("competitionDateInput");
  const compDate = (dateInput && dateInput.value.trim()) ? dateInput.value.trim() : getDefaultCompDate();

  const laneOrder = [6, 5, 4, 3, 2, 1];
  const printPages = groupSeededGroupsByGradeAndEvent(state.seededGroups);

  let html = printPages.map(page => `
    <div class="official-print-page">
      <div class="official-header">
        <div class="official-school-title">${getSchoolName()} ${getAnniversary()} 週年校慶運動競賽參賽名單</div>
      </div>

      ${page.groups.map((group, gIdx) => {
        const eventDate = getEventDate(group.title, "finals");
        const formattedTitle = group.title.replace(/(\d+)\s*公尺/, "$1 公尺");
        const subTitleText = formattedTitle.endsWith("決賽名單") ? formattedTitle : `${formattedTitle.replace(/預賽名單$/, "")}決賽名單`;
        const finalists = group.finalists || [];

        return `
        <div class="official-competition-section ${gIdx > 0 ? 'mt-2' : ''}">
          <div class="official-sub-bar">
            <span class="sub-title-left">${subTitleText}</span>
            <span class="sub-title-right">日期 <span class="notice-date-display" data-event="${group.title}" data-stage="finals">${eventDate}</span></span>
          </div>

          <table class="official-seeding-table">
            <thead>
              <tr>
                <th colspan="2" class="th-lane-title">道　次</th>
                ${laneOrder.map(laneNum => `<th>第 ${laneNum} 道${laneColorMap[laneNum] || ''}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td rowspan="2" class="heat-label-cell">決　賽</td>
                <td class="row-label-cell">姓名</td>
                ${laneOrder.map(laneNum => {
                  const f = finalists.find(x => x.finalLane === laneNum);
                  const nameStr = f ? `${f.athlete.className} ${f.athlete.name}` : '&nbsp;';
                  return `<td class="name-cell">${nameStr}</td>`;
                }).join("")}
              </tr>
              <tr>
                <td class="row-label-cell">成績</td>
                ${laneOrder.map(laneNum => {
                  const f = finalists.find(x => x.finalLane === laneNum);
                  if (!f || f.finalScore === undefined || f.finalScore === null || f.finalScore === "") {
                    return `<td class="score-cell">&nbsp;</td>`;
                  }
                  if (f.finalScore === "未出賽" || f.isFinalsDNS) {
                    return `<td class="score-cell"><span class="text-muted">未出賽</span></td>`;
                  }
                  const scoreStr = typeof f.finalScore === "number" ? f.finalScore.toFixed(2) : f.finalScore;
                  const rankBadge = (f.finalRank && f.finalRank !== 99) ? `<span class="rank-circle">${f.finalRank}</span>` : "";
                  return `<td class="score-cell ${f.finalRank === 1 ? 'qualified-score' : ''}">${rankBadge}${scoreStr}</td>`;
                }).join("")}
              </tr>
            </tbody>
          </table>

          <div class="official-qualify-legend">①②③...表示決賽名次</div>
        </div>
        `;
      }).join("")}
    </div>
  `).join("");

  container.innerHTML = html;
  renderPublicNoticeView();
}

function renderFinalsScoreInput() {
  const area = document.getElementById("finalsScoreInputArea");
  if (!area) return;

  const groupsWithFinalists = (state.seededGroups || []).filter(g => g.finalists && g.finalists.length > 0);
  if (groupsWithFinalists.length === 0) {
    area.innerHTML = `<div class="empty-state">尚未產生決賽名單，請先至「預賽成績」分頁完成晉級判定。</div>`;
    return;
  }

  let html = groupsWithFinalists.map((group, gIdx) => `
    <div class="card mb-4" style="border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 1.5rem; background: #ffffff;">
      <div class="card-header" style="background:#f8fafc; padding: 0.8rem 1.25rem; font-weight: 700; color: #1e3a8a; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
        <span>🏃 ${group.title} 決賽 6 強成績登錄</span>
        <span style="font-size: 0.88rem; color: #64748b;">依預賽成績分配道次 (4, 5, 6, 3, 2, 1)</span>
      </div>
      <div class="card-body" style="padding: 1rem 1.25rem;">
        <div class="table-responsive">
          <table class="styled-table" style="width: 100%;">
            <thead>
              <tr>
                <th>決賽道次</th>
                <th>班級</th>
                <th>姓名</th>
                <th>預賽秒數</th>
                <th>決賽完賽秒數 (輸入)</th>
                <th>名次判定</th>
              </tr>
            </thead>
            <tbody>
              ${group.finalists.map(f => `
                <tr>
                  <td><span class="lane-chip ${f.finalLane === 4 ? 'favored' : (f.finalLane === 5 ? 'favored-2' : '')}">${f.finalLane} 道</span></td>
                  <td><strong>${f.athlete.className}</strong></td>
                  <td><strong>${f.athlete.name}</strong></td>
                  <td><code>${typeof f.prelimScore === 'number' ? f.prelimScore.toFixed(2) : f.prelimScore} 秒</code></td>
                  <td>
                    <input type="text"
                           id="final_score_${gIdx}_${f.finalLane}"
                           class="final-score-input"
                           placeholder="秒數或未出賽"
                           value="${f.finalScore !== undefined ? f.finalScore : ''}"
                           style="width: 160px; font-weight: 700; padding: 0.4rem 0.6rem; border: 1px solid #cbd5e1; border-radius: 4px;">
                  </td>
                  <td id="final_rank_display_${gIdx}_${f.finalLane}">
                    ${f.finalRank && f.finalRank !== 99 ? `<span class="rank-circle">${f.finalRank}</span> <strong>第 ${f.finalRank} 名</strong>` : (f.isFinalsDNS ? '<span class="text-muted">未出賽</span>' : '-')}
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `).join("");

  area.innerHTML = html;
}

function calculateFinalResults() {
  const groupsWithFinalists = (state.seededGroups || []).filter(g => g.finalists && g.finalists.length > 0);
  if (groupsWithFinalists.length === 0) {
    alert("尚未產生決賽名單，請先至「預賽成績」分頁完成晉級判定！");
    return;
  }

  // 1. 驗證並收集每一組的決賽秒數
  for (let gIdx = 0; gIdx < groupsWithFinalists.length; gIdx++) {
    const group = groupsWithFinalists[gIdx];
    for (let f of group.finalists) {
      const inputEl = document.getElementById(`final_score_${gIdx}_${f.finalLane}`);
      if (!inputEl) continue;
      const rawVal = inputEl.value.trim();
      const isDNS = rawVal === "未出賽" || rawVal === "DNS" || rawVal === "棄權";
      const val = parseFloat(rawVal);

      if (!isDNS && (rawVal === "" || isNaN(val) || val <= 0)) {
        alert(`請先為「${group.title} ${f.finalLane} 道 ${f.athlete.name}」輸入決賽完賽秒數或填寫『未出賽』！`);
        inputEl.focus();
        return;
      }
      f.isFinalsDNS = isDNS;
      f.finalScore = isDNS ? "未出賽" : val;
    }

    // 依決賽秒數排序 (取消積分制度，純名次排序)
    const activeFinalists = group.finalists.filter(x => !x.isFinalsDNS && typeof x.finalScore === "number");
    activeFinalists.sort((a, b) => a.finalScore - b.finalScore);

    const awardLabels = [
      "🥇 金牌 (第1名)",
      "🥈 銀牌 (第2名)",
      "🥉 銅牌 (第3名)",
      "第 4 名",
      "第 5 名",
      "第 6 名"
    ];

    activeFinalists.forEach((item, idx) => {
      item.finalRank = idx + 1;
      item.awardText = awardLabels[idx] || `第 ${idx + 1} 名`;
      const displayEl = document.getElementById(`final_rank_display_${gIdx}_${item.finalLane}`);
      if (displayEl) {
        displayEl.innerHTML = `<span class="rank-circle">${item.finalRank}</span> <strong>第 ${item.finalRank} 名</strong>`;
      }
    });

    // 缺賽選手
    group.finalists.filter(x => x.isFinalsDNS || typeof x.finalScore !== "number").forEach(item => {
      item.finalRank = 99;
      item.awardText = "未出賽";
      const displayEl = document.getElementById(`final_rank_display_${gIdx}_${item.finalLane}`);
      if (displayEl) {
        displayEl.innerHTML = `<span class="text-muted">未出賽</span>`;
      }
    });

    group.finalsCompleted = true;
  }

  // 2. 產出官方格式決賽成績公告（成績前帶圈圈外框名次）
  state.published.finalsScore = false;
  saveSeedingToLocalStorage();
  updatePublishControlUI();
  renderFinalsScoreNoticePaper();

  // 3. 顯示公告專區與列印按鈕
  document.getElementById("finalsScoreNoticeSection").style.display = "block";
  const printBtn = document.getElementById("btnPrintFinalsScoreNotice");
  if (printBtn) printBtn.style.display = "inline-flex";

  // 4. 產出螢幕決賽名次總覽表
  renderFinalsResultSummaryTable(groupsWithFinalists);

  showStatus("🎉 決賽名次計算完成！已依照官方格式產出決賽成績公告。請校對無誤後點擊「📢 公告決賽成績公告至前台」！", "success");
}

function renderFinalsResultSummaryTable(groups) {
  const tbody = document.getElementById("finalsResultTableBody");
  if (!tbody) return;

  const allRanked = [];
  groups.forEach(g => {
    if (g.finalists) {
      g.finalists.forEach(f => {
        allRanked.push({
          groupTitle: g.title,
          ...f
        });
      });
    }
  });

  allRanked.sort((a, b) => (a.finalRank || 99) - (b.finalRank || 99));

  tbody.innerHTML = allRanked.map(item => `
    <tr>
      <td>${item.finalRank && item.finalRank !== 99 ? `<span class="rank-circle">${item.finalRank}</span> 第 ${item.finalRank} 名` : '<span class="text-muted">未出賽</span>'}</td>
      <td><span class="lane-chip ${item.finalLane === 4 ? 'favored' : (item.finalLane === 5 ? 'favored-2' : '')}">${item.finalLane} 道</span></td>
      <td><strong>${item.athlete.className}</strong></td>
      <td><strong>${item.athlete.name}</strong> (${item.groupTitle})</td>
      <td><strong>${typeof item.finalScore === 'number' ? item.finalScore.toFixed(2) : item.finalScore}</strong></td>
      <td><code>${typeof item.prelimScore === 'number' ? item.prelimScore.toFixed(2) : item.prelimScore} 秒</code></td>
      <td><span class="badge ${item.finalRank === 1 ? 'badge-gold' : (item.finalRank === 2 || item.finalRank === 3 ? 'badge-silver' : 'badge-small-q')}">${item.awardText || '-'}</span></td>
    </tr>
  `).join("");
}

function fillSampleFinalScores() {
  const groupsWithFinalists = (state.seededGroups || []).filter(g => g.finalists && g.finalists.length > 0);
  if (groupsWithFinalists.length === 0) {
    alert("尚未產生決賽名單，請先至「預賽成績」分頁完成晉級判定！");
    return;
  }

  groupsWithFinalists.forEach((group, gIdx) => {
    group.finalists.forEach(f => {
      const input = document.getElementById(`final_score_${gIdx}_${f.finalLane}`);
      if (input) {
        const pScore = typeof f.prelimScore === 'number' ? f.prelimScore : 16.0;
        const offset = (Math.random() * 0.3 - 0.15).toFixed(2);
        const finalVal = (parseFloat(pScore) + parseFloat(offset)).toFixed(2);
        input.value = Math.max(10.5, finalVal);
      }
    });
  });

  calculateFinalResults();
  showStatus("⚡ 已填入示範決賽完賽成績並完成名次計算！已產出決賽完賽成績公告！", "success");
}

function printFinalsRosterNotice() {
  const hasFinalists = state.seededGroups && state.seededGroups.some(g => g.finalists && g.finalists.length > 0);
  if (!hasFinalists) {
    alert("⚠️ 尚未產生決賽名單！請先在上方輸入預賽成績並判定晉級！");
    return;
  }
  renderFinalsRosterNoticePaper();

  const finalsArea = document.getElementById("finalsNoticeArea");
  const prelimPaper = document.getElementById("prelimScoreNoticePaper");

  // 物理隱藏預賽成績，確保只列印決賽參賽名冊
  if (prelimPaper) prelimPaper.style.display = "none";
  if (finalsArea) finalsArea.style.display = "block";
  document.body.classList.add("print-finals-roster-only");

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (prelimPaper) prelimPaper.style.display = "";
    document.body.classList.remove("print-finals-roster-only");
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup);
  setTimeout(cleanup, 2500);

  window.print();
}

function printFinalsScoreNotice() {
  const hasCompleted = state.seededGroups && state.seededGroups.some(g => g.finalsCompleted);
  if (!hasCompleted) {
    alert("⚠️ 尚未計算決賽名次！請先在上方輸入決賽成績，並點擊「🏁 計算決賽名次並產出決賽成績公告」！");
    return;
  }

  const finalsScorePaper = document.getElementById("finalsScoreNoticePaper");
  if (finalsScorePaper) finalsScorePaper.style.display = "block";
  document.body.classList.add("print-finals-score-only");

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove("print-finals-score-only");
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup);
  setTimeout(cleanup, 2500);

  window.print();
}

async function exportFinalsToCloud() {
  const allFinalists = [];
  if (state.seededGroups) {
    state.seededGroups.forEach(g => {
      if (g.finalists) {
        g.finalists.forEach(f => {
          if (f.finalRank && f.finalRank !== 99) {
            allFinalists.push({
              event: g.title,
              lane: `${f.finalLane} 道`,
              className: f.athlete.className,
              studentNo: f.athlete.studentNo || "",
              name: f.athlete.name,
              finalScore: f.finalScore,
              finalRank: `第 ${f.finalRank} 名`,
              award: f.awardText || `第 ${f.finalRank} 名`
            });
          }
        });
      }
    });
  }

  if (allFinalists.length === 0) {
    alert("請先完成決賽成績登錄並計算名次！");
    return;
  }

  showStatus("正在將決賽名次寫入 Google 試算表...", "info");

  try {
    const res = await fetch(CONFIG.GAS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "saveFinalResults",
        finals: allFinalists
      })
    });
    const json = await res.json();
    if (json.status === "success") {
      showStatus("🎉 決賽名次已成功儲存至 Google 試算表！", "success");
      if (json.spreadsheetUrl) {
        state.spreadsheetUrl = json.spreadsheetUrl;
        const link = document.getElementById("cloudSheetLink");
        link.href = json.spreadsheetUrl;
        link.style.display = "inline-flex";
        window.open(json.spreadsheetUrl, "_blank");
      }
    }
  } catch (err) {
    showStatus("決賽名次已完整保留於本地。若需寫入雲端請確認 Google Apps Script 授權。", "error");
  }
}

// ==========================================
// 4. 決賽事件綁定
// ==========================================
function initFinalsEvents() {
  const calcBtn = document.getElementById("btnCalculateFinalsRanks");
  if (calcBtn) calcBtn.addEventListener("click", calculateFinalResults);

  const sampleBtn = document.getElementById("btnFillSampleFinalScores");
  if (sampleBtn) sampleBtn.addEventListener("click", fillSampleFinalScores);

  const exportBtn = document.getElementById("btnExportFinalsCloud");
  if (exportBtn) exportBtn.addEventListener("click", exportFinalsToCloud);

  const printBtn = document.getElementById("btnPrintFinalsScoreNotice");
  if (printBtn) printBtn.addEventListener("click", printFinalsScoreNotice);

  const printBtn2 = document.getElementById("btnPrintFinalsScoreNoticeBtn2");
  if (printBtn2) printBtn2.addEventListener("click", printFinalsScoreNotice);

  const btnPub = document.getElementById("btnPublishFinalsScore");
  if (btnPub) btnPub.addEventListener("click", publishFinalsScore);
  const btnUnpub = document.getElementById("btnUnpublishFinalsScore");
  if (btnUnpub) btnUnpub.addEventListener("click", unpublishFinalsScore);
}
