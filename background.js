chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SYNC_PAGE') {
    // Broadcast page change to all tabs in the same session
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id !== sender.tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'PAGE_CHANGED',
            page: message.page,
            sessionId: message.sessionId
          }).catch(() => {
            // Ignore errors for tabs that don't have the content script
          });
        }
      });
    });
  } else if (message.type === 'SYNC_ANNOTATION') {
    // Broadcast annotation to all tabs in the same session
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id !== sender.tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'ANNOTATION_ADDED',
            annotation: message.annotation,
            sessionId: message.sessionId
          }).catch(() => {
            // Ignore errors for tabs that don't have the content script
          });
        }
      });
    });
  } else if (message.type === 'SYNC_ANNOTATION_REMOVAL') {
    // Broadcast annotation removal to all tabs in the same session
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id !== sender.tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'ANNOTATION_REMOVED',
            annotationId: message.annotationId,
            sessionId: message.sessionId
          }).catch(() => {
            // Ignore errors for tabs that don't have the content script
          });
        }
      });
    });
  }
});

// Create context menu for annotations
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'addComment',
    title: 'Add Comment',
    contexts: ['selection']
  });
  
  chrome.contextMenus.create({
    id: 'highlightText',
    title: 'Highlight Text',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'addComment' || info.menuItemId === 'highlightText') {
    chrome.tabs.sendMessage(tab.id, {
      type: 'CONTEXT_MENU_ANNOTATION',
      action: info.menuItemId,
      selectedText: info.selectionText
    });
  }
});