/**
 * LUMA PREMIUM FEATURES CONFIGURATION
 * ===================================
 * 
 * This file defines premium features for KnowEasy Luma
 * 
 * CEO Decision: Premium features to monetize the platform
 */

const LUMA_PREMIUM_FEATURES = {
    
    // Free Tier Limits
    free: {
        aiQuestionsPerDay: 3,
        offlineDownloads: 0,
        practiceTests: 5,
        bookmarks: 10,
        analytics: false,
        adFree: false,
        features: [
            'Basic content access',
            '3 AI questions/day',
            '5 practice tests/month',
            '10 bookmarks'
        ]
    },
    
    // Premium Tier (₹499/month or ₹4,999/year)
    premium: {
        aiQuestionsPerDay: 100,
        offlineDownloads: 50,
        practiceTests: 999999,
        bookmarks: 999999,
        analytics: true,
        adFree: true,
        features: [
            'Unlimited content access',
            '100 AI questions/day',
            'Unlimited practice tests',
            'Unlimited bookmarks',
            'Download for offline',
            'Performance analytics',
            'No ads',
            'Priority support'
        ],
        pricing: {
            monthly: 499,
            yearly: 4999,
            yearlyDiscount: '17% OFF'
        }
    },
    
    // Ultra Premium Tier (₹1,999/month or ₹19,999/year)
    ultraPremium: {
        aiQuestionsPerDay: 999999,
        offlineDownloads: 999999,
        practiceTests: 999999,
        bookmarks: 999999,
        analytics: true,
        adFree: true,
        personalizedLearning: true,
        oneOnOneDoubtSolving: true,
        features: [
            'Everything in Premium',
            'Unlimited AI questions',
            'Personalized learning path',
            '1-on-1 doubt solving',
            'Live classes access',
            'Exam prediction AI',
            'Custom study plans'
        ],
        pricing: {
            monthly: 1999,
            yearly: 19999,
            yearlyDiscount: '17% OFF'
        }
    }
};

/**
 * PREMIUM FEATURES IMPLEMENTATION
 * ================================
 */

class LumaPremium {
    constructor() {
        this.userTier = this.getUserTier();
        this.limits = LUMA_PREMIUM_FEATURES[this.userTier];
    }
    
    getUserTier() {
        // Check from localStorage or backend
        try {
            const profile = JSON.parse(localStorage.getItem('ke_profile') || '{}');
            return profile.premium_tier || 'free';
        } catch {
            return 'free';
        }
    }
    
    canUseAI() {
        const today = new Date().toDateString();
        const usage = this.getAIUsage(today);
        return usage < this.limits.aiQuestionsPerDay;
    }
    
    getAIUsage(date) {
        try {
            const usage = JSON.parse(localStorage.getItem('ke_ai_usage') || '{}');
            return usage[date] || 0;
        } catch {
            return 0;
        }
    }
    
    incrementAIUsage() {
        const today = new Date().toDateString();
        try {
            const usage = JSON.parse(localStorage.getItem('ke_ai_usage') || '{}');
            usage[today] = (usage[today] || 0) + 1;
            localStorage.setItem('ke_ai_usage', JSON.stringify(usage));
        } catch (e) {
            console.error('Failed to track AI usage:', e);
        }
    }
    
    canDownload() {
        return this.limits.offlineDownloads > 0;
    }
    
    canBookmark() {
        const bookmarks = this.getBookmarkCount();
        return bookmarks < this.limits.bookmarks;
    }
    
    getBookmarkCount() {
        try {
            const bookmarks = JSON.parse(localStorage.getItem('ke_bookmarks') || '[]');
            return bookmarks.length;
        } catch {
            return 0;
        }
    }
    
    showUpgradePrompt(feature) {
        const modal = `
            <div class="luma-premium-modal" id="premiumModal">
                <div class="luma-premium-content">
                    <div class="luma-premium-icon">⭐</div>
                    <h2>Upgrade to Premium</h2>
                    <p>Unlock ${feature} and more amazing features!</p>
                    <div class="luma-premium-features">
                        ${this.limits.features.map(f => `<div>✓ ${f}</div>`).join('')}
                    </div>
                    <button class="luma-btn luma-btn-premium" onclick="window.location.href='me.html?tab=premium'">
                        View Plans
                    </button>
                    <button class="luma-btn luma-btn-secondary" onclick="document.getElementById('premiumModal').remove()">
                        Maybe Later
                    </button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modal);
    }
}

// Initialize premium system
window.lumaPremium = new LumaPremium();

/**
 * PREMIUM UI COMPONENTS
 * =====================
 */

// Add premium badge to AI sidebar
function updateAIPremiumBadge() {
    const badge = document.getElementById('aiRateLimit');
    const today = new Date().toDateString();
    const usage = window.lumaPremium.getAIUsage(today);
    const limit = window.lumaPremium.limits.aiQuestionsPerDay;
    
    if (window.lumaPremium.userTier === 'free') {
        const remaining = limit - usage;
        badge.textContent = `Free: ${remaining}/${limit} questions today`;
        badge.style.color = remaining === 0 ? '#EF4444' : '#6B7FFF';
    } else if (window.lumaPremium.userTier === 'premium') {
        badge.textContent = `Premium: ${usage}/100 today`;
        badge.style.color = '#7BE7C4';
    } else {
        badge.textContent = `Ultra: Unlimited`;
        badge.style.color = '#FFB5D8';
    }
}

// Call on page load
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(updateAIPremiumBadge, 1000);
    });
}

/**
 * PREMIUM ANALYTICS
 * =================
 */

class LumaAnalytics {
    constructor() {
        this.sessionStart = Date.now();
        this.events = [];
    }
    
    trackEvent(event, data) {
        if (!window.lumaPremium.limits.analytics) {
            return; // Analytics only for premium
        }
        
        this.events.push({
            event,
            data,
            timestamp: Date.now()
        });
        
        // Send to backend
        this.sendToBackend({event, data});
    }
    
    async sendToBackend(eventData) {
        try {
            const API_BASE = window.API_BASE || 'https://knoweasy-engine-api.onrender.com';
            await fetch(`${API_BASE}/api/analytics/track`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    user_id: this.getUserId(),
                    ...eventData,
                    timestamp: Date.now()
                })
            });
        } catch (e) {
            console.log('Analytics tracking failed:', e);
        }
    }
    
    getUserId() {
        try {
            const profile = JSON.parse(localStorage.getItem('ke_profile') || '{}');
            return profile.user_id || 'anonymous';
        } catch {
            return 'anonymous';
        }
    }
    
    getSessionStats() {
        return {
            duration: Math.floor((Date.now() - this.sessionStart) / 1000),
            eventsCount: this.events.length,
            events: this.events
        };
    }
}

// Initialize analytics
window.lumaAnalytics = new LumaAnalytics();

/**
 * REVENUE PROJECTION
 * ==================
 * 
 * CEO Note: Based on 100,000 users in Year 1
 * 
 * Conversion Rates:
 * - Free users: 70,000 (70%)
 * - Premium users: 25,000 (25%) @ ₹499/month
 * - Ultra Premium: 5,000 (5%) @ ₹1,999/month
 * 
 * Monthly Revenue:
 * - Premium: 25,000 × ₹499 = ₹1,24,75,000
 * - Ultra: 5,000 × ₹1,999 = ₹99,95,000
 * - Total: ₹2,24,70,000/month
 * 
 * Annual Revenue: ₹269.64 Crores
 * 
 * Path to ₹500 Crores:
 * - Year 1: 100K users → ₹270 Cr
 * - Year 2: 200K users → ₹540 Cr ✅
 */

console.log('💎 Premium features loaded. Path to ₹500 Crore company!');
