/* upgrade.js

Production-grade Upgrade + Booster purchase flow.

Key rules implemented:
- Always use Bearer token via KnowEasyAuth.apiFetch
- If not logged in: disable plan/booster buttons and redirect to login
- If already on Pro: Pro button becomes "Current Plan" and disabled
- If already on Max: both Pro/Max buttons disabled (Max = current)
- Purchasing (renewal/upgrade) extends validity on server (no losing remaining time)
- Show plan validity (expires_at)
*/

(function () {
  "use strict";

  const planText = document.getElementById("planText");
  const planBadge = document.getElementById("planBadge");
  const creditsText = document.getElementById("creditsText");
  const validityText = document.getElementById("validityText");
  const msgEl = document.getElementById("msg");
  const boosterList = document.getElementById("boosterList");
  const proPriceText = document.getElementById("proPriceText");
  const maxPriceText = document.getElementById("maxPriceText");

  // Billing cycle radios (Monthly/Yearly)
  function getCycleRadios() {
    return Array.from(document.querySelectorAll('input[name="billingCycle"]'));
  }

  const DISPLAY_PRICING = {
    pro: { monthly_inr: 249, yearly_inr: 2999 },
    max: { monthly_inr: 499, yearly_inr: 4999 },
  };

  // Local view-state
  let currentSub = null; // subscription object from backend
  let currentWallet = null; // wallet from backend
  let activeSub = null; // current active subscription (status=active), if any
  let isAuthed = false;

  function getBillingCycle() {
    const checked = document.querySelector('input[name="billingCycle"]:checked');
    const v = (checked && checked.value) ? String(checked.value).toLowerCase() : "monthly";
    return v === "yearly" ? "yearly" : "monthly";
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "—";
      // e.g. 15 Jan 2026
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
    } catch {
      return "—";
    }
  }

  function isActiveSub(sub) {
    if (!sub) return false;
    const status = String(sub.status || "").toLowerCase();
    const exp = sub.expires_at ? new Date(sub.expires_at).getTime() : 0;
    return status === "active" && exp > Date.now();
  }

  function effectivePlan() {
    if (!isActiveSub(currentSub)) return "free";
    const p = String(currentSub.plan || "free").toLowerCase().trim();
    return p || "free";
  }

  function showMsg(text, isError) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.style.display = "block";
    msgEl.style.background = isError ? "#b42318" : "#0b1220";
    msgEl.style.color = "#fff";
    clearTimeout(showMsg._t);
    showMsg._t = setTimeout(() => {
      msgEl.style.display = "none";
    }, 4000);
  }

  function setButtonsDisabled(disabled) {
    document.querySelectorAll("button[data-plan], #boosterList button").forEach((b) => {
      b.disabled = !!disabled;
      b.style.opacity = disabled ? "0.6" : "1";
      b.style.cursor = disabled ? "not-allowed" : "pointer";
    });
  }

  function applyPricingLabels() {
    const cycle = getBillingCycle();
    const pro = DISPLAY_PRICING.pro;
    const max = DISPLAY_PRICING.max;
    if (proPriceText) {
      proPriceText.textContent = cycle === "yearly" ? `Yearly (₹${pro.yearly_inr}/yr)` : `Monthly (₹${pro.monthly_inr}/mo)`;
    }
    if (maxPriceText) {
      maxPriceText.textContent = cycle === "yearly" ? `Yearly (₹${max.yearly_inr}/yr)` : `Monthly (₹${max.monthly_inr}/mo)`;
    }
  }

  function applyPlanButtons() {
    const plan = effectivePlan();
    const subActive = isActiveSub(currentSub);
    const selectedCycle = getBillingCycle();
    const currentCycle = (currentSub && currentSub.billing_cycle) ? String(currentSub.billing_cycle).toLowerCase() : '';
    const cycleHint = document.getElementById('cycleHint');
    const radios = getCycleRadios();
    // Trust behavior:
    // If an active subscription exists, billing cycle is locked to the current cycle
    // to prevent accidental double charges or confusion.
    if (subActive && currentCycle) {
      radios.forEach(r => {
        const val = String(r.value || '').toLowerCase();
        const isCurrent = val === currentCycle;
        r.disabled = !isCurrent;
        if (isCurrent) r.checked = true;
        if (r.parentElement) r.parentElement.style.opacity = isCurrent ? '1' : '0.45';
      });

      if (cycleHint) {
        const exp = currentSub && currentSub.expires_at ? new Date(currentSub.expires_at) : null;
        const expTxt = exp && !isNaN(exp.getTime()) ? exp.toLocaleDateString() : null;
        cycleHint.style.display = 'block';
        cycleHint.innerHTML = `<b>Active plan:</b> ${currentCycle.toUpperCase()}${expTxt ? ` (access till ${expTxt})` : ''}. <span style="opacity:0.9">Billing cycle is locked until expiry.</span>`;
      }
    } else {
      radios.forEach(r => {
        r.disabled = false;
        if (r.parentElement) r.parentElement.style.opacity = '0.9';
      });
      if (cycleHint) cycleHint.style.display = 'none';
    }

    const proBtn = document.querySelector('button[data-plan="pro"]');
    const maxBtn = document.querySelector('button[data-plan="max"]');

    // Default
    if (proBtn) {
      proBtn.disabled = !isAuthed;
      proBtn.textContent = "Upgrade to Pro";
      proBtn.style.opacity = proBtn.disabled ? "0.6" : "1";
    }
    if (maxBtn) {
      maxBtn.disabled = !isAuthed;
      maxBtn.textContent = "Upgrade to Max";
      maxBtn.style.opacity = maxBtn.disabled ? "0.6" : "1";
    }

    if (!isAuthed) return;

    // If no active subscription, allow purchases
    if (!subActive || plan === "free") {
      return;
    }

    if (plan === "pro") {
      if (proBtn) {
        proBtn.disabled = true;
        proBtn.textContent = "Current Plan";
        proBtn.style.opacity = "0.6";
      }
      if (maxBtn) {
        maxBtn.disabled = false;
        maxBtn.textContent = "Upgrade to Max";
        maxBtn.style.opacity = "1";
      }
      return;
    }

    if (plan === "max") {
      if (proBtn) {
        proBtn.disabled = true;
        proBtn.textContent = "Included in Max";
        proBtn.style.opacity = "0.6";
      }
      if (maxBtn) {
        maxBtn.disabled = true;
        maxBtn.textContent = "Current Plan";
        maxBtn.style.opacity = "0.6";
      }
      return;
    }
  }

  function redirectToLogin() {
    const next = encodeURIComponent("upgrade.html");
    window.location.href = `login.html?role=student&next=${next}`;
  }

  async function loadCurrentPlan() {
    try {
      // Upgrade is a student-only surface.
      const token = window.KnowEasyAuth && window.KnowEasyAuth.getToken ? window.KnowEasyAuth.getToken('student') : null;
      isAuthed = !!token;

      if (!isAuthed) {
        planText.textContent = "Please login";
        planBadge.textContent = "—";
        creditsText.textContent = "Credits: —";
        validityText.textContent = "Validity: —";
        setButtonsDisabled(true);
        await loadBoosterPacks();
        return;
      }

      // /billing/me gives subscription+wallet+packs
      const { res, data, error } = await window.KnowEasyAuth.apiFetch("/payments/me", {
        method: "GET",
        noAuthRedirect: true,
      });
      if (error) throw new Error(error.message || "Network error");
      if (!res) throw new Error("No response");
      if (res.status === 401) {
        window.KnowEasyAuth.logout && window.KnowEasyAuth.logout();
        redirectToLogin();
        return;
      }
      if (!res.ok || !data || !data.ok) throw new Error((data && data.detail) || "Failed to load" );

      currentSub = data.subscription || null;
      currentWallet = data.wallet || null;

      const plan = effectivePlan();
      const planNice = plan === "free" ? "Free" : (plan.charAt(0).toUpperCase() + plan.slice(1));
      planBadge.textContent = plan.toUpperCase();

      const rawCycle = (currentSub && currentSub.billing_cycle) ? String(currentSub.billing_cycle).toLowerCase() : ((currentWallet && currentWallet.billing_cycle) ? String(currentWallet.billing_cycle).toLowerCase() : "");
      const cycle = rawCycle === "yearly" ? "Yearly" : (rawCycle === "monthly" ? "Monthly" : "Monthly");

      // Support both old + new wallet field names (backward compatible)
      const includedTotal = Number((currentWallet && (currentWallet.included_total ?? currentWallet.plan_included ?? currentWallet.included ?? 0)) ?? 0);
      const includedRemaining = Number((currentWallet && (currentWallet.included_remaining ?? currentWallet.plan_remaining ?? currentWallet.remaining ?? currentWallet.included_credits_balance ?? 0)) ?? 0);
      const booster = Number((currentWallet && (currentWallet.booster_remaining ?? currentWallet.booster ?? currentWallet.booster_credits_balance ?? 0)) ?? 0);
      const used = Math.max(0, includedTotal - includedRemaining);
      const pct = (includedTotal > 0) ? Math.max(0, Math.min(100, Math.round((used / includedTotal) * 100))) : 0;

      const cycleEnd = currentWallet && (currentWallet.cycle_end_at || currentWallet.resets_on || currentWallet.reset_on) ? (currentWallet.cycle_end_at || currentWallet.resets_on || currentWallet.reset_on) : null;
      const resetTxt = cycleEnd ? `Resets on <b>${fmtDate(cycleEnd)}</b>.` : "Resets every billing cycle.";

      // Plan header: calm, Google-like chips + a tiny progress bar
      planText.innerHTML = `
        <div class="ke-chip-row" style="margin-top:6px">
          <span class="ke-chip ke-chip--solid">Plan: <b>${planNice}</b></span>
          <span class="ke-chip">Cycle: <b>${cycle}</b></span>
          ${booster > 0 ? `<span class="ke-chip ke-chip--badge">Booster: <b>${booster}</b> (never expires)</span>` : `<span class="ke-chip ke-chip--badge">Booster never expires</span>`}
        </div>
      `;

      // Included progress (only if known)
      if (includedTotal > 0 || includedRemaining > 0) {
        creditsText.innerHTML = `
          <div class="ke-mini-card" style="margin-top:10px">
            <div class="ke-progress-head">
              <div class="ke-progress-title">Included credits</div>
              <div class="ke-progress-meta"><b>${includedRemaining}</b> left • ${used}/${includedTotal} used</div>
            </div>
            <div class="ke-progress"><div class="ke-progress__fill" style="width:${pct}%;"></div></div>
            <div class="ke-progress-sub">${resetTxt} Booster credits <b>never expire</b>. <span style="opacity:0.9">Typical doubt costs ~80–150 credits.</span></div>
          </div>
        `;
      } else {
        creditsText.innerHTML = `<div style="opacity:0.75;margin-top:6px;font-size:13px">Included credits reset every billing cycle. Booster credits <b>never expire</b>.</div>`;
      }


      if (isActiveSub(currentSub)) {
        validityText.textContent = `Plan access till ${fmtDate(currentSub.expires_at)} (subscription period)`;
      } else if (currentSub && currentSub.expires_at) {
        validityText.textContent = `Plan expired on ${fmtDate(currentSub.expires_at)}`;
      } else {
        validityText.textContent = "Validity: —";
      }

      setButtonsDisabled(false);
      applyPlanButtons();
      await loadBoosterPacks();
    } catch (e) {
      console.error(e);
      showMsg(e.message || "Failed to load", true);
      setButtonsDisabled(true);
    }
  }

  async function startPlanCheckout(targetPlan) {
    if (!isAuthed) {
      showMsg("Please login to continue.", true);
      redirectToLogin();
      return;
    }

    const planNow = effectivePlan();
    if (planNow === "max") {
      showMsg("You are already on Max.", true);
      return;
    }
    if (planNow === "pro" && targetPlan === "pro") {
      showMsg("You are already on Pro.", true);
      return;
    }

    const billing_cycle = getBillingCycle();
    const currentCycle = (currentSub && currentSub.billing_cycle) ? String(currentSub.billing_cycle).toLowerCase() : '';

    // If an active subscription exists, cycle is locked to currentCycle (backend enforces this too).
    // If UI is somehow out-of-sync, we auto-correct to the current cycle for a trust-safe flow.
    if (isActiveSub(currentSub) && currentCycle && billing_cycle !== currentCycle) {
      // Auto-correct radio selection
      getCycleRadios().forEach(r => {
        const v = String(r.value || '').toLowerCase();
        r.checked = (v === currentCycle);
      });
      showMsg(`Billing cycle is locked to ${currentCycle.toUpperCase()} until your plan expires.`, true);
      setButtonsDisabled(false);
      applyPlanButtons();
      return;
    }

    setButtonsDisabled(true);
    showMsg("Starting payment…", false);

    try {
      const { res: oRes, data: order, error: oErr } = await window.KnowEasyAuth.apiFetch("/payments/create_order", {
        method: "POST",
        body: JSON.stringify({ plan: targetPlan, billing_cycle }),
      });

      if (oErr) throw new Error(oErr.message || "Network error");
      if (!oRes) throw new Error("No response from server");
      if (oRes.status === 401) {
        window.KnowEasyAuth.logout && window.KnowEasyAuth.logout();
        showMsg("Session expired. Please login again.", true);
        setTimeout(redirectToLogin, 500);
        return;
      }
      if (!oRes.ok || !order || !order.ok) {
        // Trust-first error messages from server (409 used for blocked actions)
        const detail = (order && order.detail) ? String(order.detail) : "Order creation failed";
        throw new Error(detail);
      }

      if (!window.Razorpay) {
        throw new Error("Razorpay SDK not loaded");
      }

      const opts = {
        key: order.key_id,
        amount: order.amount_paise || order.amount,
        currency: order.currency || "INR",
        name: "KnowEasy",
        description: `${targetPlan.toUpperCase()} (${billing_cycle})`,
        order_id: order.order_id,
        handler: async function (response) {
          try {
            showMsg("Verifying payment…", false);
            const { res: vRes, data: vData, error: vErr } = await window.KnowEasyAuth.apiFetch("/payments/verify", {
              method: "POST",
              body: JSON.stringify({
                plan: targetPlan,
                billing_cycle,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            if (vErr) throw new Error(vErr.message || "Network error");
            if (!vRes) throw new Error("No response from server");
            if (vRes.status === 401) {
              window.KnowEasyAuth.logout && window.KnowEasyAuth.logout();
              showMsg("Session expired. Please login again.", true);
              setTimeout(redirectToLogin, 500);
              return;
            }
            if (!vRes.ok || !vData || !vData.ok) throw new Error((vData && vData.detail) || "Verification failed");

            showMsg("Payment successful. Plan updated.", false);
            await loadCurrentPlan();
          } catch (err) {
            console.error(err);
            showMsg(err.message || "Verification failed", true);
            setButtonsDisabled(false);
            applyPlanButtons();
          }
        },
        modal: {
          ondismiss: function () {
            showMsg("Payment cancelled.", true);
            setButtonsDisabled(false);
            applyPlanButtons();
          },
        },
        theme: { color: "#1f2937" },
      };

      // UX note for Pro -> Max: we keep remaining validity on server by extending from current expiry
      if (effectivePlan() === "pro" && targetPlan === "max") {
        showMsg("Upgrading keeps your remaining validity (it will be extended).", false);
      }

      const rzp = new window.Razorpay(opts);
      rzp.open();
    } catch (e) {
      console.error(e);
      showMsg(e.message || "Payment failed", true);
      setButtonsDisabled(false);
      applyPlanButtons();
    }
  }

  async function loadBoosterPacks() {
    try {
      if (!boosterList) return;
      boosterList.innerHTML = "";

      if (!isAuthed) {
        boosterList.innerHTML = '<div class="card" style="padding:14px;opacity:0.8">Login to buy Booster Packs.</div>';
        return;
      }

      const plan = effectivePlan();
      if (plan === "free") {
        boosterList.innerHTML = '<div class="card" style="padding:14px;opacity:0.8">Booster Packs are available only for Pro/Max.</div>';
        return;
      }

      const { res, data, error } = await window.KnowEasyAuth.apiFetch("/billing/booster/packs", {
        method: "GET",
        noAuthRedirect: true,
      });
      if (error) throw new Error(error.message || "Network error");
      if (!res) throw new Error("No response");
      if (res.status === 401) {
        window.KnowEasyAuth.logout && window.KnowEasyAuth.logout();
        redirectToLogin();
        return;
      }
      if (!res.ok || !data || !data.ok) throw new Error("Failed to load booster packs");

      const packs = data.packs || [];
      if (!packs.length) {
        boosterList.innerHTML = '<div class="card" style="padding:14px;opacity:0.8">No booster packs available right now.</div>';
        return;
      }

      packs.forEach((p) => {
        const card = document.createElement("div");
        card.className = "card";
        card.style.padding = "14px";

        const sku = String(p.sku || "").toUpperCase();
        const credits = p.credits_units != null ? Number(p.credits_units) : 0;
        const pricePaise = p.price_paise != null ? Number(p.price_paise) : 0;
        const priceInr = Math.round(pricePaise / 100);

        card.innerHTML = `
          <div style="font-weight:800;letter-spacing:0.3px">${sku}</div>
          <div style="opacity:0.85;margin-top:6px">+${credits} AI credits</div>
          <div style="margin-top:8px;font-weight:700">₹${priceInr}</div>
          <button class="btn" style="width:100%;margin-top:12px" data-booster-sku="${sku}">Buy Booster</button>
        `;

        const btn = card.querySelector("button");
        btn.addEventListener("click", () => startBoosterCheckout(sku));
        boosterList.appendChild(card);
      });
    } catch (e) {
      console.error(e);
      if (boosterList) boosterList.innerHTML = '<div class="card" style="padding:14px;opacity:0.8">Could not load booster packs.</div>';
    }
  }

  async function startBoosterCheckout(sku) {
    if (!isAuthed) {
      showMsg("Please login to continue.", true);
      redirectToLogin();
      return;
    }

    const plan = effectivePlan();
    if (plan === "free") {
      showMsg("Booster packs are available only for Pro/Max.", true);
      return;
    }

    if (!sku) {
      showMsg("Invalid booster pack.", true);
      return;
    }

    setButtonsDisabled(true);
    showMsg("Starting booster purchase…", false);

    try {
      const { res: oRes, data: order, error: oErr } = await window.KnowEasyAuth.apiFetch("/billing/booster/create_order", {
        method: "POST",
        body: JSON.stringify({ sku }),
      });

      if (oErr) throw new Error(oErr.message || "Network error");
      if (!oRes) throw new Error("No response from server");
      if (oRes.status === 401) {
        window.KnowEasyAuth.logout && window.KnowEasyAuth.logout();
        showMsg("Session expired. Please login again.", true);
        setTimeout(redirectToLogin, 500);
        return;
      }
      if (!oRes.ok || !order || !order.ok) throw new Error((order && order.detail) || "Booster order failed");

      if (!window.Razorpay) throw new Error("Razorpay SDK not loaded");

      const opts = {
        key: order.key_id,
        amount: order.amount_paise || order.amount,
        currency: order.currency || "INR",
        name: "KnowEasy",
        description: `Booster Pack ${sku}`,
        order_id: order.order_id,
        handler: async function (response) {
          try {
            showMsg("Verifying booster…", false);
            const { res: vRes, data: vData, error: vErr } = await window.KnowEasyAuth.apiFetch("/billing/booster/verify", {
              method: "POST",
              body: JSON.stringify({
                sku,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            if (vErr) throw new Error(vErr.message || "Network error");
            if (!vRes) throw new Error("No response from server");
            if (!vRes.ok || !vData || !vData.ok) throw new Error((vData && vData.detail) || "Booster verification failed");

            showMsg("Booster added successfully.", false);
            await loadCurrentPlan();
          } catch (err) {
            console.error(err);
            showMsg(err.message || "Booster verification failed", true);
            setButtonsDisabled(false);
            applyPlanButtons();
          }
        },
        modal: {
          ondismiss: function () {
            showMsg("Payment cancelled.", true);
            setButtonsDisabled(false);
            applyPlanButtons();
          },
        },
        theme: { color: "#1f2937" },
      };

      const rzp = new window.Razorpay(opts);
      rzp.open();
    } catch (e) {
      console.error(e);
      showMsg(e.message || "Booster purchase failed", true);
      setButtonsDisabled(false);
      applyPlanButtons();
    }
  }

  function bindEvents() {
    const backBtn = document.getElementById("backBtn");
    if (backBtn) backBtn.addEventListener("click", () => (window.location.href = "me.html"));

    document.querySelectorAll("button[data-plan]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const plan = btn.getAttribute("data-plan");
        if (!plan) return;
        if (btn.disabled) return;
        startPlanCheckout(plan);
      });
    });

    getCycleRadios().forEach((el) => {
      el.addEventListener("change", () => {
        applyPricingLabels();
        applyPlanButtons();
      });
    });
  }

  document.addEventListener("DOMContentLoaded", async function () {
    try {
      if (window.KnowEasyAuth && window.KnowEasyAuth.setActiveRole) {
        window.KnowEasyAuth.setActiveRole('student');
      }
      // Suppress noisy console.log in production. Only keep error logging.
      bindEvents();
      applyPricingLabels();
      await loadCurrentPlan();
    } catch (e) {
      console.error(e);
    }
  });
})();
