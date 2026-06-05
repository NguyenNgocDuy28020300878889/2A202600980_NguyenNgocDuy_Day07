// PLAYGROUND APP CONTROLLER

const API_BASE = "http://localhost:8000";

// State
let appState = {
    provider: "mock",
    chunksCount: 0,
    loadedDocuments: [],
    selectedStrategy: "recursive"
};

// Sample Text for Sandbox
const SAMPLE_TEXT = `Artificial intelligence is transforming biology. In cell analysis, spatial transcriptomics allows researchers to measure gene expression across cells while preserving spatial coordinates.

COSMOS is a platform for real-time morphology-based, label-free cell sorting using deep learning. It was published in Communications Biology 2023. By leveraging custom optical setups and fast neural network models, COSMOS processes single cell images in milliseconds to decide sorting coordinates.

SMOPCA (spatially aware dimension reduction integrating multi-omics) was proposed in Genome Biology 2025. It improves the efficiency of spatial domain detection. Standard methods fail because they ignore spatial relationships or cannot integrate multiple omics layers cooperatively. SMOPCA addresses these limitations by introducing a spatially aware principal component analysis.`;

// Document Init
document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initSettingsListeners();
    initSandbox();
    initStoreExplorer();
    initRAGAgent();
    initBenchmark();
    
    // Initial status check
    updateStatus();
    
    // Load sample text in sandbox by default
    document.getElementById("sandbox-textarea").value = SAMPLE_TEXT;
});

// 1. TAB NAVIGATION
function initTabs() {
    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabPanes = document.querySelectorAll(".tab-pane");

    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetTab = btn.dataset.tab;
            
            // Toggle buttons
            tabButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            // Toggle panes
            tabPanes.forEach(pane => {
                pane.classList.remove("active");
                if (pane.id === targetTab) {
                    pane.classList.add("active");
                }
            });
        });
    });
}

// 2. SETTINGS & STATUS
function initSettingsListeners() {
    const providerSelect = document.getElementById("provider-select");
    const openaiKeyGroup = document.getElementById("openai-key-group");
    const strategySelect = document.getElementById("strategy-select");
    const sizeSettings = document.getElementById("size-settings");
    const overlapGroup = document.getElementById("overlap-group");
    const sentenceSettings = document.getElementById("sentence-settings");
    const btnIngest = document.getElementById("btn-ingest");
    const ingestLoader = document.getElementById("ingest-loader");

    // Provider switch
    providerSelect.addEventListener("change", () => {
        const val = providerSelect.value;
        if (val === "openai") {
            openaiKeyGroup.classList.remove("hidden");
        } else {
            openaiKeyGroup.classList.add("hidden");
        }
    });

    // Strategy switch
    strategySelect.addEventListener("change", () => {
        const val = strategySelect.value;
        appState.selectedStrategy = val;
        
        if (val === "fixed_size") {
            sizeSettings.classList.remove("hidden");
            overlapGroup.classList.remove("hidden");
            sentenceSettings.classList.add("hidden");
        } else if (val === "by_sentences") {
            sizeSettings.classList.add("hidden");
            sentenceSettings.classList.remove("hidden");
        } else {
            // Recursive
            sizeSettings.classList.remove("hidden");
            overlapGroup.classList.add("hidden");
            sentenceSettings.classList.add("hidden");
        }
    });

    // Ingest action
    btnIngest.addEventListener("click", async () => {
        btnIngest.disabled = true;
        ingestLoader.classList.remove("hidden");
        ingestLoader.innerText = "Ingesting and chunking papers...";

        const payload = {
            strategy: strategySelect.value,
            chunk_size: parseInt(document.getElementById("chunk-size-input").value),
            overlap: parseInt(document.getElementById("overlap-input").value),
            max_sentences: parseInt(document.getElementById("max-sentences-input").value),
            provider: providerSelect.value,
            openai_key: document.getElementById("openai-key-input").value || null
        };

        try {
            const res = await fetch(`${API_BASE}/api/ingest`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (data.success) {
                ingestLoader.innerText = `Successfully ingested! Loaded ${data.chunks_count} chunks.`;
                setTimeout(() => ingestLoader.classList.add("hidden"), 3000);
                await updateStatus();
            } else {
                ingestLoader.innerText = `Error: ${data.error}`;
            }
        } catch (err) {
            ingestLoader.innerText = `Connection failed: ${err.message}`;
        } finally {
            btnIngest.disabled = false;
        }
    });
}

async function updateStatus() {
    try {
        const res = await fetch(`${API_BASE}/api/status`);
        const status = await res.json();
        
        document.getElementById("status-provider").innerText = status.provider === "mock" ? "Mock (MD5)" : status.provider;
        document.getElementById("status-count").innerText = status.chunks_count;
        
        appState.provider = status.provider;
        appState.chunksCount = status.chunks_count;
        appState.loadedDocuments = status.loaded_documents;

        renderIndexedDocs(status.loaded_documents);
    } catch (err) {
        console.error("Could not reach API server status:", err);
    }
}

function renderIndexedDocs(docs) {
    const listContainer = document.getElementById("indexed-docs-list");
    if (!docs || docs.length === 0) {
        listContainer.innerHTML = '<div class="empty-state">No documents indexed yet.</div>';
        return;
    }

    listContainer.innerHTML = docs.map(docId => `
        <div class="doc-item" data-docid="${docId}">
            <div class="doc-info">
                <span class="doc-name">${docId}</span>
                <span class="doc-meta">Document PDF/MD Source</span>
            </div>
            <button class="btn-delete-doc" onclick="deleteDoc('${docId}')">🗑️</button>
        </div>
    `).join("");
}

window.deleteDoc = async function(docId) {
    if (!confirm(`Are you sure you want to remove all chunks belonging to ${docId}?`)) return;
    try {
        const res = await fetch(`${API_BASE}/api/delete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ doc_id: docId })
        });
        const data = await res.json();
        if (data.success) {
            await updateStatus();
        }
    } catch (err) {
        alert("Delete failed: " + err.message);
    }
};

// 3. CHUNKING SANDBOX
function initSandbox() {
    const btnChunk = document.getElementById("btn-sandbox-chunk");
    const btnSample = document.getElementById("btn-load-sample-text");
    const textarea = document.getElementById("sandbox-textarea");
    const visualOutput = document.getElementById("sandbox-visual-output");
    
    btnSample.addEventListener("click", () => {
        textarea.value = SAMPLE_TEXT;
    });

    btnChunk.addEventListener("click", async () => {
        const text = textarea.value.trim();
        if (!text) {
            alert("Please enter some text to chunk.");
            return;
        }

        const payload = {
            text: text,
            strategy: document.getElementById("strategy-select").value,
            chunk_size: parseInt(document.getElementById("chunk-size-input").value),
            overlap: parseInt(document.getElementById("overlap-input").value),
            max_sentences: parseInt(document.getElementById("max-sentences-input").value)
        };

        try {
            visualOutput.innerHTML = '<div class="loader">Running chunking algorithm...</div>';
            const res = await fetch(`${API_BASE}/api/chunk`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            document.getElementById("sandbox-chunk-count").innerText = data.count;
            document.getElementById("sandbox-avg-len").innerText = Math.round(data.avg_length) + " chars";

            if (data.chunks && data.chunks.length > 0) {
                visualOutput.innerHTML = data.chunks.map((chunk, idx) => `
                    <div class="visual-chunk">
                        <span class="chunk-badge">Chunk #${idx+1} (${chunk.length} chars)</span>
                        <div class="chunk-content">${escapeHTML(chunk)}</div>
                    </div>
                `).join("");
            } else {
                visualOutput.innerHTML = '<div class="empty-state">No chunks returned.</div>';
            }
        } catch (err) {
            visualOutput.innerHTML = `<div class="empty-state" style="color: var(--danger)">Connection failed: ${err.message}</div>`;
        }
    });
}

// 4. VECTOR STORE EXPLORER
function initStoreExplorer() {
    const btnSearch = document.getElementById("btn-store-search");
    const queryInput = document.getElementById("search-query");
    const filterInput = document.getElementById("search-filter");
    const resultsContainer = document.getElementById("store-search-results");

    btnSearch.addEventListener("click", async () => {
        const query = queryInput.value.trim();
        if (!query) {
            alert("Please enter a query string.");
            return;
        }

        const payload = {
            query: query,
            top_k: parseInt(document.getElementById("search-topk").value),
            filter: filterInput.value.trim() || null
        };

        try {
            resultsContainer.innerHTML = '<div class="loader">Searching vector store...</div>';
            const res = await fetch(`${API_BASE}/api/search`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const results = await res.json();

            if (results && results.length > 0) {
                resultsContainer.innerHTML = results.map((r, idx) => {
                    const isHigh = r.score > 0.3;
                    const scoreClass = isHigh ? "score-high" : "score-low";
                    const formattedScore = r.score.toFixed(4);
                    
                    // Generate metadata tags
                    const metaHtml = Object.entries(r.metadata || {})
                        .map(([k, v]) => `<span class="meta-tag"><b>${k}:</b> ${v}</span>`)
                        .join(" ");

                    return `
                        <div class="result-card">
                            <div class="result-header">
                                <span class="result-source">🔍 Rank #${idx+1} — ${r.metadata.source || r.id}</span>
                                <span class="result-score ${scoreClass}">Cosine Similarity: ${formattedScore}</span>
                            </div>
                            <div class="result-body">${escapeHTML(r.content)}</div>
                            <div class="result-meta-tags">${metaHtml}</div>
                        </div>
                    `;
                }).join("");
            } else {
                resultsContainer.innerHTML = '<div class="empty-state">No matching chunks found. Double check if you have loaded/ingested the documents first.</div>';
            }
        } catch (err) {
            resultsContainer.innerHTML = `<div class="empty-state" style="color: var(--danger)">Search failed: ${err.message}</div>`;
        }
    });

    // Setup quick-filter tags
    document.querySelectorAll(".filter-tag").forEach(tag => {
        tag.addEventListener("click", () => {
            filterInput.value = tag.dataset.filter;
        });
    });
}

// 5. RAG CHAT AGENT
function initRAGAgent() {
    const btnSend = document.getElementById("btn-agent-send");
    const chatInput = document.getElementById("agent-chat-input");
    const chatHistory = document.getElementById("chat-history");
    const debugPrompt = document.getElementById("debug-prompt-output");
    const debugChunks = document.getElementById("debug-chunks-list");

    btnSend.addEventListener("click", handleSend);
    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleSend();
    });

    async function handleSend() {
        const text = chatInput.value.trim();
        if (!text) return;

        // Render user bubble
        appendBubble(text, "user-bubble");
        chatInput.value = "";

        // Show typing indicator
        const loadingId = appendBubble("Thinking and retrieving context...", "agent-bubble typing");

        try {
            const res = await fetch(`${API_BASE}/api/ask`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: text, top_k: 3 })
            });
            const data = await res.json();

            // Replace loading bubble with actual answer
            document.getElementById(loadingId).remove();
            appendBubble(data.answer, "agent-bubble");

            // Update Debugger details
            debugPrompt.innerText = data.prompt;
            
            if (data.retrieved_chunks && data.retrieved_chunks.length > 0) {
                debugChunks.innerHTML = data.retrieved_chunks.map((c, idx) => `
                    <div class="debug-chunk-item">
                        <div class="debug-chunk-header">
                            <span>#${idx+1} Score: ${c.score.toFixed(4)}</span>
                            <span>Source: ${c.metadata.source || c.id}</span>
                        </div>
                        <div class="debug-chunk-body" style="font-size: 11px; opacity: 0.85;">
                            ${escapeHTML(c.content.substring(0, 150))}...
                        </div>
                    </div>
                `).join("");
            } else {
                debugChunks.innerHTML = '<div class="empty-state-small">No context chunks retrieved.</div>';
            }

        } catch (err) {
            document.getElementById(loadingId).innerText = "Error: " + err.message;
        }
    }

    function appendBubble(content, className) {
        const bubble = document.createElement("div");
        const id = "bubble-" + Date.now();
        bubble.id = id;
        bubble.className = "chat-bubble " + className;
        bubble.innerHTML = content.replace(/\n/g, "<br>");
        chatHistory.appendChild(bubble);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        return id;
    }
}

// 6. BENCHMARK CONSOLE
function initBenchmark() {
    const btnRun = document.getElementById("btn-run-all-benchmarks");
    const goldAnswersMap = {
        1: "paper1.md",
        2: "paper2.md",
        3: "paper3.md",
        4: "paper4.md",
        5: "paper5.md"
    };

    btnRun.addEventListener("click", async () => {
        btnRun.disabled = true;
        btnRun.innerText = "Running benchmark queries...";

        const rows = document.querySelectorAll("#benchmark-rows tr");
        for (let row of rows) {
            const qid = parseInt(row.dataset.qid);
            const query = row.querySelector(".b-query").innerText.replace(/"/g, "");
            
            const cellChunk = row.querySelector(".b-live-chunk");
            const cellScore = row.querySelector(".b-score");
            const cellBadge = row.cells[5];

            cellChunk.innerHTML = '<span class="loader">Querying...</span>';
            cellScore.innerText = "...";
            cellBadge.innerHTML = '<span class="badge badge-pending">Querying</span>';

            try {
                const res = await fetch(`${API_BASE}/api/search`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ query: query, top_k: 3 })
                });
                const results = await res.json();

                if (results && results.length > 0) {
                    const topResult = results[0];
                    cellChunk.innerText = topResult.content.substring(0, 150) + "...";
                    cellScore.innerText = topResult.score.toFixed(4);

                    // Check if relevant - we check top 3 results for correct paper match
                    const goldPaper = goldAnswersMap[qid];
                    const isRelevant = results.some(r => r.metadata && r.metadata.source === goldPaper);

                    if (isRelevant) {
                        cellBadge.innerHTML = '<span class="badge badge-yes">YES (Top-3)</span>';
                    } else {
                        cellBadge.innerHTML = '<span class="badge badge-no">NO</span>';
                    }
                } else {
                    cellChunk.innerText = "No results found.";
                    cellScore.innerText = "-";
                    cellBadge.innerHTML = '<span class="badge badge-no">FAILED</span>';
                }
            } catch (err) {
                cellChunk.innerText = "Error: " + err.message;
                cellScore.innerText = "Error";
                cellBadge.innerHTML = '<span class="badge badge-no">ERROR</span>';
            }
        }

        btnRun.disabled = false;
        btnRun.innerText = "🚀 Run All 5 Benchmark Queries";
    });
}

// Helper: Escape HTML string
function escapeHTML(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
