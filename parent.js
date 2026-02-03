/* Parent Dashboard (Phase-1 UI)
   - Link student using Parent Code
   - Show read-only analytics summary

   Stability rules:
   - Deterministic back navigation (in-app state via History API)
   - Parent always shown as Plan: Free; never show upgrade surfaces
   - Multiple kids supported; user selects which student to view
   - Smooth logout to parent-mode login
*/

(function(){
  "use strict";

  const FALLBACK_HOME = 'welcome.html';
  const LOGIN_URL = 'login.html?role=parent&next=parent.html';

  // -------- helpers --------
  function escapeHtml(s){
    return String(s==null?'' : s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function safeParseJSON(raw){
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }

  function showMsg(el, text, ok){
    if(!el) return;
    el.textContent = text || '';
    el.style.opacity = text ? '1' : '0';
    el.style.color = ok ? 'inherit' : '#b91c1c';
  }

  function emptyCard(text){
    const div = document.createElement('div');
    div.className = 'parent-empty';
    div.textContent = text;
    return div;
  }

  function metricCard(label, value, hint){
    const div = document.createElement('div');
    div.className = 'parent-metric';
    div.innerHTML = `
      <div class="parent-metric__label">${escapeHtml(label)}</div>
      <div class="parent-metric__value">${escapeHtml(value)}</div>
      ${hint ? `<div class="parent-metric__hint">${escapeHtml(hint)}</div>` : ''}
    `;
    return div;
  }

  // -------- DOM --------
  const authLine = document.getElementById('authLine');
  const loginBtn = document.getElementById('loginBtn');
  const logoutTextBtn = document.getElementById('logoutTextBtn');
  const switchRoleBtn = document.getElementById('switchRoleBtn');

  const linkCard = document.getElementById('linkCard');
  const codeInput = document.getElementById('codeInput');
  const linkBtn = document.getElementById('linkBtn');
  const clearBtn = document.getElementById('clearBtn');
  const linkMsg = document.getElementById('linkMsg');

  const parentBackBtn = document.getElementById('parentBackBtn');
  const backToStudentsBtn = document.getElementById('backToStudentsBtn');

  const studentsSection = document.getElementById('studentsSection');
  const studentsList = document.getElementById('studentsList');
  const analyticsSection = document.getElementById('analyticsSection');
  const analyticsGrid = document.getElementById('analyticsGrid');
  const activityList = document.getElementById('activityList');
  const parentMeta = document.getElementById('parentMeta');
  const insightsMeta = document.getElementById('insights');
  const insightsUpdated = document.getElementById('insightsUpdated');

  // Backwards compat reference
  const msgEl = linkMsg;

  // -------- State --------
  let user = null;
  let students = [];
  let selectedStudentId = null;

  function stateStudents(){ return { ke: 'parent', view: 'students' }; }
  function stateAnalytics(studentId){ return { ke: 'parent', view: 'analytics', studentId: String(studentId) }; }

  function currentView(){
    const st = history.state;
    if(st && st.ke === 'parent' && (st.view === 'students' || st.view === 'analytics')) return st.view;
    return 'students';
  }

  function setAuthUiLoggedOut(){
    if(authLine) authLine.textContent = 'Please login as Parent to view dashboard.';
    if(loginBtn) loginBtn.style.display = '';
    if(logoutTextBtn) logoutTextBtn.style.display = 'none';
    if(switchRoleBtn) switchRoleBtn.style.display = 'none';
    if(linkCard) linkCard.style.display = 'none';
    if(studentsSection) studentsSection.style.display = 'none';
    if(analyticsSection) analyticsSection.style.display = 'none';
  }

  function setAuthUiLoggedIn(email){
    if(authLine) authLine.innerHTML = `Logged in as <b>${escapeHtml(email||'Parent')}</b> • Parent role • Plan: <b>Free</b>`;
    if(loginBtn) loginBtn.style.display = 'none';
    if(logoutTextBtn) logoutTextBtn.style.display = '';
    if(switchRoleBtn) switchRoleBtn.style.display = 'none';
    if(linkCard) linkCard.style.display = '';
    if(studentsSection) studentsSection.style.display = '';
    if(analyticsSection) analyticsSection.style.display = '';
  }

  async function api(path, options){
    return await window.KnowEasyAuth.apiFetch(path, options || {method:'GET'});
  }

  // -------- Deterministic navigation --------
  function goStudents(push){
    selectedStudentId = null;
    // Hide analytics section content (keep section but collapse)
    if(analyticsSection) analyticsSection.style.display = 'none';
    if(studentsSection) studentsSection.style.display = '';

    if(push) {
      try { history.pushState(stateStudents(), '', 'parent.html'); } catch(_) {}
    } else {
      try { history.replaceState(stateStudents(), '', 'parent.html'); } catch(_) {}
    }

    // Scroll to students list (smooth)
    try {
      if(studentsSection) studentsSection.scrollIntoView({behavior:'smooth', block:'start'});
    } catch(_) {}
  }

  function goAnalytics(studentId, push){
    selectedStudentId = String(studentId);
    if(analyticsSection) analyticsSection.style.display = '';

    const url = `parent.html#student=${encodeURIComponent(selectedStudentId)}`;
    if(push){
      try { history.pushState(stateAnalytics(selectedStudentId), '', url); } catch(_) {}
    } else {
      try { history.replaceState(stateAnalytics(selectedStudentId), '', url); } catch(_) {}
    }

    try {
      if(analyticsSection) analyticsSection.scrollIntoView({behavior:'smooth', block:'start'});
    } catch(_) {}
  }

  function headerBack(){
    // If viewing analytics, go back to students list (in-app).
    // If URL hash points to a student analytics view but history.state is not set (direct load), treat as analytics.
    try{
      const m = String(window.location.hash||'').match(/student=([^&]+)/);
      if(m && m[1] && currentView() !== 'analytics'){
        goStudents(true);
        return;
      }
    }catch(_e){}

    if(currentView() === 'analytics'){
      goStudents(true);
      return;
    }
    // Else, leave the dashboard.
    window.location.href = FALLBACK_HOME;
  }

  window.addEventListener('popstate', (ev) => {
    const st = ev.state;
    if(!st || st.ke !== 'parent') return;

    if(st.view === 'students'){
      goStudents(false);
      return;
    }

    if(st.view === 'analytics' && st.studentId){
      // Restore analytics view without pushing new history
      const sid = String(st.studentId);
      const s = students.find(x => String(x.student_user_id || x.user_id || x.id) === sid);
      const name = s ? (s.full_name || s.name || 'Student') : 'Student';
      goAnalytics(sid, false);
      loadAnalytics(sid, name, s);
      return;
    }
  });

  // -------- Rendering --------
  function setSelectedCard(studentId){
    const sid = String(studentId);
    const cards = studentsList ? studentsList.querySelectorAll('[data-student-id]') : [];
    cards.forEach(el => {
      const id = el.getAttribute('data-student-id');
      if(!id) return;
      if(id === sid) el.classList.add('is-selected');
      else el.classList.remove('is-selected');
    });
  }

  function renderStudents(list){
    if(!studentsList) return;
    studentsList.innerHTML = '';

    if(!list || list.length === 0){
      studentsList.appendChild(emptyCard('No students linked yet. Use the Parent Code to link.'));
      if(parentMeta) parentMeta.textContent = 'No linked students';
      return;
    }

    if(parentMeta) parentMeta.textContent = `${list.length} linked student${list.length>1?'s':''}`;

    for(const s of list){
      const id = String(s.student_user_id || s.user_id || s.id || '');
      const card = document.createElement('div');
      card.className = 'parent-student';
      card.setAttribute('data-student-id', id);

      const hasName = !!(s.full_name || s.name);
      const name = (s.full_name || s.name || 'Not set yet');
      // Trust-first UX: if the student hasn't completed profile, show a clear prompt instead of a generic label.
      const meta = hasName
        ? `${s.board ? String(s.board).toUpperCase() : 'Board'} • Class ${s.class || '--'}`
        : 'Ask student to complete profile';

      card.innerHTML = `
        <div>
          <div class="parent-student__name">${escapeHtml(name)}</div>
          <div class="parent-student__meta">${escapeHtml(meta)}</div>
        </div>
        <div class="parent-badge">View</div>
      `;

      card.addEventListener('click', () => {
        if(!id) return;
        setSelectedCard(id);
        goAnalytics(id, true);
        loadAnalytics(id, name, s);
      });

      studentsList.appendChild(card);
    }
  }

  async function fetchStudents(){
    const {res, data, error} = await api('/parent/students', {method:'GET'});
    if(!res){
      showMsg(msgEl, (error && error.message) ? error.message : 'Cannot reach backend.', false);
      return null;
    }
    if(res.ok && data && Array.isArray(data.students)) return data.students;
    if(data && data.detail) showMsg(msgEl, `${data.detail} (HTTP ${res.status})`, false);
    return null;
  }

  async function loadAnalytics(studentId, studentName, studentObj){
    if(!analyticsGrid || !activityList) return;

    // Reset UI (quiet)
    analyticsGrid.innerHTML = '';
    activityList.innerHTML  = '';
    analyticsGrid.appendChild(emptyCard('Loading insights…'));
    activityList.appendChild(emptyCard('Loading recent activity…'));

    // Fetch summary
    let res = null, data = null;
    try{
      const out = await api(`/parent/analytics/summary?student_user_id=${encodeURIComponent(studentId)}`);
      res = out?.res ?? out;
      data = out?.data ?? null;
    }catch(_){
      res = null; data = null;
    }

    if(!res || !res.ok || !data){
      analyticsGrid.innerHTML = '';
      activityList.innerHTML  = '';
      analyticsGrid.appendChild(emptyCard('Insights not available right now.'));
      activityList.appendChild(emptyCard('No recent activity available.'));
      return;
    }

    // Header meta
    try{
      const label = studentName ? String(studentName) : 'Student';
      const meta  = studentObj ? `${studentObj.board ? String(studentObj.board).toUpperCase() : 'Board'} • Class ${studentObj.class || '--'}` : '';
      if(insightsMeta) insightsMeta.textContent = meta ? (`Viewing: ${label} • ${meta}`) : (`Viewing: ${label}`);
      if(insightsUpdated){
        const now = new Date();
        insightsUpdated.textContent = `Updated: ${now.toLocaleString()}`;
      }
    }catch(_){ }

    // Metrics
    analyticsGrid.innerHTML = '';
    activityList.innerHTML  = '';

    const mins7d   = data.time_spent_mins_7d ?? 0;
    const active7d = data.active_days_7d ?? 0;
    const tests30d = data.tests_attempted_30d ?? 0;
    const avg30d   = data.avg_score_30d ?? null;

    analyticsGrid.appendChild(metricCard('Study time (7d)', `${mins7d} min`));
    analyticsGrid.appendChild(metricCard('Active days (7d)', `${active7d} / 7`));
    analyticsGrid.appendChild(metricCard('Tests (30d)', `${tests30d}`));
    analyticsGrid.appendChild(metricCard('Avg score (30d)', avg30d === null ? '—' : `${avg30d}%`));

    // Recent activity
    const recent = Array.isArray(data.recent) ? data.recent : [];
    if(!recent.length){
      activityList.appendChild(emptyCard('No recent activity yet.'));
    } else {
      recent.slice(0, 10).forEach(ev => {
        const row = document.createElement('div');
        row.className = 'activity-row';

        const left = document.createElement('div');
        left.className = 'activity-left';

        const title = document.createElement('div');
        title.className = 'activity-title';
        title.textContent = String(ev.event_type || 'Activity').replaceAll('_',' ');

        const sub = document.createElement('div');
        sub.className = 'activity-sub';
        const dt = ev.created_at ? new Date(ev.created_at) : null;
        sub.textContent = (dt && !isNaN(dt.getTime())) ? dt.toLocaleString() : '';

        left.appendChild(title);
        left.appendChild(sub);
        row.appendChild(left);

        // Optional right badge
        if(ev.meta_json && typeof ev.meta_json === 'object'){
          const right = document.createElement('div');
          right.className = 'activity-right';
          if(ev.meta_json.subject) right.textContent = String(ev.meta_json.subject);
          row.appendChild(right);
        }

        activityList.appendChild(row);
      });
    }
  }

  async function linkStudent(){
    const code = (codeInput ? codeInput.value : '').trim();
    if(!code){
      showMsg(linkMsg, 'Please enter the Parent Code.', false);
      return;
    }
    showMsg(linkMsg, 'Linking…', true);

    const {res, data, error} = await api('/parent/link', {method:'POST', body: JSON.stringify({code})});
    if(!res){
      showMsg(linkMsg, (error && error.message) ? error.message : 'Cannot reach backend.', false);
      return;
    }

    if(res.ok && data && data.ok){
      showMsg(linkMsg, 'Linked successfully. Loading students…', true);
      if(codeInput) codeInput.value = '';
      await refreshStudents(true);
      return;
    }

    const msg = (data && (data.message || data.detail)) ? (data.message || data.detail) : `Could not link student (HTTP ${res.status}).`;
    showMsg(linkMsg, msg, false);
  }

  async function refreshStudents(afterLink){
    if(!studentsList || !analyticsGrid || !activityList) return;

    studentsList.innerHTML = '';
    analyticsGrid.innerHTML = '';
    activityList.innerHTML = '';

    const list = await fetchStudents();
    if(list === null){
      studentsList.appendChild(emptyCard('Students API not available right now.'));
      analyticsGrid.appendChild(emptyCard('Analytics will appear after linking.'));
      activityList.appendChild(emptyCard('No data yet.'));
      if(parentMeta) parentMeta.textContent = 'Waiting for backend';
      students = [];
      goStudents(false);
      return;
    }

    students = list;
    renderStudents(students);

    // If URL has #student=..., restore analytics
    const hash = String(location.hash || '');
    const m = hash.match(/student=([^&]+)/);
    const sid = m ? decodeURIComponent(m[1]) : null;

    if(sid){
      const s = students.find(x => String(x.student_user_id || x.user_id || x.id) === String(sid));
      if(s){
        setSelectedCard(String(sid));
        goAnalytics(String(sid), false);
        await loadAnalytics(String(sid), s.full_name || s.name || 'Student', s);
        return;
      }
    }

    // After linking, keep the parent on students list (do NOT auto-open first child)
    goStudents(false);
    if(afterLink && students.length === 1){
      // Optional: if exactly one child, we can keep list but also scroll a bit
      try { if(studentsSection) studentsSection.scrollIntoView({behavior:'smooth', block:'start'}); } catch(_) {}
    }
  }

  async function init(){
    // Hard lock: parent dashboard must only run with a parent session.
    try{
      if(window.KnowEasyAuth && window.KnowEasyAuth.pageEnforce){
        if(window.KnowEasyAuth.inferRoleFromUrl) window.KnowEasyAuth.setActiveRole('parent');
        if(window.KnowEasyAuth.pageEnforce('parent') === false) return;
      }
    }catch(_e){}

    // Hook buttons
    if(parentBackBtn) parentBackBtn.addEventListener('click', headerBack);
    if(backToStudentsBtn) backToStudentsBtn.addEventListener('click', () => goStudents(true));

    if(loginBtn) loginBtn.addEventListener('click', () => { window.location.href = LOGIN_URL; });
    function doLogout(){
      try{
        if(window.KnowEasyAuth){
          window.KnowEasyAuth.clearSession('parent');
          window.KnowEasyAuth.setActiveRole('student');
        }
      }catch(_e){}
      // Parent logout always returns to Welcome (role chooser)
      try{ window.location.href = 'welcome.html'; }catch(_e){ window.location.href = 'welcome.html'; }
    }
    if(logoutTextBtn) logoutTextBtn.addEventListener('click', doLogout);


    if(clearBtn) clearBtn.addEventListener('click', () => {
      if(codeInput) codeInput.value = '';
      showMsg(linkMsg, '', true);
    });

    if(linkBtn) linkBtn.addEventListener('click', linkStudent);

    // Establish baseline history state
    try {
      if(!history.state || history.state.ke !== 'parent'){
        history.replaceState(stateStudents(), '', 'parent.html');
      }
    } catch(_) {}

    // Resolve auth: prefer token -> /me over stale localStorage role
    user = window.KnowEasyAuth.getUser();
    if(!user){
      try{
        const me = await window.KnowEasyAuth.fetchMe();
        if(me){ window.KnowEasyAuth.setUser(me); user = me; }
      }catch(_){ }
    }

    if(!user){
      setAuthUiLoggedOut();
      window.location.href = LOGIN_URL;
      return;
    }

    const role = String(user.role || '').toLowerCase();
    if(role !== 'parent'){
      // If logged-in as student, do not show mixed UI.
      window.location.href = 'me.html';
      return;
    }

    setAuthUiLoggedIn(user.email || 'Parent');
    await refreshStudents(false);
    // If opened directly with #student=ID, restore that student view after loading list.
    try{
      const m = String(window.location.hash||'').match(/student=([^&]+)/);
      if(m && m[1]){
        const sid = decodeURIComponent(m[1]);
        const s = students.find(x => String(x.student_user_id || x.user_id || x.id) === String(sid));
        if(s){
          const name = s.full_name || s.name || 'Student';
          setSelectedCard(sid);
          goAnalytics(sid, false);
          loadAnalytics(sid, name, s);
        }else{
          goStudents(false);
        }
      }
    }catch(_e){}

    // If opened directly with #student=ID, restore that student view after loading list.
    try{
      const m = String(window.location.hash||'').match(/student=([^&]+)/);
      if(m && m[1]){
        const sid = decodeURIComponent(m[1]);
        const s = students.find(x => String(x.student_user_id || x.user_id || x.id) === String(sid));
        const name = s ? (s.full_name || s.name || 'Student') : 'Student';
        if(s){
          setSelectedCard(sid);
          goAnalytics(sid, false);
          loadAnalytics(sid, name, s);
        }
      }
    }catch(_e){}

  }

  // Guard: if KnowEasyAuth not loaded, avoid console errors
  if(!window.KnowEasyAuth){
    window.location.href = LOGIN_URL;
    return;
  }

  init();
})();
