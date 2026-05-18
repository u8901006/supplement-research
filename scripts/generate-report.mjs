#!/usr/bin/env node
/**
 * Generate supplement research daily report HTML using Zhipu GLM-5-Turbo.
 * Reads papers JSON, analyzes with AI, generates styled HTML matching
 * Psychiatry-brain color scheme.
 *
 * Uses only Node.js built-in modules (no npm dependencies).
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

const API_BASE = "https://open.bigmodel.cn/api/coding/paas/v4";
const MODELS = ["GLM-5-Turbo", "GLM-4.7", "GLM-4.7-Flash"];
const MAX_TOKENS = 50000;
const TIMEOUT_MS = 480_000;

const SYSTEM_PROMPT = `你是營養補充劑與精神醫學研究的專業分析師。你的任務是：
1. 從提供的論文清單中，分析出當日最重要的營養補充劑研究趨勢與亮點
2. 每篇論文提供繁體中文（台灣用語）簡明摘要、標題翻譯、PICO 分析
3. 評估臨床實用性（高/中/低）
4. 幫讀者整理出臨床實務與研究人員值得閱讀的文章

輸出格式要求：
- 語言：繁體中文（台灣用語）
- 保持專業但易讀
- 每篇論文包含：中文標題、原文標題、一句話摘要、PICO 分析、臨床實用性、分類標籤
- 最後提供今日 TOP 5（最重要/最具臨床實用性的論文）
- 輸出格式嚴格為 JSON，不要用 markdown code block 包裹。`;

const VALID_TOPIC_TAGS = [
  "憂鬱症", "雙相情緒障礙", "焦慮症", "精神分裂症", "PTSD",
  "強迫症", "成癮", "心理治療", "自殺防治", "兒少精神醫學",
  "自閉症", "ADHD", "精神藥理學", "神經科學", "疼痛管理",
  "睡眠醫學", "老年精神醫學", "社區精神醫學", "跨文化精神醫學",
  "營養精神醫學", "ω-3脂肪酸", "維生素D", "益生菌/精神益生菌",
  "NAC/穀胱甘肽", "鎂", "鋅", "葉酸/甲基葉酸", "SAMe",
  "藏紅花/薑黃", "南非醉茄", "褪黑激素", "肌酸", "CoQ10",
  "多酚類", "腸腦軸", "神經發炎", "氧化壓力", "粒線體功能",
  "安全/交互作用", "藥草-藥物交互作用", "認知功能", "睡眠品質",
  "代謝精神醫學", "微生物體", "胺基酸", "多營養素",
];

function loadPapers(inputPath) {
  const raw = readFileSync(inputPath, "utf-8");
  return JSON.parse(raw);
}

function buildPrompt(papersData) {
  const dateStr = papersData.date;
  const count = papersData.count;
  const papersText = JSON.stringify(papersData.papers || [], null, 2);

  return `以下是 ${dateStr} 從 PubMed 抓取的最新營養補充劑研究文獻（共 ${count} 篇）。

請進行以下分析，並以 JSON 格式回傳（不要用 markdown code block 包裹）：

{
  "date": "${dateStr}",
  "market_summary": "1-2句話總結今日補充劑研究文獻趨勢與亮點",
  "top_picks": [
    {
      "rank": 1,
      "title_zh": "中文標題",
      "title_en": "English Title",
      "journal": "期刊名",
      "summary": "一句話摘要（繁體中文，突出核心發現與臨床意涵）",
      "pico": {
        "population": "研究對象",
        "intervention": "介入措施",
        "comparison": "對照組",
        "outcome": "主要結果"
      },
      "clinical_utility": "高/中/低",
      "utility_reason": "判斷實用性的一句話理由",
      "tags": ["標籤1", "標籤2"],
      "url": "文章連結",
      "emoji": "適當emoji"
    }
  ],
  "all_papers": [
    {
      "title_zh": "中文標題",
      "title_en": "English Title",
      "journal": "期刊名",
      "summary": "一句話摘要",
      "clinical_utility": "高/中/低",
      "tags": ["標籤1"],
      "url": "連結",
      "emoji": "emoji"
    }
  ],
  "keywords": ["關鍵字1", "關鍵字2"],
  "topic_distribution": {
    "營養精神醫學": 5,
    "憂鬱症": 3
  }
}

原始文獻資料：
${papersText}

請挑選出最重要的 TOP 5-8 篇論文放入 top_picks（按重要性排序），其餘放入 all_papers。
每篇 paper 的 tags 請從以下清單中挑選（可複選）：
${VALID_TOPIC_TAGS.join("、")}

注意：嚴格輸出 JSON，不要用 \`\`\`json\`\`\` 包裹。`;
}

function sanitizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => String(t).replace(/[<>"'&]/g, ""));
}

function sanitizeText(text) {
  if (typeof text !== "string") return "";
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cleanJsonResponse(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    if (firstNewline !== -1) {
      cleaned = cleaned.slice(firstNewline + 1);
    } else {
      cleaned = cleaned.slice(3);
    }
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
  }

  return cleaned;
}

function robustJsonParse(text) {
  const cleaned = cleanJsonResponse(text);

  try {
    return JSON.parse(cleaned);
  } catch {
    // try fixing common issues
  }

  let fixed = cleaned;

  fixed = fixed.replace(/,\s*([}\]])/g, "$1");

  fixed = fixed.replace(
    /"summary":\s*"((?:[^"\\]|\\.)*)"(?=\s*[,}])/gs,
    (m, content) => {
      const escaped = content.replace(/\n/g, "\\n").replace(/\r/g, "\\r");
      return `"summary": "${escaped}"`;
    }
  );

  try {
    return JSON.parse(fixed);
  } catch {
    // continue trying
  }

  const partialMatch = fixed.match(/"top_picks"\s*:\s*\[([\s\S]*?)\]\s*,\s*"all_papers"/);
  if (partialMatch) {
    try {
      const reconstructed = `{"date":"","market_summary":"","top_picks":[${partialMatch[1]}],"all_papers":[],"keywords":[],"topic_distribution":{}}`;
      return JSON.parse(reconstructed);
    } catch {
      // give up partial
    }
  }

  console.error("[WARN] All JSON repair attempts failed, returning minimal structure");
  return {
    date: "",
    market_summary: "AI 分析結果解析失敗，請稍後再試。",
    top_picks: [],
    all_papers: [],
    keywords: [],
    topic_distribution: {},
  };
}

async function analyzePapers(apiKey, papersData) {
  const prompt = buildPrompt(papersData);
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  for (const model of MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        console.error(`[INFO] Trying ${model} (attempt ${attempt + 1})...`);

        const payload = {
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          top_p: 0.9,
          max_tokens: MAX_TOKENS,
        };

        const resp = await fetch(`${API_BASE}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (resp.status === 429) {
          const wait = 60_000 * (attempt + 1);
          console.error(`[WARN] Rate limited, waiting ${wait / 1000}s...`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }

        if (!resp.ok) {
          const body = await resp.text().catch(() => "");
          console.error(`[ERROR] HTTP ${resp.status}: ${body.slice(0, 200)}`);
          break; // try next model
        }

        const data = await resp.json();
        const content = data?.choices?.[0]?.message?.content;
        if (!content) {
          console.error(`[WARN] Empty response from ${model}`);
          break;
        }

        const result = robustJsonParse(content);
        result._model = model;
        console.error(
          `[INFO] Analysis complete: ${result.top_picks?.length || 0} top picks, ${result.all_papers?.length || 0} total`
        );
        return result;
      } catch (err) {
        if (err.name === "TimeoutError") {
          console.error(`[WARN] ${model} timed out on attempt ${attempt + 1}`);
          continue;
        }
        console.error(`[ERROR] ${model} failed: ${err.message}`);
        break;
      }
    }
  }

  console.error("[ERROR] All models and attempts failed");
  return null;
}

function generateHtml(analysis) {
  const dateStr = analysis.date || new Date().toISOString().slice(0, 10);
  const dateParts = dateStr.split("-");
  const dateDisplay =
    dateParts.length === 3
      ? `${dateParts[0]}年${parseInt(dateParts[1])}月${parseInt(dateParts[2])}日`
      : dateStr;

  const summary = sanitizeText(analysis.market_summary || "");
  const topPicks = Array.isArray(analysis.top_picks) ? analysis.top_picks : [];
  const allPapers = Array.isArray(analysis.all_papers) ? analysis.all_papers : [];
  const keywords = Array.isArray(analysis.keywords) ? analysis.keywords : [];
  const topicDist = analysis.topic_distribution || {};
  const modelUsed = analysis._model || MODELS[0];

  const topPicksHtml = topPicks
    .map((pick) => {
      const tags = sanitizeTags(pick.tags || []);
      const tagsHtml = tags.map((t) => `<span class="tag">${sanitizeText(t)}</span>`).join("");
      const util = pick.clinical_utility || "中";
      const utilityClass =
        util === "高" ? "utility-high" : util === "中" ? "utility-mid" : "utility-low";
      const pico = pick.pico || {};
      const picoHtml = Object.keys(pico).length
        ? `<div class="pico-grid">
            <div class="pico-item"><span class="pico-label">P</span><span class="pico-text">${sanitizeText(pico.population || "-")}</span></div>
            <div class="pico-item"><span class="pico-label">I</span><span class="pico-text">${sanitizeText(pico.intervention || "-")}</span></div>
            <div class="pico-item"><span class="pico-label">C</span><span class="pico-text">${sanitizeText(pico.comparison || "-")}</span></div>
            <div class="pico-item"><span class="pico-label">O</span><span class="pico-text">${sanitizeText(pico.outcome || "-")}</span></div>
          </div>`
        : "";
      const safeUrl = (pick.url || "#").startsWith("http") ? pick.url : "#";

      return `<div class="news-card featured">
          <div class="card-header">
            <span class="rank-badge">#${pick.rank || ""}</span>
            <span class="emoji-icon">${pick.emoji || "📄"}</span>
            <span class="${utilityClass}">${sanitizeText(util)}實用性</span>
          </div>
          <h3>${sanitizeText(pick.title_zh || pick.title_en || "")}</h3>
          <p class="journal-source">${sanitizeText(pick.journal || "")} &middot; ${sanitizeText(pick.title_en || "")}</p>
          <p>${sanitizeText(pick.summary || "")}</p>
          ${picoHtml}
          <div class="card-footer">
            ${tagsHtml}
            <a href="${safeUrl}" target="_blank">閱讀原文 →</a>
          </div>
        </div>`;
    })
    .join("\n");

  const allPapersHtml = allPapers
    .map((paper) => {
      const tags = sanitizeTags(paper.tags || []);
      const tagsHtml = tags.map((t) => `<span class="tag">${sanitizeText(t)}</span>`).join("");
      const util = paper.clinical_utility || "中";
      const utilityClass =
        util === "高" ? "utility-high" : util === "中" ? "utility-mid" : "utility-low";
      const safeUrl = (paper.url || "#").startsWith("http") ? paper.url : "#";

      return `<div class="news-card">
          <div class="card-header-row">
            <span class="emoji-sm">${paper.emoji || "📄"}</span>
            <span class="${utilityClass} utility-sm">${sanitizeText(util)}</span>
          </div>
          <h3>${sanitizeText(paper.title_zh || paper.title_en || "")}</h3>
          <p class="journal-source">${sanitizeText(paper.journal || "")}</p>
          <p>${sanitizeText(paper.summary || "")}</p>
          <div class="card-footer">
            ${tagsHtml}
            <a href="${safeUrl}" target="_blank">PubMed →</a>
          </div>
        </div>`;
    })
    .join("\n");

  const keywordsHtml = keywords.map((k) => `<span class="keyword">${sanitizeText(k)}</span>`).join("");

  let topicBarsHtml = "";
  const topicEntries = Object.entries(topicDist);
  if (topicEntries.length) {
    const maxCount = Math.max(...topicEntries.map(([, c]) => c), 1);
    topicBarsHtml = topicEntries
      .map(
        ([topic, count]) => `<div class="topic-row">
              <span class="topic-name">${sanitizeText(topic)}</span>
              <div class="topic-bar-bg"><div class="topic-bar" style="width:${Math.round((count / maxCount) * 100)}%"></div></div>
              <span class="topic-count">${count}</span>
            </div>`
      )
      .join("\n");
  }

  const totalCount = topPicks.length + allPapers.length;

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Supplement Research &middot; 營養補充劑研究日報 &middot; ${dateDisplay}</title>
<meta name="description" content="${dateDisplay} 營養補充劑研究文獻日報，由 AI 自動彙整 PubMed 最新論文"/>
<style>
  :root { --bg: #f6f1e8; --surface: #fffaf2; --line: #d8c5ab; --text: #2b2118; --muted: #766453; --accent: #8c4f2b; --accent-soft: #ead2bf; --card-bg: color-mix(in srgb, var(--surface) 92%, white); }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: radial-gradient(circle at top, #fff6ea 0, var(--bg) 55%, #ead8c6 100%); color: var(--text); font-family: "Noto Sans TC", "PingFang TC", "Helvetica Neue", Arial, sans-serif; min-height: 100vh; overflow-x: hidden; }
  .container { position: relative; z-index: 1; max-width: 880px; margin: 0 auto; padding: 60px 32px 80px; }
  header { display: flex; align-items: center; gap: 16px; margin-bottom: 52px; animation: fadeDown 0.6s ease both; }
  .logo { width: 48px; height: 48px; border-radius: 14px; background: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; box-shadow: 0 4px 20px rgba(140,79,43,0.25); }
  .header-text h1 { font-size: 22px; font-weight: 700; color: var(--text); letter-spacing: -0.3px; }
  .header-meta { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; align-items: center; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; letter-spacing: 0.3px; }
  .badge-date { background: var(--accent-soft); border: 1px solid var(--line); color: var(--accent); }
  .badge-count { background: rgba(140,79,43,0.06); border: 1px solid var(--line); color: var(--muted); }
  .badge-source { background: transparent; color: var(--muted); font-size: 11px; padding: 0 4px; }
  .summary-card { background: var(--card-bg); border: 1px solid var(--line); border-radius: 24px; padding: 28px 32px; margin-bottom: 32px; box-shadow: 0 20px 60px rgba(61,36,15,0.06); animation: fadeUp 0.5s ease 0.1s both; }
  .summary-card h2 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.6px; color: var(--accent); margin-bottom: 16px; }
  .summary-text { font-size: 15px; line-height: 1.8; color: var(--text); }
  .section { margin-bottom: 36px; animation: fadeUp 0.5s ease both; }
  .section-title { display: flex; align-items: center; gap: 10px; font-size: 17px; font-weight: 700; color: var(--text); margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
  .section-icon { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; background: var(--accent-soft); }
  .news-card { background: var(--card-bg); border: 1px solid var(--line); border-radius: 24px; padding: 22px 26px; margin-bottom: 12px; box-shadow: 0 8px 30px rgba(61,36,15,0.04); transition: background 0.2s, border-color 0.2s, transform 0.2s; }
  .news-card:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(61,36,15,0.08); }
  .news-card.featured { border-left: 3px solid var(--accent); }
  .news-card.featured:hover { border-color: var(--accent); }
  .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .rank-badge { background: var(--accent); color: #fff7f0; font-weight: 700; font-size: 12px; padding: 2px 8px; border-radius: 6px; }
  .emoji-icon { font-size: 18px; }
  .card-header-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .emoji-sm { font-size: 14px; }
  .news-card h3 { font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 8px; line-height: 1.5; }
  .journal-source { font-size: 12px; color: var(--accent); margin-bottom: 8px; opacity: 0.8; }
  .news-card p { font-size: 13.5px; line-height: 1.75; color: var(--muted); }
  .card-footer { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .tag { padding: 2px 9px; background: var(--accent-soft); border-radius: 999px; font-size: 11px; color: var(--accent); }
  .news-card a { font-size: 12px; color: var(--accent); text-decoration: none; opacity: 0.7; margin-left: auto; }
  .news-card a:hover { opacity: 1; }
  .utility-high { color: #5a7a3a; font-size: 11px; font-weight: 600; padding: 2px 8px; background: rgba(90,122,58,0.1); border-radius: 4px; }
  .utility-mid { color: #9f7a2e; font-size: 11px; font-weight: 600; padding: 2px 8px; background: rgba(159,122,46,0.1); border-radius: 4px; }
  .utility-low { color: var(--muted); font-size: 11px; font-weight: 600; padding: 2px 8px; background: rgba(118,100,83,0.08); border-radius: 4px; }
  .utility-sm { font-size: 10px; }
  .pico-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; padding: 12px; background: rgba(255,253,249,0.8); border-radius: 14px; border: 1px solid var(--line); }
  .pico-item { display: flex; gap: 8px; align-items: baseline; }
  .pico-label { font-size: 10px; font-weight: 700; color: #fff7f0; background: var(--accent); padding: 2px 6px; border-radius: 4px; flex-shrink: 0; }
  .pico-text { font-size: 12px; color: var(--muted); line-height: 1.4; }
  .keywords-section { margin-bottom: 36px; }
  .keywords { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .keyword { padding: 5px 14px; background: var(--accent-soft); border: 1px solid var(--line); border-radius: 20px; font-size: 12px; color: var(--accent); cursor: default; transition: background 0.2s; }
  .keyword:hover { background: rgba(140,79,43,0.18); }
  .topic-section { margin-bottom: 36px; }
  .topic-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .topic-name { font-size: 13px; color: var(--muted); width: 100px; flex-shrink: 0; text-align: right; }
  .topic-bar-bg { flex: 1; height: 8px; background: var(--line); border-radius: 4px; overflow: hidden; }
  .topic-bar { height: 100%; background: linear-gradient(90deg, var(--accent), #c47a4a); border-radius: 4px; transition: width 0.6s ease; }
  .topic-count { font-size: 12px; color: var(--accent); width: 24px; }
  .links-banner { margin-top: 32px; animation: fadeUp 0.5s ease 0.4s both; }
  .links-grid { display: flex; flex-direction: column; gap: 12px; }
  .link-card { display: flex; align-items: center; gap: 14px; padding: 18px 24px; background: var(--card-bg); border: 1px solid var(--line); border-radius: 24px; text-decoration: none; color: var(--text); transition: all 0.2s; box-shadow: 0 8px 30px rgba(61,36,15,0.04); }
  .link-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 12px 40px rgba(61,36,15,0.08); }
  .link-icon { font-size: 28px; flex-shrink: 0; }
  .link-name { font-size: 15px; font-weight: 700; color: var(--text); flex: 1; }
  .link-arrow { font-size: 18px; color: var(--accent); font-weight: 700; }
  footer { margin-top: 32px; padding-top: 22px; border-top: 1px solid var(--line); font-size: 11.5px; color: var(--muted); display: flex; justify-content: space-between; animation: fadeUp 0.5s ease 0.5s both; }
  footer a { color: var(--muted); text-decoration: none; }
  footer a:hover { color: var(--accent); }
  @keyframes fadeDown { from { opacity: 0; transform: translateY(-16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @media (max-width: 600px) { .container { padding: 36px 18px 60px; } .summary-card, .news-card { padding: 20px 18px; } .pico-grid { grid-template-columns: 1fr; } footer { flex-direction: column; gap: 6px; text-align: center; } .topic-name { width: 70px; font-size: 11px; } }
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="logo">💊</div>
    <div class="header-text">
      <h1>Supplement Research &middot; 營養補充劑研究日報</h1>
      <div class="header-meta">
        <span class="badge badge-date">📅 ${dateDisplay}</span>
        <span class="badge badge-count">📊 ${totalCount} 篇文獻</span>
        <span class="badge badge-source">Powered by PubMed + Zhipu AI</span>
      </div>
    </div>
  </header>

  <div class="summary-card">
    <h2>📋 今日文獻趨勢</h2>
    <p class="summary-text">${summary}</p>
  </div>

  ${topPicksHtml ? `<div class="section"><div class="section-title"><span class="section-icon">⭐</span>今日精選 TOP Picks</div>${topPicksHtml}</div>` : ""}

  ${allPapersHtml ? `<div class="section"><div class="section-title"><span class="section-icon">📚</span>其他值得關注的文獻</div>${allPapersHtml}</div>` : ""}

  ${topicBarsHtml ? `<div class="topic-section section"><div class="section-title"><span class="section-icon">📊</span>主題分佈</div>${topicBarsHtml}</div>` : ""}

  ${keywordsHtml ? `<div class="keywords-section section"><div class="section-title"><span class="section-icon">🏷️</span>關鍵字</div><div class="keywords">${keywordsHtml}</div></div>` : ""}

  <div class="links-banner">
    <div class="links-grid">
      <a href="https://www.leepsyclinic.com/" class="link-card" target="_blank">
        <span class="link-icon">🏥</span>
        <span class="link-name">李政洋身心診所首頁</span>
        <span class="link-arrow">→</span>
      </a>
      <a href="https://blog.leepsyclinic.com/" class="link-card" target="_blank">
        <span class="link-icon">📧</span>
        <span class="link-name">訂閱電子報</span>
        <span class="link-arrow">→</span>
      </a>
      <a href="https://buymeacoffee.com/CYlee" class="link-card" target="_blank">
        <span class="link-icon">☕</span>
        <span class="link-name">Buy Me a Coffee</span>
        <span class="link-arrow">→</span>
      </a>
    </div>
  </div>

  <footer>
    <span>資料來源：PubMed &middot; 分析模型：${modelUsed}</span>
    <span><a href="https://github.com/u8901006/supplement-research">GitHub</a></span>
  </footer>
</div>
</body>
</html>`;
}

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      output: { type: "string" },
      "api-key": { type: "string", default: process.env.ZHIPU_API_KEY || "" },
    },
  });

  const apiKey = values["api-key"];
  if (!apiKey) {
    console.error("[ERROR] No API key provided. Set ZHIPU_API_KEY env var or use --api-key");
    process.exit(1);
  }

  const inputPath = values.input;
  const outputPath = values.output;

  const papersData = loadPapers(inputPath);

  let analysis;
  if (!papersData || !papersData.papers || papersData.papers.length === 0) {
    console.error("[WARN] No papers found, generating empty report");
    analysis = {
      date: papersData?.date || new Date().toISOString().slice(0, 10),
      market_summary: "今日 PubMed 暫無新的營養補充劑研究文獻更新。請明天再查看。",
      top_picks: [],
      all_papers: [],
      keywords: [],
      topic_distribution: {},
      _model: MODELS[0],
    };
  } else {
    analysis = await analyzePapers(apiKey, papersData);
    if (!analysis) {
      console.error("[ERROR] Analysis failed, cannot generate report");
      process.exit(1);
    }
  }

  const html = generateHtml(analysis);
  const outDir = dirname(outputPath);
  if (outDir && outDir !== ".") {
    mkdirSync(outDir, { recursive: true });
  }
  writeFileSync(outputPath, html, "utf-8");
  console.error(`[INFO] Report saved to ${outputPath}`);
}

main().catch((err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
