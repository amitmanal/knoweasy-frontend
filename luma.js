/** LUMA.JS - PRODUCTION PATCH (Adapter v2)
 * - Supports canonical content_id and resolver flow
 * - Adapts DB content format (blueprint.steps, practice, exam_relevance...) to UI sections/cards
 * - XSS-safe (escapes all text)
 * - No inline onclick handlers
 */
class Luma {
  constructor() {
    this.data = null;          // raw content from API: {content_id, metadata, blueprint, practice, ...}
    this.model = null;         // normalized UI model: {sections:[{title,cards:[]}]}
    this.currentSection = 0;
    this.currentCard = 0;
    this.API = window.API_BASE || "https://knoweasy-engine-api.onrender.com";
    this.init();
  }

  init() {
    const params = new URLSearchParams(window.location.search);
    const cid = params.get("id");
    if (cid) {
      this.loadById(cid);
    } else {
      // Resolver-based open (Study → Luma)
      const board = params.get("board");
      const classLevel = params.get("class_level") || params.get("class") || params.get("classLevel");
      const subject = params.get("subject");
      const chapter = params.get("chapter") || params.get("topic");
      if (board && classLevel && subject && chapter) {
        this.loadByResolve({ board, class_level: classLevel, subject, chapter });
      } else {
        this.showError("No content id or resolver parameters provided.");
      }
    }
    this.setupKeyboard();
  }

  async loadByResolve(q) {
    this.showLoading();
    try {
      const board = String(q.board || "").trim().toLowerCase();
      const class_level = String(q.class_level || "").trim();
      const subject = this.normalizeSubject(String(q.subject || "").trim());
      const chapter = this.slugify(String(q.chapter || "").trim());

      const url = `${this.API}/api/luma/resolve?board=${encodeURIComponent(board)}&class_level=${encodeURIComponent(
        class_level
      )}&subject=${encodeURIComponent(subject)}&chapter=${encodeURIComponent(chapter)}`;

      const r = await fetch(url);
      const d = await r.json().catch(() => ({}));

      if (!r.ok) throw new Error(`Resolver HTTP ${r.status}`);
      if (d && d.ok && d.content_id) {
        this.loadById(d.content_id);
        return;
      }

      const reason = (d && (d.error || d.status)) ? `${d.status || ""} ${d.error || ""}`.trim() : "NO_MATCH";
      this.showError(`Content not available (${reason}).`);
    } catch (e) {
      console.error("Resolve error:", e);
      this.showError(`Resolver failed: ${e.message}`);
    }
  }

  async loadById(cid) {
    this.showLoading();
    try {
      const r = await fetch(`${this.API}/api/luma/content/${encodeURIComponent(cid)}`);
      if (!r.ok) throw new Error("Content not found");
      const d = await r.json();
      if (d.ok && d.content) {
        this.data = d.content;
        this.model = this.normalizeContent(this.data);
        this.currentSection = 0;
        this.currentCard = 0;
        this.render();
      } else {
        throw new Error(d.error || "Failed to load");
      }
    } catch (e) {
      console.error("Load error:", e);
      this.showError(`Content not available: ${e.message}`);
    }
  }

  // -----------------------------
  // Normalization (API → UI model)
  // -----------------------------
  normalizeContent(content) {
    const sections = [];

    const bp = content.blueprint || {};
    const steps = Array.isArray(bp.steps) ? bp.steps : [];

    // Section: Learn (steps + visual)
    const learnCards = [];

    if (bp.title) {
      learnCards.push({
        type: "explain",
        title: bp.title,
        content: bp.title ? `# ${bp.title}` : ""
      });
    }

    for (const s of steps) {
      learnCards.push({
        type: "explain",
        title: s.title || "Step",
        content: s.content || ""
      });
    }

    // Visual (mermaid or text-diagram)
    if (bp.visual && (bp.visual.code || bp.visual.caption)) {
      learnCards.push({
        type: "mermaid",
        title: bp.visual.caption ? `📌 ${bp.visual.caption}` : "📌 Diagram",
        code: bp.visual.code || ""
      });
    }

    // Optional foundation blocks stored at root (legacy fields)
    if (content.conceptual_foundation) {
      learnCards.push({ type: "explain", title: "Conceptual Foundation", content: content.conceptual_foundation });
    }
    if (content.alternative_method) {
      learnCards.push({ type: "explain", title: "Alternative Method", content: content.alternative_method });
    }

    if (learnCards.length) sections.push({ title: "Learn", cards: learnCards });

    // Section: Practice (root.practice is list of {text, hint, difficulty})
    const practice = Array.isArray(content.practice) ? content.practice : [];
    if (practice.length) {
      const practiceCards = practice.map((p, idx) => ({
        type: "practice_text",
        title: `Practice ${idx + 1}${p.difficulty ? ` • ${String(p.difficulty).toUpperCase()}` : ""}`,
        text: p.text || "",
        hint: p.hint || ""
      }));
      sections.push({ title: "Practice", cards: practiceCards });
    }

    // Section: Exam & Mistakes
    const examCards = [];
    if (content.why_it_matters) examCards.push({ type: "explain", title: "Why it matters", content: content.why_it_matters });
    if (content.exam_relevance) examCards.push({ type: "explain", title: "Exam relevance", content: content.exam_relevance });

    const mistakes = Array.isArray(content.common_mistakes) ? content.common_mistakes : [];
    if (mistakes.length) {
      examCards.push({
        type: "bullets",
        title: "Common mistakes",
        items: mistakes
      });
    }
    if (examCards.length) sections.push({ title: "Exam & Mistakes", cards: examCards });

    // Fallback
    if (!sections.length) {
      sections.push({
        title: "Content",
        cards: [{ type: "explain", title: "No content", content: "No lesson content found." }]
      });
    }

    return { sections };
  }

  // -----------------------------
  // Rendering
  // -----------------------------
  render() {
    document.getElementById("uploadScreen").classList.add("hidden");
    document.getElementById("lumaMain").classList.remove("hidden");
    this.renderHeader();
    this.renderCards();
    this.renderSidebar();
  }

  renderHeader() {
    const m = (this.data && this.data.metadata) || {};
    const h = document.getElementById("headerContent");
    h.innerHTML = `<div class="luma-header">
      <h1>${this.escapeHtml(m.title || m.topic || "Content")}</h1>
      <div class="luma-meta">
        <span>${this.escapeHtml(m.board || "")} | Class ${this.escapeHtml(String(m.class_level || ""))} | ${this.escapeHtml(m.subject || "")}</span>
        <span>${this.escapeHtml(m.estimatedTime || "45 min")}</span>
      </div>
    </div>`;
    h.classList.remove("hidden");
  }

  renderCards() {
    const secs = (this.model && this.model.sections) || [];
    if (!secs.length) {
      this.showError("No lesson content found.");
      return;
    }
    const sec = secs[this.currentSection] || {};
    const cards = sec.cards || [];
    const card = cards[this.currentCard] || {};

    const c = document.getElementById("lumaContent");
    c.innerHTML = this.renderCard(card);

    this.attachCardListeners();
      this.hydrateMermaid();
}

  renderCard(card) {
    const t = card.type || "explain";
    if (t === "explain") return this.renderExplain(card);
    if (t === "visual") return this.renderVisual(card);
    if (t === "check") return this.renderCheck(card);
    if (t === "practice") return this.renderPractice(card);

    // New types
    if (t === "mermaid") return this.renderMermaid(card);
    if (t === "practice_text") return this.renderPracticeText(card);
    if (t === "bullets") return this.renderBullets(card);

    return `<div class="luma-card"><p>Unknown card type: ${this.escapeHtml(t)}</p></div>`;
  }

  renderExplain(c) {
    const cont = Array.isArray(c.content) ? c.content.join("\n") : (c.content || "");
    return `<div class="luma-card luma-card-explain">
      <h2>${this.escapeHtml(c.title || "")}</h2>
      <div class="luma-content-text">${this.markdownToHtml(cont)}</div>
    </div>`;
  }

  renderBullets(c) {
    const items = Array.isArray(c.items) ? c.items : [];
    return `<div class="luma-card luma-card-explain">
      <h2>${this.escapeHtml(c.title || "")}</h2>
      <ul class="luma-bullets">
        ${items.map(it => `<li>${this.markdownToHtml(String(it || ""))}</li>`).join("")}
      </ul>
    </div>`;
  }

  renderMermaid(c) {
    const code = (c.code || "").trim();
    const caption = c.caption ? `<div class="luma-caption">${this.escapeHtml(c.caption)}</div>` : "";

    // Use Mermaid if available; otherwise show code as fallback.
    const uid = `mermaid-${Math.random().toString(36).slice(2)}`;
    const mermaidDiv = `<div class="luma-mermaid">
        <div id="${uid}" class="mermaid">${this.escapeHtml(code)}</div>
        ${caption}
    </div>`;

    // Mark for post-render hydration
    this._pendingMermaidIds = this._pendingMermaidIds || [];
    this._pendingMermaidIds.push(uid);

    return mermaidDiv;
  }


  renderPracticeText(c) {
    const hintId = `hint_${Math.random().toString(36).slice(2)}`;
    return `<div class="luma-card luma-card-explain">
      <h2>${this.escapeHtml(c.title || "Practice")}</h2>
      <div class="luma-content-text">${this.markdownToHtml(c.text || "")}</div>
      ${c.hint ? `<button class="hint-btn" data-hint="${hintId}">Show hint</button>
      <div id="${this.escapeHtml(hintId)}" class="hint-box hidden">${this.markdownToHtml(c.hint)}</div>` : ""}
    </div>`;
  }

  renderVisual(c) {
    const imgs = c.images || [];
    return `<div class="luma-card luma-card-visual">
      <h2>${this.escapeHtml(c.title || "")}</h2>
      <p>${this.escapeHtml(c.content || "")}</p>
      ${imgs
        .map(
          (i) =>
            `<figure><img src="${this.escapeHtml(i.url)}" alt=""><figcaption>${this.escapeHtml(
              i.caption || ""
            )}</figcaption></figure>`
        )
        .join("")}
    </div>`;
  }

  renderCheck(c) {
    const q = c.quiz || {};
    return `<div class="luma-card luma-card-check">
      <h2>${this.escapeHtml(c.title || "Quick Check")}</h2>
      <div class="luma-quiz">
        <p class="quiz-q">${this.escapeHtml(q.question || "")}</p>
        <div class="quiz-opts">
          ${(q.options || [])
            .map((o, i) => `<button class="quiz-opt" data-idx="${i}">${this.escapeHtml(o)}</button>`)
            .join("")}
        </div>
        <div class="quiz-result hidden"></div>
      </div>
    </div>`;
  }

  renderPractice(c) {
    return this.renderCheck(c);
  }

  renderSidebar() {
    const secs = (this.model && this.model.sections) || [];
    const s = document.getElementById("lumaSidebar");

    s.innerHTML = secs
      .map((sec, si) => {
        const cards = sec.cards || [];
        return `<div class="sidebar-section">
          <h3>${this.escapeHtml(sec.title || `Section ${si + 1}`)}</h3>
          <div class="sidebar-cards">
            ${cards
              .map(
                (c, ci) =>
                  `<button class="sidebar-card${si === this.currentSection && ci === this.currentCard ? " active" : ""}" data-sec="${si}" data-card="${ci}">
                    ${ci + 1}. ${this.escapeHtml(c.title || "Card")}
                  </button>`
              )
              .join("")}
          </div>
        </div>`;
      })
      .join("");

    s.querySelectorAll(".sidebar-card").forEach((b) =>
      b.addEventListener("click", (e) => {
        const btn = e.currentTarget;
        this.currentSection = parseInt(btn.dataset.sec, 10);
        this.currentCard = parseInt(btn.dataset.card, 10);
        this.render();
      })
    );
  }
  async hydrateMermaid() {
    const ids = (this._pendingMermaidIds || []).slice();
    this._pendingMermaidIds = [];

    if (!ids.length) return;

    const m = window.mermaid;
    if (!m) return;

    try {
      if (typeof m.initialize === "function") {
        m.initialize({ startOnLoad: false, securityLevel: "strict" });
      }

      const nodes = ids
        .map((id) => document.getElementById(id))
        .filter(Boolean);

      if (!nodes.length) return;

      if (typeof m.run === "function") {
        await m.run({ nodes });
      } else if (typeof m.init === "function") {
        m.init(undefined, nodes);
      }
    } catch (e) {
      console.warn("Mermaid render failed:", e);
    }
  }



  attachCardListeners() {
    // Quiz buttons
    document.querySelectorAll(".quiz-opt").forEach((b) =>
      b.addEventListener("click", (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        this.checkAnswer(idx);
      })
    );

    // Hint toggle
    document.querySelectorAll(".hint-btn").forEach((b) =>
      b.addEventListener("click", (e) => {
        const btn = e.currentTarget;
        const hintId = btn.dataset.hint;
        const box = document.getElementById(hintId);
        if (!box) return;
        const isHidden = box.classList.contains("hidden");
        box.classList.toggle("hidden", !isHidden);
        btn.textContent = isHidden ? "Hide hint" : "Show hint";
      })
    );
  }

  checkAnswer(idx) {
    const secs = (this.model && this.model.sections) || [];
    const sec = secs[this.currentSection] || {};
    const cards = sec.cards || [];
    const card = cards[this.currentCard] || {};
    const q = card.quiz || {};
    const cor = q.correct;

    const res = document.querySelector(".quiz-result");
    if (!res) return;

    const isCorrect = Array.isArray(cor) ? cor.includes(idx) : cor === idx;
    res.innerHTML = isCorrect
      ? `<div class="correct">✅ Correct! ${this.escapeHtml(q.explanation || "")}</div>`
      : `<div class="incorrect">❌ Incorrect. ${this.escapeHtml(q.explanation || "")}</div>`;
    res.classList.remove("hidden");
  }

  nextCard() {
    const secs = (this.model && this.model.sections) || [];
    const sec = secs[this.currentSection] || {};
    const cards = sec.cards || [];

    if (this.currentCard < cards.length - 1) {
      this.currentCard++;
      this.render();
    } else if (this.currentSection < secs.length - 1) {
      this.currentSection++;
      this.currentCard = 0;
      this.render();
    }
  }

  prevCard() {
    const secs = (this.model && this.model.sections) || [];
    if (this.currentCard > 0) {
      this.currentCard--;
      this.render();
    } else if (this.currentSection > 0) {
      this.currentSection--;
      const sec = secs[this.currentSection] || {};
      const cards = sec.cards || [];
      this.currentCard = Math.max(0, cards.length - 1);
      this.render();
    }
  }

  setupKeyboard() {
    document.addEventListener("keydown", (e) => {
      if (e.target && e.target.matches && e.target.matches("input,textarea")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        this.nextCard();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        this.prevCard();
      }
    });
  }

  showLoading() {
    document.getElementById("uploadScreen").classList.remove("hidden");
    document.getElementById("lumaMain").classList.add("hidden");
  }

  showError(msg) {
    const el = document.getElementById("uploadScreen");
    el.innerHTML = `<div class="luma-error">
      <h2>⚠️ Error</h2>
      <p>${this.escapeHtml(msg)}</p>
      <button id="lumaGoBackBtn">Go Back</button>
    </div>`;
    el.classList.remove("hidden");
    document.getElementById("lumaMain").classList.add("hidden");

    const btn = document.getElementById("lumaGoBackBtn");
    if (btn) btn.addEventListener("click", () => window.history.back());
  }

  // -----------------------------
  // Helpers (XSS-safe)
  // -----------------------------
  escapeHtml(t) {
    const d = document.createElement("div");
    d.textContent = t || "";
    return d.innerHTML;
  }

  markdownToHtml(t) {
    if (!t) return "";
    t = this.escapeHtml(t);

    // Basic markdown support (safe):
    t = t.replace(/^###\s(.+)$/gm, "<h4>$1</h4>");
    t = t.replace(/^##\s(.+)$/gm, "<h3>$1</h3>");
    t = t.replace(/^#\s(.+)$/gm, "<h2>$1</h2>");
    t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*(.+?)\*/g, "<em>$1</em>");

    // Bullets
    t = t.replace(/^[-•]\s(.+)$/gm, "<li>$1</li>");
    t = t.replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>");

    // New lines
    t = t.replace(/\n/g, "<br>");
    return t;
  }

  slugify(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  normalizeSubject(s) {
    const v = String(s || "").trim().toLowerCase();
    const map = {
      maths: "mathematics",
      math: "mathematics",
      mathematics: "mathematics",
      bio: "biology",
      biology: "biology",
      phy: "physics",
      physics: "physics",
      chem: "chemistry",
      chemistry: "chemistry"
    };
    return map[v] || v;
  }
}

// Boot
window.addEventListener("DOMContentLoaded", () => new Luma());
