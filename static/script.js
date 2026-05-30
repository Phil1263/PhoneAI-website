// PhoneAI Frontend Logic
// Put your deployed backend API URL here in production, e.g. "https://phoneai-api.onrender.com"
const API_BASE_URL = ""; 

document.addEventListener("DOMContentLoaded", () => {
    // State Variables
    let threadId = sessionStorage.getItem("phoneai_thread_id");
    if (!threadId) {
        threadId = "thread_" + Math.random().toString(36).substring(2, 15);
        sessionStorage.setItem("phoneai_thread_id", threadId);
    }
    
    let isRecording = false;
    let isAudioEnabled = true; // Auto play TTS
    let mediaRecorder = null;
    let audioChunks = [];
    let isGenerating = false;
    let currentAudio = null;
    let currentAudioVisualizer = null; // Reference to active wave animation
    let currentAudioNode = null; // Reference to the active message node playing audio
    
    // DOM Elements
    const sidebar = document.getElementById("sidebar");
    const sidebarToggle = document.getElementById("sidebar-toggle");
    const hamburgerMenu = document.getElementById("hamburger-menu");
    const newChatBtn = document.getElementById("new-chat-btn");
    const searchHistory = document.getElementById("search-history");
    const muteToggle = document.getElementById("mute-toggle");
    const clearChatBtn = document.getElementById("clear-chat");
    
    const chatViewport = document.getElementById("chat-viewport");
    const welcomeDashboard = document.getElementById("welcome-dashboard");
    const chatHistory = document.getElementById("chat-history");
    
    const toolAlert = document.getElementById("tool-alert");
    const toolAlertText = document.getElementById("tool-alert-text");
    const voicePanel = document.getElementById("voice-panel");
    const cancelVoiceBtn = document.getElementById("cancel-voice-btn");
    
    const textInput = document.getElementById("text-input");
    const micBtn = document.getElementById("mic-btn");
    const sendBtn = document.getElementById("send-btn");
    
    // Configure marked options
    marked.setOptions({
        breaks: true,
        gfm: true
    });
    
    // Sidebar Controls
    if (hamburgerMenu) {
        hamburgerMenu.addEventListener("click", () => {
            sidebar.classList.add("active");
        });
    }
    
    if (sidebarToggle) {
        sidebarToggle.addEventListener("click", () => {
            sidebar.classList.remove("active");
        });
    }
    
    // Click outside sidebar on mobile to close it
    document.addEventListener("click", (e) => {
        if (window.innerWidth <= 900) {
            if (!sidebar.contains(e.target) && !hamburgerMenu.contains(e.target) && sidebar.classList.contains("active")) {
                sidebar.classList.remove("active");
            }
        }
    });
    
    // New Consult Action
    newChatBtn.addEventListener("click", () => {
        if (isGenerating) return;
        stopCurrentAudio();
        chatHistory.innerHTML = "";
        chatHistory.classList.add("hidden");
        welcomeDashboard.classList.remove("hidden");
        
        // Generate new session thread
        threadId = "thread_" + Math.random().toString(36).substring(2, 15);
        sessionStorage.setItem("phoneai_thread_id", threadId);
        
        if (window.innerWidth <= 900) {
            sidebar.classList.remove("active");
        }
        
        textInput.value = "";
        adjustTextareaHeight();
        toggleSendButtonState();
    });
    
    // Auto-Voice Playback Mute Action
    muteToggle.addEventListener("click", () => {
        isAudioEnabled = !isAudioEnabled;
        if (isAudioEnabled) {
            muteToggle.innerHTML = '<i class="fa-solid fa-volume-high"></i><span>Voice Autoplay: ON</span>';
            muteToggle.style.color = "var(--text-primary)";
        } else {
            muteToggle.innerHTML = '<i class="fa-solid fa-volume-xmark"></i><span>Voice Autoplay: OFF</span>';
            muteToggle.style.color = "var(--text-secondary)";
            stopCurrentAudio();
        }
    });
    
    // Clear Active UI Chat Pane (doesn't refresh thread ID)
    clearChatBtn.addEventListener("click", () => {
        if (isGenerating) return;
        stopCurrentAudio();
        chatHistory.innerHTML = "";
        chatHistory.classList.add("hidden");
        welcomeDashboard.classList.remove("hidden");
    });
    
    // Auto-grow text input box
    textInput.addEventListener("input", () => {
        adjustTextareaHeight();
        toggleSendButtonState();
    });
    
    function adjustTextareaHeight() {
        textInput.style.height = "auto";
        textInput.style.height = (textInput.scrollHeight - 10) + "px";
    }
    
    function toggleSendButtonState() {
        sendBtn.disabled = textInput.value.trim() === "";
    }
    
    // Handle typing enter key (Shift+Enter for new line)
    textInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submitQuery();
        }
    });
    
    // Click Suggestion Cards
    document.querySelectorAll(".suggestion-card").forEach(card => {
        card.addEventListener("click", () => {
            const prompt = card.getAttribute("data-prompt");
            if (prompt) {
                textInput.value = prompt;
                adjustTextareaHeight();
                toggleSendButtonState();
                submitQuery();
            }
        });
    });
    
    // Click Sidebar Prompt Items
    document.querySelectorAll(".history-item").forEach(item => {
        item.addEventListener("click", () => {
            const prompt = item.getAttribute("data-prompt");
            if (prompt) {
                textInput.value = prompt;
                adjustTextareaHeight();
                toggleSendButtonState();
                submitQuery();
                if (window.innerWidth <= 900) {
                    sidebar.classList.remove("active");
                }
            }
        });
    });
    
    // Send Button Click
    sendBtn.addEventListener("click", submitQuery);
    
    // Submit Chat Logic
    async function submitQuery() {
        const query = textInput.value.trim();
        if (!query || isGenerating) return;
        
        isGenerating = true;
        stopCurrentAudio();
        
        // UI Cleanups
        textInput.value = "";
        textInput.disabled = true;
        sendBtn.disabled = true;
        adjustTextareaHeight();
        
        // Hide Welcome Pane on first run
        if (!welcomeDashboard.classList.contains("hidden")) {
            welcomeDashboard.classList.add("hidden");
            chatHistory.classList.remove("hidden");
        }
        
        // Append User Message
        appendMessage("user", query);
        
        // Append Bot Node Holder
        const botNode = appendMessage("assistant", "");
        const botBubble = botNode.querySelector(".message-bubble");
        
        // Append dynamic blinking cursor
        const cursor = document.createElement("span");
        cursor.className = "streaming-cursor";
        cursor.innerHTML = '<i class="fa-solid fa-circle" style="font-size: 6px; margin-left: 4px; animation: blink 1s infinite;"></i>';
        botBubble.appendChild(cursor);
        
        let accumulatedText = "";
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message: query,
                    thread_id: threadId
                })
            });
            
            if (!response.ok) {
                if (response.status === 429) {
                    try {
                        const errData = await response.json();
                        throw new Error(errData.detail || "Quota exceeded.");
                    } catch (e) {
                        throw new Error(e.message || "Quota exceeded.");
                    }
                }
                throw new Error(`Server returned status: ${response.status}`);
            }
            
            // Read SSE streams
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let partialData = "";
            
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                
                partialData += decoder.decode(value, { stream: true });
                const lines = partialData.split("\n\n");
                partialData = lines.pop(); // Keep remaining incomplete block
                
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const rawJson = line.substring(6).trim();
                        if (!rawJson) continue;
                        
                        try {
                            const event = JSON.parse(rawJson);
                            
                            if (event.type === "token") {
                                accumulatedText += event.content;
                                // Remove cursor, render markdown, append cursor back
                                cursor.remove();
                                botBubble.innerHTML = marked.parse(accumulatedText);
                                postProcessCodeBlocks(botBubble);
                                botBubble.appendChild(cursor);
                                scrollToBottom();
                            } else if (event.type === "tool_start") {
                                showToolAlert(`Retrieving specifications database for: '${query.substring(0, 30)}...'`);
                            } else if (event.type === "tool_end") {
                                hideToolAlert();
                            } else if (event.type === "done") {
                                cursor.remove();
                            } else if (event.type === "error") {
                                throw new Error(event.content);
                            }
                        } catch (err) {
                            console.error("Error parsing stream chunk", err);
                        }
                    }
                }
            }
            
            cursor.remove();
            
            // Add TTS controls if text generated
            if (accumulatedText.trim()) {
                addAudioControls(botNode, accumulatedText);
                
                // Autoplay TTS if configured
                if (isAudioEnabled) {
                    playTTS(accumulatedText, botNode);
                }
            }
            
        } catch (error) {
            console.error("Chat error:", error);
            cursor.remove();
            botBubble.innerHTML = `<p style="color: #ea4335;"><i class="fa-solid fa-circle-exclamation"></i> Error: ${error.message || "Failed to reach backend."}</p>`;
        } finally {
            isGenerating = false;
            textInput.disabled = false;
            textInput.focus();
            toggleSendButtonState();
            hideToolAlert();
        }
    }
    
    // Add Copy code feature to code blocks
    function postProcessCodeBlocks(container) {
        const preBlocks = container.querySelectorAll("pre");
        preBlocks.forEach(pre => {
            if (pre.querySelector(".copy-code-btn")) return;
            
            pre.style.position = "relative";
            const copyBtn = document.createElement("button");
            copyBtn.className = "copy-code-btn";
            copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
            copyBtn.style.cssText = "position: absolute; right: 12px; top: 12px; font-size: 0.75rem; color: var(--text-secondary); background: var(--bg-main); border: 1px solid var(--border-color); padding: 4px 8px; border-radius: 6px; z-index: 10;";
            
            pre.appendChild(copyBtn);
            
            copyBtn.addEventListener("click", () => {
                const codeNode = pre.querySelector("code");
                if (codeNode) {
                    navigator.clipboard.writeText(codeNode.innerText).then(() => {
                        copyBtn.innerHTML = '<i class="fa-solid fa-check" style="color: #34a853;"></i> Copied!';
                        setTimeout(() => {
                            copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
                        }, 2000);
                    });
                }
            });
        });
    }
    
    // Helper to Append HTML message node
    function appendMessage(role, text) {
        const messageNode = document.createElement("div");
        messageNode.className = `message-node ${role}`;
        
        const iconDiv = document.createElement("div");
        iconDiv.className = "message-icon";
        
        if (role === "user") {
            iconDiv.innerHTML = '<i class="fa-solid fa-user"></i>';
        } else {
            iconDiv.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
        }
        
        const contentDiv = document.createElement("div");
        contentDiv.className = "message-content";
        
        const bubbleDiv = document.createElement("div");
        bubbleDiv.className = "message-bubble";
        bubbleDiv.innerHTML = role === "user" ? escapeHtml(text) : marked.parse(text);
        
        contentDiv.appendChild(bubbleDiv);
        messageNode.appendChild(iconDiv);
        messageNode.appendChild(contentDiv);
        
        chatHistory.appendChild(messageNode);
        scrollToBottom();
        
        return messageNode;
    }
    
    // Add Replay Audio button to assistant response
    function addAudioControls(messageNode, text) {
        const contentDiv = messageNode.querySelector(".message-content");
        
        const controlsDiv = document.createElement("div");
        controlsDiv.className = "assistant-audio-controls";
        
        const btn = document.createElement("button");
        btn.className = "replay-audio-btn";
        btn.innerHTML = '<i class="fa-solid fa-volume-high"></i> Listen response';
        
        controlsDiv.appendChild(btn);
        contentDiv.appendChild(controlsDiv);
        
        btn.addEventListener("click", () => {
            playTTS(text, messageNode);
        });
    }
    
    // Play Text-to-Speech
    async function playTTS(text, messageNode) {
        // Toggle play/stop: If the same message audio button is clicked while playing, stop it.
        if (currentAudio && currentAudioNode === messageNode) {
            stopCurrentAudio();
            return;
        }
        
        stopCurrentAudio();
        currentAudioNode = messageNode;
        
        // Find or create mini voice visualizer wave in the button
        const btn = messageNode.querySelector(".replay-audio-btn");
        if (!btn) return;
        
        // Show playing state inside the button
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `
            <div class="voice-wave-mini">
                <span></span>
                <span></span>
                <span></span>
            </div>
            Playing...
        `;
        currentAudioVisualizer = { btn, originalHtml };
        
        try {
            // Remove markdown syntax for cleaner speech
            const cleanText = text.replace(/[*#`_\-]/g, " ").substring(0, 1500); // safety cap
            
            const response = await fetch(`${API_BASE_URL}/api/tts`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ text: cleanText })
            });
            
            if (!response.ok) {
                if (response.status === 429) {
                    try {
                        const errData = await response.json();
                        throw new Error(errData.detail || "Audio rate limited.");
                    } catch (e) {
                        throw new Error(e.message || "Audio rate limited.");
                    }
                }
                throw new Error("TTS generation failed");
            }
            
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            
            currentAudio = new Audio(url);
            currentAudio.play();
            
            currentAudio.onended = () => {
                resetAudioVisualizer();
            };
            
            currentAudio.onerror = () => {
                resetAudioVisualizer();
            };
            
        } catch (err) {
            console.error("TTS audio error:", err);
            resetAudioVisualizer();
        }
    }
    
    function resetAudioVisualizer() {
        if (currentAudioVisualizer) {
            currentAudioVisualizer.btn.innerHTML = currentAudioVisualizer.originalHtml;
            currentAudioVisualizer = null;
        }
    }
    
    function stopCurrentAudio() {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }
        resetAudioVisualizer();
        currentAudioNode = null;
    }
    
    // Microphone Voice Input Controls
    micBtn.addEventListener("click", toggleRecording);
    cancelVoiceBtn.addEventListener("click", cancelRecording);
    
    async function toggleRecording() {
        if (isGenerating) return;
        
        if (!isRecording) {
            // Start recording audio
            audioChunks = [];
            
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                
                // Select MIME Type (WebM standard, WAV or MP4 fallback)
                let options = { mimeType: "audio/webm" };
                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    options = { mimeType: "audio/ogg" };
                    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                        options = { mimeType: "audio/mp4" };
                        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                            options = {}; // use browser default
                        }
                    }
                }
                
                mediaRecorder = new MediaRecorder(stream, options);
                
                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) {
                        audioChunks.push(e.data);
                    }
                };
                
                mediaRecorder.onstop = async () => {
                    // Check if recording was cancelled
                    if (audioChunks.length === 0) {
                        return;
                    }
                    
                    const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
                    await processAudioBlob(audioBlob);
                };
                
                // Update UI state
                isRecording = true;
                micBtn.classList.remove("mic-inactive");
                micBtn.classList.add("mic-active");
                voicePanel.classList.remove("hidden");
                textInput.placeholder = "Listening to your voice...";
                textInput.disabled = true;
                
                mediaRecorder.start();
                
            } catch (err) {
                console.error("Microphone setup failed:", err);
                alert("Microphone permission denied or unsupported. Please type your query instead.");
                resetRecordingUi();
            }
        } else {
            // Stop recording
            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                mediaRecorder.stop();
                // Stop mic track stream
                mediaRecorder.stream.getTracks().forEach(track => track.stop());
            }
            resetRecordingUi();
        }
    }
    
    function cancelRecording() {
        audioChunks = [];
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
        resetRecordingUi();
    }
    
    function resetRecordingUi() {
        isRecording = false;
        micBtn.classList.remove("mic-active");
        micBtn.classList.add("mic-inactive");
        voicePanel.classList.add("hidden");
        textInput.placeholder = "Message PhoneAI...";
        textInput.disabled = false;
        textInput.focus();
    }
    
    async function processAudioBlob(audioBlob) {
        showToolAlert("Transcribing voice input with Whisper...");
        
        try {
            const formData = new FormData();
            // Determine file extension for backend
            let ext = "webm";
            if (mediaRecorder && mediaRecorder.mimeType) {
                if (mediaRecorder.mimeType.includes("ogg")) ext = "ogg";
                else if (mediaRecorder.mimeType.includes("mp4")) ext = "mp4";
                else if (mediaRecorder.mimeType.includes("wav")) ext = "wav";
            }
            
            formData.append("file", audioBlob, `input_audio.${ext}`);
            
            const response = await fetch(`${API_BASE_URL}/api/stt`, {
                method: "POST",
                body: formData
            });
            
            if (!response.ok) {
                if (response.status === 429) {
                    try {
                        const errData = await response.json();
                        throw new Error(errData.detail || "Transcription rate limited.");
                    } catch (e) {
                        throw new Error(e.message || "Transcription rate limited.");
                    }
                }
                throw new Error("Voice transcription failed");
            }
            
            const data = await response.json();
            hideToolAlert();
            
            if (data.text && data.text.trim()) {
                textInput.value = data.text;
                adjustTextareaHeight();
                toggleSendButtonState();
                // Automatically send message!
                submitQuery();
            } else {
                alert("No clear speech detected. Please try again.");
            }
            
        } catch (err) {
            console.error("STT network error:", err);
            hideToolAlert();
            alert("Error transcribing voice: " + err.message);
        }
    }
    
    // Tool Alert helpers
    function showToolAlert(text) {
        toolAlertText.innerText = text;
        toolAlert.classList.remove("hidden");
    }
    
    function hideToolAlert() {
        toolAlert.classList.add("hidden");
    }
    
    // Viewport Scroll Helpers
    function scrollToBottom() {
        chatViewport.scrollTop = chatViewport.scrollHeight;
    }
    
    // Escape HTML text utility
    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    // Listen to resize to adapt sidebar states
    window.addEventListener("resize", () => {
        if (window.innerWidth > 900) {
            sidebar.classList.remove("hidden");
            sidebar.classList.remove("active");
        }
    });
});
