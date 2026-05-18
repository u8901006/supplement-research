#!/usr/bin/env node
/**
 * Fetch latest supplement / nutritional psychiatry research papers from PubMed E-utilities API.
 * Targets journals and topics from the supplements_psychiatry_neuroscience_psychology_nutrition_research_toolkit.
 *
 * Uses only Node.js built-in modules (no npm dependencies).
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { parseArgs } from "node:util";

const PUBMED_SEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const PUBMED_FETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";

const JOURNALS = [
  "Nutritional Neuroscience",
  "Nutrients",
  "Journal of Affective Disorders",
  "American Journal of Clinical Nutrition",
  "Molecular Psychiatry",
  "Biological Psychiatry",
  "Lancet Psychiatry",
  "JAMA Psychiatry",
  "American Journal of Psychiatry",
  "Psychological Medicine",
  "World Psychiatry",
  "Journal of Clinical Psychiatry",
  "Phytotherapy Research",
  "Phytomedicine",
  "Brain Behavior and Immunity",
  "Translational Psychiatry",
  "Neuropsychopharmacology",
  "Progress in Neuro-Psychopharmacology and Biological Psychiatry",
  "European Neuropsychopharmacology",
  "Psychiatry Research",
  "Depression and Anxiety",
  "Schizophrenia Bulletin",
  "Schizophrenia Research",
  "Journal of Child Psychology and Psychiatry",
  "Journal of Attention Disorders",
  "Autism Research",
  "Sleep Medicine",
  "Journal of Clinical Sleep Medicine",
  "Antioxidants",
  "Redox Biology",
  "Prostaglandins Leukotrienes and Essential Fatty Acids",
  "Gut Microbes",
  "Microbiome",
  "Beneficial Microbes",
  "Food and Function",
  "Journal of Functional Foods",
  "Advances in Nutrition",
  "Clinical Nutrition",
  "European Journal of Clinical Nutrition",
  "British Journal of Nutrition",
  "Pharmacological Research",
  "Neuropharmacology",
  "Journal of Neurochemistry",
  "Neuroscience and Biobehavioral Reviews",
  "Complementary Therapies in Medicine",
  "BMC Complementary Medicine and Therapies",
  "Journal of Dietary Supplements",
  "Journal of Medicinal Food",
  "Nutraceuticals",
  "Metabolites",
  "Biological Trace Element Research",
  "Journal of Trace Elements in Medicine and Biology",
  "Biological Psychiatry CNNI",
  "Nutritional Psychiatry",
  "Brain Behavior and Immunity Health",
  "Critical Reviews in Food Science and Nutrition",
  "Molecular Nutrition and Food Research",
  "Frontiers in Psychiatry",
  "Frontiers in Pharmacology",
  "Frontiers in Aging Neuroscience",
  "Alternative Therapies in Health and Medicine",
  "Obesity Reviews",
  "Behavioural Brain Research",
  "Neurobiology of Stress",
];

const SEARCH_QUERIES = [
  {
    name: "broad-nutritional-psychiatry",
    query: `("Dietary Supplements"[Mesh] OR nutraceutical*[tiab] OR "dietary supplement*"[tiab] OR micronutrient*[tiab]) AND ("Mental Disorders"[Mesh] OR psychiatry[tiab] OR psychiatric[tiab] OR depression[tiab] OR anxiety[tiab])`,
  },
  {
    name: "omega3-depression",
    query: `("omega-3"[tiab] OR EPA[tiab] OR DHA[tiab] OR "fish oil"[tiab]) AND (depression[tiab] OR "major depressive disorder"[tiab]) AND (randomized[tiab] OR placebo[tiab] OR meta-analysis[pt] OR systematic review[pt])`,
  },
  {
    name: "probiotics-mental-health",
    query: `(probiotic*[tiab] OR psychobiotic*[tiab] OR microbiome[tiab] OR "gut-brain axis"[tiab]) AND (depression[tiab] OR anxiety[tiab] OR stress[tiab] OR cognition[tiab] OR "mental health"[tiab])`,
  },
  {
    name: "NAC-psychiatry",
    query: `("N-acetylcysteine"[tiab] OR NAC[tiab] OR glutathione[tiab]) AND (bipolar[tiab] OR schizophrenia[tiab] OR depression[tiab] OR addiction[tiab] OR obsessive[tiab])`,
  },
  {
    name: "vitamin-d-mental",
    query: `("vitamin D"[tiab] OR cholecalciferol[tiab] OR calcifediol[tiab]) AND (depression[tiab] OR schizophrenia[tiab] OR cognition[tiab] OR autism[tiab] OR ADHD[tiab])`,
  },
  {
    name: "saffron-curcumin-mood",
    query: `(saffron[tiab] OR "Crocus sativus"[tiab] OR curcumin[tiab] OR turmeric[tiab] OR ashwagandha[tiab] OR "Withania somnifera"[tiab]) AND (depression[tiab] OR anxiety[tiab] OR mood[tiab] OR stress[tiab])`,
  },
  {
    name: "magnesium-sleep-anxiety",
    query: `(magnesium[tiab] OR melatonin[tiab] OR glycine[tiab] OR tryptophan[tiab]) AND (anxiety[tiab] OR insomnia[tiab] OR "sleep quality"[tiab] OR stress[tiab])`,
  },
  {
    name: "folate-bvitamins-depression",
    query: `(folate[tiab] OR "folic acid"[tiab] OR "L-methylfolate"[tiab] OR methylfolate[tiab] OR "vitamin B12"[tiab] OR homocysteine[tiab]) AND (depression[tiab] OR cognition[tiab] OR dementia[tiab])`,
  },
  {
    name: "neuroinflammation-supplements",
    query: `(NAC[tiab] OR omega-3[tiab] OR curcumin[tiab] OR polyphenol*[tiab]) AND (neuroinflammation[tiab] OR cytokine*[tiab] OR "oxidative stress"[tiab]) AND (depression[tiab] OR schizophrenia[tiab] OR bipolar[tiab] OR anxiety[tiab])`,
  },
  {
    name: "safety-interactions",
    query: `("dietary supplement*"[tiab] OR herbal[tiab] OR nutraceutical*[tiab]) AND (interaction*[tiab] OR adverse[tiab] OR hepatotoxicity[tiab] OR "serotonin syndrome"[tiab]) AND (antidepressant*[tiab] OR antipsychotic*[tiab] OR psychiatric[tiab])`,
  },
  {
    name: "ADHD-micronutrients",
    query: `(ADHD[tiab] OR "attention deficit"[tiab]) AND (omega-3[tiab] OR iron[tiab] OR zinc[tiab] OR magnesium[tiab] OR micronutrient*[tiab] OR multinutrient*[tiab])`,
  },
  {
    name: "autism-supplements",
    query: `(autism[tiab] OR ASD[tiab]) AND (probiotic*[tiab] OR "vitamin D"[tiab] OR omega-3[tiab] OR folinic[tiab] OR "dietary supplement*"[tiab] OR microbiome[tiab])`,
  },
];

const HEADERS = {
  "User-Agent": "SupplementResearchBot/1.0 (research aggregator)",
};

function buildDateRange(daysBack) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - daysBack);
  const fmt = (d) =>
    `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  return `"${fmt(start)}"[Date - Publication] : "3000"[Date - Publication]`;
}

async function searchPapers(query, retmax = 30) {
  const url = new URL(PUBMED_SEARCH);
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("term", query);
  url.searchParams.set("retmax", String(retmax));
  url.searchParams.set("sort", "date");
  url.searchParams.set("retmode", "json");

  try {
    const resp = await fetch(url.toString(), {
      headers: HEADERS,
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) {
      console.error(`[ERROR] PubMed search HTTP ${resp.status}`);
      return [];
    }
    const data = await resp.json();
    return data?.esearchresult?.idlist || [];
  } catch (err) {
    console.error(`[ERROR] PubMed search failed: ${err.message}`);
    return [];
  }
}

async function fetchDetails(pmids) {
  if (!pmids.length) return [];
  const ids = pmids.join(",");
  const url = new URL(PUBMED_FETCH);
  url.searchParams.set("db", "pubmed");
  url.searchParams.set("id", ids);
  url.searchParams.set("retmode", "xml");

  try {
    const resp = await fetch(url.toString(), {
      headers: HEADERS,
      signal: AbortSignal.timeout(60_000),
    });
    if (!resp.ok) {
      console.error(`[ERROR] PubMed fetch HTTP ${resp.status}`);
      return [];
    }
    const xml = await resp.text();
    return parseXmlArticles(xml);
  } catch (err) {
    console.error(`[ERROR] PubMed fetch failed: ${err.message}`);
    return [];
  }
}

function parseXmlArticles(xml) {
  const papers = [];
  const articleRegex = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
  let match;

  while ((match = articleRegex.exec(xml)) !== null) {
    const block = match[1];
    try {
      const title = extractTag(block, "ArticleTitle") || "";
      const journal = extractTag(block, "<Title>") || "";
      const pmid = extractTag(block, "<PMID") || "";
      const pmidVal = pmid.replace(/.*?>([\d]+)<.*/s, "$1").trim();

      const abstractParts = [];
      const absRegex = /<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g;
      let absMatch;
      while ((absMatch = absRegex.exec(block)) !== null) {
        const labelMatch = absMatch[0].match(/Label="([^"]*)"/);
        const label = labelMatch ? labelMatch[1] : "";
        const text = absMatch[1].replace(/<[^>]+>/g, "").trim();
        if (text) {
          abstractParts.push(label ? `${label}: ${text}` : text);
        }
      }
      const abstract = abstractParts.join(" ").slice(0, 2000);

      let dateStr = "";
      const pubDateMatch = block.match(/<PubDate>([\s\S]*?)<\/PubDate>/);
      if (pubDateMatch) {
        const y = extractInner(pubDateMatch[1], "Year");
        const m = extractInner(pubDateMatch[1], "Month");
        const d = extractInner(pubDateMatch[1], "Day");
        dateStr = [y, m, d].filter(Boolean).join(" ");
      }

      const keywords = [];
      const kwRegex = /<Keyword>([\s\S]*?)<\/Keyword>/g;
      let kwMatch;
      while ((kwMatch = kwRegex.exec(block)) !== null) {
        const kw = kwMatch[1].trim();
        if (kw) keywords.push(kw);
      }

      if (title) {
        papers.push({
          pmid: pmidVal,
          title: title.replace(/<[^>]+>/g, "").trim(),
          journal,
          date: dateStr,
          abstract,
          url: pmidVal ? `https://pubmed.ncbi.nlm.nih.gov/${pmidVal}/` : "",
          keywords: keywords.slice(0, 15),
        });
      }
    } catch {
      // skip malformed articles
    }
  }
  return papers;
}

function extractTag(block, tagName) {
  const re = new RegExp(`<${escapeRegex(tagName)}[^>]*>([\\s\\S]*?)<\\/${escapeRegex(tagName.replace(/^</, ""))}>`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : "";
}

function extractInner(block, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
  const m = block.match(re);
  return m ? m[1].trim() : "";
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCli() {
  const { values } = parseArgs({
    options: {
      "max-papers": { type: "string", default: "50" },
      output: { type: "string", default: "papers.json" },
      today: { type: "string", default: "" },
      "lookback-days": { type: "string", default: "7" },
    },
    strict: false,
  });
  return {
    maxPapers: parseInt(values["max-papers"], 10) || 50,
    output: values.output,
    today: values.today || new Date().toISOString().slice(0, 10),
    lookbackDays: parseInt(values["lookback-days"], 10) || 7,
  };
}

async function main() {
  const args = parseCli();
  console.error(`[INFO] Fetching supplement research papers from PubMed...`);
  console.error(`[INFO] Lookback: ${args.lookbackDays} days, Max papers: ${args.maxPapers}`);

  const dateRange = buildDateRange(args.lookbackDays);
  const allPmids = new Set();

  const journalPart = JOURNALS.slice(0, 20)
    .map((j) => `"${j}"[Journal]`)
    .join(" OR ");
  const journalDateQuery = `(${journalPart}) AND ${dateRange}`;

  console.error(`[INFO] Searching by journals...`);
  const journalPmids = await searchPapers(journalDateQuery, Math.floor(args.maxPapers * 0.4));
  journalPmids.forEach((id) => allPmids.add(id));
  console.error(`[INFO] Found ${journalPmids.length} from journals`);

  for (const sq of SEARCH_QUERIES) {
    const query = `${sq.query} AND ${dateRange}`;
    console.error(`[INFO] Searching: ${sq.name}...`);
    const pmids = await searchPapers(query, Math.floor(args.maxPapers * 0.15));
    pmids.forEach((id) => allPmids.add(id));
    console.error(`  → ${pmids.length} results`);

    await new Promise((r) => setTimeout(r, 400));
  }

  const uniquePmids = [...allPmids].slice(0, args.maxPapers);
  console.error(`[INFO] Total unique PMIDs: ${uniquePmids.length}`);

  if (!uniquePmids.length) {
    console.error("[WARN] No papers found");
    const output = {
      date: args.today,
      count: 0,
      papers: [],
    };
    writeFileSync(args.output, JSON.stringify(output, null, 2), "utf-8");
    return;
  }

  console.error("[INFO] Fetching article details...");
  const papers = await fetchDetails(uniquePmids);
  console.error(`[INFO] Fetched details for ${papers.length} papers`);

  const output = {
    date: args.today,
    count: papers.length,
    papers,
  };

  writeFileSync(args.output, JSON.stringify(output, null, 2), "utf-8");
  console.error(`[INFO] Saved to ${args.output}`);
}

main().catch((err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
