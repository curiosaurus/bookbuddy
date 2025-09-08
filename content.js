class PDFSyncManager {
  constructor() {
    this.sessionId = null;
    this.isHost = false;
    this.currentPage = 1;
    this.isInitialized = false;
    this.syncOverlay = null;
    this.annotationMode = 'none';
    this.selectedColor = '#ffeb3b';
    this.annotations = [];
    this.commentModal = null;
    
    this.init();
  }
  
  init() {
    if (this.isInitialized) return;
    
    // Check if this is a PDF page
    if (!this.isPDFPage()) return;
    
    this.isInitialized = true;
    this.createSyncOverlay();
    this.createCommentModal();
    this.setupPageDetection();
    this.setupMessageListener();
    this.setupAnnotationListeners();
    this.loadAnnotations();
    
    // Restore session if exists
    chrome.storage.local.get(['currentSession', 'isHost'], (result) => {
      if (result.currentSession) {
        this.joinSession(result.currentSession, result.isHost);
      }
    });
  }
  
  isPDFPage() {
    return window.location.href.includes('.pdf') || 
           window.location.href.includes('/pdf') ||
           document.querySelector('embed[type="application/pdf"]') ||
           document.querySelector('object[type="application/pdf"]') ||
           document.title.toLowerCase().includes('pdf');
  }
  
  createSyncOverlay() {
    this.syncOverlay = document.createElement('div');
    this.syncOverlay.id = 'pdf-sync-overlay';
    this.syncOverlay.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        display: none;
        align-items: center;
        gap: 10px;
        min-width: 200px;
      ">
        <div style="flex: 1;">
          <div style="font-weight: 600; margin-bottom: 2px;">📄 PDF Sync</div>
          <div style="font-size: 12px; opacity: 0.9;" id="sync-status">Disconnected</div>
        </div>
        <div style="
          background: rgba(255,255,255,0.2);
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 12px;
          font-weight: 600;
        " id="page-indicator">Page 1</div>
      </div>
    `;
    
    document.body.appendChild(this.syncOverlay);
  }
  
  createCommentModal() {
    this.commentModal = document.createElement('div');
    this.commentModal.id = 'pdf-comment-modal';
    this.commentModal.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 10001;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      " id="modal-backdrop">
        <div style="
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          max-width: 400px;
          width: 90%;
        ">
          <div style="font-size: 18px; font-weight: 600; margin-bottom: 15px; color: #333;">
            💬 Add Comment
          </div>
          <div style="margin-bottom: 10px; padding: 8px; background: #f5f5f5; border-radius: 4px; font-size: 14px; color: #666; max-height: 60px; overflow-y: auto;" id="selected-text-preview">
            Selected text will appear here...
          </div>
          <textarea id="comment-input" placeholder="Enter your comment..." style="
            width: 100%;
            height: 80px;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 8px;
            font-size: 14px;
            resize: vertical;
            font-family: inherit;
            box-sizing: border-box;
          "></textarea>
          <div style="display: flex; gap: 10px; margin-top: 15px; justify-content: flex-end;">
            <button id="cancel-comment" style="
              padding: 8px 16px;
              border: 1px solid #ddd;
              background: white;
              border-radius: 4px;
              cursor: pointer;
              font-size: 14px;
            ">Cancel</button>
            <button id="save-comment" style="
              padding: 8px 16px;
              border: none;
              background: #4CAF50;
              color: white;
              border-radius: 4px;
              cursor: pointer;
              font-size: 14px;
            ">Save Comment</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(this.commentModal);
    
    // Modal event listeners
    this.commentModal.querySelector('#cancel-comment').addEventListener('click', () => {
      this.hideCommentModal();
    });
    
    this.commentModal.querySelector('#modal-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'modal-backdrop') {
        this.hideCommentModal();
      }
    });
    
    this.commentModal.querySelector('#save-comment').addEventListener('click', () => {
      this.saveComment();
    });
    
    this.commentModal.querySelector('#comment-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        this.saveComment();
      }
    });
  }
  
  setupPageDetection() {
    // Detect page changes in PDF viewer
    let lastUrl = window.location.href;
    
    const detectPageChange = () => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        this.extractCurrentPage();
        lastUrl = currentUrl;
      }
    };
    
    // Monitor URL changes (for viewers that use hash routing)
    new MutationObserver(detectPageChange).observe(document, {
      subtree: true,
      childList: true
    });
    
    // Monitor hash changes
    window.addEventListener('hashchange', detectPageChange);
    
    // Monitor scroll for PDF viewers that change page on scroll
    let scrollTimeout;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        this.extractCurrentPage();
      }, 300);
    });
    
    // Initial page detection
    setTimeout(() => this.extractCurrentPage(), 1000);
  }
  
  extractCurrentPage() {
    let page = 1;
    
    // Try different methods to detect current page
    
    // Method 1: Check URL hash
    const hashMatch = window.location.hash.match(/page=(\d+)/);
    if (hashMatch) {
      page = parseInt(hashMatch[1]);
    }
    
    // Method 2: Check for Chrome PDF viewer
    else if (window.location.href.includes('chrome-extension://')) {
      const pageMatch = window.location.href.match(/page=(\d+)/);
      if (pageMatch) {
        page = parseInt(pageMatch[1]);
      }
    }
    
    // Method 3: Look for page indicators in the DOM
    else {
      const pageElements = [
        'input[aria-label*="page" i]',
        'input[title*="page" i]',
        '.page-number',
        '#pageNumber',
        '[data-page-number]'
      ];
      
      for (const selector of pageElements) {
        const element = document.querySelector(selector);
        if (element && element.value) {
          page = parseInt(element.value) || page;
          break;
        }
      }
    }
    
    if (page !== this.currentPage) {
      this.currentPage = page;
      this.updatePageIndicator();
      
      if (this.sessionId && this.isHost) {
        this.broadcastPageChange(page);
      }
    }
  }
  
  updatePageIndicator() {
    const indicator = document.getElementById('page-indicator');
    if (indicator) {
      indicator.textContent = `Page ${this.currentPage}`;
    }
  }
  
  setupAnnotationListeners() {
    // Handle text selection for highlighting
    document.addEventListener('mouseup', (e) => {
      const selection = window.getSelection();
      if (selection.toString().trim().length > 0 && this.annotationMode === 'highlight') {
        this.createHighlight(selection);
      } else if (selection.toString().trim().length > 0 && this.annotationMode === 'comment') {
        this.showCommentModal(selection.toString(), selection);
      }
    });
    
    // Handle clicks on existing annotations
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('pdf-highlight')) {
        const annotationId = e.target.dataset.annotationId;
        const annotation = this.annotations.find(a => a.id === annotationId);
        if (annotation && annotation.type === 'highlight' && annotation.comment) {
          this.showAnnotationTooltip(e.target, annotation);
        }
      } else if (e.target.classList.contains('pdf-comment-marker')) {
        const annotationId = e.target.dataset.annotationId;
        const annotation = this.annotations.find(a => a.id === annotationId);
        if (annotation) {
          this.showAnnotationTooltip(e.target, annotation);
        }
      }
    });
    
    // Context menu handling
    document.addEventListener('contextmenu', (e) => {
      const selection = window.getSelection();
      if (selection.toString().trim().length > 0) {
        // Let the context menu show for selected text
        return;
      }
    });
  }
  
  loadAnnotations() {
    const storageKey = `annotations_${window.location.href}_${this.sessionId || 'local'}`;
    chrome.storage.local.get([storageKey], (result) => {
      if (result[storageKey]) {
        this.annotations = result[storageKey];
        this.renderAnnotations();
      }
    });
  }
  
  saveAnnotations() {
    const storageKey = `annotations_${window.location.href}_${this.sessionId || 'local'}`;
    chrome.storage.local.set({
      [storageKey]: this.annotations
    });
    
    // Notify popup about annotation updates
    chrome.runtime.sendMessage({
      type: 'ANNOTATIONS_UPDATED',
      annotations: this.annotations
    }).catch(() => {
      // Ignore errors if popup is not open
    });
  }
  
  createHighlight(selection) {
    if (!selection || selection.toString().trim().length === 0) return;
    
    const annotation = {
      id: this.generateId(),
      type: 'highlight',
      text: selection.toString().trim(),
      color: this.selectedColor,
      page: this.currentPage,
      timestamp: Date.now(),
      author: this.isHost ? 'Host' : 'Participant'
    };
    
    // Create highlight element
    try {
      const range = selection.getRangeAt(0);
      const highlightSpan = document.createElement('span');
      highlightSpan.className = 'pdf-highlight';
      highlightSpan.dataset.annotationId = annotation.id;
      highlightSpan.style.cssText = `
        background-color: ${this.selectedColor} !important;
        opacity: 0.4 !important;
        cursor: pointer !important;
        transition: opacity 0.2s !important;
      `;
      
      highlightSpan.addEventListener('mouseenter', () => {
        highlightSpan.style.opacity = '0.6';
      });
      
      highlightSpan.addEventListener('mouseleave', () => {
        highlightSpan.style.opacity = '0.4';
      });
      
      range.surroundContents(highlightSpan);
      selection.removeAllRanges();
      
      this.annotations.push(annotation);
      this.saveAnnotations();
      
      // Sync with other participants
      if (this.sessionId) {
        chrome.runtime.sendMessage({
          type: 'SYNC_ANNOTATION',
          annotation: annotation,
          sessionId: this.sessionId
        });
      }
      
    } catch (error) {
      console.log('Could not create highlight:', error);
    }
  }
  
  showCommentModal(selectedText, selection) {
    this.commentModal.style.display = 'flex';
    this.commentModal.querySelector('#selected-text-preview').textContent = selectedText;
    this.commentModal.querySelector('#comment-input').value = '';
    this.commentModal.querySelector('#comment-input').focus();
    
    // Store selection for later use
    this.pendingSelection = { selectedText, selection };
  }
  
  hideCommentModal() {
    this.commentModal.style.display = 'none';
    this.pendingSelection = null;
  }
  
  saveComment() {
    const commentText = this.commentModal.querySelector('#comment-input').value.trim();
    if (!commentText || !this.pendingSelection) return;
    
    const annotation = {
      id: this.generateId(),
      type: 'comment',
      text: this.pendingSelection.selectedText,
      comment: commentText,
      color: this.selectedColor,
      page: this.currentPage,
      timestamp: Date.now(),
      author: this.isHost ? 'Host' : 'Participant'
    };
    
    // Create comment marker
    try {
      const selection = this.pendingSelection.selection;
      const range = selection.getRangeAt(0);
      const commentMarker = document.createElement('span');
      commentMarker.className = 'pdf-comment-marker';
      commentMarker.dataset.annotationId = annotation.id;
      commentMarker.innerHTML = '💬';
      commentMarker.style.cssText = `
        background-color: ${this.selectedColor} !important;
        color: white !important;
        border-radius: 50% !important;
        padding: 2px 4px !important;
        font-size: 12px !important;
        cursor: pointer !important;
        margin: 0 2px !important;
        display: inline-block !important;
        vertical-align: super !important;
        line-height: 1 !important;
      `;
      
      range.collapse(false);
      range.insertNode(commentMarker);
      selection.removeAllRanges();
      
      this.annotations.push(annotation);
      this.saveAnnotations();
      
      // Sync with other participants
      if (this.sessionId) {
        chrome.runtime.sendMessage({
          type: 'SYNC_ANNOTATION',
          annotation: annotation,
          sessionId: this.sessionId
        });
      }
      
    } catch (error) {
      console.log('Could not create comment marker:', error);
    }
    
    this.hideCommentModal();
  }
  
  showAnnotationTooltip(element, annotation) {
    // Remove existing tooltips
    document.querySelectorAll('.annotation-tooltip').forEach(t => t.remove());
    
    const tooltip = document.createElement('div');
    tooltip.className = 'annotation-tooltip';
    tooltip.style.cssText = `
      position: absolute;
      background: #333;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      z-index: 10002;
      max-width: 300px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;
    
    const rect = element.getBoundingClientRect();
    tooltip.style.left = rect.left + 'px';
    tooltip.style.top = (rect.bottom + 5) + 'px';
    
    let content = `<strong>${annotation.type === 'highlight' ? '🖍️ Highlight' : '💬 Comment'}</strong><br>`;
    content += `<em>by ${annotation.author}</em><br><br>`;
    
    if (annotation.type === 'highlight') {
      content += `"${annotation.text}"`;
      if (annotation.comment) {
        content += `<br><br><strong>Comment:</strong> ${annotation.comment}`;
      }
    } else {
      content += `<strong>Text:</strong> "${annotation.text}"<br><br>`;
      content += `<strong>Comment:</strong> ${annotation.comment}`;
    }
    
    tooltip.innerHTML = content;
    document.body.appendChild(tooltip);
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      tooltip.remove();
    }, 5000);
    
    // Hide on click outside
    setTimeout(() => {
      document.addEventListener('click', function hideTooltip() {
        tooltip.remove();
        document.removeEventListener('click', hideTooltip);
      });
    }, 100);
  }
  
  renderAnnotations() {
    // Clear existing rendered annotations
    document.querySelectorAll('.pdf-highlight, .pdf-comment-marker').forEach(el => {
      if (el.parentNode) {
        el.parentNode.replaceChild(document.createTextNode(el.textContent), el);
      }
    });
    
    // Re-render all annotations
    this.annotations.forEach(annotation => {
      // Note: Re-rendering highlights is complex and may require storing position data
      // For now, annotations persist until page refresh
    });
  }
  
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
  
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'CREATE_SESSION':
          this.createSession(message.sessionId);
          break;
        case 'JOIN_SESSION':
          this.joinSession(message.sessionId, false);
          break;
        case 'LEAVE_SESSION':
          this.leaveSession();
          break;
        case 'PAGE_CHANGED':
          if (message.sessionId === this.sessionId && !this.isHost) {
            this.navigateToPage(message.page);
          }
          break;
        case 'SET_ANNOTATION_MODE':
          this.annotationMode = message.mode;
          this.selectedColor = message.color;
          break;
        case 'SET_HIGHLIGHT_COLOR':
          this.selectedColor = message.color;
          break;
        case 'CLEAR_ANNOTATIONS':
          this.clearAllAnnotations();
          break;
        case 'GET_ANNOTATIONS':
          chrome.runtime.sendMessage({
            type: 'ANNOTATIONS_UPDATED',
            annotations: this.annotations
          }).catch(() => {});
          break;
        case 'FOCUS_ANNOTATION':
          this.focusAnnotation(message.annotationId);
          break;
        case 'ANNOTATION_ADDED':
          if (message.sessionId === this.sessionId) {
            this.receiveAnnotation(message.annotation);
          }
          break;
        case 'ANNOTATION_REMOVED':
          if (message.sessionId === this.sessionId) {
            this.removeAnnotation(message.annotationId);
          }
          break;
        case 'CONTEXT_MENU_ANNOTATION':
          this.handleContextMenuAnnotation(message.action, message.selectedText);
          break;
      }
    });
  }
  
  handleContextMenuAnnotation(action, selectedText) {
    const selection = window.getSelection();
    if (action === 'highlightText') {
      this.createHighlight(selection);
    } else if (action === 'addComment') {
      this.showCommentModal(selectedText, selection);
    }
  }
  
  receiveAnnotation(annotation) {
    // Add annotation from another participant
    this.annotations.push(annotation);
    this.saveAnnotations();
    
    // Show a notification
    this.showNotification(`${annotation.author} added a ${annotation.type}`);
  }
  
  removeAnnotation(annotationId) {
    // Remove annotation
    this.annotations = this.annotations.filter(a => a.id !== annotationId);
    this.saveAnnotations();
    
    // Remove from DOM
    const element = document.querySelector(`[data-annotation-id="${annotationId}"]`);
    if (element) {
      if (element.classList.contains('pdf-highlight')) {
        element.outerHTML = element.innerHTML;
      } else {
        element.remove();
      }
    }
  }
  
  clearAllAnnotations() {
    // Remove all annotations from DOM
    document.querySelectorAll('.pdf-highlight').forEach(el => {
      el.outerHTML = el.innerHTML;
    });
    document.querySelectorAll('.pdf-comment-marker').forEach(el => {
      el.remove();
    });
    
    // Clear annotations array
    this.annotations = [];
    this.saveAnnotations();
    
    // Sync with other participants
    if (this.sessionId) {
      chrome.runtime.sendMessage({
        type: 'SYNC_ANNOTATION_REMOVAL',
        annotationId: 'all',
        sessionId: this.sessionId
      });
    }
  }
  
  focusAnnotation(annotationId) {
    const element = document.querySelector(`[data-annotation-id="${annotationId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Highlight temporarily
      const originalStyle = element.style.cssText;
      element.style.cssText += 'animation: pulse 2s; border: 2px solid #ff4444 !important;';
      
      setTimeout(() => {
        element.style.cssText = originalStyle;
      }, 2000);
    }
  }
  
  showNotification(message) {
    // Create a temporary notification
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 10px 15px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 10003;
      animation: slideIn 0.3s ease-out;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
  
  createSession(sessionId) {
    this.sessionId = sessionId;
    this.isHost = true;
    this.showSyncOverlay(`Host - Session: ${sessionId}`);
  }
  
  joinSession(sessionId, isHost = false) {
    this.sessionId = sessionId;
    this.isHost = isHost;
    const role = isHost ? 'Host' : 'Participant';
    this.showSyncOverlay(`${role} - Session: ${sessionId}`);
  }
  
  leaveSession() {
    this.sessionId = null;
    this.isHost = false;
    this.hideSyncOverlay();
  }
  
  showSyncOverlay(status) {
    if (this.syncOverlay) {
      this.syncOverlay.style.display = 'flex';
      const statusEl = this.syncOverlay.querySelector('#sync-status');
      if (statusEl) {
        statusEl.textContent = status;
      }
    }
  }
  
  hideSyncOverlay() {
    if (this.syncOverlay) {
      this.syncOverlay.style.display = 'none';
    }
  }
  
  broadcastPageChange(page) {
    chrome.runtime.sendMessage({
      type: 'SYNC_PAGE',
      page: page,
      sessionId: this.sessionId
    });
  }
  
  navigateToPage(page) {
    this.currentPage = page;
    this.updatePageIndicator();
    
    // Try different methods to navigate to the page
    
    // Method 1: Update URL hash
    if (window.location.hash.includes('page=')) {
      window.location.hash = window.location.hash.replace(/page=\d+/, `page=${page}`);
    } else {
      window.location.hash += (window.location.hash ? '&' : '#') + `page=${page}`;
    }
    
    // Method 2: Find and update page input
    const pageInputs = document.querySelectorAll('input[aria-label*="page" i], input[title*="page" i]');
    pageInputs.forEach(input => {
      input.value = page;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    
    // Method 3: Simulate keyboard navigation
    if (page > this.currentPage) {
      for (let i = 0; i < page - this.currentPage; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      }
    } else if (page < this.currentPage) {
      for (let i = 0; i < this.currentPage - page; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      }
    }
  }
}

// Initialize PDF sync manager
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new PDFSyncManager());
} else {
  new PDFSyncManager();
}