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

  // 4. 比賽預設日期（顯示於各列印公告紙右上角）
  DEFAULT_COMP_DATE: "115.11.11",

  // 5. 雲端後端服務設定 (Google Apps Script)
  GAS_API_URL: "https://script.google.com/macros/s/AKfycby5Q_Ctrhlaefx7lgnPyiSUcIcCyV-uVCLL_h87ZEnhyc8QdkVaqK-QTKUgKgbwBKh7/exec",
  SCRIPT_EDIT_URL: "https://script.google.com/d/1lk6hSzpkoOIGUPvgeo-EDdZ1939wj8K365IK1vbKF3GMwzYcvi7SFS_m/edit"
};
