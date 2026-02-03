/* Payment history page (student only)
   - Uses KnowEasyAuth from core.js
*/

function fmtINR(amount) {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
  } catch {
    return `₹${amount || 0}`;
  }
}

function fmtDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString('en-IN', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function badge(label) {
  const s = String(label || '').toUpperCase();
  const cls = s === 'PAID' || s === 'SUCCESS' ? 'badge badge--good'
    : s === 'PENDING' ? 'badge badge--warn'
    : s === 'FAILED' ? 'badge badge--bad'
    : 'badge';
  return `<span class="${cls}">${s || '-'}</span>`;
}

async function loadPayments() {
  const loadingEl = document.getElementById('loading');
  const emptyEl = document.getElementById('empty');
  const listEl = document.getElementById('list');
  const rowsEl = document.getElementById('rows');
  const notStudentEl = document.getElementById('notStudent');
  const avatarBtn = document.getElementById('avatarBtn');

  const safeShow = (el, show) => { if (el) el.style.display = show ? '' : 'none'; };

  const unwrapUser = (d) => {
    if (!d) return null;
    if (d.user && typeof d.user === 'object') return d.user;
    return d;
  };

  const toInr = (amount_paise) => {
    const p = Number(amount_paise || 0);
    if (!Number.isFinite(p)) return 0;
    return Math.round(p / 100);
  };

  const normStatus = (s) => {
    const v = String(s || '').toLowerCase().trim();
    if (v === 'paid' || v === 'success') return 'PAID';
    if (v === 'created' || v === 'pending') return 'PENDING';
    if (v === 'failed' || v === 'error') return 'FAILED';
    if (v === 'active') return 'ACTIVE';
    return (s ? String(s).toUpperCase() : '-');
  };

  try {
    // Fetch /me to set avatar + role
    const { data: meRaw, error: meErr } = await window.KnowEasyAuth.apiFetch('/me', { method: 'GET' });
    if (meErr) throw new Error(meErr);
    const me = unwrapUser(meRaw);

    if (avatarBtn && me && me.email) {
      avatarBtn.textContent = String(me.email || 'A').trim().charAt(0).toUpperCase();
    }

    if (!me || me.role !== 'student') {
      safeShow(loadingEl, false);
      safeShow(listEl, false);
      safeShow(emptyEl, false);
      safeShow(notStudentEl, true);
      return;
    }

    // Fetch history
    const { data, error } = await window.KnowEasyAuth.apiFetch('/payments/history', { method: 'GET' });
    if (error) throw new Error(error);

    safeShow(loadingEl, false);

    const items = (data && data.items) ? data.items : [];
    if (!items.length) {
      safeShow(emptyEl, true);
      safeShow(listEl, false);
      return;
    }

    // Render to match payments_router.py response fields
    const html = items.map(p => {
      const type = String(p.payment_type || 'subscription').toUpperCase();
      const planSku = p.booster_sku ? String(p.booster_sku) : String(p.plan || '-');
      const amountInr = toInr(p.amount_paise);
      const status = normStatus(p.status);
      const orderId = p.razorpay_order_id || p.razorpay_payment_id || '-';

      // Optional extra info (not in table header but useful)
      const extra = [
        p.billing_cycle ? `Cycle: <b>${p.billing_cycle}</b>` : null,
        p.expires_at ? `Access till: <b>${fmtDate(p.expires_at)}</b>` : null,
        p.note ? `<span style="opacity:0.75;">${String(p.note)}</span>` : null,
      ].filter(Boolean).join('<br>');

      return `
        <tr>
          <td>${fmtDate(p.created_at)}</td>
          <td>${type}</td>
          <td>${planSku}${extra ? `<div style="margin-top:4px; font-size:12px; opacity:0.9;">${extra}</div>` : ''}</td>
          <td>${fmtINR(amountInr)}</td>
          <td>${badge(status)}</td>
          <td style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 12px;">${orderId}</td>
        </tr>`;
    }).join('');

    if (rowsEl) rowsEl.innerHTML = html;
    safeShow(listEl, true);
    safeShow(emptyEl, false);
  } catch (err) {
    console.error(err);
    safeShow(loadingEl, false);
    safeShow(listEl, false);
    safeShow(emptyEl, true);
    if (emptyEl) emptyEl.textContent = 'Could not load payments. Please refresh.';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadPayments();
});
