/**
 * 大庄國小校慶運動競賽系統 - 年度集中設定檔
 * 每年舉辦校慶時，只需在此修改年度、日期與週年，全系統所有頁面與列印公告將自動同步更新！
 */
const CONFIG = {
  // 1. 學校名稱
  SCHOOL_NAME: "新竹市香山區大庄國民小學",
  SHORT_SCHOOL_NAME: "大庄國小",

  // 2. 校慶週年（例：明年度改為 "72"）
  ANNIVERSARY: "71",

  // 3. 報名截止提示文字（顯示於前台報名表上方）
  DEADLINE_DATE: "115年10月12日(一)",

  // 4. 比賽預設日期（基準備援日期）
  DEFAULT_COMP_DATE: "115.11.10",

  // 5. 各項目比賽預設日期排程 (預賽 / 決賽)
  DEFAULT_SCHEDULE: {
    prelim: {
      "三年級女生組60公尺": "115.10.21",
      "三年級男生組60公尺": "115.10.21",
      "四年級女生組60公尺": "115.10.21",
      "四年級男生組60公尺": "115.10.21",
      "三年級女生組100公尺": "115.10.27",
      "三年級男生組100公尺": "115.10.27",
      "四年級女生組100公尺": "115.10.27",
      "四年級男生組100公尺": "115.10.27",
      "五年級女生組100公尺": "115.10.28",
      "五年級男生組100公尺": "115.10.28",
      "六年級女生組100公尺": "115.10.28",
      "六年級男生組100公尺": "115.10.28",
      "五年級女生組200公尺": "115.10.30",
      "五年級男生組200公尺": "115.10.30",
      "六年級女生組200公尺": "115.10.30",
      "六年級男生組200公尺": "115.10.30"
    },
    finals: {
      "三年級女生組60公尺": "115.11.10",
      "三年級男生組60公尺": "115.11.10",
      "四年級女生組60公尺": "115.11.10",
      "四年級男生組60公尺": "115.11.10",
      "三年級女生組100公尺": "115.11.10",
      "三年級男生組100公尺": "115.11.10",
      "四年級女生組100公尺": "115.11.10",
      "四年級男生組100公尺": "115.11.10",
      "五年級女生組100公尺": "115.11.13",
      "五年級男生組100公尺": "115.11.13",
      "六年級女生組100公尺": "115.11.13",
      "六年級男生組100公尺": "115.11.13",
      "五年級女生組200公尺": "115.11.13",
      "五年級男生組200公尺": "115.11.13",
      "六年級女生組200公尺": "115.11.13",
      "六年級男生組200公尺": "115.11.13"
    }
  },

  // 6. 雲端後端服務設定 (Google Apps Script)
  GAS_API_URL: "https://script.google.com/macros/s/AKfycby5Q_Ctrhlaefx7lgnPyiSUcIcCyV-uVCLL_h87ZEnhyc8QdkVaqK-QTKUgKgbwBKh7/exec",
  SCRIPT_EDIT_URL: "https://script.google.com/d/1lk6hSzpkoOIGUPvgeo-EDdZ1939wj8K365IK1vbKF3GMwzYcvi7SFS_m/edit"
};

// ==========================================
// 全域設定存取輔助函式
// ==========================================
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
  return (typeof CONFIG !== "undefined" && CONFIG.DEFAULT_COMP_DATE) || "115.11.10";
}

// 取得各項目賽程日期對照表 (優先順序: localStorage > CONFIG.DEFAULT_SCHEDULE)
function getEventScheduleMap(stage = "prelim") {
  const storageKey = `dcps_event_dates_${stage}`;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {}

  if (typeof CONFIG !== "undefined" && CONFIG.DEFAULT_SCHEDULE && CONFIG.DEFAULT_SCHEDULE[stage]) {
    return { ...CONFIG.DEFAULT_SCHEDULE[stage] };
  }
  return {};
}

// 儲存各項目賽程日期對照表至 localStorage
function saveEventScheduleMap(map, stage = "prelim") {
  const storageKey = `dcps_event_dates_${stage}`;
  try {
    localStorage.setItem(storageKey, JSON.stringify(map));
  } catch (e) {}
}

// 取得特定項目的比賽日期 (預賽 / 決賽)
function getEventDate(eventName, stage = "prelim") {
  if (!eventName) return getDefaultCompDate();
  const norm = eventName.replace(/\s+/g, "").replace(/(預賽名單|決賽名單|預賽成績|決賽成績|參賽名單)$/, "");
  const map = getEventScheduleMap(stage);
  
  if (map[norm]) return map[norm];
  
  for (const key of Object.keys(map)) {
    if (norm === key || norm.includes(key) || key.includes(norm)) {
      return map[key];
    }
  }

  // 智慧官方預設備援
  if (stage === "prelim") {
    if (norm.includes("60公尺") && (norm.includes("三年級") || norm.includes("四年級"))) return "115.10.21";
    if (norm.includes("100公尺") && (norm.includes("三年級") || norm.includes("四年級"))) return "115.10.27";
    if (norm.includes("100公尺") && (norm.includes("五年級") || norm.includes("六年級"))) return "115.10.28";
    if (norm.includes("200公尺") && (norm.includes("五年級") || norm.includes("六年級"))) return "115.10.30";
  } else if (stage === "finals") {
    if ((norm.includes("三年級") || norm.includes("四年級")) && (norm.includes("60公尺") || norm.includes("100公尺"))) return "115.11.10";
    if ((norm.includes("五年級") || norm.includes("六年級")) && (norm.includes("100公尺") || norm.includes("200公尺"))) return "115.11.13";
  }

  return getDefaultCompDate();
}

