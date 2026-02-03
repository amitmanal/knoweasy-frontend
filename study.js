/* KnowEasy study.js build: 2026-02-02 v6 */
console.info('KnowEasy study.js loaded v6');
"use strict";

(async () => {


function isIdLikeTitle(title) {
    if (!title) return false;
    const t = String(title).trim();
    // Looks like a slug/id: lots of lowercase/digits and dashes, no spaces
    return /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(t) && t.length >= 10;
}

function displayTitleForContent(c) {
    const t = (c && c.title) ? String(c.title).trim() : "";
    const id = (c && c.id) ? String(c.id).trim() : "";
    if (!t) return (c?.blueprint?.title || c?.metadata?.title || id || "Untitled").toString();
    if (t.toLowerCase() === "coming soon") return t;
    if (t === id || isIdLikeTitle(t)) {
        return (c?.blueprint?.title || c?.metadata?.title || t).toString();
    }
    return t;
}

// ------------------------------
// Luma resolver (Study -> Luma)
// ------------------------------
// Goal: map (class, board/exam, subject, chapter) -> a single canonical content_id,
// otherwise return null so Luma shows ONLY a calm Coming Soon screen.
// This MUST NOT throw (production-safe).
async function resolveLumaContentId(filters) {
  try {
    filters = (filters && typeof filters === "object") ? filters : {};
    const clsNum = Number(filters.clsNum || filters.class_level || 0) || null;
    const boardKey = String(filters.boardKey || filters.board || "").trim();
    const subjectSlug = String(filters.subjectSlug || filters.subject || "").trim();
    const chapterSlug = String(filters.chapterSlug || filters.chapter || "").trim();
    const chapterTitle = String(filters.chapterTitle || filters.title || "").trim();

    // Load API base from config.json (same origin)
    let apiBase = "";
    try {
      const res = await fetch("config.json", { cache: "no-store" });
      const j = await res.json();
      apiBase = String(j.api_base_url || j.api_root || "").replace(/\/$/, "");
    } catch (_) {}

    if (!apiBase || !clsNum || !boardKey || !subjectSlug) return null;
    // Prefer deterministic Study resolver (canonical): /api/study/resolve
    // This avoids fuzzy matching and eliminates "sometimes Coming Soon" when content exists.
    try {
      const track = (["neet","jee","cet","cet_pcm","cet_pcb","jee_main","jee_adv","cet_med","cet_engg"].includes(boardKey.toLowerCase()))
        ? "entrance" : "boards";
      let program = boardKey.toLowerCase();
      if (track === "boards") {
        // keep as cbse|icse|maharashtra
        if (program === "msb" || program === "mh") program = "maharashtra";
      } else {
        if (program.startsWith("jee")) program = "jee";
        if (program === "cet" || program === "cet_engg") program = "cet_pcm";
        if (program === "cet_med") program = "cet_pcb";
      }
      const params = new URLSearchParams();
      params.set("class_num", String(clsNum));
      params.set("track", track);
      params.set("program", program);
      params.set("subject_slug", subjectSlug);
      params.set("chapter_id", String(chapterSlug || ""));
      params.set("asset_type", "luma");
      const rS = await fetch(`${apiBase}/api/study/resolve?${params.toString()}`);
      if (rS.ok) {
        const jS = await rS.json();
        if (jS && jS.ok && jS.content_id) return jS.content_id;
      }
    } catch (e) {
      // fall through to luma/resolve + catalog search
    }

    // First try dedicated resolve endpoint (fast + exact).
    try {
      const params = new URLSearchParams();
      params.set("board", boardKey);
      params.set("class_level", String(clsNum));
      params.set("subject", subjectSlug);
      params.set("chapter", String(chapterTitle || ""));
      const r0 = await fetch(`${apiBase}/api/luma/resolve?${params.toString()}`);
      if (r0.ok) {
        const j0 = await r0.json();
        if (j0 && j0.content_id) return j0.content_id;
      }
    } catch (e) {
      // fall through to catalog search
    }


    // Canonicalize board/exam for backend filter matching (metadata uses CBSE/NEET/etc)
    const b = boardKey.toLowerCase();
    const canonicalBoard =
      (b === "cbse") ? "CBSE" :
      (b === "icse") ? "ICSE" :
      (b === "msb" || b === "maharashtra" || b === "mh") ? "Maharashtra" :
      (b === "neet") ? "NEET" :
      (b === "jee" || b === "jee_adv" || b === "jee_main") ? "JEE" :
      (b === "cet" || b === "cet_engg" || b === "cet_med") ? "CET" :
      boardKey;

    // Canonicalize subject for backend filter matching (metadata uses Physics/Chemistry/Biology/Math)
    const s = subjectSlug.toLowerCase();
    const canonicalSubject =
      (s === "physics") ? "Physics" :
      (s === "chemistry") ? "Chemistry" :
      (s === "biology" || s === "bio") ? "Biology" :
      (s === "math" || s === "mathematics") ? "Math" :
      (s === "english") ? "English" :
      subjectSlug;

    // Fetch recent published content list for this (class, board, subject) and match chapter locally.
    const url =
      apiBase + "/api/luma/content"
      + "?class_level=" + encodeURIComponent(String(clsNum))
      + "&board=" + encodeURIComponent(String(canonicalBoard))
      + "&subject=" + encodeURIComponent(String(canonicalSubject))
      + "&limit=100";

    const resp = await fetch(url, { method: "GET" });
    if (!resp.ok) return null;

    const data = await resp.json();
    const items = (data && data.ok && Array.isArray(data.contents)) ? data.contents : [];
    if (!items.length) return null;

    // If chapterSlug itself looks like a content id, allow direct match.
    if (chapterSlug && /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(chapterSlug)) {
      const direct = items.find(it => String(it && it.id || "") === chapterSlug);
      if (direct && direct.id) return direct.id;
    }

    // --- Robust matching (tolerant to chapter title variations) ---
// We intentionally avoid strict equality only; we use a simple scoring match.
const norm = (s) => String(s || "")
  .toLowerCase()
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const tokens = (s) => norm(s).split("-").filter(Boolean);

const wantTitle = chapterTitle || chapterSlug;
const wantSlugA = norm(wantTitle);
const wantSlugB = norm(chapterSlug);

// Prefer: chapterSlug if present, else title
const wantTokens = tokens(wantTitle);
const wantKey = wantTokens.join(" ");

const scoreCandidate = (it) => {
  const md = (it && it.metadata) ? it.metadata : {};
  const id = String(it && it.id || "");
  const chRaw = md.chapter || "";
  const tpRaw = md.topic || "";
  const ch = norm(chRaw);
  const tp = norm(tpRaw);
  const idn = norm(id);

  let score = 0;

  // Exact matches
  if (wantSlugA && (ch === wantSlugA || tp === wantSlugA)) score = Math.max(score, 100);
  if (wantSlugB && (ch === wantSlugB || tp === wantSlugB)) score = Math.max(score, 98);

  // Prefix / contains (covers "photosynthesis-in-higher-plants" vs "photosynthesis")
  if (wantSlugA && (ch && (wantSlugA.startsWith(ch) || ch.startsWith(wantSlugA))) ) score = Math.max(score, 85);
  if (wantSlugA && (tp && (wantSlugA.startsWith(tp) || tp.startsWith(wantSlugA))) ) score = Math.max(score, 82);
  if (wantSlugA && (ch && (wantSlugA.includes(ch) || ch.includes(wantSlugA))) ) score = Math.max(score, 70);
  if (wantSlugA && (tp && (wantSlugA.includes(tp) || tp.includes(wantSlugA))) ) score = Math.max(score, 68);

  // Token overlap
  const cTokens = [...new Set(tokens(chRaw + " " + tpRaw))];
  if (wantTokens.length && cTokens.length) {
    const set = new Set(cTokens);
    const hit = wantTokens.filter(t => set.has(t));
    const overlap = hit.length / Math.max(1, wantTokens.length);
    score = Math.max(score, Math.round(overlap * 65));
  }

  // Id hint
  if (wantSlugA && idn && (idn.includes(wantSlugA) || wantSlugA.includes(idn))) score = Math.max(score, 75);

  return score;
};

let best = null;
let bestScore = 0;
for (const it of items) {
  const sc = scoreCandidate(it);
  if (sc > bestScore) { bestScore = sc; best = it; }
}

// Threshold to avoid wrong-subject bleed (keeps exam-safe behavior)
if (best && best.id && bestScore >= 55) return String(best.id);

return null;
  } catch (_) {
    return null;
  }
}

// Make resolver globally available (safety)
window.resolveLumaContentId = resolveLumaContentId;

  // -------- UI --------
  function setHeaderMeta(profile) {
    const meta = $("profileMeta");
    if (!meta || !profile) return;
    const boardLabel = profile.board === "maharashtra" ? "Maharashtra" : profile.board.toUpperCase();
    const clsLabel = isIntegrated1112(profile) ? "11+12" : effectiveClass(profile);
    meta.textContent = `${boardLabel} • Class ${clsLabel}`;
  }

  function setContextLine(profile) {
    const line = $("contextLine");
    if (!line || !profile) return;

    const cls = effectiveClass(profile);
    const mode = getStudyMode(profile);

    if (cls !== "11" && cls !== "12") {
      line.textContent = `Boards mode • ${profile.board.toUpperCase()} • Class ${cls}`;
      return;
    }

    if (mode === "boards") {
      line.textContent = `Boards mode • Full board syllabus • Class ${cls}`;
    } else {
      const exam = getExamMode();
      const label = (exam === "cet_engg") ? "CET (PCM)"
        : (exam === "cet_med") ? "CET (PCB)"
        : (exam === "jee_adv") ? "JEE Advanced"
        : exam.toUpperCase();
      line.textContent = `Entrance mode • ${label} • Class ${cls} portion only`;
    }
  }

  function hideBoardRowInsideStudy() {
    const row = $("boardRow");
    if (row) row.style.display = "none";
  }

  // Global helper: when a modal is visible, we hide the floating Luma button so it never overlaps actions.
  function updateModalOpenClass() {
    const anyOpen = !!document.querySelector(".modal-overlay:not(.hidden)");
    document.body.classList.toggle("ke-modal-open", anyOpen);
  }

  // Show + highlight board chips on Study page (NO redesign)
  // Rules:
  // - ICSE visible ONLY for class 5–10
  // - board value "msb" is treated as "maharashtra" (already normalized in profile)
  function applyBoardRowUI(profile) {
    const row = $("boardRow");
    if (!row || !profile) return;

    const cls = effectiveClass(profile);
    const is1112 = (cls === "11" || cls === "12");

    const chips = Array.from(row.querySelectorAll("[data-board]"));
    chips.forEach(chip => {
      const raw = String(chip.getAttribute("data-board") || "").toLowerCase();
      const b = (raw === "msb") ? "maharashtra" : raw;

      // ICSE allowed only for 5–10
      const show = !(is1112 && b === "icse");
      chip.style.display = show ? "" : "none";
      chip.classList.toggle("is-hidden", !show);

      chip.classList.toggle("is-active", String(profile.board || "").toLowerCase() === b);
    });
  }

  function applyYearToggle(profile) {
    const host = $("yearToggleHost");
    const b11 = $("btnYear11");
    const b12 = $("btnYear12");
    if (!host || !b11 || !b12) return;

    if (!isIntegrated1112(profile)) {
      host.style.display = "none";
      return;
    }

    host.style.display = "";
    const y = activeYear();
    b11.classList.toggle("is-active", y === "11");
    b12.classList.toggle("is-active", y === "12");
  }

  function applyModeUI(profile) {
    const cls = effectiveClass(profile);
    const is1112 = (cls === "11" || cls === "12");

    const bBoards = $("btnModeBoards");
    const bEntrance = $("btnModeEntrance");
    const examRow = $("examRow");

    if (!bBoards || !bEntrance) return;

    if (!is1112) {
      bBoards.style.display = "none";
      bEntrance.style.display = "none";
      if (examRow) {
        examRow.classList.remove("is-visible");
        examRow.style.display = "none";
      }
      return;
    }

    const mode = getStudyMode(profile);
    bBoards.style.display = "";
    bEntrance.style.display = "";
    bBoards.classList.toggle("is-active", mode === "boards");
    bEntrance.classList.toggle("is-active", mode === "entrance");

    if (examRow) {
      const show = (mode === "entrance");
      examRow.classList.toggle("is-visible", show);
      examRow.style.display = show ? "inline-flex" : "none";

      const chips = Array.from(examRow.querySelectorAll("[data-exam]"));
      const allowed = allowedExamsForBoard(profile && profile.board);

      // hide chips that are not allowed for the selected board (LOCKED RULES)
      chips.forEach(c => {
        const ex = (c.getAttribute("data-exam") || "").toLowerCase();
        const ok = allowed.includes(ex);
        c.style.display = ok ? "" : "none";
        c.classList.toggle("is-active", false);
      });

      const current = getExamMode(profile);
      chips.forEach(c => c.classList.toggle("is-active", (c.getAttribute("data-exam") || "").toLowerCase() === current));
    }
  }

  // Junior classes (5–10): Study screen should NOT allow class/board switching.
  // Seniors (11–12): keep pavilion controls exactly as-is.
  function applyJuniorLocks(profile) {
    if (!profile) return;
    const cls = effectiveClass(profile);
    const isJunior = !(cls === "11" || cls === "12");
    if (!isJunior) return;

    const boardRow = $("boardRow");
    if (boardRow) boardRow.style.display = "none";

    const changeBtn = $("btnChangeProfile");
    if (changeBtn) changeBtn.style.display = "none";

    const modeBar = $("modeBar");
    // Keep layout spacing calm: if only the mode pills were showing, they are already hidden by applyModeUI.
    // We keep modeBar visible because it also contains the context line below.
    if (modeBar) {
      // no-op
    }
  }

  function filterSubjectsForEntrance(subjects, exam) {
    const isEngg = (exam === "jee" || exam === "jee_adv" || exam === "cet_engg");
    const pcm = new Set(["physics", "chemistry", "maths", "mathematics"]);
    const pcb = new Set(["physics", "chemistry", "biology"]);
    return subjects.filter(s => {
      const n = String(s.name || "").toLowerCase();
      return isEngg ? pcm.has(n) : pcb.has(n);
    });
  }
  /**********************************************************************
   * Exam overlays (LOCKED)
   * Board files remain canonical and TAG-FREE.
   * Entrance mode uses these overlays to decide which chapters to show.
   **********************************************************************/

  const EXAM_OVERLAYS = {
    jee: {
      "11": {
        Physics: [
          { title: "Units and Measurements", adv: true },
          { title: "Kinematics", adv: true },
          { title: "Laws of Motion", adv: true },
          { title: "Work, Energy and Power", adv: true },
          { title: "Centre of Mass and Rotational Motion", adv: true },
          { title: "Gravitation", adv: true },
          { title: "Mechanical Properties of Solids", adv: true },
          { title: "Mechanical Properties of Fluids", adv: true },
          { title: "Thermal Properties of Matter", adv: false },
          { title: "Thermodynamics", adv: true },
          { title: "Kinetic Theory of Gases", adv: false },
          { title: "Oscillations", adv: true },
          { title: "Waves", adv: true },
          { title: "Experimental Physics", adv: false }
        ],
        Chemistry: [
          { title: "Mole Concept and Stoichiometry", adv: true },
          { title: "Atomic Structure", adv: true },
          { title: "States of Matter (Gases and Liquids)", adv: true },
          { title: "Thermodynamics", adv: true },
          { title: "Chemical Equilibrium", adv: true },
          { title: "Ionic Equilibrium", adv: true },
          { title: "Redox Reactions", adv: false },
          { title: "Periodic Table and Periodicity", adv: true },
          { title: "Chemical Bonding", adv: true },
          { title: "Hydrogen", adv: false },
          { title: "s-Block Elements", adv: false },
          { title: "p-Block Elements (Group 13–18)", adv: true },
          { title: "General Organic Chemistry (GOC)", adv: true },
          { title: "Stereochemistry", adv: true },
          { title: "Hydrocarbons", adv: true }
        ],
        Mathematics: [
          { title: "Sets", adv: true },
          { title: "Relations and Functions", adv: true },
          { title: "Trigonometric Functions", adv: true },
          { title: "Complex Numbers", adv: true },
          { title: "Quadratic Equations", adv: false },
          { title: "Permutations and Combinations", adv: true },
          { title: "Binomial Theorem", adv: true },
          { title: "Sequences and Series", adv: true },
          { title: "Straight Lines", adv: true },
          { title: "Conic Sections", adv: true },
          { title: "Limits and Derivatives", adv: true },
          { title: "Mathematical Reasoning", adv: false }
        ]
      },
      "12": {
        Physics: [
          { title: "Electric Charges and Fields", adv: true },
          { title: "Electrostatic Potential and Capacitance", adv: true },
          { title: "Current Electricity", adv: true },
          { title: "Moving Charges and Magnetism", adv: true },
          { title: "Magnetism and Matter", adv: false },
          { title: "Electromagnetic Induction", adv: true },
          { title: "Alternating Current", adv: true },
          { title: "Electromagnetic Waves", adv: false },
          { title: "Ray Optics and Optical Instruments", adv: true },
          { title: "Wave Optics", adv: true },
          { title: "Dual Nature of Radiation and Matter", adv: false },
          { title: "Atoms", adv: false },
          { title: "Nuclei", adv: false },
          { title: "Semiconductor Electronics", adv: false }
        ],
        Chemistry: [
          { title: "Solid State", adv: false },
          { title: "Solutions", adv: true },
          { title: "Electrochemistry", adv: true },
          { title: "Chemical Kinetics", adv: true },
          { title: "Surface Chemistry", adv: false },
          { title: "d- and f-Block Elements", adv: false },
          { title: "Coordination Compounds", adv: true },
          { title: "Metallurgy", adv: false },
          { title: "Qualitative Analysis", adv: true },
          { title: "Haloalkanes and Haloarenes", adv: true },
          { title: "Alcohols, Phenols and Ethers", adv: true },
          { title: "Aldehydes and Ketones", adv: true },
          { title: "Carboxylic Acids", adv: true },
          { title: "Amines", adv: true },
          { title: "Biomolecules", adv: false },
          { title: "Polymers", adv: false },
          { title: "Chemistry in Everyday Life", adv: false },
          { title: "Practical Organic Chemistry", adv: true }
        ],
        Mathematics: [
          { title: "Matrices", adv: true },
          { title: "Determinants", adv: true },
          { title: "Continuity and Differentiability", adv: true },
          { title: "Application of Derivatives", adv: true },
          { title: "Integrals", adv: true },
          { title: "Application of Integrals", adv: true },
          { title: "Differential Equations", adv: true },
          { title: "Vector Algebra", adv: true },
          { title: "Three Dimensional Geometry", adv: true },
          { title: "Probability", adv: true },
          { title: "Statistics", adv: false }
        ]
      }
    },

    neet: {
      "11": {
        Physics: [
          "Units and Measurements","Motion in a Straight Line","Motion in a Plane","Laws of Motion",
          "Work, Energy and Power","System of Particles and Rotational Motion","Gravitation",
          "Mechanical Properties of Solids","Mechanical Properties of Fluids","Thermal Properties of Matter",
          "Thermodynamics","Kinetic Theory","Oscillations","Waves"
        ],
        Chemistry: [
          "Some Basic Concepts of Chemistry","Atomic Structure","Classification of Elements and Periodicity in Properties",
          "Chemical Bonding and Molecular Structure","Chemical Thermodynamics","Equilibrium","Redox Reactions",
          "Organic Chemistry – Some Basic Principles and Techniques","Hydrocarbons"
        ],
        Biology: [
          "The Living World","Biological Classification","Plant Kingdom","Animal Kingdom",
          "Morphology of Flowering Plants","Anatomy of Flowering Plants","Structural Organisation in Animals",
          "Cell: The Unit of Life","Biomolecules","Cell Cycle and Cell Division","Photosynthesis in Higher Plants",
          "Respiration in Plants","Plant Growth and Development","Breathing and Exchange of Gases",
          "Body Fluids and Circulation","Excretory Products and their Elimination","Locomotion and Movement",
          "Neural Control and Coordination","Chemical Coordination and Integration"
        ]
      },
      "12": {
        Physics: [
          "Electric Charges and Fields","Electrostatic Potential and Capacitance","Current Electricity",
          "Moving Charges and Magnetism","Magnetism and Matter","Electromagnetic Induction","Alternating Current",
          "Electromagnetic Waves","Ray Optics and Optical Instruments","Wave Optics",
          "Dual Nature of Radiation and Matter","Atoms","Nuclei","Semiconductor Electronics"
        ],
        Chemistry: [
          "Solutions","Electrochemistry","Chemical Kinetics","d- and f-Block Elements","Coordination Compounds",
          "Haloalkanes and Haloarenes","Alcohols, Phenols and Ethers",
          "Aldehydes, Ketones and Carboxylic Acids","Amines","Biomolecules"
        ],
        Biology: [
          "Sexual Reproduction in Flowering Plants","Human Reproduction","Reproductive Health",
          "Principles of Inheritance and Variation","Molecular Basis of Inheritance","Evolution","Human Health and Disease",
          "Microbes in Human Welfare","Biotechnology: Principles and Processes","Biotechnology and its Applications",
          "Organisms and Populations","Ecosystem","Biodiversity and Conservation"
        ]
      }
    }
  };

  function getOverlayTitles(exam, cls, subjectName) {
    const e = String(exam || "").toLowerCase();
    const c = String(cls || "");
    const s = String(subjectName || "");

    // JEE Adv uses the JEE overlay list
    const examKey = (e === "jee_adv") ? "jee" : e;

    if (!EXAM_OVERLAYS[examKey] || !EXAM_OVERLAYS[examKey][c]) return [];

    // Accept Maths/Mathematics
    const sKey = (s.toLowerCase() === "maths") ? "Mathematics" : s;

    const raw = EXAM_OVERLAYS[examKey][c][sKey];
    if (!raw) return [];

    // Normalize to: [{title, adv?}]
    return raw.map(x => {
      if (typeof x === "string") return { title: x, adv: false };
      return { title: x.title, adv: !!x.adv };
    });
  }

  function buildOverlayChapters(profile, subjectObj) {
    const cls = effectiveClass(profile);
    const mode = getStudyMode(profile);
    if ((cls !== "11" && cls !== "12") || mode !== "entrance") return null;

    const exam = String(getExamMode() || "").toLowerCase();
    const subjectName = (subjectObj && subjectObj.name) ? subjectObj.name : "";
    const overlay = getOverlayTitles(exam, cls, subjectName);
    if (!overlay.length) return null;

    const chapters = (subjectObj && Array.isArray(subjectObj.chapters)) ? subjectObj.chapters : [];
    const byTitleSlug = Object.create(null);
    chapters.forEach(ch => {
      const t = slugify(ch && ch.title ? ch.title : "");
      if (t) byTitleSlug[t] = ch;
    });

    return overlay.map(item => {
      const key = slugify(item.title);
      const base = byTitleSlug[key];
      const ch = base ? Object.assign({}, base) : { id: slugify(item.title), title: item.title, note: "" };

      // JEE advanced badge (UI only)
      const isJee = (exam === "jee" || exam === "jee_adv");
      if (isJee && item.adv) ch.__badge = "JEE Adv";

      return ch;
    });
  }


  // -------- Render --------
  let __keSubjects = [];
  let __keSelectedSubject = "";

  function renderSubjects(profile, syllabus) {
    const row = $("subjectRow");
    if (!row) return;

    const cls = effectiveClass(profile);
    const mode = getStudyMode(profile);
    const exam = getExamMode();

    let subjects = (syllabus && Array.isArray(syllabus.subjects)) ? syllabus.subjects : [];
    if ((cls === "11" || cls === "12") && mode === "entrance") {
      subjects = filterSubjectsForEntrance(subjects, exam);
    }

    if (!subjects.length) {
      subjects = [{ name: "Physics", icon: subjectIconPath("Physics"), total: 0, chapters: [{ title: "Chapter list", note: "" }] }];
    }

    __keSubjects = subjects;

    // preserve selection if possible
    const want = __keSelectedSubject || (subjects[0] ? subjects[0].name : "");
    const found = subjects.find(s => String(s.name || "") === String(want));
    __keSelectedSubject = (found ? found.name : subjects[0].name);

    row.innerHTML = subjects.map((s) => {
      const icon = s.icon || subjectIconPath(s.name) || "assets/subjects/science.png";
      const total = s.total || (s.chapters ? s.chapters.length : 0);
      // "Done" is mastery-based (>=80%) using the same local mastery map as chapter cards.
      // Falls back to 0 if chapters are missing.
      let done = 0;
      try {
        const chs = Array.isArray(s.chapters) ? s.chapters : [];
        chs.forEach((ch, idx) => {
          const t = (ch && ch.title) ? String(ch.title) : `Chapter ${idx + 1}`;
          const id = (ch && ch.id) ? String(ch.id) : slugify(t);
          if (getChapterScore(id) >= 80) done += 1;
        });
        done = clamp(done, 0, total);
      } catch { done = 0; }

      const activeClass = (String(s.name) === String(__keSelectedSubject)) ? " study-subject-pill--active" : "";
      const safeName = escapeHtml(s.name || "Subject");
      const safeNameAttr = escapeHtml(s.name || "");
      return `
        <button class="study-subject-pill${activeClass}" data-subject="${safeNameAttr}" type="button">
          <div class="study-subject-icon">
            <img src="${icon}" alt="${safeName}"
                 onerror="this.onerror=null;this.src='assets/subjects/science.png';" />
          </div>
          <div class="study-subject-text">
            <span class="study-subject-name">${safeName}</span>
            <span class="study-subject-meta">${done} / ${total} chapters</span>
          </div>
        </button>
      `;
    }).join("");

    const subjectObj = subjects.find(x => String(x.name || "") === String(__keSelectedSubject)) || subjects[0];
    renderChapters(profile, subjectObj);
  }

  function renderChapters(profile, subjectObj) {
    const list = $("chapterList");
    const label = $("study-subject-label");
    const sectionTitle = $("chapter-section-title");

    if (!list) return;

    const subject = (subjectObj && subjectObj.name) ? subjectObj.name : "Subject";

    if (label) label.textContent = subject;
    if (sectionTitle) sectionTitle.textContent = `${subject} chapters`;

    const chapters = (subjectObj && Array.isArray(subjectObj.chapters)) ? subjectObj.chapters : [];

    // Entrance mode uses overlays (board files remain canonical & tag-free)
    const overlayChapters = buildOverlayChapters(profile, subjectObj);
    const visibleChapters = (overlayChapters && overlayChapters.length) ? overlayChapters : chapters.filter(ch => chapterVisibleForProfile(ch, profile));

    // Suggestion pill (student-facing)
    try {
      const sug = pickSuggestedChapter(visibleChapters);
      const pill = $("overview-pill-text");
      if (pill && sug) pill.textContent = `Luma suggests: start with ${sug.title} (${sug.score}%).`;
    } catch {}

    const doneEl = $("stat-chapters-done");
    const weakEl = $("stat-weak-chapters");
    // Student mastery (local) → stats
    try {
      let done = 0;
      let weak = 0;
      visibleChapters.forEach((ch, idx) => {
        const t = (ch && ch.title) ? String(ch.title) : `Chapter ${idx + 1}`;
        const id = (ch && ch.id) ? String(ch.id) : slugify(t);
        const sc = getChapterScore(id);
        if (sc >= 80) done += 1;
        if (sc < 40) weak += 1;
      });
      if (doneEl) doneEl.textContent = String(done);
      if (weakEl) weakEl.textContent = String(weak);
    } catch {
      if (doneEl) doneEl.textContent = "0";
      if (weakEl) weakEl.textContent = "0";
    }

    // Cache for "View all" modal (slug hints)
    window.__keLastProfileForChapters = profile;
    window.__keLastSubjectName = subject;
    window.__keLastVisibleChapters = visibleChapters.map((ch, idx) => {
      const t = (ch && ch.title) ? String(ch.title) : `Chapter ${idx + 1}`;
      const id = (ch && ch.id) ? String(ch.id) : slugify(t);
      return { id, title: t };
    });

if (!visibleChapters.length) {
      list.innerHTML = `
        <article class="study-chapter-card">
          <div class="study-chapter-main">
            <div>
              <h3 class="study-chapter-title">No chapters visible here</h3>
              <p class="study-chapter-meta">Try switching mode or exam.</p>
            </div>
            <span class="study-chip">Info</span>
          </div>
        </article>
      `;
      return;
    }

// Precompute chapter action buttons once (perf for large syllabi)
let __actionsHtml = "";
try {
  const p = profile || getProfile() || {};
  const subjectName = subjectObj && subjectObj.name ? subjectObj.name : subject;
  const listActions = (window.KE && KE.tabs && typeof KE.tabs.getChapterActions === "function")
    ? KE.tabs.getChapterActions(p, subjectName)
    : [
        { action: "notes", label: "Notes" },
        { action: "revision", label: "1 min" },
        { action: "mindmap", label: "Mindmap" },
        { action: "pyq", label: "PYQs" },
        { action: "quiz", label: "Quiz" },
        { action: "formula", label: "Formula" }
      ];
  __actionsHtml = (listActions || [])
    .map(x => {
      const a = String(x && x.action ? x.action : "");
      const isLuma = (a === "luma");
      const cls = isLuma ? "study-mini-btn study-mini-btn--luma" : "study-mini-btn";
      return `<button class="${cls}" data-action="${escapeHtml(a)}" type="button">${escapeHtml(x.label)}</button>`;
    })
    .join("");
  if (!__actionsHtml) __actionsHtml = `<button class="study-mini-btn" data-action="notes" type="button">Notes</button>`;
} catch {
  __actionsHtml = `<button class="study-mini-btn" data-action="notes" type="button">Notes</button>`;
}

const buildCardHtml = (ch, idx) => {
  const safeTitle = ch.title || `Chapter ${idx + 1}`;
  // Prefer stable id for folders. If missing (legacy syllabus), fall back to slug(title).
  const safeId = (ch && ch.id) ? String(ch.id) : slugify(safeTitle);
  const safeNote = ch.note || "Upload resources to auto-appear here.";
  const score = getChapterScore(safeId);
  const ui = masteryUiFor(score);

  const titleHtml = escapeHtml(safeTitle);
  const noteHtml = escapeHtml(safeNote);
  const idAttr = escapeHtml(safeId);
  const titleAttr = escapeHtml(safeTitle);
  const badgeHtml = (ch && ch.__badge) ? escapeHtml(String(ch.__badge)) : "";

  return `
    <article class="study-chapter-card" data-chapter-id="${idAttr}" data-chapter-title="${titleAttr}">
      <div class="study-chapter-main">
        <div>
          <h3 class="study-chapter-title">${titleHtml}${badgeHtml ? ` <span class="study-chip" style="margin-left:8px; vertical-align:middle;">${badgeHtml}</span>` : ""}</h3>
          <p class="study-chapter-meta">${noteHtml}</p>
        </div>
        <span class="study-chip ${ui.chipClass}">${ui.chipText}</span>
      </div>

      <div class="study-chapter-progress-row">
        <div class="study-progress-bar">
          <div class="study-progress-fill ${ui.fillClass}" style="width: ${score}%;"></div>
        </div>
        <span class="study-progress-label">${score}%</span>
      </div>

      <div class="study-chapter-actions">
        ${__actionsHtml}
      </div>
    </article>
  `;
};

// Phase-5 add-on: JEE Advanced extras (advExtras) are NOT part of Boards/NEET/CET.
// They appear only in Entrance mode when exam = "jee_adv".
let advHtml = "";
const cls = effectiveClass(profile);
const mode = getStudyMode(profile);
const exam = getExamMode();

if ((cls === "11" || cls === "12") && mode === "entrance" && exam === "jee_adv") {
  const extras = (subjectObj && Array.isArray(subjectObj.advExtras)) ? subjectObj.advExtras : [];
  if (extras.length) {
    // Build "under chapter title" groups (optional)
    const byUnder = Object.create(null);
    extras.forEach(x => {
      const under = String(x.under || "").trim() || "__ungrouped__";
      (byUnder[under] = byUnder[under] || []).push(x);
    });

    const chapterTitleById = Object.create(null);
    (subjectObj.chapters || []).forEach(ch => { if (ch && ch.id) chapterTitleById[String(ch.id)] = String(ch.title || ch.id); });

    const groups = Object.keys(byUnder);
    advHtml = `
      <article class="study-chapter-card">
        <div class="study-chapter-main">
          <div>
            <h3 class="study-chapter-title">Additional Topics (JEE Advanced)</h3>
            <p class="study-chapter-meta">Extra topics beyond Boards/JEE Main. These are tagged as advExtras only.</p>
          </div>
          <span class="study-chip">JEE Adv</span>
        </div>
        <div class="study-chapter-actions" style="display:block; padding-top:10px;">
          ${groups.map(k => {
            const title = (k !== "__ungrouped__") ? (chapterTitleById[k] || k) : "More";
            const items = byUnder[k].map(x => `<li>${String(x.title || "").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</li>`).join("");
            return `<div style="margin-bottom:10px;"><div style="font-weight:800; margin-bottom:6px;">${title}</div><ul style="margin:0; padding-left:18px;">${items}</ul></div>`;
          }).join("")}
        </div>
      </article>
    `;
  }
}

// Render cards (scale-safe): chunk render when chapter count is large to avoid UI jank.
const total = visibleChapters.length;
if (total <= 150) {
  const baseCards = visibleChapters.map(buildCardHtml).join("");
  list.innerHTML = baseCards + advHtml;
  return;
}

list.innerHTML = "";
const chunkSize = 60;
let i = 0;

const pump = () => {
  const slice = visibleChapters.slice(i, i + chunkSize);
  if (!slice.length) {
    if (advHtml) list.insertAdjacentHTML("beforeend", advHtml);
    return;
  }
  const html = slice.map(buildCardHtml).join("");
  list.insertAdjacentHTML("beforeend", html);
  i += chunkSize;

  // Use requestIdleCallback if available, else yield via setTimeout.
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(pump, { timeout: 250 });
  } else {
    setTimeout(pump, 0);
  }
};

pump();

  }

  // -------- Today Plan Modal (student-facing, calm) --------
  function openPlanModal(linesText) {
    const overlay = $("plan-modal");
    const body = $("plan-modal-body");
    if (!overlay || !body) return toast("Today plan: " + String(linesText || ""));
    body.innerHTML = `
      <div style="font-weight:800; margin-bottom:8px;">Do this first</div>
      <pre style="margin:0; white-space:pre-wrap; font-family:inherit; font-size:12px; color:#111827; line-height:1.4;">${String(linesText||"").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</pre>
      <div style="margin-top:10px; font-size:11px; color:#6b7280;">This is a local, offline plan based on your weakest chapters. It will get smarter as engine attempts are connected.</div>
    `;
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    updateModalOpenClass();
  }

  // -------- Modals --------
  function bindModalClosersOnce() {
    if (window.__keModalBound) return;
    window.__keModalBound = true;

    document.querySelectorAll("[data-close-modal]").forEach(btn => {
      btn.addEventListener("click", () => {
        const overlay = btn.closest(".modal-overlay");
        if (overlay) overlay.classList.add("hidden");
        updateModalOpenClass();
      });
    });
  }

  function openPdfOverlay(title) {
    const overlay = $("pdf-modal");
    const titleEl = $("pdf-modal-title");
    if (!overlay || !titleEl) return false;
    titleEl.textContent = title;
    
    // ---- Missing Content Checklist (notes.pdf / notes_exam.pdf) ----
    const checkBtn = $("chapters-check-btn");
    const missingOnly = $("chapters-missing-only");
    const statusEl2 = $("chapters-status");
    const copyMissingBtn = $("chapters-copy-missing");

    // Reset UI state each time modal opens
    if (statusEl2) statusEl2.textContent = "";
    if (missingOnly) missingOnly.checked = false;

    const _setRowVisibility = () => {
      const onlyMissing = !!(missingOnly && missingOnly.checked);
      listEl.querySelectorAll(".chapter-row").forEach(row => {
        const miss = row.classList.contains("missing");
        row.style.display = (onlyMissing && !miss) ? "none" : "";
      });
    };

    if (missingOnly) {
      missingOnly.onchange = _setRowVisibility;
    }

    if (copyMissingBtn) {
      copyMissingBtn.onclick = async () => {
        const missing = [];
        listEl.querySelectorAll(".chapter-row.missing").forEach(row => {
          const slug = row.getAttribute("data-chapter-slug") || "";
          if (slug) missing.push(slug);
        });
        const text = missing.join("\n");
        if (!text) return toast("No missing chapters (notes) found.");
        try {
          await navigator.clipboard.writeText(text);
          toast("Missing list copied.");
        } catch {
          window.prompt("Copy missing list:", text);
        }
      };
    }

    if (checkBtn) {
      checkBtn.onclick = async () => {
        checkBtn.disabled = true;
        if (statusEl2) statusEl2.textContent = "Checking…";
        toast("Checking notes availability…");

        // Concurrency limit to avoid overwhelming Hostinger
        const rows = Array.from(listEl.querySelectorAll(".chapter-row"));
        const slugs = rows.map(r => r.getAttribute("data-chapter-slug") || "").filter(Boolean);

        const results = new Map(); // slug -> boolean
        let done = 0;

        const updateStatus = () => {
          if (!statusEl2) return;
          statusEl2.textContent = `${done}/${slugs.length} checked`;
        };

        const auditRunId = Date.now();
        let cancelled = false;

        // cancel if modal closes
        const overlayEl = $("pdf-modal");
        const cancelIfClosed = () => {
          if (!overlayEl) return false;
          // overlay hidden => stop
          const hidden = overlayEl.classList.contains("hidden");
          if (hidden) cancelled = true;
          return cancelled;
        };

        const checkOne = async (row) => {
          if (cancelIfClosed()) return;

          const slug = row.getAttribute("data-chapter-slug") || "";
          const pill = row.querySelector(`[data-avail-pill="${slug}"]`);
          if (pill) pill.textContent = "Checking…";

          // Scale-safe: avoid resolveResourceUrl() because it may try multiple candidates/files.
          // For an admin audit we check the canonical board path only.
          const cls = effectiveClass(profile);
          const board = String(profile.board || "").toLowerCase();
          const subjSlug = slugify(subject);
          const base = `content/class_${cls}/${board}`;
          const url = `${base}/${subjSlug}/${slug}/notes.pdf`;

          const ok = await headOk(url);

          results.set(slug, ok);

          if (ok) {
            row.classList.remove("missing");
            if (pill) pill.textContent = "Available";
          } else {
            row.classList.add("missing");
            if (pill) pill.textContent = "Missing";
          }
          done += 1;
          updateStatus();
        };

        const limit = 6;
        const queue = rows.slice();

        const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
          while (queue.length) {
            const row = queue.shift();
            if (!row) return;
            if (cancelled) return;

            try { await checkOne(row); } catch { /* ignore */ }

            // Yield occasionally to keep UI responsive on large lists
            if (done % 25 === 0) {
              await new Promise(r => setTimeout(r, 0));
            }
          }
        });

        await Promise.all(workers);

        _setRowVisibility();

        if (statusEl2) {
          const missingCount = Array.from(results.values()).filter(v => !v).length;
          statusEl2.textContent = missingCount ? `Missing: ${missingCount}` : "All available ✅";
        }
        checkBtn.disabled = false;
      };
    }


    overlay.classList.remove("hidden");
    updateModalOpenClass();
    return true;
  }

  function setPdfView(showFrame) {
    const wrap = $("pdf-view-wrapper");
    const empty = $("pdf-empty");
    if (wrap) wrap.classList.toggle("hidden", !showFrame);
    if (empty) empty.classList.toggle("hidden", showFrame);
  }

  
  function openChaptersModal(profile, subject, chapters) {
    const overlay = $("chapters-modal");
    const titleEl = $("chapters-modal-title");
    const metaEl = $("chapters-modal-meta");
    const listEl = $("chapters-modal-list");

    if (!overlay || !titleEl || !listEl) {
      toast("Chapter list UI missing.");
      return;
    }

    titleEl.textContent = `${subject} • All chapters`;

    const cls = profile && profile.class ? profile.class : (profile && profile.class_level ? profile.class_level : "");
    const board = profile && profile.board ? profile.board : "";
    const mode = profile && profile.studyMode ? profile.studyMode : (profile && profile.study_mode ? profile.study_mode : "");

    if (metaEl) {
      const parts = [];
      if (board) parts.push(`Board: ${board}`);
      if (cls) parts.push(`Class: ${cls}`);
      if (mode) parts.push(`Mode: ${String(mode).toUpperCase()}`);
      metaEl.textContent = parts.join(" • ");
    }

    listEl.innerHTML = chapters.map((ch, idx) => {
      const t = ch && ch.title ? String(ch.title) : `Chapter ${idx + 1}`;
      const id = ch && ch.id ? String(ch.id) : slugify(t);
      const safeTitle = t.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const safeId = id.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `
        <div class="chapter-row" data-chapter-slug="${safeId}" data-chapter-title="${safeTitle}">
          <div class="chapter-left">
            <div class="chapter-title">${safeTitle}</div>
            <div class="chapter-slug">Folder: <span class="mono">${safeId}</span></div>
            <div class="chapter-status"><span class="avail-pill" data-avail-pill="${safeId}">Not checked</span></div>
          </div>
          <button class="ask-btn" type="button" data-ask-doubt="1" data-ask-subject="${slugify(subject)}" data-ask-chapter="${safeId}" data-ask-title="${safeTitle}">Ask</button>
          <button class="copy-btn" type="button" data-copy-slug="${safeId}">Copy</button>
        </div>
      `;
    }).join("");

    // apply admin/creator visibility to dynamically rendered rows
    applyCreatorVisibility();

    // bind copy (idempotent per open)
    listEl.querySelectorAll("[data-copy-slug]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const slug = btn.getAttribute("data-copy-slug") || "";
        if (!slug) return;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(slug);
            toast("Folder slug copied.");
          } else {
            window.prompt("Copy folder slug:", slug);
          }
        } catch {
          window.prompt("Copy folder slug:", slug);
        }
      });
    });
    // bind Ask Doubt buttons (student-safe; passes context to chat.html)
    (listEl.querySelectorAll("[data-ask-doubt]") || []).forEach(btn => {
      if (btn.__keAskBound) return;
      btn.__keAskBound = true;
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        const subjectId = btn.getAttribute("data-ask-subject") || "";
        const chapterId = btn.getAttribute("data-ask-chapter") || "";
        const title = btn.getAttribute("data-ask-title") || "";
        const q = new URLSearchParams();
        if (subjectId) q.set("subject", subjectId);
        if (chapterId) q.set("chapter", chapterId);
        if (title) q.set("title", title);
        window.location.href = "chat.html" + (q.toString() ? ("?" + q.toString()) : "");
      });
    });


    
    // ---- Missing Content Checklist (notes.pdf / notes_exam.pdf) ----
    const checkBtn = $("chapters-check-btn");
    const missingOnly = $("chapters-missing-only");
    const statusEl2 = $("chapters-status");
    const copyMissingBtn = $("chapters-copy-missing");

    // Reset UI state each time modal opens
    if (statusEl2) statusEl2.textContent = "";
    if (missingOnly) missingOnly.checked = false;

    const _setRowVisibility = () => {
      const onlyMissing = !!(missingOnly && missingOnly.checked);
      listEl.querySelectorAll(".chapter-row").forEach(row => {
        const miss = row.classList.contains("missing");
        row.style.display = (onlyMissing && !miss) ? "none" : "";
      });
    };

    if (missingOnly) {
      missingOnly.onchange = _setRowVisibility;
    }

    if (copyMissingBtn) {
      copyMissingBtn.onclick = async () => {
        const missing = [];
        listEl.querySelectorAll(".chapter-row.missing").forEach(row => {
          const slug = row.getAttribute("data-chapter-slug") || "";
          if (slug) missing.push(slug);
        });
        const text = missing.join("\n");
        if (!text) return toast("No missing chapters (notes) found.");
        try {
          await navigator.clipboard.writeText(text);
          toast("Missing list copied.");
        } catch {
          window.prompt("Copy missing list:", text);
        }
      };
    }

    if (checkBtn) {
      checkBtn.onclick = async () => {
        checkBtn.disabled = true;
        if (statusEl2) statusEl2.textContent = "Checking…";
        toast("Checking notes availability…");

        // Concurrency limit to avoid overwhelming Hostinger
        const rows = Array.from(listEl.querySelectorAll(".chapter-row"));
        const slugs = rows.map(r => r.getAttribute("data-chapter-slug") || "").filter(Boolean);

        const results = new Map(); // slug -> boolean
        let done = 0;

        const updateStatus = () => {
          if (!statusEl2) return;
          statusEl2.textContent = `${done}/${slugs.length} checked`;
        };

        const checkOne = async (row) => {
          const slug = row.getAttribute("data-chapter-slug") || "";
          const title = row.getAttribute("data-chapter-title") || "";
          const pill = row.querySelector(`[data-avail-pill="${slug}"]`);
          if (pill) pill.textContent = "Checking…";

          const url = await resolveResourceUrl(profile, subject, slug, title, "notes");
          const ok = !!url;
          results.set(slug, ok);

          if (ok) {
            row.classList.remove("missing");
            if (pill) pill.textContent = "Available";
          } else {
            row.classList.add("missing");
            if (pill) pill.textContent = "Missing";
          }
          done += 1;
          updateStatus();
        };

        const limit = 6;
        const queue = rows.slice();

        const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
          while (queue.length) {
            const row = queue.shift();
            if (!row) return;
            try { await checkOne(row); } catch { /* ignore */ }
          }
        });

        await Promise.all(workers);

        _setRowVisibility();

        if (statusEl2) {
          const missingCount = Array.from(results.values()).filter(v => !v).length;
          statusEl2.textContent = missingCount ? `Missing: ${missingCount}` : "All available ✅";
        }
        checkBtn.disabled = false;
      };
    }


    overlay.classList.remove("hidden");
  }


// -------- PDF fullscreen helpers (mobile + web) --------
  let __keCurrentPdfUrl = "";

  function isMobile() {
    try {
      return window.matchMedia && window.matchMedia("(max-width: 820px)").matches;
    } catch {
      return false;
    }
  }

  function tunePdfFrame(frame) {
    if (!frame) return;
    frame.setAttribute("allowfullscreen", "");
    frame.setAttribute("webkitallowfullscreen", "");
    frame.setAttribute("mozallowfullscreen", "");
    frame.style.width = "100%";
    frame.style.border = "0";
    frame.style.display = "block";
    frame.style.background = "transparent";

    // Make it feel fullscreen inside modal
    const h = Math.max(480, Math.floor(window.innerHeight * (isMobile() ? 0.92 : 0.80)));
    frame.style.height = h + "px";
  }


  function openPdfModalLoading(title) {
    if (!openPdfOverlay(title)) return;
    setPdfView(false);
    const empty = $("pdf-empty");
    if (!empty) return;
    const h = empty.querySelector("[data-empty-heading]");
    const b = empty.querySelector("[data-empty-body]");
    if (h) h.textContent = "Loading…";
    if (b) b.textContent = "Fetching resource from your library…";
  }

  function openPdfModalEmpty(title, neededFile) {
    if (!openPdfOverlay(title)) return;
    setPdfView(false);
    const empty = $("pdf-empty");
    if (!empty) return;
    const h = empty.querySelector("[data-empty-heading]");
    const b = empty.querySelector("[data-empty-body]");
    if (h) h.textContent = "Resource coming soon";
    if (b) b.textContent = `Upload ${neededFile} in the same chapter folder and it will auto-appear here.`;
  }

  function openPdfModalUrl(title, url) {
    if (!openPdfOverlay(title)) return;

    __keCurrentPdfUrl = url;

    const frame = $("pdf-frame");
    if (frame) {
      tunePdfFrame(frame);
      frame.src = pdfParams(url);
    }

    setPdfView(true);

    // Protected view by default (Free). Download remains hidden unless you later enable it for Pro/Max.
    const protect = $("pdf-protect-overlay");
    const dl = $("pdf-download-btn");
    if (protect) protect.classList.remove("hidden");
    if (dl) dl.classList.add("hidden");
  }

  function actionLabel(action) {
    if (action === "notes") return "Notes";
    if (action === "revision") return "Revision";
    if (action === "mindmap") return "Mindmap";
    if (action === "pyq") return "PYQs";
    if (action === "quiz") return "Quiz";
    if (action === "formula") return "Formula sheet";
    if (action === "diagram") return "Diagrams";
    if (action === "textbook") return "Textbook Q&A";
    if (action === "worksheet") return "Practice Sheets";
    if (action === "keypoints") return "Key Points";
    return "Resource";
  }

  // -------- Revision Cards (PREBUILT, app-native; NOT AI; NOT PDF) --------
  function revisionLabelForProfile(profile) {
    const cls = effectiveClass(profile);
    const c = parseInt(String(cls).match(/\d+/)?.[0] || "0", 10);
    const mode = getStudyMode(profile);
    if (mode === "boards" && (c === 11 || c === 12)) return ""; // hidden by tab logic anyway
    if (c >= 5 && c <= 8) return "Quick Recall";
    if (c === 9 || c === 10) return "Revision";
    if ((c === 11 || c === 12) && mode === "entrance") return "Rapid Revision";
    return "Revision";
  }

  function openRevisionModalShell(title) {
    const overlay = $("rev-modal");
    const titleEl = $("rev-modal-title");
    const body = $("rev-modal-body");
    if (!overlay || !body) {
      toast("Revision view not found. Please refresh.");
      return null;
    }
    if (titleEl) titleEl.textContent = title;
    body.innerHTML = `
      <div class="ke-rev-loading">
        <div class="ke-rev-loading-title">Loading…</div>
        <div class="ke-rev-loading-sub">Opening your revision cards.</div>
      </div>
    `;
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    updateModalOpenClass();
    return body;
  }

  function renderRevisionFromJson(container, data) {
    const d = (data && typeof data === "object") ? data : {};
    const esc = (s) => String(s || "").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const bullets = (arr) => {
      const a = Array.isArray(arr) ? arr : [];
      if (!a.length) return "";
      return `<ul class="ke-rev-list">${a.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`;
    };

    const remember = bullets(d.remember || d.what_to_remember || d.whatToRemember);
    const key = bullets(d.key_points || d.keyPoints || d.formulas || d.facts);
    const mistakes = bullets(d.common_mistakes || d.commonMistakes || d.mistakes);
    const exam = bullets(d.exam_favourite || d.examFavourite || d.exam_favorites);

    const visuals = Array.isArray(d.visuals) ? d.visuals : [];
    const visualHtml = visuals.length ? `
      <div class="ke-rev-section">
        <div class="ke-rev-h">Visual</div>
        <div class="ke-rev-visuals">
          ${visuals.map(v=>{
            const type = String(v.type||"image");
            const src = esc(v.src||"");
            const cap = esc(v.caption||"");
            if (!src) return "";
            if (type === "svg" || type === "image") {
              return `<figure class="ke-rev-fig"><img src="${src}" alt="" loading="lazy"/><figcaption>${cap}</figcaption></figure>`;
            }
            return "";
          }).join("")}
        </div>
      </div>` : "";

    const section = (title, inner) => inner ? `<div class="ke-rev-section"><div class="ke-rev-h">${esc(title)}</div>${inner}</div>` : "";

    container.innerHTML = `
      <div class="ke-rev-wrap">
        ${section("What to Remember", remember)}
        ${section("Key Points", key)}
        ${section("Common Mistakes", mistakes)}
        ${section("Exam Favourite", exam)}
        ${visualHtml}
      </div>
    `;
  }

  async function openRevisionCards(profile, subject, chapId, chapTitle) {
    const label = revisionLabelForProfile(profile);
    const title = `${subject} • ${chapTitle} • ${label || "Revision"}`;

    const body = openRevisionModalShell(title);
    if (!body) return;

    try {
      const url = await resolveResourceUrl(profile, subject, chapId, chapTitle, "revision");
      if (!url) {
        body.innerHTML = `
          <div class="ke-rev-empty">
            <div class="ke-rev-empty-title">Not available</div>
            <div class="ke-rev-empty-sub">This revision isn’t available for this chapter right now.</div>
          </div>
        `;
        return;
      }

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);

      if (url.toLowerCase().endsWith(".html")) {
        const html = await res.text();
        body.innerHTML = `<div class="ke-rev-wrap">${html}</div>`;
        return;
      }

      const jsonData = await res.json();
      renderRevisionFromJson(body, jsonData);
    } catch (e) {
      console.warn("[KE] revision cards failed", e);
      body.innerHTML = `<div class="ke-rev-error">Couldn’t load revision right now. Please try again.</div>`;
    }
  }

  // -------- Quiz (chapter-linked) --------
async function openQuizModal(profile, subject, chapId, chapTitle) {
  const overlay = $("quiz-modal");
  const titleEl = $("quiz-modal-title");
  const container = $("quiz-container");

  if (!overlay || !container) {
    toast("Quiz UI not found. Please refresh.");
    return;
  }

  const safeSubject = String(subject || "Subject");
  const safeChapTitle = String(chapTitle || "Chapter");
  const safeChapId = String(chapId || "");

  if (titleEl) titleEl.textContent = `${safeSubject} • ${safeChapTitle} • Quiz`;

  // Loading UI
  container.innerHTML = `
    <div class="quiz-intro">
      <div style="font-weight:900; font-size:14px;">Loading quiz…</div>
      <div style="margin-top:6px; opacity:0.85;">Preparing a calm, quick practice for you 🙂</div>
    </div>
  `;

  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  // Ensure floating UI (Luma FAB) doesn't overlap quiz actions
  updateModalOpenClass();

  (async () => {
    // Resolve quiz.json
    let url = "";
    try { url = await resolveResourceUrl(profile, safeSubject, safeChapId, safeChapTitle, "quiz"); } catch { url = ""; }

    if (!url) {
      container.innerHTML = `
        <div class="quiz-summary">
          <div class="quiz-summary-title">Quiz coming soon</div>
          <div class="quiz-summary-sub">This chapter’s quiz isn’t available yet. Try again later ✨</div>
          <div class="quiz-actions" style="margin-top:12px;">
            <span class="spacer"></span>
            <button class="ke-btn ke-btn--ghost" data-qnav="close" type="button">Close</button>
          </div>
        </div>
      `;
      return;
    }

    let data = null;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      data = await res.json();
    } catch (e) {
      container.innerHTML = `
        <div class="quiz-summary">
          <div class="quiz-summary-title">Couldn’t load the quiz</div>
          <div class="quiz-summary-sub">No worries — please refresh or try again in a moment.</div>
          <div class="quiz-actions" style="margin-top:12px;">
            <span class="spacer"></span>
            <button class="ke-btn ke-btn--ghost" data-qnav="retry-load" type="button">Retry</button>
            <button class="ke-btn ke-btn--ghost" data-qnav="close" type="button">Close</button>
          </div>
        </div>
      `;
      return;
    }

    // Normalize schema
    const rawQs = (data && (data.questions || data.items)) || [];
    const questions = Array.isArray(rawQs) ? rawQs : [];
    const total = questions.length;

    if (!total) {
      container.innerHTML = `
        <div class="quiz-summary">
          <div class="quiz-summary-title">No questions yet</div>
          <div class="quiz-summary-sub">This quiz file exists, but questions haven’t been added yet.</div>
          <div class="quiz-actions" style="margin-top:12px;">
            <span class="spacer"></span>
            <button class="ke-btn ke-btn--ghost" data-qnav="close" type="button">Close</button>
          </div>
        </div>
      `;
      return;
    }

    // State
    let idx = 0;
    const answers = new Array(total).fill(null);
    let submitted = false;
    let lastResult = null; // {correctCount, scorePct, perTag:{}, wrongQs:[...], strong:[...], needs:[...]}

    const normQ = (q, i) => {
      const prompt = String(q.prompt || q.question || q.q || q.text || `Question ${i + 1}`);
      const options = Array.isArray(q.options) ? q.options : (Array.isArray(q.choices) ? q.choices : (Array.isArray(q.opts) ? q.opts : []));
      const ansIdx = Number.isFinite(q.answer_index) ? Number(q.answer_index)
                   : Number.isFinite(q.answerIndex) ? Number(q.answerIndex)
                   : Number.isFinite(q.correct_index) ? Number(q.correct_index)
                   : Number.isFinite(q.correctIndex) ? Number(q.correctIndex)
                   : Number.isFinite(q.answer) ? Number(q.answer)
                   : -1;
      const explanation = String(q.explanation || q.exp || q.reason || "");
      const tags = Array.isArray(q.tags) ? q.tags : (Array.isArray(q.concepts) ? q.concepts : (q.tag ? [q.tag] : []));
      const difficulty = String(q.difficulty || "");
      return { prompt, options, ansIdx, explanation, tags, difficulty };
    };

    const getChapKey = () => {
      try {
        const b = String(profile?.board || profile?.boardKey || profile?.board_id || "");
        const c = String(profile?.klass || profile?.class || profile?.grade || "");
        const g = String(profile?.group || profile?.stream || "");
        return ["quiz", b, c, g, safeSubject, safeChapId].filter(Boolean).join("|");
      } catch {
        return ["quiz", safeSubject, safeChapId].filter(Boolean).join("|");
      }
    };

    const saveAttempt = (resultObj) => {
      try {
        const key = "knoweasy_quiz_attempts_v1";
        const raw = localStorage.getItem(key);
        const db = raw ? JSON.parse(raw) : {};
        db[getChapKey()] = { ...resultObj, at: Date.now(), subject: safeSubject, chapter: safeChapTitle, chapId: safeChapId };
        localStorage.setItem(key, JSON.stringify(db));

        // Mastery bump based on quiz score (offline, deterministic).
        try{
          const pct = Number(resultObj && resultObj.scorePct) || 0;
          const delta = Math.max(6, Math.min(20, Math.round(pct / 5))); // 0-100 -> 6..20
          bumpChapterScore(safeChapId, delta);
          appendAttempt({ subjectId: String(__keSelectedSubject || ""), chapterId: safeChapId, mode: "QUIZ", delta, source: "quiz" });
          const subjectObj = (__keSubjects || []).find(x => String(x.id || "") === String(__keSelectedSubject)) || (__keSubjects || [])[0];
          if (subjectObj) renderChapters(profile, subjectObj);
        }catch(_){}

      } catch {}
    };

    const donutSvg = (pct) => {
      const p = Math.max(0, Math.min(100, Number(pct) || 0));
      const r = 34;
      const c = 2 * Math.PI * r;
      const dash = (p / 100) * c;
      return `
        <svg class="quiz-donut" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(148,163,184,0.25)" stroke-width="10" />
          <circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(59,130,246,0.55)" stroke-width="10"
            stroke-linecap="round"
            stroke-dasharray="${dash} ${c - dash}"
            transform="rotate(-90 50 50)" />
          <text x="50" y="54" text-anchor="middle" font-size="16" font-weight="900" fill="#0f172a">${p}%</text>
        </svg>
      `;
    };

    const pickQuote = () => {
      const quotes = [
        "Small steps today build big confidence tomorrow.",
        "Understanding takes time — and that’s completely normal.",
        "You’re closer than you think. Let’s make it clear together.",
        "Effort matters. We’ll strengthen the rest calmly.",
      ];
      return quotes[Math.floor(Math.random() * quotes.length)];
    };

    const mentorMessage = (pct) => {
      if (pct < 40) {
        return {
          head: "Hey 🙂 Don’t worry at all. I’m here with you.",
          body: "This score doesn’t define you. It only shows what we’ll learn next — slowly, from scratch.",
          quote: pickQuote()
        };
      }
      if (pct < 70) {
        return {
          head: "Nice effort 🙂 You’re getting it.",
          body: "A couple of ideas need clarity. Let’s strengthen them and you’ll feel confident.",
          quote: pickQuote()
        };
      }
      return {
        head: "Great work ✨",
        body: "You’re doing well here. Let’s polish a few details to make it perfect.",
        quote: pickQuote()
      };
    };

    const computeResult = () => {
      const perTag = {};
      let correctCount = 0;

      const wrongQs = [];

      for (let i = 0; i < total; i++) {
        const nq = normQ(questions[i], i);
        const chosen = answers[i];
        const isCorrect = chosen === nq.ansIdx;
        if (isCorrect) correctCount++;

        const tags = (nq.tags && nq.tags.length) ? nq.tags : ["General"];
        tags.forEach(t => {
          const k = String(t || "General");
          perTag[k] = perTag[k] || { total: 0, correct: 0 };
          perTag[k].total += 1;
          if (isCorrect) perTag[k].correct += 1;
        });

        if (!isCorrect) {
          wrongQs.push({ i, ...nq, chosen });
        }
      }

      const scorePct = Math.round((correctCount / total) * 100);

      const ranked = Object.keys(perTag).map(k => {
        const v = perTag[k];
        const pct = v.total ? (v.correct / v.total) : 0;
        return { tag: k, pct, total: v.total };
      }).sort((a, b) => a.pct - b.pct);

      const needs = ranked.filter(x => x.total >= 1 && x.pct < 0.6).slice(0, 3);
      const strong = ranked.slice().reverse().filter(x => x.total >= 1 && x.pct >= 0.8).slice(0, 3);

      return { correctCount, scorePct, perTag, wrongQs, needs, strong };
    };

    const renderQuestion = () => {
      const q = normQ(questions[idx], idx);
      const chosen = answers[idx];
      const diff = String(q.difficulty || "").toUpperCase();
      const chip = diff ? `<span class="quiz-question-chip">${escapeHtml(diff)}</span>` : "";

      const optsHtml = q.options.map((opt, i) => {
        const isSel = chosen === i;
        return `
          <button class="quiz-option" data-opt="${i}" type="button" ${submitted ? "disabled" : ""} style="${isSel ? "outline:2px solid rgba(59,130,246,0.55);" : ""}">
            ${escapeHtml(String(opt))}
          </button>
        `;
      }).join("");

      const prog = Math.round(((idx + 1) / total) * 100);

      container.innerHTML = `
        <div class="quiz-question">
          <div class="quiz-question-top">
            <div class="quiz-question-title">Question ${idx + 1} / ${total}</div>
            ${chip}
          </div>
          <div class="quiz-progress">
            <div class="quiz-progress-bar" style="width:${prog}%"></div>
          </div>
          <div class="quiz-question-prompt">${escapeHtml(q.prompt)}</div>
          <div class="quiz-options">${optsHtml}</div>
        </div>

        <div class="quiz-actions">
          <button class="ke-btn ke-btn--ghost" data-qnav="prev" type="button" ${idx === 0 ? "disabled" : ""}>Previous</button>
          <button class="ke-btn ke-btn--ghost" data-qnav="next" type="button" ${idx === total - 1 ? "disabled" : ""}>Next</button>
          <span class="spacer"></span>
          <button class="ke-btn ke-btn--primary" data-qnav="submit" type="button">Submit</button>
        </div>
      `;
    };

    const renderReview = () => {
      const items = questions.map((qq, i) => {
        const q = normQ(qq, i);
        const chosen = answers[i];
        const correct = q.ansIdx;
        const chosenTxt = (chosen === null || chosen === undefined) ? "Not answered" : String(q.options[chosen] ?? "");
        const correctTxt = String(q.options[correct] ?? "");
        const exp = q.explanation ? escapeHtml(q.explanation) : "Explanation will be added soon ✨";
        const status = (chosen === correct) ? "Correct" : "Needs practice";
        return `
          <div class="quiz-review-item">
            <div class="quiz-review-q">${i + 1}. ${escapeHtml(q.prompt)}</div>
            <div class="quiz-review-meta"><b>${escapeHtml(status)}</b> • Your answer: ${escapeHtml(chosenTxt)} • Correct: ${escapeHtml(correctTxt)}</div>
            <div class="quiz-review-exp">${exp}</div>
          </div>
        `;
      }).join("");

      container.innerHTML = `
        ${renderSummaryHtml(lastResult, true)}
        <div class="quiz-review">${items}</div>
        <div class="quiz-actions">
          <button class="ke-btn ke-btn--ghost" data-qnav="back-summary" type="button">Back</button>
          <span class="spacer"></span>
          <button class="ke-btn ke-btn--ghost" data-qnav="retry" type="button">Retry</button>
          <button class="ke-btn ke-btn--ghost" data-qnav="close" type="button">Close</button>
        </div>
      `;
    };

    const buildLumaPrompt = (resultObj) => {
      const needs = (resultObj.needs || []).map(x => x.tag).join(", ");
      const strong = (resultObj.strong || []).map(x => x.tag).join(", ");
      const wrongList = (resultObj.wrongQs || []).slice(0, 5).map(w => `- ${w.prompt}`).join("\n");
      return `You are Luma — a calm, friendly mentor for students.

Student profile:
- Class: ${profile?.klass || profile?.class || ""}
- Board: ${profile?.board || ""}
- Subject: ${safeSubject}
- Chapter: ${safeChapTitle}

Quiz result:
- Score: ${resultObj.correctCount}/${total} (${resultObj.scorePct}%)
- Needs practice topics: ${needs || "General"}
- Strong topics: ${strong || "—"}

Wrong questions (sample):
${wrongList || "- (none)"}

Instructions:
1) Start with reassurance (no pressure, no judgment).
2) Explain the “Needs practice” topics from scratch, simply and step-by-step.
3) For each topic: give 1 small example and 1 quick checkpoint question.
4) Address the wrong questions briefly: explain the correct reasoning.
5) End with a short, kind plan for the next 10 minutes.
Tone: warm, calm, friendly. Use 1–3 soft emojis (🙂 💡 ✨). Avoid any harsh words like “weak”, “fail”, “poor”.`;
    };

    const renderSummaryHtml = (resultObj, compact) => {
      const { correctCount, scorePct, needs, strong } = resultObj;
      const mm = mentorMessage(scorePct);
      const needsHtml = (needs && needs.length) ? needs.map(x => `<span class="quiz-tag quiz-tag--need">${escapeHtml(x.tag)}</span>`).join("") : `<span class="quiz-tag quiz-tag--need">No big gaps 🎯</span>`;
      const strongHtml = (strong && strong.length) ? strong.map(x => `<span class="quiz-tag quiz-tag--good">${escapeHtml(x.tag)}</span>`).join("") : `<span class="quiz-tag quiz-tag--good">Building…</span>`;

      return `
        <div class="quiz-summary">
          <div class="quiz-summary-top">
            ${donutSvg(scorePct)}
            <div style="flex:1;">
              <div class="quiz-summary-title">Result</div>
              <div class="quiz-summary-sub">You got <b>${correctCount}/${total}</b> correct • ${scorePct}% mastery today</div>
            </div>
          </div>

          <div class="quiz-mentor">
            <div style="font-weight:900;">${escapeHtml(mm.head)}</div>
            <div style="margin-top:6px;">${escapeHtml(mm.body)}</div>
            <small>“${escapeHtml(mm.quote)}”</small>
          </div>

          <div class="quiz-tags">
            <span style="font-size:12px; color:#64748b; margin-right:4px;">Needs:</span>
            ${needsHtml}
          </div>
          <div class="quiz-tags">
            <span style="font-size:12px; color:#64748b; margin-right:4px;">Strong:</span>
            ${strongHtml}
          </div>

          ${compact ? "" : `
            <div class="quiz-seg">
              <button class="ke-btn ke-btn--ghost" data-qnav="review" type="button">Review answers</button>
              <button class="ke-btn ke-btn--primary" data-qnav="luma" type="button">Learn with Luma</button>
            </div>
          `}
        </div>
      `;
    };

    const renderSummary = () => {
      const resultObj = computeResult();
      lastResult = resultObj;
      saveAttempt(resultObj);

      container.innerHTML = `
        ${renderSummaryHtml(resultObj, false)}
        <div class="quiz-actions">
          <button class="ke-btn ke-btn--ghost" data-qnav="retry" type="button">Retry</button>
          <button class="ke-btn ke-btn--ghost" data-qnav="close" type="button">Close</button>
        </div>
      `;
    };

    // Initial render
    renderQuestion();

    // Event delegation
    container.onclick = (ev) => {
      const t = ev.target;
      if (!t) return;

      const opt = t.getAttribute && t.getAttribute("data-opt");
      if (opt !== null && opt !== undefined) {
        const i = Number(opt);
        if (!submitted) {
          answers[idx] = i;
          renderQuestion();
        }
        return;
      }

      const nav = t.getAttribute && t.getAttribute("data-qnav");
      if (!nav) return;

      if (nav === "prev") { if (idx > 0) { idx--; renderQuestion(); } return; }
      if (nav === "next") { if (idx < total - 1) { idx++; renderQuestion(); } return; }

      if (nav === "submit") {
        // gentle confirm: ensure user tried
        submitted = true;
        renderSummary();
        return;
      }

      if (nav === "retry") {
        idx = 0;
        for (let i = 0; i < total; i++) answers[i] = null;
        submitted = false;
        lastResult = null;
        renderQuestion();
        return;
      }

      if (nav === "review") {
        if (!lastResult) { lastResult = computeResult(); }
        renderReview();
        return;
      }

      if (nav === "back-summary") {
        if (!lastResult) { lastResult = computeResult(); }
        container.innerHTML = `
          ${renderSummaryHtml(lastResult, false)}
          <div class="quiz-actions">
            <button class="ke-btn ke-btn--ghost" data-qnav="retry" type="button">Retry</button>
            <button class="ke-btn ke-btn--ghost" data-qnav="close" type="button">Close</button>
          </div>
        `;
        return;
      }

      if (nav === "luma") {
        if (!lastResult) { lastResult = computeResult(); }
        try {
          const prompt = buildLumaPrompt(lastResult);
          localStorage.setItem("knoweasy_luma_context_v1", JSON.stringify({
            prompt,
            createdAt: Date.now(),
            subject: safeSubject,
            chapter: safeChapTitle
          }));
        } catch {}
        // open chat page
        try { window.location.href = "chat.html"; } catch {}
        return;
      }

      if (nav === "retry-load") {
        openQuizModal(profile, subject, chapId, chapTitle);
        return;
      }

      if (nav === "close") {
        overlay.classList.add("hidden");
        overlay.setAttribute("aria-hidden", "true");
        updateModalOpenClass();
        try {
          const prof = getProfile();
          const subjectObj = (__keSubjects || []).find(x => String((x && x.id) || (x && x.subject) || "") === String(__keSelectedSubject)) || (__keSubjects || [])[0];
          if (prof && subjectObj) renderChapters(prof, subjectObj);
        } catch {}
        return;
      }
    };
  })();
}


  // -------- ONE-TIME Study bindings (performance fix) --------
  function bindStudyControlsOnce() {
    if (!IS_STUDY()) return;

    // Mastery recompute/sync is handled in refreshStudy() to avoid async in bind.
    if (window.__keStudyBound) return;
    window.__keStudyBound = true;

    on($("btnChangeProfile"), "click", () => openSetup());

    on($("btnYear11"), "click", () => { setActiveYear("11"); refreshStudy(); });
    on($("btnYear12"), "click", () => { setActiveYear("12"); refreshStudy(); });

    on($("btnModeBoards"), "click", () => { setStudyMode("boards"); refreshStudy(); });
    on($("btnModeEntrance"), "click", () => { setStudyMode("entrance"); refreshStudy(); });

    const examRow = $("examRow");
    if (examRow) {
      examRow.querySelectorAll("[data-exam]").forEach(chip => {
        on(chip, "click", () => { setExamMode(chip.getAttribute("data-exam")); refreshStudy(); });
      });
    }


    const boardRow = $("boardRow");
    if (boardRow) {
      boardRow.querySelectorAll("[data-board]").forEach(chip => {
        on(chip, "click", async () => {
          const profile = getProfile();
          if (!profile) return openSetup();

          let b = String(chip.getAttribute("data-board") || "").toLowerCase();
          if (b === "msb") b = "maharashtra";

          const cls = effectiveClass(profile);
          const is1112 = (cls === "11" || cls === "12");
          if (is1112 && b === "icse") {
            toast("ICSE is available only for Class 5–10.");
            return;
          }

          // Update board, keep everything else same
          profile.board = b;
          saveProfile(normalizeProfile(profile));

          // Ensure new syllabus file loads and UI updates
          await ensureSyllabusLoaded(profile);
          refreshStudy();
        });
      });
    }


    // Tap PDF title to open the same PDF in a true fullscreen tab (best reliability on phones)
    const pdfTitle = $("pdf-modal-title");
    if (pdfTitle) {
      pdfTitle.style.cursor = "pointer";
      pdfTitle.title = "Tap to open fullscreen";
      pdfTitle.addEventListener("click", () => {
        if (__keCurrentPdfUrl) window.open(__keCurrentPdfUrl, "_blank", "noopener");
      });
    }

    // ✅ Event delegation for subject clicks
    const subjectRow = $("subjectRow");
    if (subjectRow) {
      subjectRow.addEventListener("click", (e) => {
        const btn = e.target.closest(".study-subject-pill");
        if (!btn) return;
        const name = btn.getAttribute("data-subject") || "";
        __keSelectedSubject = name;

        subjectRow.querySelectorAll(".study-subject-pill").forEach(b => b.classList.remove("study-subject-pill--active"));
        btn.classList.add("study-subject-pill--active");

        const profile = getProfile();
        if (!profile) return openSetup();

        const subjectObj = (__keSubjects || []).find(x => String(x.name || "") === String(name)) || (__keSubjects || [])[0];
        if (subjectObj) renderChapters(profile, subjectObj);
      });
    }

    // ✅ Event delegation for chapter actions
    const chapterList = $("chapterList");
    if (chapterList) {
      chapterList.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;

        const card = e.target.closest(".study-chapter-card");
        if (!card) return;

        const action = btn.getAttribute("data-action") || "notes";
        const chapId = card.getAttribute("data-chapter-id") || "";
        const chapTitle = card.getAttribute("data-chapter-title") || "Chapter";
        const subject = $("study-subject-label") ? $("study-subject-label").textContent : "Subject";

        const profile = getProfile();
        if (!profile) return openSetup();

        // Local mastery bumps (offline): small deterministic increments.
        if (action === "revision") {
          // Revision cards are prebuilt app-native content (not AI, not PDF).
          bumpChapterScore(chapId, 8);
          appendAttempt({ subjectId: String(__keSelectedSubject || ""), chapterId: chapId, mode: "REVISION", delta: 8, source: "ui" });
          const subjectObj = (__keSubjects || []).find(x => String(x.name || "") === String(__keSelectedSubject)) || (__keSubjects || [])[0];
          if (subjectObj) renderChapters(profile, subjectObj);
          await openRevisionCards(profile, subject, chapId, chapTitle);
          return;
        }

        if (action === "quiz") {
          return openQuizModal(profile, subject, chapId, chapTitle);
        }

        // Luma: distraction-free guided learning page (UI-only v1)
        if (action === "luma") {
          const delta = 4;
          bumpChapterScore(chapId, delta);
          appendAttempt({ subjectId: String(__keSelectedSubject || ""), chapterId: chapId, mode: "OPEN_LUMA", delta, source: "ui" });
          const subjectObj = (__keSubjects || []).find(x => String(x.name || "") === String(__keSelectedSubject)) || (__keSubjects || [])[0];
          if (subjectObj) renderChapters(profile, subjectObj);

          // IMPORTANT: Profile schema is locked and defined in core.js
          //   - profile.class (e.g., 9, 10, 11, 12)
          //   - profile.board (e.g., CBSE, MH, ICSE)
          // Some screens may also use studyMode for 11/12 integrated, so
          // if a helper exists we prefer it.
          const clsNum = (window.KE && typeof KE.effectiveClass === 'function')
            ? String(KE.effectiveClass(profile))
            : (profile && profile.class ? String(profile.class) : "");
          // Determine board/exam key from active UI.
          // IMPORTANT: If the UI is in an inconsistent state (e.g., mode pill not active
          // due to cached DOM or partial refresh), we still want the correct content.
          // So: if the Exam row is currently visible and has an active exam chip, we
          // treat it as entrance mode regardless of the pill state.
          const modeKey = (document.querySelector('.mode-pill.is-active')?.dataset?.mode) || (profile && profile.mode) || "boards";
          const examRowEl = document.querySelector('#examRow');
          const examRowVisible = !!examRowEl && examRowEl.style.display !== 'none';
          const activeExamKey = document.querySelector('#examRow .chip.is-active')?.dataset?.exam || "";

          let boardKey = "";
          if (examRowVisible) {
            boardKey = String(activeExamKey || "neet").toLowerCase();
          } else if (modeKey === "entrance") {
            boardKey = String(activeExamKey || "neet").toLowerCase();
          } else {
            const bKey = (profile && profile.board) ? String(profile.board) : (document.querySelector('#boardRow .chip.is-active')?.dataset?.board || "");
            const _rawBoardKey = String(bKey);
            boardKey = (_rawBoardKey.toLowerCase() === "msb") ? "maharashtra" : _rawBoardKey.toLowerCase();
          }
          const subjectSlug = slugify(subject);
          const chapterSlug = String(chapId || "");

          // NEW (CEO FIX): Study -> Luma must open a specific chapter content_id (or a single Coming Soon screen).

// Fast path: if chapId already is a canonical content_id, open it directly (no resolver needed).
const _maybeId = String(chapterSlug || "").trim();
if (_maybeId && /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(_maybeId) && _maybeId !== "coming-soon") {
  window.location.href = "luma.html?content_id=" + encodeURIComponent(_maybeId);
  return;
}

(async () => {
  const filters = {
    clsNum,
    boardKey,
    subjectSlug: subjectSlug,
    chapterSlug: chapterSlug,
    chapterTitle: String(chapTitle || "").trim()
  };
  const contentId = await resolveLumaContentId(filters);
  if (contentId) {
    window.location.href = "luma.html?content_id=" + encodeURIComponent(contentId);
  } else {
    // Not available yet -> show a single Coming Soon screen in Luma (no library list).
    const t = String(chapTitle || "Coming Soon");
    window.location.href = "luma.html?content_id=" + encodeURIComponent("coming-soon") + "&title=" + encodeURIComponent(t);
  }
})();
return;
        }

        // Local mastery bumps when user opens a learning resource.
        if (
          action === "notes" || action === "mindmap" || action === "pyq" || action === "formula" ||
          action === "diagram" || action === "textbook" || action === "worksheet" || action === "keypoints"
        ) {
          const delta = 3; // small, safe increment
          bumpChapterScore(chapId, delta);
          appendAttempt({ subjectId: String(__keSelectedSubject || ""), chapterId: chapId, mode: ("OPEN_" + action.toUpperCase()), delta, source: "ui" });
          const subjectObj = (__keSubjects || []).find(x => String(x.name || "") === String(__keSelectedSubject)) || (__keSubjects || [])[0];
          if (subjectObj) renderChapters(profile, subjectObj);
        }

        openPdfModalLoading(`${subject} • ${actionLabel(action)}`);
        const url = await resolveResourceUrl(profile, subject, chapId, chapTitle, action);
        if (!url) return openPdfModalEmpty(`${subject} • ${actionLabel(action)}`, fileFor(action));
        openPdfModalUrl(`${subject} • ${actionLabel(action)}`, url);
      });
    }

    on($("btnTodayPlan"), "click", () => {
      const profile = getProfile();
      if (!profile) return openSetup();
      const chapters = window.__keLastVisibleChapters || [];
      if (!chapters.length) return toast("No chapters yet.");
      const ranked = chapters.map(ch => ({...ch, score: getChapterScore(ch.id)})).sort((a,b)=>a.score-b.score);
      const top = ranked.slice(0, 3);
      const lines = top.map((x,i)=>`${i+1}. ${x.title} (${x.score}%)`).join("\n");
      openPlanModal(lines);
    });

    on($("btnViewAll"), "click", () => {
      const profile = window.__keLastProfileForChapters || getProfile();
      const subject = window.__keLastSubjectName || (($("study-subject-label") && $("study-subject-label").textContent) ? $("study-subject-label").textContent : "Subject");
      const chapters = window.__keLastVisibleChapters || [];
      if (!chapters.length) return toast("No chapters to show.");
      openChaptersModal(profile, subject, chapters);
    });
  }

  // -------- Main refresh (lightweight) --------
  async function refreshStudy() {
    const profile = getProfile();

    setHeaderMeta(profile);

    if (!IS_STUDY()) return;

    bindModalClosersOnce();
    bindStudyControlsOnce();

    // Apply locally stored attempts (UI/engine) to chapter mastery, then optionally sync engine mastery.
    recomputeChapterMasteryFromAttempts();
    try { await trySyncEngineMastery(); } catch {}

    if (!profile) return openSetup();

    if (isIntegrated1112(profile) && !localStorage.getItem(KEY_ACTIVE_YEAR)) setActiveYear("11");

    applyBoardRowUI(profile);
    applyYearToggle(profile);
    applyModeUI(profile);
    applyJuniorLocks(profile);
    setContextLine(profile);

    // Attempt to load the syllabus for the selected class/board.  If the
    // corresponding data file is missing (e.g. a new board/class combination
    // was added without a syllabus file), ensureSyllabusLoaded() will return
    // false.  In that case we fall back to a graceful error rather than
    // silently showing an empty page.  Previously the page would render
    // nothing and appear broken.  Now we display a friendly message to
    // inform the student that their syllabus data is unavailable.
    const loaded = await ensureSyllabusLoaded(profile);
    if (!loaded) {
      try {
        const subjRow = document.getElementById("subjectRow");
        const chapList = document.getElementById("chapterList");
        if (subjRow) {
          subjRow.innerHTML =
            '<div class="study-chapter-card" style="padding:14px;">' +
            '<div class="study-chapter-main"><div>' +
            '<h3 class="study-chapter-title">Syllabus unavailable</h3>' +
            '<p class="study-chapter-meta">The syllabus for your selected class/board could not be loaded. Please try another selection or contact support.</p>' +
            '</div><span class="study-chip">Info</span></div></div>';
        }
        if (chapList) {
          chapList.innerHTML = '';
        }
      } catch {
        // ignore errors when populating the error message
      }
      return;
    }

    const syllabus = getSyllabus(profile);
    renderSubjects(profile, syllabus);
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindSetupModal();
    applyCreatorVisibility();
    refreshStudy();
  });

})();