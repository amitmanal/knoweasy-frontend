// KnowEasy OS — Bootstrap (stability)
// Goal: never crash on load, but never fail silently in debug mode.
(() => {
  "use strict";

  // -------- Auth/Role helpers (front-end only, safe) --------
  // Backend remains the security boundary; this is UX gating only.
  const AUTH_USER_KEY = "knoweasy_user_v1";
  const AUTH_TOKEN_KEY = "knoweasy_session_token_v1";

  function safeParse(raw){
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }

  function getAuthUser(){
    return safeParse(localStorage.getItem(AUTH_USER_KEY));
  }

  function getAuthRole(){
    const u = getAuthUser();
    const r = (u && u.role) ? String(u.role).toLowerCase() : "";
    return (r === "parent" || r === "student") ? r : "";
  }

  async function loadConfig(){
    try{
      const res = await fetch("config.json", {cache:"no-store"});
      const j = await res.json();
      return j && typeof j === "object" ? j : {};
    }catch{ return {}; }
  }

  async function apiPost(path, payload){
    try{
      const cfg = await loadConfig();
      const base = String(cfg.api_base_url || cfg.api_root || "").replace(/\/$/, "");
      if(!base) return false;
      const token = (localStorage.getItem(AUTH_TOKEN_KEY) || "").trim();
      // Never spam the backend with unauthorized requests.
      // Most endpoints behind apiPost are authenticated (e.g., /events/track).
      if(!token) return false;
      const headers = {"Content-Type":"application/json"};
      if(token) headers["Authorization"] = "Bearer " + token;
      const res = await fetch(base + path, {
        method:"POST",
        headers,
        body: JSON.stringify(payload || {})
      });
      return res && res.ok;
    }catch{ return false; }
  }

  function currentPage(){
    return ((location.pathname || "").split("/").pop() || "index.html").toLowerCase();
  }

  function isAuthPage(page){
    return page === "login.html";
  }

  function isWelcomePage(page){
    return page === "welcome.html";
  }

  function isParentPage(page){
    return page === "parent.html";
  }

  function isStudentOnlyPage(page){
    return ["study.html","chat.html","test.html","luma.html"].includes(page);
  }

  function hideBottomNav(){
    try{
      const nav = document.querySelector(".bottom-nav");
      if(nav) nav.style.display = "none";
    }catch{}
  }

  function setBodyRoleClass(role){
    try{
      document.body.classList.toggle("ke-role-parent", role === "parent");
      document.body.classList.toggle("ke-role-student", role === "student");
    }catch{}
  }

  function safeCall(name, fn) {
    try {
      fn && fn();
    } catch (err) {
      try {
        if (window.KE && typeof window.KE.logError === "function") {
          window.KE.logError(name, err);
        } else if (localStorage.getItem("knoweasy_debug_v1") === "1") {
          console.error("[KE_BOOT]", name, err);
        }
      } catch (_) {}
    }
  }

  
  // -------- Shell: profile enforcement + header meta --------
  const PROFILE_KEY = "knoweasy_student_profile_v1";

  function safeParseJSON(raw){
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }

  function normalizeBoard(board){
    const b = String(board || "").trim();
    const low = b.toLowerCase();
    if (low === "msb" || low === "mh" || low === "maharashtra" || low === "maharashtra board") return "maharashtra";
    if (low === "cbse") return "cbse";
    if (low === "icse") return "icse";
    if (low) return low;
    return "";
  }

  function normalizeClass(cls){
    const c = String(cls || "").trim();
    if (!c) return "";
    if (c === "11_12" || c === "11-12" || c === "11–12" || c === "11+12") return "11_12";
    // numeric 5-12
    const m = c.match(/\d+/);
    return m ? m[0] : "";
  }

  function getProfileRaw(){
    try { return safeParseJSON(localStorage.getItem(PROFILE_KEY)); } catch { return null; }
  }

  function getProfileNormalized(){
    const p = getProfileRaw();
    if (!p) return null;
    const board = normalizeBoard(p.board);
    const klass = normalizeClass(p.class);
    if (!board || !klass) return null;
    return { ...p, board, class: klass };
  }

  function profileLabel(p){
    if (!p) return "Board • Class";
    const boardLabel = p.board === "maharashtra" ? "Maharashtra" : String(p.board).toUpperCase();
    const clsLabel = p.class === "11_12" ? "11+12" : p.class;
    return `${boardLabel} • Class ${clsLabel}`;
  }

  function ensureProfileOrRedirect(role){
    const page = currentPage();
    // Parents do not need student onboarding/profile.
    if(role === "parent") return null;
    if (isWelcomePage(page)) return getProfileNormalized();
    const p = getProfileNormalized();
    if (!p) {
      try { location.href = "welcome.html"; } catch {}
      return null;
    }
    // write back normalized (so other pages read consistent values)
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...p, updatedAt: Date.now() })); } catch {}
    return p;
  }

  function syncHeaderMeta(p){
    try{
      const meta = document.getElementById("profileMeta");
      if (meta) meta.textContent = profileLabel(p);
    } catch {}
  }

  function bindResetProfile(){
    const btn = document.getElementById("resetProfileBtn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      try{
        const ok = confirm("Reset your class & board on this device?");
        if (!ok) return;
        // Remove only local app keys (safe)
        const keys = [
          "knoweasy_student_profile_v1",
          "knoweasy_study_mode_v1",
          "knoweasy_exam_mode_v1",
          "knoweasy_active_year_v1",
          "knoweasy_chapter_mastery_v1"
        ];
        keys.forEach(k => { try { localStorage.removeItem(k); } catch {} });
      } catch {}
      try { location.href = "welcome.html?edit=1&return=index.html"; } catch {}
    });
  }

document.addEventListener("DOMContentLoaded", () => {

    // Prevent double-initialization. If this script has already run on this page,
    // simply return early. This guards against duplicate event listeners and
    // duplicate network calls when multiple copies of app.js are loaded.
    if (window.__KE_APP_INIT__) {
      return;
    }
    window.__KE_APP_INIT__ = true;

    const role = getAuthRole();
    setBodyRoleClass(role);

    const page = currentPage();

    // Parent UX gating: keep them inside the parent dashboard.
    if(role === "parent"){
      hideBottomNav();
      // Block student-only pages & welcome onboarding for parents.
      if(isStudentOnlyPage(page) || isWelcomePage(page)){
        try { location.href = "parent.html"; } catch {}
        return;
      }
      // If parent goes to home/me, gently route to dashboard.
      if(!isParentPage(page) && !isAuthPage(page)){
        try { location.href = "parent.html"; } catch {}
        return;
      }
    }

    const __p = ensureProfileOrRedirect(role);
    syncHeaderMeta(__p);
    bindResetProfile();
    safeCall("bindSetupModal", () => window.bindSetupModal && window.bindSetupModal());
    safeCall("applyCreatorVisibility", () => window.applyCreatorVisibility && window.applyCreatorVisibility());
    safeCall("refreshStudy", () => window.refreshStudy && window.refreshStudy());

    // ----- Silent analytics (best-effort) -----
    // Only meta signals; never store chat text or sensitive content.
    const ts = Date.now();
    const sessionId = String(ts) + "-" + Math.random().toString(16).slice(2);
    try{ sessionStorage.setItem("ke_session_id_v1", sessionId); }catch{}

    // Fire-and-forget session start.
    apiPost("/events/track", {
      event_type: "session_start",
      meta: { page, role: role || "unknown", sid: sessionId }
    });

    // Heartbeat every 2.5 minutes (very light).
    try{
      if(!window.__keHeartbeat){
        window.__keHeartbeat = setInterval(()=>{
          apiPost("/events/track", { event_type:"session_heartbeat", meta:{ page: currentPage(), role: getAuthRole() || "unknown", sid: sessionId } });
        }, 150000);
      }
    }catch{}

    // Session end (best-effort). Use sendBeacon if available.
    try{
      window.addEventListener("beforeunload", () => {
        try{
          // Use fetch in keepalive mode (works on modern browsers).
          apiPost("/events/track", { event_type:"session_end", meta:{ page, role: role || "unknown", sid: sessionId } });
        }catch{}
      });
    }catch{}
  });
})();
