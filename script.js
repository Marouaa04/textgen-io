document.addEventListener('DOMContentLoaded', function() {
    const inputText = document.getElementById('input-text');
    const outputText = document.getElementById('output-text');
    const charCount = document.getElementById('char-count');
    const generateBtn = document.getElementById('generate-btn');
    const rephraseBtn = document.getElementById('rephrase-btn');
    const grammarBtn = document.getElementById('grammar-btn');
    const scriptBtn = document.getElementById('script-btn');

    // Character counter
    inputText.addEventListener('input', function() {
        const length = this.value.length;
        charCount.textContent = length;
        
        if (length >= 500) {
            charCount.style.color = '#ff4444';
        } else {
            charCount.style.color = '#999';
        }
    });

    const BACKEND_URL = 'https://web-production-2401b.up.railway.app';

    // Process text function
    async function processText(action) {
        const text = inputText.value.trim();
        
        if (!text) {
            outputText.textContent = 'Please enter some text to process.';
            return;
        }

        // Show loading state
        outputText.textContent = 'Processing...';
        
        try {
            console.log(`Sending request to ${BACKEND_URL}/api/process with action: ${action}`);
            
            const response = await fetch(`${BACKEND_URL}/api/process`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: text,
                    action: action  // This will be 'generate', 'rephrase', 'grammar', or 'script'
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                outputText.textContent = data.result;
            } else {
                outputText.textContent = 'Error: ' + (data.error || 'Unknown error');
            }
        } catch (error) {
            console.error('Error:', error);
            outputText.textContent = '⚠️ Error connecting to server. Make sure backend is running at port 5000.';
        }
    }

    // Event listeners - each button now sends a DIFFERENT action
    generateBtn.addEventListener('click', () => processText('generate'));  // Changed to 'generate'
    rephraseBtn.addEventListener('click', () => processText('rephrase'));
    grammarBtn.addEventListener('click', () => processText('grammar'));
    scriptBtn.addEventListener('click', () => processText('script'));      // This is now ONLY for scripts

});
