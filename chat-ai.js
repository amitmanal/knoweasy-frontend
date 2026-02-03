/**
 * KnowEasy Chat AI v3.0 - World-Class Conversational Interface
 * 
 * Features:
 * - Claude/Gemini-quality conversation UX
 * - Message history with persistence
 * - Typing indicators with smooth animation
 * - Voice input support (Web Speech API)
 * - Image upload for question photos
 * - Smart suggestions based on subject
 * - Keyboard shortcuts (Ctrl+Enter to send)
 * - Multi-language support
 * - Offline queue with sync
 * - Haptic feedback on mobile
 * 
 * Author: KnowEasy AI Team
 * Version: 3.0.0
 */

(function() {
  'use strict';

  /**
   * Convert the new AnswerObject returned by the backend into the
   * section-based format expected by PremiumRenderer. This allows us
   * to reuse the existing premium renderer used in other parts of the
   * application without changing its implementation. If sections are
   * already present on the object (e.g. from an older premium API) then
   * this function simply returns those.
   *
   * @param {Object} answer
   * @returns {Array} sections compatible with PremiumRenderer
   */
  function transformAnswerToSections(answer) {
    if (!answer || typeof answer !== 'object') return [];
    if (Array.isArray(answer.sections) && answer.sections.length > 0) {
      return answer.sections;
    }
    const sections = [];
    // Header section (title + why this matters)
    const title = answer.title || '';
    const why = answer.why_this_matters || '';
    if (title || why) {
      const header = {
        type: 'header',
        title: title,
        subtitle: why
      };
      sections.push(header);
    }
    // Explanation blocks
    if (Array.isArray(answer.explanation_blocks)) {
      answer.explanation_blocks.forEach((blk, idx) => {
        if (!blk) return;
        let title = blk.title || '';
        let content = blk.content || blk; // block may be string
        if (!title && typeof content === 'string') {
          title = `Explanation ${idx + 1}`;
        }
        sections.push({
          type: 'explanation',
          title: title,
          content: String(content)
        });
      });
    }
    // Visuals (mermaid/text)
    if (Array.isArray(answer.visuals)) {
      answer.visuals.forEach((vis, idx) => {
        if (!vis || typeof vis !== 'object') return;
        const fmt = String(vis.format || '').toLowerCase();
        const code = String(vis.code || '').trim();
        if (!code) return;
        if (fmt === 'mermaid') {
          sections.push({
            type: 'diagram',
            title: vis.title || `Diagram ${idx + 1}`,
            diagram_code: code
          });
        } else {
          sections.push({
            type: 'note',
            title: vis.title || `Visual ${idx + 1}`,
            content: code
          });
        }
      });
    }
    // Examples
    if (Array.isArray(answer.examples) && answer.examples.length > 0) {
      const content = answer.examples.map(ex => `• ${ex}`).join('\n');
      sections.push({
        type: 'example',
        title: 'Examples',
        content: content
      });
    }
    // Common mistakes
    if (Array.isArray(answer.common_mistakes) && answer.common_mistakes.length > 0) {
      const content = answer.common_mistakes.map(cm => `• ${cm}`).join('\n');
      sections.push({
        type: 'tips',
        title: 'Common Mistakes',
        content: content
      });
    }
    // Exam relevance footer as a note
    if (answer.exam_relevance_footer) {
      sections.push({
        type: 'note',
        title: 'Exam relevance',
        content: answer.exam_relevance_footer
      });
    }
    return sections;
  }

  /**
   * Call the new unified AI answer endpoint. This wraps the network
   * request, handles authentication and timeouts, and returns the
   * parsed JSON. If the request fails, an error is thrown.
   *
   * @param {Object} payload
   * @returns {Promise<Object>}
   */
  async function callAnswerAPI(payload) {
    const timeout = 45000;
    state.abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      if (state.abortController) state.abortController.abort();
    }, timeout);
    try {
      let apiBase = 'https://knoweasy-engine-api.onrender.com';
      if (window.KE && window.KE.config && window.KE.config.api_base_url) {
        apiBase = window.KE.config.api_base_url;
      }
      const solvePath = (window.KE && window.KE.config && window.KE.config.solve_path) || '/v1/ai/answer';
      const url = `${apiBase}${solvePath.startsWith('/') ? '' : '/'}${solvePath}`;
      const headers = { 'Content-Type': 'application/json' };
      try {
        const token = getAuthToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch (e) {}
      const resp = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
        signal: state.abortController.signal
      });
      clearTimeout(timeoutId);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || `HTTP_${resp.status}`);
      }
      return await resp.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Display the answer returned from the AI in the chat interface. If
   * PremiumRenderer is available and the answer can be converted into
   * sections, we use it to render a rich card. Otherwise we fall back
   * to showing plain text in a chat bubble.
   *
   * @param {Object} answer
   */
  function displayAnswer(answer) {
    const container = $('chatMessages');
    if (!container) return;
    // Backend wrapper: { ok, learning_object, sections, meta, ... }
    const lo = (answer && answer.learning_object && typeof answer.learning_object === 'object') ? answer.learning_object : answer;
    const sections = (answer && Array.isArray(answer.sections) && answer.sections.length)
      ? answer.sections
      : transformAnswerToSections(lo);
    // Remove typing indicator if any
    hideTypingIndicator();
    if (window.PremiumRenderer && sections.length > 0) {
      // Create a wrapper bubble for the premium card
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble assistant-bubble';
      const inner = document.createElement('div');
      inner.className = 'premium-answer';
      bubble.appendChild(inner);
      container.appendChild(bubble);
      const providers = (answer && answer.meta && Array.isArray(answer.meta.providers_used))
        ? answer.meta.providers_used
        : (Array.isArray(answer.providers_used) ? answer.providers_used : []);
      window.PremiumRenderer.render({ sections: sections, providers_used: providers }, inner);
    } else {
      // Fallback to plain answer text
      const content = (answer && (answer.final_answer || answer.answer)) || (lo && (lo.title || 'No answer available'));
      const assistantMessage = {
        id: generateId(),
        role: 'assistant',
        content: content,
        timestamp: new Date().toISOString(),
        status: 'success'
      };
      state.history.push(assistantMessage);
      renderMessage(assistantMessage, true);
    }
    saveHistory();
    scrollToBottom();
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const CONFIG = {
    maxHistory: 50,
    maxQuestionLength: 2000,
    typingDelay: 30,
    storageKey: 'knoweasy_chat_history_v3',
    offlineQueueKey: 'knoweasy_chat_offline_queue_v1',
    suggestionsKey: 'knoweasy_chat_suggestions_v1',
    voiceEnabled: true,
    hapticEnabled: true,
    debugMode: false
  };

  // ============================================================================
  // STATE
  // ============================================================================

  const state = {
    isLoading: false,
    isRecording: false,
    history: [],
    offlineQueue: [],
    currentSubject: '',
    currentClass: '',
    currentBoard: '',
    speechRecognition: null,
    abortController: null
  };

  // ============================================================================
  // SUBJECT SUGGESTIONS
  // ============================================================================

  const SUGGESTIONS = {
    physics: [
      "Explain Newton's laws with examples",
      "Derive the equation for projectile motion",
      "What is electromagnetic induction?",
      "Solve a numerial on Ohm's law",
      "Explain the photoelectric effect"
    ],
    chemistry: [
      "Explain the mechanism of SN1 reaction",
      "Balance this equation: Fe + O2 → Fe2O3",
      "What are the properties of alkali metals?",
      "Explain VSEPR theory with examples",
      "Difference between ionic and covalent bonds"
    ],
    biology: [
      "Explain the process of photosynthesis",
      "What is the structure of DNA?",
      "Describe the human digestive system",
      "Explain Mendel's laws of inheritance",
      "What are the stages of mitosis?"
    ],
    mathematics: [
      "Solve this quadratic equation",
      "Explain integration by parts",
      "Prove the Pythagorean theorem",
      "Find the derivative of sin(x²)",
      "Explain matrices and determinants"
    ],
    default: [
      "Explain this concept simply",
      "Give me a memory tip for this",
      "Solve this step by step",
      "What are the key points?",
      "Give me practice questions"
    ]
  };

  // ============================================================================
  // DOM HELPERS
  // ============================================================================

  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => root.querySelector(sel);
  const $$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function createElement(tag, className, innerHTML = '') {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (innerHTML) el.innerHTML = innerHTML;
    return el;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatTime(date) {
    return new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(date);
  }

  function generateId() {
    return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  function hapticFeedback(type = 'light') {
    if (!CONFIG.hapticEnabled) return;
    try {
      if (navigator.vibrate) {
        const patterns = { light: [10], medium: [20], heavy: [30, 20, 30] };
        navigator.vibrate(patterns[type] || patterns.light);
      }
    } catch (e) {}
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  // ============================================================================
  // STORAGE
  // ============================================================================

  function saveHistory() {
    try {
      const toSave = state.history.slice(-CONFIG.maxHistory);
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(toSave));
    } catch (e) {
      console.warn('[Chat] Failed to save history:', e);
    }
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      if (raw) {
        state.history = JSON.parse(raw) || [];
      }
    } catch (e) {
      state.history = [];
    }
  }

  function saveOfflineQueue() {
    try {
      localStorage.setItem(CONFIG.offlineQueueKey, JSON.stringify(state.offlineQueue));
    } catch (e) {}
  }

  function loadOfflineQueue() {
    try {
      const raw = localStorage.getItem(CONFIG.offlineQueueKey);
      if (raw) {
        state.offlineQueue = JSON.parse(raw) || [];
      }
    } catch (e) {
      state.offlineQueue = [];
    }
  }

  // ============================================================================
  // UI COMPONENTS
  // ============================================================================

  function createMessageBubble(message) {
    const { id, role, content, timestamp, status, aiMeta } = message;
    
    const bubble = createElement('div', `chat-bubble chat-bubble-${role}`);
    bubble.dataset.messageId = id;
    
    // Avatar
    const avatar = createElement('div', 'chat-avatar');
    avatar.innerHTML = role === 'user' 
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>';
    
    // Content wrapper
    const contentWrapper = createElement('div', 'chat-content-wrapper');
    
    // Message content
    const contentEl = createElement('div', 'chat-content');
    
    if (role === 'assistant' && content) {
      // Render with formatting
      contentEl.innerHTML = formatAIResponse(content);
    } else {
      contentEl.textContent = content || '';
    }
    
    // Metadata footer
    const meta = createElement('div', 'chat-meta');
    const timeStr = timestamp ? formatTime(new Date(timestamp)) : '';
    
    let metaHtml = `<span class="chat-time">${timeStr}</span>`;
    
    if (role === 'assistant' && aiMeta) {
      if (aiMeta.ai_strategy) {
        metaHtml += `<span class="chat-strategy">${formatStrategy(aiMeta.ai_strategy)}</span>`;
      }
      if (aiMeta.credits_used) {
        metaHtml += `<span class="chat-credits">${aiMeta.credits_used} credits</span>`;
      }
    }
    
    if (status === 'sending') {
      metaHtml += '<span class="chat-status">Sending...</span>';
    } else if (status === 'error') {
      metaHtml += '<span class="chat-status chat-status-error">Failed</span>';
    }
    
    meta.innerHTML = metaHtml;
    
    contentWrapper.appendChild(contentEl);
    contentWrapper.appendChild(meta);
    
    bubble.appendChild(avatar);
    bubble.appendChild(contentWrapper);
    
    return bubble;
  }

  function formatStrategy(strategy) {
    const map = {
      'gemini_only': '⚡ Gemini',
      'gemini_simple': '⚡ Gemini',
      'gemini_gpt': '✨ Dual AI',
      'triple_ai': '🚀 Triple AI',
      'claude_deep': '🧠 Claude',
      'gpt_math': '📊 GPT'
    };
    return map[strategy] || strategy;
  }

  function formatAIResponse(text) {
    if (!text) return '';
    
    // Convert markdown-like formatting
    let html = escapeHtml(text);
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Code
    html = html.replace(/`(.*?)`/g, '<code>$1</code>');
    
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    
    // Lists
    html = html.replace(/^[-•]\s*(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    return html;
  }

  function createTypingIndicator() {
    const indicator = createElement('div', 'chat-bubble chat-bubble-assistant chat-typing');
    indicator.innerHTML = `
      <div class="chat-avatar">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
      </div>
      <div class="chat-content-wrapper">
        <div class="chat-content">
          <div class="typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    `;
    return indicator;
  }

  function createSuggestionChips(subject) {
    const container = createElement('div', 'chat-suggestions');
    const suggestions = SUGGESTIONS[subject?.toLowerCase()] || SUGGESTIONS.default;
    
    suggestions.slice(0, 4).forEach(text => {
      const chip = createElement('button', 'suggestion-chip');
      chip.textContent = text;
      chip.onclick = () => {
        const input = $('chatInput');
        if (input) {
          input.value = text;
          input.focus();
          hapticFeedback('light');
        }
      };
      container.appendChild(chip);
    });
    
    return container;
  }

  // ============================================================================
  // CHAT LOGIC
  // ============================================================================

  async function sendMessage(content) {
    if (!content || !content.trim()) return;
    if (state.isLoading) return;
    
    content = content.trim();
    if (content.length > CONFIG.maxQuestionLength) {
      showToast('Question is too long. Please shorten it.');
      return;
    }
    
    hapticFeedback('light');
    
    // Create user message
    const userMessage = {
      id: generateId(),
      role: 'user',
      content: content,
      timestamp: new Date().toISOString(),
      status: 'sent'
    };
    
    state.history.push(userMessage);
    renderMessage(userMessage);
    saveHistory();
    
    // Clear input
    const input = $('chatInput');
    if (input) input.value = '';
    
    // Show typing indicator
    state.isLoading = true;
    updateUI();
    showTypingIndicator();
    
    // Check offline
    if (!navigator.onLine) {
      hideTypingIndicator();
      const offlineMsg = {
        id: generateId(),
        role: 'assistant',
        content: "You're currently offline. I'll answer your question once you're back online! 📶",
        timestamp: new Date().toISOString(),
        status: 'offline'
      };
      state.history.push(offlineMsg);
      renderMessage(offlineMsg);
      
      // Queue for later
      state.offlineQueue.push({ question: content, timestamp: new Date().toISOString() });
      saveOfflineQueue();
      
      state.isLoading = false;
      updateUI();
      return;
    }
    
    try {
      // Get context from profile or URL params
      const profile = loadProfile();
      const board = state.currentBoard || profile?.board || 'CBSE';
      const klass = state.currentClass || profile?.class || '11';
      const subject = state.currentSubject || profile?.subject || '';
      // Determine answer mode from UI if available (map to lite/tutor/mastery)
      let mode = 'tutor';
      try {
        const active = document.querySelector('.ke-seg__btn--active');
        if (active && active.dataset && active.dataset.mode) {
          const m = String(active.dataset.mode).toLowerCase();
          mode = (m === 'lite' || m === 'mastery') ? m : 'tutor';
        }
      } catch (_) {}
      // Build payload for new AI endpoint
      const payload = {
        question: content,
        board: board,
        class: klass,
        subject: subject,
        mode: mode,
        study_mode: 'chat',
        language: 'en',
        request_id: generateId()
      };
      // Make the API call
      const response = await callAnswerAPI(payload);
      // Render answer using premium renderer if possible
      displayAnswer(response);
      hapticFeedback('medium');
    } catch (error) {
      console.error('[Chat] API error:', error);
      hideTypingIndicator();
      const errorMessage = {
        id: generateId(),
        role: 'assistant',
        content: getErrorMessage(error),
        timestamp: new Date().toISOString(),
        status: 'error'
      };
      state.history.push(errorMessage);
      renderMessage(errorMessage);
      saveHistory();
    } finally {
      state.isLoading = false;
      updateUI();
    }
  }

  async function callSolveAPI(payload) {
    const timeout = 45000;
    state.abortController = new AbortController();
    
    const timeoutId = setTimeout(() => {
      if (state.abortController) state.abortController.abort();
    }, timeout);
    
    try {
      // Get API URL
      let apiBase = 'https://knoweasy-engine-api.onrender.com';
      if (window.KE && window.KE.config && window.KE.config.api_base_url) {
        apiBase = window.KE.config.api_base_url;
      }
      
      const url = `${apiBase}/solve`;
      
      // Get auth token
      const headers = { 'Content-Type': 'application/json' };
      try {
        const token = getAuthToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch (e) {}
      
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
        signal: state.abortController.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('RATE_LIMITED');
        }
        if (response.status === 402) {
          throw new Error('OUT_OF_CREDITS');
        }
        throw new Error(`HTTP_${response.status}`);
      }
      
      return await response.json();
      
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  function getAuthToken() {
    // Try multiple sources
    if (window.KnowEasyAuth && typeof window.KnowEasyAuth.getToken === 'function') {
      return window.KnowEasyAuth.getToken('student') || window.KnowEasyAuth.getToken();
    }
    try {
      return localStorage.getItem('knoweasy_session_token_student_v1') 
        || localStorage.getItem('knoweasy_session_token_v1') 
        || '';
    } catch (e) {
      return '';
    }
  }

  function loadProfile() {
    try {
      const raw = localStorage.getItem('knoweasy_student_profile_v1');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function getErrorMessage(error) {
    const msg = error?.message || String(error);
    
    if (msg.includes('RATE_LIMITED')) {
      return "You're sending messages too quickly. Please wait a moment and try again. 🙏";
    }
    if (msg.includes('OUT_OF_CREDITS')) {
      return "You've used all your AI credits for now. Consider upgrading your plan for unlimited learning! 💡";
    }
    if (msg.includes('AbortError') || msg.includes('abort')) {
      return "The request took too long. Please try again with a shorter question. ⏱️";
    }
    if (msg.includes('NetworkError') || msg.includes('Failed to fetch')) {
      return "Network error. Please check your internet connection and try again. 📶";
    }
    
    return "I had trouble processing that. Please try again in a moment. 🔄";
  }

  // ============================================================================
  // VOICE INPUT
  // ============================================================================

  function initVoiceInput() {
    if (!CONFIG.voiceEnabled) return;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.log('[Chat] Speech recognition not supported');
      return;
    }
    
    state.speechRecognition = new SpeechRecognition();
    state.speechRecognition.continuous = false;
    state.speechRecognition.interimResults = true;
    state.speechRecognition.lang = 'en-IN';
    
    state.speechRecognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join('');
      
      const input = $('chatInput');
      if (input) input.value = transcript;
    };
    
    state.speechRecognition.onend = () => {
      state.isRecording = false;
      updateVoiceButton();
    };
    
    state.speechRecognition.onerror = (event) => {
      console.error('[Chat] Speech error:', event.error);
      state.isRecording = false;
      updateVoiceButton();
      
      if (event.error === 'not-allowed') {
        showToast('Please allow microphone access to use voice input');
      }
    };
  }

  function toggleVoiceInput() {
    if (!state.speechRecognition) {
      showToast('Voice input is not supported on this device');
      return;
    }
    
    if (state.isRecording) {
      state.speechRecognition.stop();
      state.isRecording = false;
    } else {
      state.speechRecognition.start();
      state.isRecording = true;
      hapticFeedback('medium');
    }
    
    updateVoiceButton();
  }

  function updateVoiceButton() {
    const btn = $('voiceBtn');
    if (!btn) return;
    
    if (state.isRecording) {
      btn.classList.add('recording');
      btn.setAttribute('aria-label', 'Stop recording');
    } else {
      btn.classList.remove('recording');
      btn.setAttribute('aria-label', 'Start voice input');
    }
  }

  // ============================================================================
  // UI UPDATES
  // ============================================================================

  function renderMessage(message, animate = false) {
    const container = $('chatMessages');
    if (!container) return;
    
    const bubble = createMessageBubble(message);
    
    if (animate) {
      bubble.style.opacity = '0';
      bubble.style.transform = 'translateY(20px)';
    }
    
    container.appendChild(bubble);
    
    if (animate) {
      requestAnimationFrame(() => {
        bubble.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        bubble.style.opacity = '1';
        bubble.style.transform = 'translateY(0)';
      });
    }
    
    scrollToBottom();
  }

  function renderHistory() {
    const container = $('chatMessages');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Welcome message if empty
    if (state.history.length === 0) {
      const welcome = createElement('div', 'chat-welcome');
      welcome.innerHTML = `
        <div class="welcome-icon">🎓</div>
        <h2>Hi! I'm Luma</h2>
        <p>Your AI study buddy. Ask me anything about your subjects - I'm here to help you learn!</p>
      `;
      container.appendChild(welcome);
      
      // Show suggestions
      const suggestions = createSuggestionChips(state.currentSubject);
      container.appendChild(suggestions);
      return;
    }
    
    state.history.forEach(msg => renderMessage(msg, false));
    scrollToBottom();
  }

  function showTypingIndicator() {
    const container = $('chatMessages');
    if (!container) return;
    
    const existing = $$('.chat-typing', container);
    if (existing) return;
    
    const indicator = createTypingIndicator();
    container.appendChild(indicator);
    scrollToBottom();
  }

  function hideTypingIndicator() {
    const container = $('chatMessages');
    if (!container) return;
    
    const indicator = $$('.chat-typing', container);
    if (indicator) indicator.remove();
  }

  function scrollToBottom() {
    const container = $('chatMessages');
    if (!container) return;
    
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }

  function updateUI() {
    const sendBtn = $('sendBtn');
    const input = $('chatInput');
    
    if (sendBtn) {
      sendBtn.disabled = state.isLoading;
      sendBtn.innerHTML = state.isLoading 
        ? '<span class="spinner"></span>' 
        : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
    }
    
    if (input) {
      input.disabled = state.isLoading;
    }
  }

  function showToast(message) {
    if (window.KE && typeof window.KE.toast === 'function') {
      window.KE.toast(message);
    } else {
      alert(message);
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function initChat() {
    console.log('[Chat] Initializing v3.0...');
    
    // Load state
    loadHistory();
    loadOfflineQueue();
    
    // Get context from URL or profile
    const params = new URLSearchParams(window.location.search);
    state.currentSubject = params.get('subject') || '';
    state.currentClass = params.get('class') || params.get('cls') || '';
    state.currentBoard = params.get('board') || '';
    
    // Render history
    renderHistory();
    
    // Bind events
    bindEvents();
    
    // Init voice
    initVoiceInput();
    
    // Process offline queue
    processOfflineQueue();
    
    // Inject styles
    injectStyles();
    
    console.log('[Chat] Initialized ✓');
  }

  function bindEvents() {
    // Send button
    const sendBtn = $('sendBtn');
    if (sendBtn) {
      sendBtn.onclick = () => {
        const input = $('chatInput');
        if (input) sendMessage(input.value);
      };
    }
    
    // Input
    const input = $('chatInput');
    if (input) {
      // Enter to send (Shift+Enter for newline)
      input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage(input.value);
        }
      };
      
      // Auto-resize
      input.oninput = () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 150) + 'px';
      };
    }
    
    // Voice button
    const voiceBtn = $('voiceBtn');
    if (voiceBtn) {
      voiceBtn.onclick = toggleVoiceInput;
    }
    
    // Clear history
    const clearBtn = $('clearHistoryBtn');
    if (clearBtn) {
      clearBtn.onclick = () => {
        if (confirm('Clear all chat history?')) {
          state.history = [];
          saveHistory();
          renderHistory();
          hapticFeedback('heavy');
        }
      };
    }
    
    // Online/offline
    window.addEventListener('online', () => {
      showToast("You're back online! 🎉");
      processOfflineQueue();
    });
    
    window.addEventListener('offline', () => {
      showToast("You're offline. Messages will be queued.");
    });
  }

  async function processOfflineQueue() {
    if (state.offlineQueue.length === 0) return;
    if (!navigator.onLine) return;
    
    console.log('[Chat] Processing offline queue:', state.offlineQueue.length);
    
    const queue = [...state.offlineQueue];
    state.offlineQueue = [];
    saveOfflineQueue();
    
    for (const item of queue) {
      await sendMessage(item.question);
      await new Promise(r => setTimeout(r, 1000)); // Rate limit
    }
  }

  // ============================================================================
  // STYLES
  // ============================================================================

  function injectStyles() {
    if (document.getElementById('chat-ai-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'chat-ai-styles';
    style.textContent = `
      /* Chat Container */
      .chat-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        max-height: 100vh;
        background: #f8fafc;
      }
      
      /* Messages Area */
      #chatMessages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        scroll-behavior: smooth;
      }
      
      /* Welcome */
      .chat-welcome {
        text-align: center;
        padding: 40px 20px;
        color: #64748b;
      }
      
      .welcome-icon {
        font-size: 48px;
        margin-bottom: 16px;
      }
      
      .chat-welcome h2 {
        font-size: 1.5rem;
        color: #1e293b;
        margin-bottom: 8px;
      }
      
      .chat-welcome p {
        font-size: 1rem;
        max-width: 300px;
        margin: 0 auto;
      }
      
      /* Message Bubbles */
      .chat-bubble {
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
        max-width: 85%;
        animation: bubbleIn 0.3s ease;
      }
      
      @keyframes bubbleIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      .chat-bubble-user {
        margin-left: auto;
        flex-direction: row-reverse;
      }
      
      .chat-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      
      .chat-bubble-user .chat-avatar {
        background: #6366f1;
        color: white;
      }
      
      .chat-bubble-assistant .chat-avatar {
        background: #10b981;
        color: white;
      }
      
      .chat-avatar svg {
        width: 20px;
        height: 20px;
      }
      
      .chat-content-wrapper {
        flex: 1;
        min-width: 0;
      }
      
      .chat-content {
        padding: 12px 16px;
        border-radius: 16px;
        line-height: 1.5;
        word-wrap: break-word;
      }
      
      .chat-bubble-user .chat-content {
        background: #6366f1;
        color: white;
        border-bottom-right-radius: 4px;
      }
      
      .chat-bubble-assistant .chat-content {
        background: white;
        color: #1e293b;
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      
      .chat-content code {
        background: rgba(0,0,0,0.1);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: 'Fira Code', monospace;
        font-size: 0.9em;
      }
      
      .chat-content ul {
        margin: 8px 0;
        padding-left: 20px;
      }
      
      .chat-content li {
        margin: 4px 0;
      }
      
      /* Metadata */
      .chat-meta {
        display: flex;
        gap: 8px;
        margin-top: 4px;
        font-size: 0.75rem;
        color: #94a3b8;
        padding: 0 4px;
      }
      
      .chat-bubble-user .chat-meta {
        justify-content: flex-end;
      }
      
      .chat-strategy {
        background: #f0fdf4;
        color: #16a34a;
        padding: 2px 6px;
        border-radius: 4px;
      }
      
      .chat-credits {
        color: #a855f7;
      }
      
      .chat-status-error {
        color: #ef4444;
      }
      
      /* Typing Indicator */
      .chat-typing .chat-content {
        padding: 16px;
      }
      
      .typing-dots {
        display: flex;
        gap: 4px;
      }
      
      .typing-dots span {
        width: 8px;
        height: 8px;
        background: #94a3b8;
        border-radius: 50%;
        animation: typingBounce 1.4s infinite ease-in-out;
      }
      
      .typing-dots span:nth-child(2) {
        animation-delay: 0.2s;
      }
      
      .typing-dots span:nth-child(3) {
        animation-delay: 0.4s;
      }
      
      @keyframes typingBounce {
        0%, 80%, 100% {
          transform: scale(0.6);
          opacity: 0.5;
        }
        40% {
          transform: scale(1);
          opacity: 1;
        }
      }
      
      /* Suggestions */
      .chat-suggestions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
        padding: 16px;
      }
      
      .suggestion-chip {
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 20px;
        padding: 8px 16px;
        font-size: 0.875rem;
        color: #475569;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .suggestion-chip:hover {
        background: #f1f5f9;
        border-color: #6366f1;
        color: #6366f1;
      }
      
      /* Input Area */
      .chat-input-area {
        display: flex;
        gap: 8px;
        padding: 12px 16px;
        background: white;
        border-top: 1px solid #e2e8f0;
      }
      
      #chatInput {
        flex: 1;
        border: 1px solid #e2e8f0;
        border-radius: 24px;
        padding: 12px 16px;
        font-size: 1rem;
        resize: none;
        outline: none;
        transition: border-color 0.2s;
        min-height: 48px;
        max-height: 150px;
      }
      
      #chatInput:focus {
        border-color: #6366f1;
      }
      
      #sendBtn, #voiceBtn {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      
      #sendBtn {
        background: #6366f1;
        color: white;
      }
      
      #sendBtn:hover:not(:disabled) {
        background: #4f46e5;
        transform: scale(1.05);
      }
      
      #sendBtn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      #sendBtn svg {
        width: 20px;
        height: 20px;
      }
      
      #voiceBtn {
        background: #f1f5f9;
        color: #64748b;
      }
      
      #voiceBtn:hover {
        background: #e2e8f0;
      }
      
      #voiceBtn.recording {
        background: #ef4444;
        color: white;
        animation: pulse 1s infinite;
      }
      
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.1); }
      }
      
      /* Spinner */
      .spinner {
        width: 20px;
        height: 20px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      
      /* Dark Mode */
      @media (prefers-color-scheme: dark) {
        .chat-container {
          background: #0f172a;
        }
        
        .chat-welcome {
          color: #94a3b8;
        }
        
        .chat-welcome h2 {
          color: #f1f5f9;
        }
        
        .chat-bubble-assistant .chat-content {
          background: #1e293b;
          color: #f1f5f9;
        }
        
        .chat-input-area {
          background: #1e293b;
          border-top-color: #334155;
        }
        
        #chatInput {
          background: #0f172a;
          border-color: #334155;
          color: #f1f5f9;
        }
        
        #chatInput:focus {
          border-color: #6366f1;
        }
        
        .suggestion-chip {
          background: #1e293b;
          border-color: #334155;
          color: #94a3b8;
        }
        
        .suggestion-chip:hover {
          background: #334155;
        }
        
        #voiceBtn {
          background: #334155;
          color: #94a3b8;
        }
      }
      
      /* Mobile */
      @media (max-width: 480px) {
        .chat-bubble {
          max-width: 90%;
        }
        
        .chat-avatar {
          width: 32px;
          height: 32px;
        }
        
        .chat-content {
          padding: 10px 14px;
          font-size: 0.95rem;
        }
        
        .suggestion-chip {
          font-size: 0.8rem;
          padding: 6px 12px;
        }
      }
    `;
    
    document.head.appendChild(style);
  }

  // ============================================================================
  // EXPORT
  // ============================================================================

  window.KnowEasyChat = {
    init: initChat,
    send: sendMessage,
    clearHistory: () => {
      state.history = [];
      saveHistory();
      renderHistory();
    },
    getHistory: () => [...state.history],
    version: '3.0.0'
  };

  // Auto-init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChat);
  } else {
    initChat();
  }

})();
