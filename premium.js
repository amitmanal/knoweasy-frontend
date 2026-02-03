// premium.js (patched v1)
// Uses One AI Brain via KE.postSolve and renders AnswerObject/sections via PremiumRenderer

document.addEventListener('DOMContentLoaded', () => {
  const askBtn = document.getElementById('askBtn');
  const questionInput = document.getElementById('questionInput');
  const modeSelect = document.getElementById('modeSelect');
  const boardSelect = document.getElementById('boardSelect');
  const classSelect = document.getElementById('classSelect');
  const subjectSelect = document.getElementById('subjectSelect');
  const result = document.getElementById('result');

  function setStatus(html){
    if (!result) return;
    result.innerHTML = html || '';
  }

  async function solve(){
    const q = String(questionInput && questionInput.value || '').trim();
    if (!q) return;

    const answer_mode = String((modeSelect && modeSelect.value) || 'tutor').toLowerCase();
    const board = String((boardSelect && boardSelect.value) || '').trim();
    const klass = String((classSelect && classSelect.value) || '').trim();
    const subject = String((subjectSelect && subjectSelect.value) || '').trim();

    setStatus('<div class="ke-note">Thinking…</div>');

    try{
      if (!window.KE || typeof window.KE.postSolve !== 'function') {
        throw new Error('KE_NOT_READY');
      }
      const data = await window.KE.postSolve({
        question: q,
        board,
        klass,
        subject,
        study_mode: 'chat',
        answer_mode,
        surface: 'premium'
      });

      if (window.PremiumRenderer && typeof window.PremiumRenderer.render === 'function') {
        window.PremiumRenderer.render(data, result);
      } else if (window.KE && typeof window.KE.renderAnswer === 'function') {
        window.KE.renderAnswer(result, data);
      } else {
        setStatus('<pre style="white-space:pre-wrap">' + (data ? JSON.stringify(data, null, 2) : 'No response') + '</pre>');
      }
    }catch(e){
      console.error('[Premium] solve failed', e);
      const offline = !navigator.onLine || (e && /Failed to fetch/i.test(e.message || ''));
      if (offline) {
        setStatus('<div class="ke-note"><b>You are offline.</b> Please reconnect and try again.</div>');
      } else {
        setStatus('<div class="ke-note"><b>Could not solve.</b> Please try again.</div>');
      }
    }
  }

  if (askBtn) askBtn.addEventListener('click', solve);
  if (questionInput) {
    questionInput.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') solve();
    });
  }
});
