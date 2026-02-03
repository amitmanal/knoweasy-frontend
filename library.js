(function(){
  'use strict';
  const $ = (id) => document.getElementById(id);
  const statusEl = $('libStatus');
  const listEl = $('libList');

  function setStatus(msg){
    if(statusEl) statusEl.textContent = msg || '';
  }

  function bearer(){
    try{
      const t = (window.KnowEasyAuth && window.KnowEasyAuth.getToken) ? window.KnowEasyAuth.getToken() : '';
      return t ? ('Bearer ' + t) : '';
    }catch{ return ''; }
  }

  async function api(path, opts){
    const KE = window.KE;
    if(!KE || !KE.fetchJson) throw new Error('KE not ready');
    const headers = Object.assign({}, (opts && opts.headers) || {});
    const b = bearer();
    if(b) headers['Authorization'] = b;
    return await KE.fetchJson(KE.apiUrl(path), Object.assign({}, opts||{}, { headers }));
  }

  function card(item){
    const wrap = document.createElement('div');
    wrap.className = 'ke-card';
    wrap.style.padding = '12px';
    wrap.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
        <div style="min-width:0;">
          <div style="font-weight:700; margin-bottom:4px; word-break:break-word;">${escapeHtml(item.title || 'Untitled')}</div>
          <div style="font-size:13px; opacity:.8; margin-bottom:6px;">
            <span style="text-transform:uppercase; letter-spacing:.06em;">${escapeHtml(item.doc_type || 'link')}</span>
            <span style="margin:0 8px;">•</span>
            <span>${escapeHtml(item.created_at || '')}</span>
          </div>
          <a href="${escapeAttr(item.file_url || '#')}" target="_blank" rel="noopener" style="font-size:13px; word-break:break-all;">Open</a>
        </div>
        <button class="ke-btn" data-del="${item.id}" type="button">Delete</button>
      </div>
    `;
    const btn = wrap.querySelector('button[data-del]');
    if(btn){
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-del');
        if(!id) return;
        btn.disabled = true;
        try{
          await api('/api/luma/catalog/' + encodeURIComponent(id), { method:'DELETE' });
          await refresh();
        }catch(e){
          console.warn(e);
          setStatus('Delete failed (check login).');
        }finally{
          btn.disabled = false;
        }
      });
    }
    return wrap;
  }

  function escapeHtml(s){
    return String(s||'').replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function escapeAttr(s){ return escapeHtml(s).replace(/\s/g,'%20'); }

  async function refresh(){
    setStatus('Loading…');
    listEl.innerHTML = '';
    try{
      const data = await api('/api/luma/catalog?limit=50', { method:'GET' });
      if(!data || data.ok !== true){
        setStatus((data && data.error) ? ('Error: ' + data.error) : 'Unable to load library (check login).');
        return;
      }
      const items = data.items || [];
      if(!items.length){
        setStatus('No items yet.');
        return;
      }
      setStatus('');
      items.forEach(it => listEl.appendChild(card(it)));
    }catch(e){
      console.warn(e);
      setStatus('Unable to load library (check login).');
    }
  }

  async function addItem(){
    const title = ($('libTitle').value || '').trim();
    const url = ($('libUrl').value || '').trim();
    const docType = ($('libType').value || 'link').trim();
    if(!url){
      setStatus('Please paste a URL.');
      return;
    }
    setStatus('Saving…');
    try{
      const payload = { title: title || 'Untitled', file_url: url, doc_type: docType, source:'user', file_key: '' };
      const data = await api('/api/luma/catalog', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
      if(!data || data.ok !== true){
        setStatus((data && data.error) ? ('Error: ' + data.error) : 'Save failed.');
        return;
      }
      $('libTitle').value = '';
      $('libUrl').value = '';
      setStatus('Saved.');
      await refresh();
    }catch(e){
      console.warn(e);
      setStatus('Save failed (check login).');
    }
  }

  function boot(){
    try{
      // Require login on this page
      if(window.KnowEasyAuth && window.KnowEasyAuth.pageEnforce){
        window.KnowEasyAuth.pageEnforce('student');
      }
    }catch{}
    const btn = $('btnAddLib');
    if(btn) btn.addEventListener('click', addItem);
    refresh();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();