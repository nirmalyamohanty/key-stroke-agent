let editor = null;
let currentLanguage = "python";

// =====================================================
// WebSocket Connection
// =====================================================

const socket = new WebSocket("ws://127.0.0.1:8000/ws");

socket.onopen = function () {
    console.log("Connected to KeyStroke Agent WS");
    const statusText = document.getElementById("connectionStatus");
    const statusDot = document.getElementById("statusDot");
    
    if (statusText) statusText.textContent = "Connected";
    if (statusDot) {
        statusDot.className = "status-dot connected";
    }
};

socket.onclose = function () {
    console.log("Disconnected from WS");
    const statusText = document.getElementById("connectionStatus");
    const statusDot = document.getElementById("statusDot");
    
    if (statusText) statusText.textContent = "Disconnected";
    if (statusDot) {
        statusDot.className = "status-dot disconnected";
    }
};

socket.onerror = function (error) {
    console.error("WebSocket error:", error);
    const statusText = document.getElementById("connectionStatus");
    const statusDot = document.getElementById("statusDot");
    
    if (statusText) statusText.textContent = "Connection Error";
    if (statusDot) {
        statusDot.className = "status-dot disconnected";
    }
};

// Receive updates from backend agent
socket.onmessage = function (message) {
    try {
        const data = JSON.parse(message.data);
        console.log("Agent response:", data);
        updateUI(data);

        if (data.assistance_needed && data.suggestion) {
            showSuggestion(data.suggestion);
        } else if (data.struggle_score < 0.5) {
            hideSuggestion();
        }
    } catch (err) {
        console.error("Error parsing message:", err);
    }
};

// =====================================================
// Monaco Editor Initialization
// =====================================================

require.config({
    paths: {
        vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs"
    }
});

require(["vs/editor/editor.main"], function () {
    editor = monaco.editor.create(document.getElementById("editor"), {
        value: `# Keystroke Agent - Real-Time Algorithm Workspace\n# Start typing your code below...\n\ndef two_sum(nums, target):\n    seen = {}\n    for i, num in enumerate(nums):\n        complement = target - num\n        if complement in seen:\n            return [seen[complement], i]\n        seen[num] = i\n    return []\n`,
        language: "python",
        theme: "vs-dark",
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 14,
        fontFamily: "'JetBrains Mono', Consolas, monospace",
        wordWrap: "on",
        padding: { top: 16 }
    });

    console.log("Monaco Editor Initialized");

    // Update character count on edit
    editor.onDidChangeModelContent(function () {
        const val = editor.getValue();
        const countDisplay = document.getElementById("charCountDisplay");
        if (countDisplay) {
            countDisplay.textContent = `${val.length} chars`;
        }
    });

    setupKeyboardDetection();
    setupTabSwitching();
    setupDemoControls();
});

// =====================================================
// Event Transmission
// =====================================================

function sendEvent(eventType, characterCount) {
    if (socket.readyState !== WebSocket.OPEN || !editor) {
        return;
    }

    const event = {
        session_id: "session_001",
        timestamp: Date.now() / 1000,
        event_type: eventType,
        character_count: characterCount,
        code: editor.getValue(),
        language: currentLanguage
    };

    console.log("Sending event:", event);
    socket.send(JSON.stringify(event));
}

// =====================================================
// Keyboard Event Detection
// =====================================================

function setupKeyboardDetection() {
    if (!editor) return;

    editor.onKeyDown(function (event) {
        const keyCode = event.keyCode;
        const KeyCode = monaco.KeyCode;

        if (keyCode === KeyCode.Backspace) {
            sendEvent("backspace", 1);
            setEventTicker("Backspace detected ⌫");
            return;
        }

        if (keyCode === KeyCode.Delete) {
            sendEvent("delete", 1);
            setEventTicker("Delete detected ❌");
            return;
        }

        if (
            event.browserEvent &&
            event.browserEvent.key &&
            event.browserEvent.key.length === 1 &&
            !event.browserEvent.ctrlKey &&
            !event.browserEvent.metaKey &&
            !event.browserEvent.altKey
        ) {
            sendEvent("keypress", 1);
            setEventTicker(`Keypress: '${event.browserEvent.key}' ⌨️`);
        }
    });
}

document.addEventListener("paste", function (event) {
    if (!editor) return;
    const text = event.clipboardData.getData("text") || "";
    sendEvent("paste", text.length);
    setEventTicker(`Paste detected (${text.length} chars) 📋`);
});

function setEventTicker(text) {
    const el = document.getElementById("eventStatus");
    if (el) el.textContent = text;
}

// =====================================================
// UI State Updates & Gauge Animations
// =====================================================

function updateUI(state) {
    if (state.total_keystrokes !== undefined) {
        setText("keystrokes", state.total_keystrokes);
    }
    if (state.total_backspaces !== undefined) {
        setText("backspaces", state.total_backspaces);
    }
    if (state.total_deletes !== undefined) {
        setText("deletes", state.total_deletes);
    }
    if (state.total_inserted_characters !== undefined) {
        setText("inserted", state.total_inserted_characters);
    }
    if (state.total_deleted_characters !== undefined) {
        setText("deleted", state.total_deleted_characters);
    }

    if (state.last_latency !== null && state.last_latency !== undefined) {
        setText("latency", state.last_latency.toFixed(2) + "s");
    }

    setText("pause", state.pause_detected ? "Yes ⚠️" : "No");

    if (state.backspace_ratio !== undefined) {
        setText("backspaceRatio", (state.backspace_ratio * 100).toFixed(0) + "%");
    }

    // Update Struggle Score Gauge & Colors
    if (state.struggle_score !== undefined) {
        const score = state.struggle_score;
        const scoreEl = document.getElementById("struggleScore");
        const statusTag = document.getElementById("struggleStatusTag");
        const progressBar = document.getElementById("struggleProgressBar");

        if (scoreEl) scoreEl.textContent = score.toFixed(1);

        const percentage = Math.min(Math.max(score * 100, 0), 100);
        if (progressBar) {
            progressBar.style.width = percentage + "%";
        }

        if (score < 0.4) {
            if (scoreEl) scoreEl.style.color = "#10B981";
            if (statusTag) {
                statusTag.textContent = "Fluid Flow 🟢";
                statusTag.style.background = "rgba(16, 185, 129, 0.15)";
                statusTag.style.color = "#10B981";
                statusTag.style.borderColor = "rgba(16, 185, 129, 0.3)";
            }
            if (progressBar) progressBar.style.background = "linear-gradient(90deg, #10B981, #06B6D4)";
        } else if (score < 0.7) {
            if (scoreEl) scoreEl.style.color = "#F59E0B";
            if (statusTag) {
                statusTag.textContent = "Hesitation 🟡";
                statusTag.style.background = "rgba(245, 158, 11, 0.15)";
                statusTag.style.color = "#F59E0B";
                statusTag.style.borderColor = "rgba(245, 158, 11, 0.3)";
            }
            if (progressBar) progressBar.style.background = "linear-gradient(90deg, #F59E0B, #8B5CF6)";
        } else {
            if (scoreEl) scoreEl.style.color = "#EF4444";
            if (statusTag) {
                statusTag.textContent = "High Friction 🔴";
                statusTag.style.background = "rgba(239, 68, 68, 0.15)";
                statusTag.style.color = "#EF4444";
                statusTag.style.borderColor = "rgba(239, 68, 68, 0.3)";
            }
            if (progressBar) progressBar.style.background = "linear-gradient(90deg, #F59E0B, #EF4444)";
        }
    }
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function showSuggestion(suggestion) {
    const box = document.getElementById("suggestionBox");
    const text = document.getElementById("suggestionText");

    if (text) text.textContent = suggestion;
    if (box) box.style.display = "block";
}

function hideSuggestion() {
    const box = document.getElementById("suggestionBox");
    if (box) box.style.display = "none";
}

// =====================================================
// Tab Switching (Python / C++ / Java)
// =====================================================

function setupTabSwitching() {
    const tabPy = document.getElementById("tabPython");
    const tabCpp = document.getElementById("tabCpp");
    const tabJava = document.getElementById("tabJava");

    if (tabPy) {
        tabPy.addEventListener("click", () => setLang("python", tabPy, [tabCpp, tabJava]));
    }
    if (tabCpp) {
        tabCpp.addEventListener("click", () => setLang("cpp", tabCpp, [tabPy, tabJava]));
    }
    if (tabJava) {
        tabJava.addEventListener("click", () => setLang("java", tabJava, [tabPy, tabCpp]));
    }
}

function setLang(lang, activeTab, otherTabs) {
    currentLanguage = lang;
    activeTab.className = "tab active";
    otherTabs.forEach(t => { if (t) t.className = "tab"; });
    if (editor && monaco) {
        monaco.editor.setModelLanguage(editor.getModel(), lang);
    }
}

// =====================================================
// Interactive Demo Controls
// =====================================================

function setupDemoControls() {
    const btnSmooth = document.getElementById("btnSmoothDemo");
    const btnFriction = document.getElementById("btnFrictionDemo");
    const btnReset = document.getElementById("btnReset");

    if (btnSmooth) {
        btnSmooth.addEventListener("click", () => {
            simulateTyping(["def ", "solution", "(arr):\n", "    return ", "sorted(arr)"], 150);
        });
    }

    if (btnFriction) {
        btnFriction.addEventListener("click", () => {
            // Fire multiple backspaces to simulate high struggle score
            let count = 0;
            const interval = setInterval(() => {
                sendEvent("backspace", 1);
                setEventTicker("Simulating rapid backspace erasing... ⌫");
                count++;
                if (count >= 6) {
                    clearInterval(interval);
                    showSuggestion("💡 Hint: You seem to be erasing code repeatedly. Consider using Kadane's Algorithm for contiguous subarray sum computation with O(N) time complexity.");
                }
            }, 200);
        });
    }

    if (btnReset) {
        btnReset.addEventListener("click", () => {
            updateUI({
                total_keystrokes: 0,
                total_backspaces: 0,
                total_deletes: 0,
                total_inserted_characters: 0,
                total_deleted_characters: 0,
                last_latency: 0,
                pause_detected: false,
                backspace_ratio: 0,
                struggle_score: 0.0
            });
            hideSuggestion();
            setEventTicker("Metrics reset 🔄");
        });
    }
}

function simulateTyping(chunks, delay) {
    let index = 0;
    const interval = setInterval(() => {
        if (index >= chunks.length || !editor) {
            clearInterval(interval);
            return;
        }
        editor.trigger("keyboard", "type", { text: chunks[index] });
        sendEvent("keypress", chunks[index].length);
        index++;
    }, delay);
}