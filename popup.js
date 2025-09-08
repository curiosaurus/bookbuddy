document.addEventListener('DOMContentLoaded', function() {
  const statusEl = document.getElementById('status');
  const sessionIdInput = document.getElementById('sessionId');
  const createBtn = document.getElementById('createSession');
  const joinBtn = document.getElementById('joinSession');
  const leaveBtn = document.getElementById('leaveSession');
  const sessionInfo = document.getElementById('sessionInfo');
  const currentSessionEl = document.getElementById('currentSession');
  const participantCountEl = document.getElementById('participantCount');
  const annotationControls = document.getElementById('annotationControls');
  const highlightBtn = document.getElementById('highlightBtn');
  const commentBtn = document.getElementById('commentBtn');
  const clearAnnotationsBtn = document.getElementById('clearAnnotations');
  const colorOptions = document.querySelectorAll('.color-option');
  const annotationList = document.getElementById('annotationList');
  
  let selectedColor = '#ffeb3b';
  let annotationMode = 'none'; // 'highlight', 'comment', 'none'
  
  // Generate random session ID
  function generateSessionId() {
    return Math.random().toString(36).substr(2, 8).toUpperCase();
  }
  
  // Load current state
  chrome.storage.local.get(['currentSession', 'isHost'], function(result) {
    if (result.currentSession) {
      showConnectedState(result.currentSession, result.isHost);
    }
  });
  
  // Create session
  createBtn.addEventListener('click', function() {
    const sessionId = sessionIdInput.value || generateSessionId();
    sessionIdInput.value = sessionId;
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0].url.includes('.pdf') || tabs[0].url.includes('pdf')) {
        chrome.storage.local.set({
          currentSession: sessionId,
          isHost: true
        });
        
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'CREATE_SESSION',
          sessionId: sessionId
        });
        
        showConnectedState(sessionId, true);
      } else {
        statusEl.textContent = 'Please open a PDF first!';
        statusEl.style.background = 'rgba(244, 67, 54, 0.3)';
      }
    });
  });
  
  // Join session
  joinBtn.addEventListener('click', function() {
    const sessionId = sessionIdInput.value;
    if (!sessionId) {
      statusEl.textContent = 'Please enter a session ID';
      return;
    }
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0].url.includes('.pdf') || tabs[0].url.includes('pdf')) {
        chrome.storage.local.set({
          currentSession: sessionId,
          isHost: false
        });
        
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'JOIN_SESSION',
          sessionId: sessionId
        });
        
        showConnectedState(sessionId, false);
      } else {
        statusEl.textContent = 'Please open a PDF first!';
        statusEl.style.background = 'rgba(244, 67, 54, 0.3)';
      }
    });
  });
  
  // Leave session
  leaveBtn.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'LEAVE_SESSION'
      });
    });
    
    chrome.storage.local.remove(['currentSession', 'isHost']);
    showDisconnectedState();
  });
  
  // Color picker
  colorOptions.forEach(option => {
    option.addEventListener('click', function() {
      colorOptions.forEach(o => o.classList.remove('selected'));
      this.classList.add('selected');
      selectedColor = this.dataset.color;
      
      // Send color change to content script
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SET_HIGHLIGHT_COLOR',
          color: selectedColor
        });
      });
    });
  });
  
  // Annotation mode buttons
  highlightBtn.addEventListener('click', function() {
    toggleAnnotationMode('highlight');
  });
  
  commentBtn.addEventListener('click', function() {
    toggleAnnotationMode('comment');
  });
  
  // Clear annotations
  clearAnnotationsBtn.addEventListener('click', function() {
    if (confirm('Clear all annotations? This cannot be undone.')) {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'CLEAR_ANNOTATIONS'
        });
      });
      updateAnnotationList([]);
    }
  });
  
  function toggleAnnotationMode(mode) {
    if (annotationMode === mode) {
      annotationMode = 'none';
      highlightBtn.style.background = 'rgba(255,255,255,0.2)';
      commentBtn.style.background = 'rgba(255,255,255,0.2)';
    } else {
      annotationMode = mode;
      highlightBtn.style.background = mode === 'highlight' ? '#4CAF50' : 'rgba(255,255,255,0.2)';
      commentBtn.style.background = mode === 'comment' ? '#4CAF50' : 'rgba(255,255,255,0.2)';
    }
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'SET_ANNOTATION_MODE',
        mode: annotationMode,
        color: selectedColor
      });
    });
  }
  
  function updateAnnotationList(annotations) {
    annotationList.innerHTML = '';
    annotations.forEach((annotation, index) => {
      const item = document.createElement('div');
      item.className = 'annotation-item';
      item.innerHTML = `
        <div class="annotation-type" style="color: ${annotation.color || '#ffeb3b'};">
          ${annotation.type === 'highlight' ? '🖍️ HIGHLIGHT' : '💬 COMMENT'}
        </div>
        <div style="margin-top: 4px;">
          ${annotation.type === 'highlight' ? 
            annotation.text.substring(0, 30) + (annotation.text.length > 30 ? '...' : '') :
            annotation.comment.substring(0, 30) + (annotation.comment.length > 30 ? '...' : '')
          }
        </div>
        <div style="font-size: 10px; opacity: 0.8; margin-top: 2px;">Page ${annotation.page}</div>
      `;
      
      item.addEventListener('click', () => {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'FOCUS_ANNOTATION',
            annotationId: annotation.id
          });
        });
        window.close();
      });
      
      annotationList.appendChild(item);
    });
  }
  
  // Listen for annotation updates
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ANNOTATIONS_UPDATED') {
      updateAnnotationList(message.annotations);
    }
  });
  
  function showConnectedState(sessionId, isHost) {
    statusEl.textContent = `Connected as ${isHost ? 'Host' : 'Participant'}`;
    statusEl.style.background = 'rgba(76, 175, 80, 0.3)';
    
    currentSessionEl.textContent = sessionId;
    sessionInfo.classList.add('connected');
    annotationControls.classList.add('active');
    
    createBtn.style.display = 'none';
    joinBtn.style.display = 'none';
    leaveBtn.style.display = 'block';
    
    sessionIdInput.value = sessionId;
    sessionIdInput.disabled = true;
    
    // Load existing annotations
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'GET_ANNOTATIONS'
      });
    });
  }
  
  function showDisconnectedState() {
    statusEl.textContent = 'Ready to sync PDFs';
    statusEl.style.background = 'rgba(255,255,255,0.1)';
    
    sessionInfo.classList.remove('connected');
    annotationControls.classList.remove('active');
    
    createBtn.style.display = 'block';
    joinBtn.style.display = 'block';
    leaveBtn.style.display = 'none';
    
    sessionIdInput.disabled = false;
    sessionIdInput.value = '';
    
    // Reset annotation mode
    annotationMode = 'none';
    highlightBtn.style.background = 'rgba(255,255,255,0.2)';
    commentBtn.style.background = 'rgba(255,255,255,0.2)';
    updateAnnotationList([]);
  }
});