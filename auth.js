/*
  KnowEasy Auth (v10 clean)
  Goals:
  - Separate Student vs Parent sessions (can coexist)
  - Page-driven active role (student pages never act as parent and vice versa)
  - Backward compatible with legacy key knoweasy_session_token_v1
*/
(function(){
  "use strict";

  const LEGACY_TOKEN_KEY = "knoweasy_session_token_v1";
  const LEGACY_USER_KEY  = "knoweasy_user_v1";

  const ROLE_TOKEN_KEY = {
    student: "knoweasy_session_token_student_v1",
    parent:  "knoweasy_session_token_parent_v1",
  };
  const ROLE_USER_KEY = {
    student: "knoweasy_user_student_v1",
    parent:  "knoweasy_user_parent_v1",
  };

  const ACTIVE_ROLE_KEY = "knoweasy_active_role_v1"; // advisory only

  function safeJsonParse(raw){ try{ return raw ? JSON.parse(raw) : null; }catch{ return null; } }
  function safeJsonStringify(obj){ try{ return JSON.stringify(obj); }catch{ return ""; } }

  function normRole(role){
    const r = String(role || "").toLowerCase();
    return (r === "parent" || r === "student") ? r : "";
  }

  function inferRoleFromUrl(){
    try{
      const u = new URL(location.href);
      const qp = normRole(u.searchParams.get("role"));
      if(qp) return qp;
      const page = ((location.pathname||"").split("/").pop()||"").toLowerCase();
      if(page === "parent.html") return "parent";
      // Everything else is treated as student surface
      return "student";
    }catch{ return "student"; }
  }

  function getActiveRole(){
    const r = normRole(sessionStorage.getItem(ACTIVE_ROLE_KEY) || localStorage.getItem(ACTIVE_ROLE_KEY));
    return r || inferRoleFromUrl();
  }

  function setActiveRole(role){
    const r = normRole(role) || inferRoleFromUrl();
    try{ sessionStorage.setItem(ACTIVE_ROLE_KEY, r); }catch{}
    try{ localStorage.setItem(ACTIVE_ROLE_KEY, r); }catch{}
    // Sync legacy token for old codepaths (app.js)
    try{ syncLegacyForRole(r); }catch{}
    return r;
  }

  function getToken(role){
    const r = normRole(role) || getActiveRole();
    const k = ROLE_TOKEN_KEY[r];
    const t = k ? (localStorage.getItem(k) || "") : "";
    return (t || "").trim();
  }

  function setToken(token, role){
    const r = normRole(role) || getActiveRole();
    const k = ROLE_TOKEN_KEY[r];
    const t = String(token || "").trim();
    if(!k) return false;
    if(!t) {
      try{ localStorage.removeItem(k); }catch{}
    } else {
      try{ localStorage.setItem(k, t); }catch{}
    }
    // Keep legacy token aligned to current role (for app.js)
    try{ localStorage.setItem(LEGACY_TOKEN_KEY, t); }catch{}
    setActiveRole(r);
    return true;
  }

  function getUser(role){
    const r = normRole(role) || getActiveRole();
    const k = ROLE_USER_KEY[r];
    const u = safeJsonParse(k ? localStorage.getItem(k) : null);
    if(u && typeof u === "object") return u;

    // Back-compat: if legacy user exists, migrate into current role
    const legacy = safeJsonParse(localStorage.getItem(LEGACY_USER_KEY));
    if(legacy && typeof legacy === "object") {
      // Only migrate if it matches the role (if present)
      const lr = normRole(legacy.role);
      if(!lr || lr === r) {
        try{ localStorage.setItem(k, safeJsonStringify({ ...legacy, role: r })); }catch{}
        return { ...legacy, role: r };
      }
    }
    return null;
  }

  function setUser(user, role){
    const r = normRole(role) || getActiveRole();
    const k = ROLE_USER_KEY[r];
    if(!k) return false;
    const u = (user && typeof user === "object") ? { ...user, role: r } : null;
    if(!u) {
      try{ localStorage.removeItem(k); }catch{}
      return true;
    }
    try{ localStorage.setItem(k, safeJsonStringify(u)); }catch{}
    // Keep legacy user in sync (for old code)
    try{ localStorage.setItem(LEGACY_USER_KEY, safeJsonStringify(u)); }catch{}
    setActiveRole(r);
    return true;
  }

  function syncLegacyForRole(role){
    const r = normRole(role) || inferRoleFromUrl();
    const t = getToken(r);
    if(t) {
      try{ localStorage.setItem(LEGACY_TOKEN_KEY, t); }catch{}
    } else {
      // If no token for this role, clear legacy to avoid leaking other role into this surface
      try{ localStorage.removeItem(LEGACY_TOKEN_KEY); }catch{}
    }

    const u = getUser(r);
    if(u) {
      try{ localStorage.setItem(LEGACY_USER_KEY, safeJsonStringify(u)); }catch{}
    } else {
      try{ localStorage.removeItem(LEGACY_USER_KEY); }catch{}
    }
  }

  function clearSession(role){
    const r = normRole(role) || getActiveRole();
    try{ localStorage.removeItem(ROLE_TOKEN_KEY[r]); }catch{}
    try{ localStorage.removeItem(ROLE_USER_KEY[r]); }catch{}

    // If clearing current active role, clear legacy as well
    try{
      if(getActiveRole() === r) {
        localStorage.removeItem(LEGACY_TOKEN_KEY);
        localStorage.removeItem(LEGACY_USER_KEY);
      }
    }catch{}
  }

  function logout(role, opts){
    const r = normRole(role) || getActiveRole();
    clearSession(r);
    // After logout, keep the other role intact. Default route is welcome.
    const o = opts && typeof opts === 'object' ? opts : {};
    const dest = o.redirect || 'welcome.html';
    try{ window.location.href = dest; }catch(_e){}
  }

  async function loadConfig(){
    try{
      const res = await fetch("config.json", { cache: "no-store" });
      const j = await res.json();
      return j && typeof j === "object" ? j : {};
    }catch{ return {}; }
  }

  async function apiFetch(path, options){
    const opts = options && typeof options === "object" ? options : {};
    const role = normRole(opts.role) || getActiveRole();
    const cfg = await loadConfig();
    const base = String(cfg.api_base_url || cfg.api_root || "").replace(/\/$/, "");
    if(!base) return { res:null, data:null, error:"API base not configured" };

    const headers = Object.assign({}, opts.headers || {});

    // Attach token if present
    const token = getToken(role);
    if(token) headers["Authorization"] = "Bearer " + token;

    // Ensure JSON content-type when body provided and not already
    if(opts.body && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }

    let res = null;
    try{
      res = await fetch(base + path, {
        method: opts.method || "GET",
        headers,
        body: opts.body,
      });
    }catch(err){
      return { res:null, data:null, error: (err && err.message) ? err.message : "Network error" };
    }

    let data = null;
    try{
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if(ct.includes("application/json")) data = await res.json();
      else data = await res.text();
    }catch{ data = null; }

    if(!res.ok){
      return { res, data, error: (data && data.detail) ? String(data.detail) : (res.status + " " + res.statusText) };
    }
    return { res, data, error:null };
  }

  // Convenience: fetch the currently authenticated user for a role
  async function fetchMe(role){
    const r = normRole(role) || getActiveRole();
    const out = await apiFetch('/me', { role: r, method: 'GET' });
    if(out && out.error) return null;
    const d = out ? out.data : null;
    if(!d) return null;
    // Backend may return {email, role, plan, ...} or {user: {...}}
    if(typeof d === 'object' && d.user && typeof d.user === 'object') return d.user;
    return (typeof d === 'object') ? d : null;
  }

  function pageEnforce(expectedRole){
    const want = normRole(expectedRole);
    const have = getActiveRole();
    if(!want) return true;
    if(have !== want) {
      // Switch active role for this page and sync legacy keys
      setActiveRole(want);
    }
    // If no token for expected role but other role has token, route appropriately
    const t = getToken(want);
    if(!t){
      // No session for this role -> go login page for role
      const next = encodeURIComponent(((location.pathname||"").split("/").pop()||"index.html"));
      try{ location.replace("login.html?role=" + want + "&next=" + next); }catch{}
      return false;
    }
    return true;
  }

  // Boot: align legacy token/user with page role so older scripts behave.
  try{ syncLegacyForRole(inferRoleFromUrl()); }catch{}

  window.KnowEasyAuth = {
    inferRoleFromUrl,
    getActiveRole,
    setActiveRole,
    getToken,
    setToken,
    getUser,
    setUser,
    clearSession,
    logout,
    syncLegacyForRole,
    loadConfig,
    apiFetch,
    fetchMe,
    pageEnforce,
  };
})();
