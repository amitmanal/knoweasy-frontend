/**
 * KnowEasy Blueprint Renderer v1
 * - Renders Answer Blueprint (cards + reveal) per Appendix E
 * - Backward compatible with legacy {sections:[]}
 */
(function(){
  'use strict';

  function esc(s){
    s = String(s == null ? '' : s);
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function ensureStyles(){
    if (document.getElementById('ke-blueprint-style')) return;
    const css = `
      .ke-answer{display:block}
      .ke-answer__topbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0 14px}
      .ke-reveal{display:flex;gap:6px;background:rgba(255,255,255,.6);border:1px solid rgba(0,0,0,.08);border-radius:999px;padding:4px}
      .ke-reveal__btn{border:0;background:transparent;padding:8px 10px;border-radius:999px;cursor:pointer;font-weight:600;font-size:12px;color:#0f172a;opacity:.7}
      .ke-reveal__btn--active{background:rgba(15,23,42,.06);opacity:1}
      .ke-card{background:rgba(255,255,255,.7);border:1px solid rgba(0,0,0,.08);border-radius:16px;padding:14px 14px;margin:10px 0;box-shadow:0 10px 24px rgba(15,23,42,.06)}
      .ke-card__kicker{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:rgba(15,23,42,.55);margin-bottom:6px}
      .ke-card__title{font-size:15px;font-weight:700;color:#0f172a;margin:0 0 8px}
      .ke-card__body{font-size:14px;line-height:1.55;color:#0f172a;white-space:pre-wrap}
      .ke-visual{margin-top:10px;border-radius:14px;border:1px solid rgba(0,0,0,.08);background:rgba(255,255,255,.65);padding:10px;overflow:auto}
      .ke-mermaid{white-space:pre; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size:12px;}
      .ke-badge{font-size:12px;color:rgba(15,23,42,.65)}
    `;
    const style = document.createElement('style');
    style.id = 'ke-blueprint-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function revealRank(r){
    if (r === 'R0') return 0;
    if (r === 'R2') return 2;
    return 1;
  }

  function renderMermaid(code){
    const wrap = document.createElement('div');
    wrap.className = 'ke-visual';
    const pre = document.createElement('div');
    pre.className = 'ke-mermaid mermaid';
    pre.textContent = code;
    wrap.appendChild(pre);
    return wrap;
  }

  function renderVisual(visual){
    if (!visual) return null;
    if (visual.kind === 'mermaid' && visual.code){
      return renderMermaid(visual.code);
    }
    if (visual.kind === 'text' && visual.text){
      const wrap = document.createElement('div');
      wrap.className='ke-visual';
      wrap.textContent = visual.text;
      return wrap;
    }
    return null;
  }

  class PremiumRenderer {
    static render(data, container){
      ensureStyles();
      if (!container) return;
      container.innerHTML = '';
      container.classList.add('ke-answer');

      // Prefer Blueprint
      const blueprint = data && (data.blueprint || (data.learning_object && data.learning_object.blueprint));
      if (blueprint && Array.isArray(blueprint.cards)){
        this.renderBlueprint(blueprint, data, container);
      } else if (data && Array.isArray(data.sections)){
        this.renderLegacySections(data, container);
      } else if (data && (data.final_answer || data.answer)){
        this.renderPlainText(String(data.final_answer || data.answer), container);
      } else {
        container.innerHTML = '<div class="ke-card"><div class="ke-card__title">Error</div><div class="ke-card__body">Invalid response format.</div></div>';
      }

      // Mermaid render
      if (window.mermaid && typeof window.mermaid.run === 'function'){
        try{ window.mermaid.run(); }catch(_e){}
      }
    }

    static renderBlueprint(blueprint, data, container){
      const top = document.createElement('div');
      top.className='ke-answer__topbar';

      const badge = document.createElement('div');
      badge.className='ke-badge';
      const meta = (data && data.meta) || (blueprint && blueprint.meta) || {};
      const verified = meta.verified;
      badge.textContent = verified ? 'Verified for exam safety' : 'Exam-safe format';
      top.appendChild(badge);

      const seg = document.createElement('div');
      seg.className='ke-reveal';
      const levels = [
        {id:'R0', label:'Overview'},
        {id:'R1', label:'Guided'},
        {id:'R2', label:'Full'}
      ];
      let current='R1';
      function setLevel(l){
        current=l;
        Array.from(seg.querySelectorAll('button')).forEach(b=>{
          b.classList.toggle('ke-reveal__btn--active', b.dataset.level===l);
        });
        Array.from(container.querySelectorAll('[data-reveal-min]')).forEach(el=>{
          const min = el.getAttribute('data-reveal-min') || 'R1';
          el.style.display = revealRank(current) >= revealRank(min) ? '' : 'none';
        });
      }
      levels.forEach(l=>{
        const b=document.createElement('button');
        b.type='button';
        b.className='ke-reveal__btn' + (l.id==='R1' ? ' ke-reveal__btn--active':'');
        b.textContent=l.label;
        b.dataset.level=l.id;
        b.addEventListener('click', ()=>setLevel(l.id));
        seg.appendChild(b);
      });
      top.appendChild(seg);
      container.appendChild(top);

      (blueprint.cards||[]).forEach(card=>{
        const cardEl=document.createElement('div');
        cardEl.className='ke-card';
        cardEl.setAttribute('data-reveal-min', card.reveal_min || 'R1');

        const kicker=document.createElement('div');
        kicker.className='ke-card__kicker';
        kicker.textContent=(card.type||'').toString().replace(/_/g,' ');
        cardEl.appendChild(kicker);

        const title=document.createElement('div');
        title.className='ke-card__title';
        title.textContent=card.title || '';
        cardEl.appendChild(title);

        if (card.content){
          const body=document.createElement('div');
          body.className='ke-card__body';
          body.innerText = card.content;
          cardEl.appendChild(body);
        }

        const v = renderVisual(card.visual);
        if (v) cardEl.appendChild(v);

        container.appendChild(cardEl);
      });

      // Apply initial reveal state
      setLevel('R1');
    }

    static renderLegacySections(data, container){
      // Minimal calm rendering for legacy sections
      const title = data.title ? `<div class="ke-card" data-reveal-min="R0"><div class="ke-card__kicker">Title</div><div class="ke-card__title">${esc(data.title)}</div></div>` : '';
      container.insertAdjacentHTML('beforeend', title);
      if (data.why_this_matters){
        container.insertAdjacentHTML('beforeend', `<div class="ke-card" data-reveal-min="R0"><div class="ke-card__kicker">Why it matters</div><div class="ke-card__body">${esc(data.why_this_matters)}</div></div>`);
      }
      (data.sections||[]).forEach(s=>{
        const min = (s.type==='steps' ? 'R2' : 'R1');
        container.insertAdjacentHTML('beforeend', `<div class="ke-card" data-reveal-min="${min}"><div class="ke-card__kicker">${esc(s.type||'')}</div><div class="ke-card__title">${esc(s.title||'')}</div><div class="ke-card__body">${esc(s.content||'')}</div></div>`);
      });
    }

    static renderPlainText(text, container){
      container.innerHTML = `<div class="ke-card"><div class="ke-card__title">Answer</div><div class="ke-card__body">${esc(text)}</div></div>`;
    }
  }

  window.PremiumRenderer = PremiumRenderer;
})();
