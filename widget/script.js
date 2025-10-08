// Configuration
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/chat'
    : `${window.location.origin}/chat`;

// DOM elements
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

// Add message to chat
function addMessage(text, isUser = false) {
    // Remove quick buttons after first message
    const quickButtons = document.querySelector('.quick-buttons');
    if (quickButtons) {
        quickButtons.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;
    
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';
    bubbleDiv.textContent = text;
    
    messageDiv.appendChild(bubbleDiv);
    messagesDiv.appendChild(messageDiv);
    
    // Scroll to bottom
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Show typing indicator
function showTyping() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot';
    typingDiv.id = 'typing';
    
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.innerHTML = '<span></span><span></span><span></span>';
    
    typingDiv.appendChild(indicator);
    messagesDiv.appendChild(typingDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Hide typing indicator
function hideTyping() {
    const typing = document.getElementById('typing');
    if (typing) {
        typing.remove();
    }
}

// Send message
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;
    
    // Add user message
    addMessage(message, true);
    
    // Clear input and disable
    messageInput.value = '';
    messageInput.disabled = true;
    sendBtn.disabled = true;
    
    // Show typing
    showTyping();
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message })
        });
        
        const data = await response.json();
        
        // Hide typing and show response
        hideTyping();
        addMessage(data.reply || 'Sorry, er ging iets mis. Probeer het opnieuw.');
        
    } catch (error) {
        console.error('Error:', error);
        hideTyping();
        addMessage('Er ging iets mis met de verbinding. Probeer het later opnieuw.');
    }
    
    // Re-enable input
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();
}

// Quick message buttons
function sendQuickMessage(message) {
    messageInput.value = message;
    sendMessage();
}

// Focus input on load
window.addEventListener('load', () => {
    messageInput.focus();
});

// Handle Enter key
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});