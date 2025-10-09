// Configuration
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/chat'
    : `${window.location.origin}/chat`;

// DOM elements
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
// Conversation history
let conversationHistory = [];

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

// Nieuwe functie voor event cards
function addEventCard(event) {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'event-card';
    
    cardDiv.innerHTML = `
        <div class="event-header">
            <span class="event-title">${event.titel}</span>
        </div>
        <div class="event-details">
            <div class="event-info">
                📅 ${formatDatum(event.datum)} om ${event.tijd}
            </div>
            <div class="event-info">
                📍 ${event.venue}${event.stad ? ', ' + event.stad : ''}
            </div>
        </div>
    `;
    
    messagesDiv.appendChild(cardDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Helper voor datum formatting
function formatDatum(dateStr) {
    const datum = new Date(dateStr);
    const dagen = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
    const maanden = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
    
    return `${dagen[datum.getDay()]} ${datum.getDate()} ${maanden[datum.getMonth()]}`;
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
    
    // Save to history
conversationHistory.push({
    role: 'user',
    content: message
});

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
            body: JSON.stringify({ 
    message,
    history: conversationHistory.slice(-20)
})
        });
        
        const data = await response.json();
        
        // Hide typing and show response
        hideTyping();
        
        // Check if we got structured data or plain text
        if (data.intro && data.events) {
            // Structured response
            addMessage(data.intro);
            
            // Save bot intro to history
if (data.intro) {
    conversationHistory.push({
        role: 'assistant',
        content: data.intro
    });
}

addMessage(data.intro);

            // Add event cards
            data.events.forEach(event => {
                addEventCard(event);
            });
            
            // Add outro
            addMessage(data.outro);
        } else if (data.reply) {
            // Plain text response (fallback)
            addMessage(data.reply);
        } else {
            addMessage('Sorry, er ging iets mis. Probeer het opnieuw.');
        }
        
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