/**
 * ================================================================
 * LUMA-AI.JS - AI Chat System
 * CEO & Senior Designer Production Version
 * 
 * Features: Context-aware chat, Rate limiting, Mobile responsive
 * Integration: Ready for Claude/GPT/any AI backend
 * ================================================================
 */

class LumaAI {
  constructor(lumaCore) {
    this.core = lumaCore;
    this.chatHistory = [];
    this.rateLimit = {
      free: 3,
      used: 0,
      resetDate: this.getNextResetDate()
    };
    
    // Load saved state
    this.loadState();
    
    // Initialize UI
    this.init();
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  init() {
    console.log('🤖 Lumi AI - Initializing...');
    
    this.setupEventListeners();
    this.updateRateLimitUI();
    this.renderChatHistory();
    
    console.log('✅ AI System ready');
  }

  setupEventListeners() {
    // Desktop send button
    const sendBtn = document.getElementById('aiSendButton');
    if (sendBtn) {
      sendBtn.addEventListener('click', () => this.sendMessage());
    }

    // Desktop input (Enter to send)
    const input = document.getElementById('aiInput');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
    }

    // Mobile FAB
    const fab = document.getElementById('lumaAiFab');
    if (fab) {
      fab.addEventListener('click', () => this.openMobileChat());
    }

    // Mobile send (if exists)
    const sendBtnModal = document.getElementById('aiSendButtonModal');
    if (sendBtnModal) {
      sendBtnModal.addEventListener('click', () => this.sendMessage(true));
    }

    // Mobile input
    const inputModal = document.getElementById('aiInputModal');
    if (inputModal) {
      inputModal.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage(true);
        }
      });
    }
  }

  // ============================================
  // CHAT FUNCTIONALITY
  // ============================================

  async sendMessage(isMobile = false) {
    const inputId = isMobile ? 'aiInputModal' : 'aiInput';
    const input = document.getElementById(inputId);
    
    if (!input) return;

    const message = input.value.trim();
    if (!message) return;

    // Check rate limit
    if (!this.checkRateLimit()) {
      this.showRateLimitMessage();
      return;
    }

    // Clear input
    input.value = '';

    // Add user message to UI
    this.addMessage(message, 'user');

    // Show typing indicator
    this.showTypingIndicator();

    // Get context
    const context = this.getContext();

    try {
      // Call AI (this is where you integrate your backend)
      const response = await this.callAI(message, context);
      
      // Remove typing indicator
      this.removeTypingIndicator();

      // Add AI response
      this.addMessage(response, 'assistant');

      // Update rate limit
      this.incrementRateLimit();

    } catch (error) {
      console.error('AI Error:', error);
      this.removeTypingIndicator();
      this.addMessage('Sorry, I encountered an error. Please try again.', 'assistant');
    }

    // Save state
    this.saveState();
  }

  async callAI(message, context) {
    // ============================================
    // INTEGRATION POINT FOR YOUR AI BACKEND
    // ============================================
    
    // Option 1: Return smart pre-written responses (NO API COST)
    return this.getSmartResponse(message, context);
    
    // Option 2: Call your AI API (UNCOMMENT TO USE)
    /*
    const response = await fetch('YOUR_AI_API_ENDPOINT', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_API_KEY'
      },
      body: JSON.stringify({
        message: message,
        context: context,
        model: 'claude-sonnet-4-5-20250929'
      })
    });
    
    const data = await response.json();
    return data.response;
    */
  }

  getSmartResponse(message, context) {
    // Smart pattern matching for common questions
    const msg = message.toLowerCase();
    
    // Greetings
    if (msg.match(/^(hi|hello|hey|namaste)/)) {
      return `Hi! I'm Lumi, your learning assistant for ${context.subject}. How can I help you understand today's topic better?`;
    }

    // Current card question
    if (msg.match(/(explain|what is|tell me about|help with|understand)/)) {
      return `I can help you understand "${context.currentCardTitle}"! ${context.cardSummary}

Would you like me to:
1. Explain it differently
2. Give you an example
3. Test your understanding
4. Show related concepts

Just let me know!`;
    }

    // Quiz help
    if (msg.match(/(answer|solution|correct|wrong|why)/)) {
      return `Let me help you understand this concept better.

The key points are:
${context.keyPoints}

Try thinking about it step by step. Would you like a hint or a detailed explanation?`;
    }

    // Examples
    if (msg.match(/(example|real|world|life|practical)/)) {
      return `Great question! Here's a real-world example:

In everyday life, this concept applies to many situations. Think about ${context.examples}

Can you think of another example? This helps reinforce learning!`;
    }

    // Doubt/Confusion
    if (msg.match(/(confused|doubt|don't understand|stuck)/)) {
      return `No worries! Let's break this down together.

The main idea is: ${context.summary}

Common confusions:
- Students often mix up X with Y
- Remember the key difference: ${context.keyDifference}

Does this help? Ask me specific questions!`;
    }

    // Test understanding
    if (msg.match(/(test|quiz|question|practice)/)) {
      return `Excellent! Testing yourself is the best way to learn.

Quick question: ${context.quickQuiz}

Take your time and try to answer. I'm here if you need hints!`;
    }

    // Default helpful response
    return `I'm here to help! You asked about: "${message}"

Currently, you're learning about **${context.currentCardTitle}** in ${context.subject}.

I can:
✅ Explain concepts differently
✅ Give real-world examples  
✅ Answer specific doubts
✅ Test your understanding
✅ Show related topics

What would help you most?`;
  }

  getContext() {
    // Get current learning context
    if (!this.core.data) {
      return {
        subject: 'General',
        currentCardTitle: 'Introduction',
        cardSummary: '',
        keyPoints: '',
        summary: '',
        examples: '',
        keyDifference: ''
      };
    }

    const section = this.core.data.sections[this.core.currentSection];
    const card = section.cards[this.core.currentCard];

    return {
      subject: this.core.data.metadata.subject || 'Subject',
      class: this.core.data.metadata.class || '',
      board: this.core.data.metadata.board || '',
      chapterTitle: this.core.data.metadata.title || '',
      sectionTitle: section.title || '',
      currentCardTitle: card.title || '',
      cardType: card.type || '',
      cardContent: JSON.stringify(card.content).substring(0, 500),
      cardSummary: this.extractSummary(card),
      keyPoints: this.extractKeyPoints(card),
      hasQuiz: !!card.quiz,
      hasDoubts: !!(card.commonDoubts && card.commonDoubts.length > 0),
      totalCards: this.core.getTotalCards(),
      currentCardNumber: this.core.getCurrentCardNumber()
    };
  }

  extractSummary(card) {
    if (typeof card.content === 'string') {
      return card.content.substring(0, 200) + '...';
    }
    if (Array.isArray(card.content)) {
      const firstPara = card.content.find(c => typeof c === 'string');
      return firstPara ? firstPara.substring(0, 200) + '...' : '';
    }
    return '';
  }

  extractKeyPoints(card) {
    if (card.keyPoints) {
      return card.keyPoints.join('\n- ');
    }
    if (card.commonDoubts && card.commonDoubts.length > 0) {
      return card.commonDoubts.map(d => d.question).join('\n- ');
    }
    return 'Check the card content above';
  }

  // ============================================
  // UI MANAGEMENT
  // ============================================

  addMessage(text, role) {
    const message = {
      text: text,
      role: role,
      timestamp: Date.now()
    };

    this.chatHistory.push(message);

    // Add to desktop UI
    const desktopContainer = document.getElementById('aiMessages');
    if (desktopContainer) {
      this.appendMessageToContainer(desktopContainer, message);
    }

    // Add to mobile UI
    const mobileContainer = document.getElementById('aiMessagesModal');
    if (mobileContainer) {
      this.appendMessageToContainer(mobileContainer, message);
    }

    // Save
    this.saveState();
  }

  appendMessageToContainer(container, message) {
    const div = document.createElement('div');
    div.className = `luma-ai-message ${message.role}`;
    div.innerHTML = this.formatMessage(message.text);
    
    container.appendChild(div);
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  formatMessage(text) {
    // Convert markdown-style formatting
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\n/g, '<br>');
    return text;
  }

  showTypingIndicator() {
    const containers = [
      document.getElementById('aiMessages'),
      document.getElementById('aiMessagesModal')
    ];

    containers.forEach(container => {
      if (!container) return;
      
      const indicator = document.createElement('div');
      indicator.className = 'luma-ai-message assistant luma-typing';
      indicator.innerHTML = '<span></span><span></span><span></span>';
      indicator.id = 'typingIndicator';
      
      container.appendChild(indicator);
      container.scrollTop = container.scrollHeight;
    });
  }

  removeTypingIndicator() {
    document.querySelectorAll('#typingIndicator').forEach(el => el.remove());
  }

  renderChatHistory() {
    const desktopContainer = document.getElementById('aiMessages');
    const mobileContainer = document.getElementById('aiMessagesModal');

    this.chatHistory.forEach(message => {
      if (desktopContainer) {
        this.appendMessageToContainer(desktopContainer, message);
      }
      if (mobileContainer) {
        this.appendMessageToContainer(mobileContainer, message);
      }
    });
  }

  clearChat() {
    this.chatHistory = [];
    
    // Clear UI
    const containers = [
      document.getElementById('aiMessages'),
      document.getElementById('aiMessagesModal')
    ];

    containers.forEach(container => {
      if (!container) return;
      container.innerHTML = `
        <div class="luma-ai-message assistant">
          👋 Hi! I'm Lumi. Chat cleared. How can I help you?
        </div>
      `;
    });

    this.saveState();
  }

  // ============================================
  // RATE LIMITING
  // ============================================

  checkRateLimit() {
    // Check if need to reset
    if (Date.now() > this.rateLimit.resetDate) {
      this.resetRateLimit();
    }

    return this.rateLimit.used < this.rateLimit.free;
  }

  incrementRateLimit() {
    this.rateLimit.used++;
    this.updateRateLimitUI();
    this.saveState();
  }

  resetRateLimit() {
    this.rateLimit.used = 0;
    this.rateLimit.resetDate = this.getNextResetDate();
    this.updateRateLimitUI();
    this.saveState();
  }

  getNextResetDate() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.getTime();
  }

  updateRateLimitUI() {
    const remaining = this.rateLimit.free - this.rateLimit.used;
    const text = remaining > 0 
      ? `Free: ${remaining} questions/day remaining` 
      : 'Daily limit reached';

    const elements = document.querySelectorAll('#aiRateLimit, #aiRateLimitText');
    elements.forEach(el => {
      if (el) el.textContent = text;
    });
  }

  showRateLimitMessage() {
    this.addMessage(
      `⚠️ You've used your ${this.rateLimit.free} free AI questions for today.

Your limit resets at midnight. Or upgrade to Premium for unlimited questions!

In the meantime:
- Check "Common Doubts" on each card
- Use the hints system
- Review previous explanations

Keep learning! 📚`,
      'assistant'
    );
  }

  // ============================================
  // MOBILE SUPPORT
  // ============================================

  openMobileChat() {
    const modal = document.getElementById('aiModal');
    if (modal) {
      modal.classList.remove('hidden');
      document.getElementById('aiInputModal')?.focus();
    }
  }

  closeMobileChat() {
    const modal = document.getElementById('aiModal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  // ============================================
  // PERSISTENCE
  // ============================================

  saveState() {
    const state = {
      chatHistory: this.chatHistory,
      rateLimit: this.rateLimit
    };
    localStorage.setItem('lumaAIState', JSON.stringify(state));
  }

  loadState() {
    try {
      const saved = localStorage.getItem('lumaAIState');
      if (!saved) return;

      const state = JSON.parse(saved);
      
      if (state.chatHistory) {
        this.chatHistory = state.chatHistory;
      }
      
      if (state.rateLimit) {
        this.rateLimit = state.rateLimit;
        
        // Reset if past reset date
        if (Date.now() > this.rateLimit.resetDate) {
          this.resetRateLimit();
        }
      }
    } catch (error) {
      console.error('Failed to load AI state:', error);
    }
  }
}

// Quick actions (can be called from anywhere)
function askLumi(question) {
  if (window.lumaAI) {
    const input = document.getElementById('aiInput') || document.getElementById('aiInputModal');
    if (input) {
      input.value = question;
      window.lumaAI.sendMessage();
    }
  }
}

function clearLumiChat() {
  if (window.lumaAI) {
    window.lumaAI.clearChat();
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LumaAI;
}
