/**
 * 大庄國小 71 週年校慶運動競賽 - 前端賽務公文 Word / 獎狀 Excel 直接下載模組
 * 支援 5 大賽務階段一鍵直接下載：
 * 1. 預賽賽道編排完畢 ➔ 產生預賽名單 Word 檔 (已排賽道，成績空白)
 * 2. 預賽成績輸入完畢 ➔ 產生預賽名單 Word 檔 (含預賽成績)
 * 3. 決賽賽道編排完畢 ➔ 產生決賽名單 Word 檔 (已排賽道，成績空白)
 * 4. 決賽成績輸入完畢 ➔ 產生決賽名單 Word 檔 (含決賽成績)
 * 5. 決賽成績統整完畢 ➔ 產生 71 週年獎狀合併列印 Excel 檔 (96 筆得獎紀錄)
 * 6. 一鍵打包全套文件 ZIP 下載
 */

// 16 個標準競賽項目 (依年級與項目排序)
const EXPORT_STANDARD_EVENTS = [
  "三年級女生組60公尺",
  "三年級男生組60公尺",
  "四年級女生組60公尺",
  "四年級男生組60公尺",
  "三年級女生組100公尺",
  "三年級男生組100公尺",
  "四年級女生組100公尺",
  "四年級男生組100公尺",
  "五年級女生組100公尺",
  "五年級男生組100公尺",
  "六年級女生組100公尺",
  "六年級男生組100公尺",
  "五年級女生組200公尺",
  "五年級男生組200公尺",
  "六年級女生組200公尺",
  "六年級男生組200公尺"
];

// 預賽名單 Word 範本中 16 個項目的順序 (每個項目包含 3 組 Table，共 48 Tables)
const EXPORT_PRELIM_EVENT_ORDER = [
  "六年級女生組100公尺",
  "六年級男生組100公尺",
  "六年級女生組200公尺",
  "六年級男生組200公尺",
  "五年級女生組100公尺",
  "五年級男生組100公尺",
  "五年級女生組200公尺",
  "五年級男生組200公尺",
  "四年級女生組60公尺",
  "四年級男生組60公尺",
  "四年級女生組100公尺",
  "四年級男生組100公尺",
  "三年級女生組60公尺",
  "三年級男生組60公尺",
  "三年級女生組100公尺",
  "三年級男生組100公尺"
];

// 決賽名單 Word 範本中 16 個項目的順序 (每個項目 1 個 Table，共 16 Tables)
const EXPORT_FINALS_EVENT_ORDER = [
  "三年級女生組60公尺",
  "三年級男生組60公尺",
  "四年級女生組60公尺",
  "四年級男生組60公尺",
  "三年級女生組100公尺",
  "三年級男生組100公尺",
  "四年級女生組100公尺",
  "四年級男生組100公尺",
  "五年級女生組100公尺",
  "五年級男生組100公尺",
  "六年級女生組100公尺",
  "六年級男生組100公尺",
  "五年級女生組200公尺",
  "五年級男生組200公尺",
  "六年級女生組200公尺",
  "六年級男生組200公尺"
];

// 名次中文對照表 (含大庄國小慣用之空白格式)
const EXPORT_RANK_CHINESE = {
  1: "第 一 名",
  2: "第 二 名",
  3: "第 三 名",
  4: "第 四 名",
  5: "第 五 名",
  6: "第 六 名"
};

/**
 * 正規化項目名稱 (例如 "六年級女生組 100 公尺" -> "六年級女生組100公尺")
 */
function normalizeEventTitle(raw) {
  if (!raw) return "";
  return String(raw).replace(/\s+/g, "").trim();
}

/**
 * 下載 Blob 為檔案
 */
function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 300);
}

/**
 * 取得或準備預賽賽道資料映射表
 * 返回 Map: key: `${event}_${heat}_${lane}` -> { className, name, score }
 */
async function getPrelimDataMap() {
  const map = new Map();

  // 若前端當前 state 中已有編排結果
  if (state.seededGroups && state.seededGroups.length > 0) {
    state.seededGroups.forEach(g => {
      const evName = normalizeEventTitle(g.title);
      (g.heats || []).forEach(h => {
        const heatNum = parseInt(h.heatNum, 10);
        (h.lanes || []).forEach(l => {
          const laneNum = parseInt(l.lane, 10);
          const athlete = l.athlete || {};
          let score = l.prelimScore !== undefined && l.prelimScore !== null ? String(l.prelimScore).trim() : "";
          if (score && !isNaN(parseFloat(score)) && isFinite(score)) {
            score = parseFloat(score).toFixed(2);
          }
          map.set(`${evName}_${heatNum}_${laneNum}`, {
            className: athlete.className || "",
            name: athlete.name || "",
            score: score
          });
        });
      });
    });
    return map;
  }

  // 嘗試從 Google Sheets 雲端 API 取得
  if (typeof CONFIG !== "undefined" && CONFIG.GAS_API_URL) {
    try {
      const res = await fetch(`${CONFIG.GAS_API_URL}?action=getPrelimResults`);
      const json = await res.json();
      if (json.status === "success" && Array.isArray(json.data) && json.data.length > 0) {
        json.data.forEach(item => {
          const evName = normalizeEventTitle(item.event);
          const heatNum = parseInt(item.heat || 1, 10);
          const laneNum = parseInt(item.lane || 1, 10);
          let score = item.resultScore || item.seedScore || "";
          if (score && !isNaN(parseFloat(score)) && isFinite(score)) {
            score = parseFloat(score).toFixed(2);
          }
          map.set(`${evName}_${heatNum}_${laneNum}`, {
            className: item.className || "",
            name: item.name || "",
            score: score
          });
        });
        return map;
      }
    } catch (e) {
      console.warn("無法從雲端取得預賽名冊", e);
    }
  }

  // 若尚未編排，但有報名名單，則自動先執行一次排道
  if (state.registrations && state.registrations.length > 0) {
    runSerpentineSeeding();
    return getPrelimDataMap();
  }

  return map;
}

/**
 * 取得或準備決賽資料映射表
 * 返回 Map: key: `${event}_${lane}` -> { className, name, prelimScore, finalScore, finalRank, awardText }
 */
async function getFinalsDataMap() {
  const map = new Map();

  // 若前端 state 中已有決賽晉級選手
  const groupsWithFinalists = (state.seededGroups || []).filter(g => g.finalists && g.finalists.length > 0);
  if (groupsWithFinalists.length > 0) {
    groupsWithFinalists.forEach(g => {
      const evName = normalizeEventTitle(g.title);
      g.finalists.forEach(f => {
        const laneNum = parseInt(f.finalLane, 10);
        const athlete = f.athlete || {};
        let fScore = f.finalScore !== undefined && f.finalScore !== null ? String(f.finalScore).trim() : "";
        if (fScore && !isNaN(parseFloat(fScore)) && isFinite(fScore)) {
          fScore = parseFloat(fScore).toFixed(2);
        }
        map.set(`${evName}_${laneNum}`, {
          className: athlete.className || "",
          name: athlete.name || "",
          prelimScore: f.prelimScore,
          finalScore: fScore,
          finalRank: f.finalRank,
          awardText: f.awardText
        });
      });
    });
    return map;
  }

  // 嘗試從 Google Sheets 雲端 API 取得
  if (typeof CONFIG !== "undefined" && CONFIG.GAS_API_URL) {
    try {
      const res = await fetch(`${CONFIG.GAS_API_URL}?action=getFinalResults`);
      const json = await res.json();
      if (json.status === "success" && Array.isArray(json.data) && json.data.length > 0) {
        json.data.forEach(item => {
          const evName = normalizeEventTitle(item.event);
          const laneNum = parseInt(item.lane || 1, 10);
          let fScore = item.finalScore || "";
          if (fScore && !isNaN(parseFloat(fScore)) && isFinite(fScore)) {
            fScore = parseFloat(fScore).toFixed(2);
          }
          let rankNum = null;
          if (item.finalRank) {
            const m = String(item.finalRank).match(/(\d+)/);
            if (m) rankNum = parseInt(m[1], 10);
          }
          map.set(`${evName}_${laneNum}`, {
            className: item.className || "",
            name: item.name || "",
            prelimScore: item.prelimScore || "",
            finalScore: fScore,
            finalRank: rankNum,
            awardText: item.award || (rankNum ? `第 ${rankNum} 名` : "")
          });
        });
        return map;
      }
    } catch (e) {
      console.warn("無法從雲端取得決賽資料", e);
    }
  }

  return map;
}

/**
 * 依據 XML 操作填充 Word 表格單元格
 */
function setXmlCellText(cell, text, isBold = false, fontSize = 26) {
  const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  let p = cell.getElementsByTagNameNS(ns, "p")[0];
  if (!p) {
    p = cell.ownerDocument.createElementNS(ns, "w:p");
    cell.appendChild(p);
  }

  // 移除既有的所有 run (w:r)
  const existingRs = Array.from(p.getElementsByTagNameNS(ns, "r"));
  existingRs.forEach(r => p.removeChild(r));

  if (!text) return;

  const r = cell.ownerDocument.createElementNS(ns, "w:r");
  const rPr = cell.ownerDocument.createElementNS(ns, "w:rPr");

  // 字型設定為標楷體
  const rFonts = cell.ownerDocument.createElementNS(ns, "w:rFonts");
  rFonts.setAttributeNS(ns, "w:eastAsia", "標楷體");
  rFonts.setAttributeNS(ns, "w:hint", "eastAsia");
  rPr.appendChild(rFonts);

  // 字體大小 (half-points, 26 = 13pt)
  const sz = cell.ownerDocument.createElementNS(ns, "w:sz");
  sz.setAttributeNS(ns, "w:val", String(fontSize));
  rPr.appendChild(sz);

  const szCs = cell.ownerDocument.createElementNS(ns, "w:szCs");
  szCs.setAttributeNS(ns, "w:val", String(fontSize));
  rPr.appendChild(szCs);

  // 黑色文字
  const col = cell.ownerDocument.createElementNS(ns, "w:color");
  col.setAttributeNS(ns, "w:val", "000000");
  rPr.appendChild(col);

  if (isBold) {
    const b = cell.ownerDocument.createElementNS(ns, "w:b");
    rPr.appendChild(b);
  }

  r.appendChild(rPr);

  const t = cell.ownerDocument.createElementNS(ns, "w:t");
  t.textContent = text;
  r.appendChild(t);

  p.appendChild(r);
}

/**
 * 透過 JSZip 讀取 .docx 範本、修改 word/document.xml 並重新打包為 Blob
 */
async function processDocxTemplate(templateUrl, modifierCallback) {
  let arrayBuffer;
  try {
    const resp = await fetch(templateUrl);
    if (!resp.ok) throw new Error(`HTTP error ${resp.status}`);
    arrayBuffer = await resp.arrayBuffer();
  } catch (err) {
    throw new Error(`範本載入失敗 (${templateUrl})：${err.message}`);
  }

  if (typeof JSZip === "undefined") {
    throw new Error("JSZip 函式庫尚未載入，無法處理 .docx 檔案！");
  }

  const zip = await JSZip.loadAsync(arrayBuffer);
  const docXmlStr = await zip.file("word/document.xml").async("string");

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(docXmlStr, "application/xml");
  const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

  modifierCallback(xmlDoc, ns);

  const serializer = new XMLSerializer();
  const newXmlStr = serializer.serializeToString(xmlDoc);
  zip.file("word/document.xml", newXmlStr);

  return await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

/**
 * 備用 Word (.doc) HTML 格式產生器：預賽名單
 * 當本地 file:// 無法 fetch .docx 範本時自動呼叫，支援 100% 離線直接產出
 */
function generatePrelimHtmlDoc(dataMap, includeScores = false) {
  const compDate = (typeof getDefaultCompDate === "function" ? getDefaultCompDate() : "115.11.11");
  const anniversary = (typeof getAnniversary === "function" ? getAnniversary() : "71");
  const laneColMap = [5, 4, 3, 2, 1];
  const colorMap = { 5: "橘", 4: "紫", 3: "黃", 2: "藍", 1: "紅" };

  let html = `
  <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
  <head>
  <meta charset='utf-8'>
  <!--[if gte mso 9]>
  <xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml>
  <![endif]-->
  <style>
    @page { size: 21.0cm 29.7cm; margin: 1.5cm 1.5cm 1.5cm 1.5cm; }
    body { font-family: "標楷體", "DFKai-SB", "BiauKai", serif; font-size: 14pt; }
    .page-title { text-align: center; font-size: 22pt; font-weight: bold; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; table-layout: fixed; }
    th, td { border: 1.5pt solid black; text-align: center; padding: 6px 4px; height: 38px; font-size: 13pt; }
    th { font-weight: bold; background-color: #f8fafc; }
    .page-break { page-break-before: always; }
  </style>
  </head>
  <body>
  `;

  EXPORT_PRELIM_EVENT_ORDER.forEach((evName, idx) => {
    if (idx > 0 && idx % 2 === 0) {
      html += `<div class="page-break"></div>`;
    }
    const match = evName.match(/^([三四五六]年級)([男女]生組)(.*)$/);
    const gradeCat = match ? `${match[1]}${match[2]}` : evName;
    const eventItem = match ? match[3] : "";

    html += `
      <div style="margin-bottom: 24px;">
        <div class="page-title">大庄國小 ${anniversary} 週年校慶  ${includeScores ? "競賽預賽成績" : "運動競賽預賽名單"}</div>
        <table style="border: none; width: 100%; margin-bottom: 6px;">
          <tr style="border: none;">
            <td style="border: none; text-align: left; font-weight: bold; font-size: 14pt; width: 33%;">年級組別：${gradeCat}</td>
            <td style="border: none; text-align: center; font-weight: bold; font-size: 14pt; width: 33%;">項目：${eventItem}</td>
            <td style="border: none; text-align: right; font-weight: bold; font-size: 14pt; width: 33%;">比賽日期：${compDate}</td>
          </tr>
        </table>
    `;

    for (let heatIdx = 1; heatIdx <= 3; heatIdx++) {
      html += `
        <div style="font-weight: bold; font-size: 13pt; margin-bottom: 3px;">第 ${heatIdx} 組</div>
        <table>
          <tr>
            <th style="width: 14%;">道 次</th>
            ${laneColMap.map(l => `<th style="width: 17.2%;">第${l}道${colorMap[l]}</th>`).join("")}
          </tr>
          <tr>
            <th>姓 名</th>
            ${laneColMap.map(l => {
              const item = dataMap.get(`${evName}_${heatIdx}_${l}`);
              return `<td>${item && item.name ? `${item.className} ${item.name}` : ""}</td>`;
            }).join("")}
          </tr>
          <tr>
            <th>成 績</th>
            ${laneColMap.map(l => {
              const item = dataMap.get(`${evName}_${heatIdx}_${l}`);
              return `<td style="font-weight: bold;">${includeScores && item && item.score ? item.score : ""}</td>`;
            }).join("")}
          </tr>
        </table>
      `;
    }

    html += `
      <div style="font-size: 11pt; margin-top: 4px;">附註：1. 本項目預賽取6名參加決賽。 2. 各組第1名晉級決賽(計3名)，其餘擇優取3名。</div>
      </div>
    `;
  });

  html += `</body></html>`;
  return new Blob([html], { type: "application/msword;charset=utf-8" });
}

/**
 * 備用 Word (.doc) HTML 格式產生器：決賽名單
 * 當本地 file:// 無法 fetch .docx 範本時自動呼叫，支援 100% 離線直接產出
 */
function generateFinalsHtmlDoc(dataMap, includeScores = false) {
  const compDate = (typeof getDefaultCompDate === "function" ? getDefaultCompDate() : "115.11.11");
  const anniversary = (typeof getAnniversary === "function" ? getAnniversary() : "71");
  const finalsLanes = [6, 5, 4, 3, 2, 1];
  const colorMap = { 6: "紫", 5: "橘", 4: "黃", 3: "藍", 2: "綠", 1: "紅" };

  let html = `
  <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
  <head>
  <meta charset='utf-8'>
  <!--[if gte mso 9]>
  <xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml>
  <![endif]-->
  <style>
    @page { size: 21.0cm 29.7cm; margin: 1.5cm 1.5cm 1.5cm 1.5cm; }
    body { font-family: "標楷體", "DFKai-SB", "BiauKai", serif; font-size: 14pt; }
    .page-title { text-align: center; font-size: 22pt; font-weight: bold; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; table-layout: fixed; }
    th, td { border: 1.5pt solid black; text-align: center; padding: 6px 4px; height: 38px; font-size: 13pt; }
    th { font-weight: bold; background-color: #f8fafc; }
    .page-break { page-break-before: always; }
  </style>
  </head>
  <body>
  `;

  EXPORT_FINALS_EVENT_ORDER.forEach((evName, idx) => {
    if (idx > 0 && idx % 4 === 0) {
      html += `<div class="page-break"></div>`;
    }
    const match = evName.match(/^([三四五六]年級)([男女]生組)(.*)$/);
    const gradeCat = match ? `${match[1]}${match[2]}` : evName;
    const eventItem = match ? match[3] : "";

    html += `
      <div style="margin-bottom: 24px;">
        <div class="page-title">大庄國小 ${anniversary} 週年校慶  ${includeScores ? "運動競賽決賽成績" : "運動競賽決賽名單"}</div>
        <table style="border: none; width: 100%; margin-bottom: 6px;">
          <tr style="border: none;">
            <td style="border: none; text-align: left; font-weight: bold; font-size: 14pt; width: 33%;">年級組別：${gradeCat}</td>
            <td style="border: none; text-align: center; font-weight: bold; font-size: 14pt; width: 33%;">項目：${eventItem}</td>
            <td style="border: none; text-align: right; font-weight: bold; font-size: 14pt; width: 33%;">比賽日期：${compDate}</td>
          </tr>
        </table>
        <table>
          <tr>
            <th style="width: 14%;">道 次</th>
            ${finalsLanes.map(l => `<th style="width: 14.3%;">第${l}道${colorMap[l]}</th>`).join("")}
          </tr>
          <tr>
            <th>姓 名</th>
            ${finalsLanes.map(l => {
              const item = dataMap.get(`${evName}_${l}`);
              return `<td>${item && item.name ? `${item.className} ${item.name}` : ""}</td>`;
            }).join("")}
          </tr>
          <tr>
            <th>成 績</th>
            ${finalsLanes.map(l => {
              const item = dataMap.get(`${evName}_${l}`);
              return `<td style="font-weight: bold;">${includeScores && item && item.finalScore ? item.finalScore : ""}</td>`;
            }).join("")}
          </tr>
        </table>
      </div>
    `;
  });

  html += `</body></html>`;
  return new Blob([html], { type: "application/msword;charset=utf-8" });
}

// =========================================================================
// 階段 1：預賽賽道編排完畢 ➔ 下載預賽名單 Word 檔 (已排賽道，成績空白)
// =========================================================================
async function downloadStage1PrelimRosterWord() {
  try {
    showStatus("⏳ 正在產出【預賽賽道名單 Word 檔 (空白成績)】...", "info");
    const dataMap = await getPrelimDataMap();
    if (dataMap.size === 0) {
      alert("⚠️ 目前尚無預賽賽道編排資料！\n請先至「跑道智慧編排」分頁點擊「執行反向蛇形編排」。");
      return;
    }

    const laneColMap = { 5: 2, 4: 3, 3: 4, 2: 5, 1: 6 };
    let blob, filename;

    try {
      blob = await processDocxTemplate("templates/115校慶(71周年)運動競賽預賽名單.docx", (xmlDoc, ns) => {
        const tables = xmlDoc.getElementsByTagNameNS(ns, "tbl");
        EXPORT_PRELIM_EVENT_ORDER.forEach((evName, evIdx) => {
          for (let heatIdx = 1; heatIdx <= 3; heatIdx++) {
            const tblIdx = evIdx * 3 + (heatIdx - 1);
            if (tblIdx >= tables.length) break;
            const tbl = tables[tblIdx];
            const rows = tbl.getElementsByTagNameNS(ns, "tr");
            if (rows.length < 3) continue;

            const row1Cells = rows[1].getElementsByTagNameNS(ns, "tc");
            const row2Cells = rows[2].getElementsByTagNameNS(ns, "tc");

            for (const [laneStr, colIdx] of Object.entries(laneColMap)) {
              const laneNum = parseInt(laneStr, 10);
              const key = `${evName}_${heatIdx}_${laneNum}`;
              const item = dataMap.get(key);

              if (item && item.name) {
                const displayName = `${item.className} ${item.name}`.trim();
                setXmlCellText(row1Cells[colIdx], displayName, false, 26);
              } else {
                setXmlCellText(row1Cells[colIdx], "", false, 26);
              }
              // 階段 1 成績保留空白
              setXmlCellText(row2Cells[colIdx], "", false, 26);
            }
          }
        });
      });
      filename = "115校慶(71周年)運動競賽預賽名單_已編排賽道.docx";
    } catch (docxErr) {
      console.warn("範本載入失敗，切換至相容 Word (.doc) 格式產生", docxErr);
      blob = generatePrelimHtmlDoc(dataMap, false);
      filename = "115校慶(71周年)運動競賽預賽名單_已編排賽道.doc";
    }

    triggerBlobDownload(blob, filename);
    showStatus(`🎉 成功下載：${filename}`, "success");
  } catch (err) {
    console.error("產出預賽名單失敗", err);
    alert(`產出失敗：${err.message}`);
    showStatus("產出預賽名單失敗", "error");
  }
}

// =========================================================================
// 階段 2：預賽成績輸入完畢 ➔ 下載預賽名單 Word 檔 (含預賽成績)
// =========================================================================
async function downloadStage2PrelimResultsWord() {
  try {
    showStatus("⏳ 正在產出【預賽成績名單 Word 檔 (含預賽成績)】...", "info");
    const dataMap = await getPrelimDataMap();
    if (dataMap.size === 0) {
      alert("⚠️ 目前尚無預賽賽道編排資料！請先完成編排並登錄成績。");
      return;
    }

    const laneColMap = { 5: 2, 4: 3, 3: 4, 2: 5, 1: 6 };
    let blob, filename;

    try {
      blob = await processDocxTemplate("templates/115校慶(71周年)運動競賽預賽名單.docx", (xmlDoc, ns) => {
        const tables = xmlDoc.getElementsByTagNameNS(ns, "tbl");
        EXPORT_PRELIM_EVENT_ORDER.forEach((evName, evIdx) => {
          for (let heatIdx = 1; heatIdx <= 3; heatIdx++) {
            const tblIdx = evIdx * 3 + (heatIdx - 1);
            if (tblIdx >= tables.length) break;
            const tbl = tables[tblIdx];
            const rows = tbl.getElementsByTagNameNS(ns, "tr");
            if (rows.length < 3) continue;

            const row1Cells = rows[1].getElementsByTagNameNS(ns, "tc");
            const row2Cells = rows[2].getElementsByTagNameNS(ns, "tc");

            for (const [laneStr, colIdx] of Object.entries(laneColMap)) {
              const laneNum = parseInt(laneStr, 10);
              const key = `${evName}_${heatIdx}_${laneNum}`;
              const item = dataMap.get(key);

              if (item && item.name) {
                const displayName = `${item.className} ${item.name}`.trim();
                setXmlCellText(row1Cells[colIdx], displayName, false, 26);
                setXmlCellText(row2Cells[colIdx], item.score || "", true, 26);
              } else {
                setXmlCellText(row1Cells[colIdx], "", false, 26);
                setXmlCellText(row2Cells[colIdx], "", false, 26);
              }
            }
          }
        });
      });
      filename = "115校慶(71周年)運動競賽預賽名單_含預賽成績.docx";
    } catch (docxErr) {
      console.warn("範本載入失敗，切換至相容 Word (.doc) 格式產生", docxErr);
      blob = generatePrelimHtmlDoc(dataMap, true);
      filename = "115校慶(71周年)運動競賽預賽名單_含預賽成績.doc";
    }

    triggerBlobDownload(blob, filename);
    showStatus(`🎉 成功下載：${filename}`, "success");
  } catch (err) {
    console.error("產出預賽成績名單失敗", err);
    alert(`產出失敗：${err.message}`);
    showStatus("產出預賽成績名單失敗", "error");
  }
}

// =========================================================================
// 階段 3：決賽賽道編排完畢 ➔ 下載決賽名單 Word 檔 (已排賽道，成績空白)
// =========================================================================
async function downloadStage3FinalsRosterWord() {
  try {
    showStatus("⏳ 正在產出【決賽賽道名單 Word 檔 (空白成績)】...", "info");
    const dataMap = await getFinalsDataMap();
    if (dataMap.size === 0) {
      alert("⚠️ 目前尚無決賽晉級選手名單！\n請先至「預賽成績」分頁輸入各組秒數並點擊「判定晉級」。");
      return;
    }

    const finalsLaneColMap = { 6: 1, 5: 2, 4: 3, 3: 4, 2: 5, 1: 6 };
    let blob, filename;

    try {
      blob = await processDocxTemplate("templates/115校慶(71周年)運動競賽決賽名單.docx", (xmlDoc, ns) => {
        const tables = xmlDoc.getElementsByTagNameNS(ns, "tbl");
        EXPORT_FINALS_EVENT_ORDER.forEach((evName, evIdx) => {
          if (evIdx >= tables.length) return;
          const tbl = tables[evIdx];
          const rows = tbl.getElementsByTagNameNS(ns, "tr");
          if (rows.length < 3) return;

          const row1Cells = rows[1].getElementsByTagNameNS(ns, "tc");
          const row2Cells = rows[2].getElementsByTagNameNS(ns, "tc");

          for (const [laneStr, colIdx] of Object.entries(finalsLaneColMap)) {
            const laneNum = parseInt(laneStr, 10);
            const key = `${evName}_${laneNum}`;
            const item = dataMap.get(key);

            if (item && item.name) {
              const displayName = `${item.className} ${item.name}`.trim();
              setXmlCellText(row1Cells[colIdx], displayName, false, 26);
            } else {
              setXmlCellText(row1Cells[colIdx], "", false, 26);
            }
            // 階段 3 成績保留空白
            setXmlCellText(row2Cells[colIdx], "", false, 26);
          }
        });
      });
      filename = "115校慶(71周年)運動競賽決賽名單_已編排賽道.docx";
    } catch (docxErr) {
      console.warn("範本載入失敗，切換至相容 Word (.doc) 格式產生", docxErr);
      blob = generateFinalsHtmlDoc(dataMap, false);
      filename = "115校慶(71周年)運動競賽決賽名單_已編排賽道.doc";
    }

    triggerBlobDownload(blob, filename);
    showStatus(`🎉 成功下載：${filename}`, "success");
  } catch (err) {
    console.error("產出決賽名單失敗", err);
    alert(`產出失敗：${err.message}`);
    showStatus("產出決賽名單失敗", "error");
  }
}

// =========================================================================
// 階段 4：決賽成績輸入完畢 ➔ 下載決賽名單 Word 檔 (含決賽成績)
// =========================================================================
async function downloadStage4FinalsResultsWord() {
  try {
    showStatus("⏳ 正在產出【決賽成績名單 Word 檔 (含決賽成績)】...", "info");
    const dataMap = await getFinalsDataMap();
    if (dataMap.size === 0) {
      alert("⚠️ 目前尚無決賽選手資料！請先至「預賽成績」分頁完成晉級判定。");
      return;
    }

    const finalsLaneColMap = { 6: 1, 5: 2, 4: 3, 3: 4, 2: 5, 1: 6 };
    let blob, filename;

    try {
      blob = await processDocxTemplate("templates/115校慶(71周年)運動競賽決賽名單.docx", (xmlDoc, ns) => {
        const tables = xmlDoc.getElementsByTagNameNS(ns, "tbl");
        EXPORT_FINALS_EVENT_ORDER.forEach((evName, evIdx) => {
          if (evIdx >= tables.length) return;
          const tbl = tables[evIdx];
          const rows = tbl.getElementsByTagNameNS(ns, "tr");
          if (rows.length < 3) return;

          const row1Cells = rows[1].getElementsByTagNameNS(ns, "tc");
          const row2Cells = rows[2].getElementsByTagNameNS(ns, "tc");

          for (const [laneStr, colIdx] of Object.entries(finalsLaneColMap)) {
            const laneNum = parseInt(laneStr, 10);
            const key = `${evName}_${laneNum}`;
            const item = dataMap.get(key);

            if (item && item.name) {
              const displayName = `${item.className} ${item.name}`.trim();
              setXmlCellText(row1Cells[colIdx], displayName, false, 26);
              setXmlCellText(row2Cells[colIdx], item.finalScore || "", true, 26);
            } else {
              setXmlCellText(row1Cells[colIdx], "", false, 26);
              setXmlCellText(row2Cells[colIdx], "", false, 26);
            }
          }
        });
      });
      filename = "115校慶(71周年)運動競賽決賽名單_含決賽成績.docx";
    } catch (docxErr) {
      console.warn("範本載入失敗，切換至相容 Word (.doc) 格式產生", docxErr);
      blob = generateFinalsHtmlDoc(dataMap, true);
      filename = "115校慶(71周年)運動競賽決賽名單_含決賽成績.doc";
    }

    triggerBlobDownload(blob, filename);
    showStatus(`🎉 成功下載：${filename}`, "success");
  } catch (err) {
    console.error("產出決賽成績名單失敗", err);
    alert(`產出失敗：${err.message}`);
    showStatus("產出決賽成績名單失敗", "error");
  }
}

// =========================================================================
// 階段 5：決賽成績統整完畢 ➔ 下載 71 週年獎狀合併列印 Excel 檔 (96 筆)
// =========================================================================
async function downloadStage5CertificatesExcel() {
  try {
    showStatus("⏳ 正在產出【71週年獎狀合併列印 Excel 檔】...", "info");
    const dataMap = await getFinalsDataMap();
    if (dataMap.size === 0) {
      alert("⚠️ 目前尚無決賽完賽成績！\n請先在「決賽成績」分頁輸入完賽秒數並點擊「計算決賽名次」。");
      return;
    }

    if (typeof XLSX === "undefined") {
      alert("XLSX 函式庫載入中，請稍後重試！");
      return;
    }

    // 將決賽選手依各項目整理出第 1 名至第 6 名
    const eventFinalists = {};
    EXPORT_FINALS_EVENT_ORDER.forEach(ev => {
      eventFinalists[ev] = [];
    });

    dataMap.forEach((item, key) => {
      const lastUnderscore = key.lastIndexOf("_");
      const evName = key.substring(0, lastUnderscore);
      if (eventFinalists[evName]) {
        eventFinalists[evName].push(item);
      }
    });

    // 建立 4 欄工作表資料：[編號, 組別, 姓名, 名次]
    const rows = [
      ["編號", "組別", "姓名", "名次"]
    ];

    let rowSeq = 1;
    EXPORT_FINALS_EVENT_ORDER.forEach(evName => {
      const finalists = eventFinalists[evName] || [];
      // 依名次排序
      finalists.sort((a, b) => (a.finalRank || 99) - (b.finalRank || 99));

      for (let r = 1; r <= 6; r++) {
        const student = finalists[r - 1];
        const groupLabel = `${evName}比賽`;
        const studentName = student ? student.name : "";
        const rankLabel = EXPORT_RANK_CHINESE[r] || `第 ${r} 名`;

        rows.push([
          rowSeq,
          groupLabel,
          studentName,
          rankLabel
        ]);
        rowSeq++;
      }
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // 設定欄寬
    ws["!cols"] = [
      { wch: 8 },   // 編號
      { wch: 28 },  // 組別
      { wch: 14 },  // 姓名
      { wch: 16 }   // 名次
    ];

    XLSX.utils.book_append_sheet(wb, ws, "獎狀名冊");

    const filename = "115校慶(71周年)獎狀合併列印.xlsx";
    XLSX.writeFile(wb, filename);
    showStatus(`🎉 成功下載：${filename}（共 96 筆得獎紀錄）`, "success");
  } catch (err) {
    console.error("產出獎狀 Excel 失敗", err);
    alert(`產出失敗：${err.message}`);
    showStatus("產出獎狀 Excel 失敗", "error");
  }
}

// =========================================================================
// 一鍵打包下載全部賽務文件 (.ZIP)
// =========================================================================
async function downloadAllCompetitionDocsZip() {
  try {
    showStatus("⏳ 正在一鍵打包產出全套賽務公文與獎狀檔案 (ZIP)...", "info");
    if (typeof JSZip === "undefined") {
      alert("JSZip 函式庫尚未載入！");
      return;
    }

    const zip = new JSZip();
    const folder = zip.folder("115校慶(71周年)運動競賽全套賽務文件");

    const prelimMap = await getPrelimDataMap();
    const finalsMap = await getFinalsDataMap();

    const laneColMap = { 5: 2, 4: 3, 3: 4, 2: 5, 1: 6 };
    const finalsLaneColMap = { 6: 1, 5: 2, 4: 3, 3: 4, 2: 5, 1: 6 };

    // 1. 階段 1
    if (prelimMap.size > 0) {
      try {
        const b1 = await processDocxTemplate("templates/115校慶(71周年)運動競賽預賽名單.docx", (xmlDoc, ns) => {
          const tables = xmlDoc.getElementsByTagNameNS(ns, "tbl");
          EXPORT_PRELIM_EVENT_ORDER.forEach((evName, evIdx) => {
            for (let heatIdx = 1; heatIdx <= 3; heatIdx++) {
              const tblIdx = evIdx * 3 + (heatIdx - 1);
              if (tblIdx >= tables.length) break;
              const rows = tables[tblIdx].getElementsByTagNameNS(ns, "tr");
              if (rows.length < 3) continue;
              const r1 = rows[1].getElementsByTagNameNS(ns, "tc");
              const r2 = rows[2].getElementsByTagNameNS(ns, "tc");
              for (const [laneStr, colIdx] of Object.entries(laneColMap)) {
                const item = prelimMap.get(`${evName}_${heatIdx}_${laneStr}`);
                setXmlCellText(r1[colIdx], item && item.name ? `${item.className} ${item.name}` : "", false, 26);
                setXmlCellText(r2[colIdx], "", false, 26);
              }
            }
          });
        });
        folder.file("115校慶(71周年)運動競賽預賽名單_已編排賽道.docx", b1);
      } catch (e) {
        folder.file("115校慶(71周年)運動競賽預賽名單_已編排賽道.doc", generatePrelimHtmlDoc(prelimMap, false));
      }

      // 2. 階段 2
      try {
        const b2 = await processDocxTemplate("templates/115校慶(71周年)運動競賽預賽名單.docx", (xmlDoc, ns) => {
          const tables = xmlDoc.getElementsByTagNameNS(ns, "tbl");
          EXPORT_PRELIM_EVENT_ORDER.forEach((evName, evIdx) => {
            for (let heatIdx = 1; heatIdx <= 3; heatIdx++) {
              const tblIdx = evIdx * 3 + (heatIdx - 1);
              if (tblIdx >= tables.length) break;
              const rows = tables[tblIdx].getElementsByTagNameNS(ns, "tr");
              if (rows.length < 3) continue;
              const r1 = rows[1].getElementsByTagNameNS(ns, "tc");
              const r2 = rows[2].getElementsByTagNameNS(ns, "tc");
              for (const [laneStr, colIdx] of Object.entries(laneColMap)) {
                const item = prelimMap.get(`${evName}_${heatIdx}_${laneStr}`);
                setXmlCellText(r1[colIdx], item && item.name ? `${item.className} ${item.name}` : "", false, 26);
                setXmlCellText(r2[colIdx], item && item.score ? item.score : "", true, 26);
              }
            }
          });
        });
        folder.file("115校慶(71周年)運動競賽預賽名單_含預賽成績.docx", b2);
      } catch (e) {
        folder.file("115校慶(71周年)運動競賽預賽名單_含預賽成績.doc", generatePrelimHtmlDoc(prelimMap, true));
      }
    }

    // 3. 階段 3 & 4
    if (finalsMap.size > 0) {
      try {
        const b3 = await processDocxTemplate("templates/115校慶(71周年)運動競賽決賽名單.docx", (xmlDoc, ns) => {
          const tables = xmlDoc.getElementsByTagNameNS(ns, "tbl");
          EXPORT_FINALS_EVENT_ORDER.forEach((evName, evIdx) => {
            if (evIdx >= tables.length) return;
            const rows = tables[evIdx].getElementsByTagNameNS(ns, "tr");
            if (rows.length < 3) return;
            const r1 = rows[1].getElementsByTagNameNS(ns, "tc");
            const r2 = rows[2].getElementsByTagNameNS(ns, "tc");
            for (const [laneStr, colIdx] of Object.entries(finalsLaneColMap)) {
              const item = finalsMap.get(`${evName}_${laneStr}`);
              setXmlCellText(r1[colIdx], item && item.name ? `${item.className} ${item.name}` : "", false, 26);
              setXmlCellText(r2[colIdx], "", false, 26);
            }
          });
        });
        folder.file("115校慶(71周年)運動競賽決賽名單_已編排賽道.docx", b3);
      } catch (e) {
        folder.file("115校慶(71周年)運動競賽決賽名單_已編排賽道.doc", generateFinalsHtmlDoc(finalsMap, false));
      }

      try {
        const b4 = await processDocxTemplate("templates/115校慶(71周年)運動競賽決賽名單.docx", (xmlDoc, ns) => {
          const tables = xmlDoc.getElementsByTagNameNS(ns, "tbl");
          EXPORT_FINALS_EVENT_ORDER.forEach((evName, evIdx) => {
            if (evIdx >= tables.length) return;
            const rows = tables[evIdx].getElementsByTagNameNS(ns, "tr");
            if (rows.length < 3) return;
            const r1 = rows[1].getElementsByTagNameNS(ns, "tc");
            const r2 = rows[2].getElementsByTagNameNS(ns, "tc");
            for (const [laneStr, colIdx] of Object.entries(finalsLaneColMap)) {
              const item = finalsMap.get(`${evName}_${laneStr}`);
              setXmlCellText(r1[colIdx], item && item.name ? `${item.className} ${item.name}` : "", false, 26);
              setXmlCellText(r2[colIdx], item && item.finalScore ? item.finalScore : "", true, 26);
            }
          });
        });
        folder.file("115校慶(71周年)運動競賽決賽名單_含決賽成績.docx", b4);
      } catch (e) {
        folder.file("115校慶(71周年)運動競賽決賽名單_含決賽成績.doc", generateFinalsHtmlDoc(finalsMap, true));
      }
    }

    // 5. 階段 5 Excel
    if (typeof XLSX !== "undefined" && finalsMap.size > 0) {
      const eventFinalists = {};
      EXPORT_FINALS_EVENT_ORDER.forEach(ev => { eventFinalists[ev] = []; });
      finalsMap.forEach((item, key) => {
        const evName = key.substring(0, key.lastIndexOf("_"));
        if (eventFinalists[evName]) eventFinalists[evName].push(item);
      });
      const rows = [["編號", "組別", "姓名", "名次"]];
      let rowSeq = 1;
      EXPORT_FINALS_EVENT_ORDER.forEach(evName => {
        const finalists = eventFinalists[evName] || [];
        finalists.sort((a, b) => (a.finalRank || 99) - (b.finalRank || 99));
        for (let r = 1; r <= 6; r++) {
          const student = finalists[r - 1];
          rows.push([rowSeq, `${evName}比賽`, student ? student.name : "", EXPORT_RANK_CHINESE[r] || `第 ${r} 名`]);
          rowSeq++;
        }
      });
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 8 }, { wch: 28 }, { wch: 14 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, ws, "獎狀名冊");
      const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      folder.file("115校慶(71周年)獎狀合併列印.xlsx", excelBuffer);
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const zipFilename = "115校慶(71周年)賽務全套文件.zip";
    triggerBlobDownload(zipBlob, zipFilename);
    showStatus(`🎉 成功打包下載：${zipFilename}`, "success");
  } catch (err) {
    console.error("打包下載失敗", err);
    alert(`打包下載失敗：${err.message}`);
    showStatus("打包下載失敗", "error");
  }
}

// 註冊至全域供按鈕調用
window.downloadStage1PrelimRosterWord = downloadStage1PrelimRosterWord;
window.downloadStage2PrelimResultsWord = downloadStage2PrelimResultsWord;
window.downloadStage3FinalsRosterWord = downloadStage3FinalsRosterWord;
window.downloadStage4FinalsResultsWord = downloadStage4FinalsResultsWord;
window.downloadStage5CertificatesExcel = downloadStage5CertificatesExcel;
window.downloadAllCompetitionDocsZip = downloadAllCompetitionDocsZip;
