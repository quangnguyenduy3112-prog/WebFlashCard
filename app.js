/* =============================================
   VocabFlash - Main Application Logic
   ============================================= */

(function () {
    'use strict';

    // ==========================================
    // ⚡ ĐIỀN API KEY CỦA BẠN VÀO ĐÂY
    // ==========================================
    const GEMINI_API_KEY = 'AQ.Ab8RN6KUVJK9feCRHT9MkD4_8DJxYCr_RAp2oZOUQM_l9q6B6A';

    // ==========================================
    // State
    // ==========================================
    const state = {
        words: [],           // { id, english, vietnamese, definition, example, loaded }
        apiKey: GEMINI_API_KEY,
        searchQuery: '',
    };

    // ==========================================
    // DOM Elements
    // ==========================================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const els = {
        // Header
        btnApiSettings: $('#btn-api-settings'),
        wordCounter: $('#counter-number'),

        // API Modal
        modalApi: $('#modal-api'),
        modalApiClose: $('#modal-api-close'),
        geminiApiKey: $('#gemini-api-key'),
        toggleApiVisibility: $('#toggle-api-visibility'),
        btnCancelApi: $('#btn-cancel-api'),
        btnSaveApi: $('#btn-save-api'),

        // Add Word Modal
        modalAddWord: $('#modal-add-word'),
        modalAddWordClose: $('#modal-add-word-close'),
        newWordInput: $('#new-word-input'),
        newWordsBulk: $('#new-words-bulk'),
        btnCancelAddWord: $('#btn-cancel-add-word'),
        btnConfirmAddWord: $('#btn-confirm-add-word'),

        // Hero & Toolbar
        heroSection: $('#hero-section'),
        toolbar: $('#toolbar'),
        searchInput: $('#search-input'),

        // File inputs
        fileUploadHero: $('#file-upload'),
        fileUploadToolbar: $('#file-upload-toolbar'),

        // Buttons
        btnAddWordHero: $('#btn-add-word-hero'),
        btnAddWordToolbar: $('#btn-add-word-toolbar'),
        btnClearAll: $('#btn-clear-all'),

        // Grid
        flashcardGrid: $('#flashcard-grid'),

        // Loading
        loadingOverlay: $('#loading-overlay'),
        loadingText: $('#loading-text'),

        // Toast
        toastContainer: $('#toast-container'),
    };

    // ==========================================
    // Initialization
    // ==========================================
    function init() {
        loadState();
        bindEvents();
        renderUI();
    }

    function loadState() {
        // API Key is hardcoded at the top of this file
        state.apiKey = GEMINI_API_KEY;

        // Load words from localStorage
        const savedWords = localStorage.getItem('vocabflash_words');
        if (savedWords) {
            try {
                state.words = JSON.parse(savedWords);
            } catch (e) {
                state.words = [];
            }
        }
    }

    function saveState() {
        localStorage.setItem('vocabflash_words', JSON.stringify(state.words));
    }

    // ==========================================
    // Event Binding
    // ==========================================
    function bindEvents() {
        // API Modal
        els.btnApiSettings.addEventListener('click', () => openModal('api'));
        els.modalApiClose.addEventListener('click', () => closeModal('api'));
        els.btnCancelApi.addEventListener('click', () => closeModal('api'));
        els.btnSaveApi.addEventListener('click', saveApiKey);
        els.toggleApiVisibility.addEventListener('click', toggleApiKeyVisibility);

        // Add Word Modal
        els.btnAddWordHero.addEventListener('click', () => openModal('addWord'));
        els.btnAddWordToolbar.addEventListener('click', () => openModal('addWord'));
        els.modalAddWordClose.addEventListener('click', () => closeModal('addWord'));
        els.btnCancelAddWord.addEventListener('click', () => closeModal('addWord'));
        els.btnConfirmAddWord.addEventListener('click', handleAddWord);

        // Enter key in single word input
        els.newWordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleAddWord();
        });

        // File upload
        els.fileUploadHero.addEventListener('change', handleFileUpload);
        els.fileUploadToolbar.addEventListener('change', handleFileUpload);

        // Clear all
        els.btnClearAll.addEventListener('click', handleClearAll);

        // Search
        els.searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value.trim().toLowerCase();
            renderFlashcards();
        });

        // Close modals on overlay click
        els.modalApi.addEventListener('click', (e) => {
            if (e.target === els.modalApi) closeModal('api');
        });
        els.modalAddWord.addEventListener('click', (e) => {
            if (e.target === els.modalAddWord) closeModal('addWord');
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal('api');
                closeModal('addWord');
            }
        });
    }

    // ==========================================
    // Modal Management
    // ==========================================
    function openModal(type) {
        if (type === 'api') {
            els.geminiApiKey.value = state.apiKey;
            els.modalApi.classList.add('active');
            setTimeout(() => els.geminiApiKey.focus(), 300);
        } else if (type === 'addWord') {
            els.newWordInput.value = '';
            els.newWordsBulk.value = '';
            els.modalAddWord.classList.add('active');
            setTimeout(() => els.newWordInput.focus(), 300);
        }
    }

    function closeModal(type) {
        if (type === 'api') {
            els.modalApi.classList.remove('active');
        } else if (type === 'addWord') {
            els.modalAddWord.classList.remove('active');
        }
    }

    // ==========================================
    // API Key Management
    // ==========================================
    function saveApiKey() {
        const key = els.geminiApiKey.value.trim();
        if (!key) {
            showToast('Vui lòng nhập API Key', 'warning');
            return;
        }
        state.apiKey = key;
        localStorage.setItem('vocabflash_api_key', key);
        closeModal('api');
        showToast('Đã lưu API Key thành công!', 'success');

        // Re-fetch data for words that haven't been loaded
        const unloaded = state.words.filter(w => !w.loaded);
        if (unloaded.length > 0) {
            fetchWordsBatch(unloaded);
        }
    }

    function toggleApiKeyVisibility() {
        const input = els.geminiApiKey;
        if (input.type === 'password') {
            input.type = 'text';
        } else {
            input.type = 'password';
        }
    }

    // ==========================================
    // File Upload & Parsing
    // ==========================================
    async function handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        // Reset the input so the same file can be uploaded again
        e.target.value = '';

        const fileName = file.name.toLowerCase();
        showToast('Đang đọc file...', 'info');

        try {
            let extractedText = '';

            if (fileName.endsWith('.txt') || fileName.endsWith('.csv') || fileName.endsWith('.tsv') || fileName.endsWith('.md') || fileName.endsWith('.srt') || fileName.endsWith('.vtt')) {
                extractedText = await readFileAsText(file);
            } else if (fileName.endsWith('.docx')) {
                extractedText = await parseDocx(file);
            } else if (fileName.endsWith('.pdf')) {
                extractedText = await parsePdf(file);
            } else if (fileName.endsWith('.apkg') || fileName.endsWith('.colpkg')) {
                const words = await parseAnki(file);
                if (words.length > 0) {
                    addWords(words);
                    showToast(`Đã thêm ${words.length} từ vựng từ Anki!`, 'success');
                } else {
                    showToast('Không tìm thấy từ vựng trong file Anki', 'warning');
                }
                return;
            } else {
                showToast('Định dạng file không được hỗ trợ', 'error');
                return;
            }

            if (extractedText) {
                const words = parseTextContent(extractedText, fileName);
                if (words.length === 0) {
                    showToast('Không tìm thấy từ vựng trong file', 'warning');
                    return;
                }
                addWords(words);
                showToast(`Đã thêm ${words.length} từ vựng từ file!`, 'success');
            }
        } catch (err) {
            console.error(err);
            showToast('Lỗi khi đọc file: ' + err.message, 'error');
        }
    }

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Lỗi đọc file text'));
            reader.readAsText(file, 'UTF-8');
        });
    }

    function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Lỗi đọc file binary'));
            reader.readAsArrayBuffer(file);
        });
    }

    async function parseDocx(file) {
        if (!window.mammoth) throw new Error('Thư viện mammoth.js chưa được tải');
        const buffer = await readFileAsArrayBuffer(file);
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        return result.value;
    }

    async function parsePdf(file) {
        if (!window.pdfjsLib) throw new Error('Thư viện pdf.js chưa được tải');
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        
        const buffer = await readFileAsArrayBuffer(file);
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const strings = content.items.map(item => item.str);
            fullText += strings.join(' ') + '\n';
        }
        return fullText;
    }

    async function parseAnki(file) {
        if (!window.JSZip || !window.initSqlJs) throw new Error('Thư viện JSZip hoặc SQL.js chưa được tải');
        const buffer = await readFileAsArrayBuffer(file);
        const zip = await JSZip.loadAsync(buffer);
        
        const sqliteFile = zip.file('collection.anki2') || zip.file('collection.anki21');
        if (!sqliteFile) throw new Error('Không tìm thấy database trong file Anki');
        
        const sqliteData = await sqliteFile.async('uint8array');
        
        const SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm`
        });
        const db = new SQL.Database(sqliteData);
        
        const words = [];
        try {
            const res = db.exec("SELECT flds FROM notes");
            if (res.length > 0) {
                res[0].values.forEach(row => {
                    const flds = row[0].split('\x1F');
                    let word = flds[0]; // Usually the front card content
                    word = word.replace(/<[^>]+>/g, '').trim();
                    word = cleanWord(word);
                    if (word && word.length > 0 && word.length < 100) {
                        words.push(word);
                    }
                });
            }
        } catch (e) {
            console.error('Lỗi khi đọc bảng notes từ Anki', e);
        }
        return [...new Set(words)];
    }

    function parseTextContent(content, fileName) {
        const words = [];
        let normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        if (fileName.endsWith('.srt') || fileName.endsWith('.vtt')) {
            // Bỏ timestamps và số thứ tự
            normalized = normalized.replace(/^\d+$/gm, '')
                                   .replace(/^\d{2}:\d{2}:\d{2}.*/gm, '')
                                   .replace(/<[^>]+>/g, '');
        }

        // Tách từ bằng regex đối với văn bản khối lớn (PDF, Docx, SRT)
        if (fileName.endsWith('.pdf') || fileName.endsWith('.docx') || fileName.endsWith('.srt') || fileName.endsWith('.vtt')) {
            // Lọc các từ chỉ có chữ cái tiếng Anh, dài hơn 2 ký tự
            const matches = normalized.match(/\b[a-zA-Z]{2,}\b/g);
            if (matches) {
                for (let w of matches) {
                    words.push(cleanWord(w.toLowerCase()));
                }
            }
        } else {
            // List-based (txt, csv, tsv, md)
            const lines = normalized.split('\n');
            for (let line of lines) {
                line = line.trim();
                if (!line) continue;
                if (line.startsWith('#') || line.startsWith('//')) continue;

                // Xử lý Markdown (bỏ dấu -, *, định dạng bảng)
                line = line.replace(/^[\-\*\d\.]+\s+/, '');
                line = line.replace(/^\|\s*/, '');
                line = line.replace(/\|.*/, '');

                const delimiters = [',', ';', '\t'];
                let word = line;
                for (const delim of delimiters) {
                    if (line.includes(delim)) {
                        word = line.split(delim)[0].trim();
                        break;
                    }
                }
                
                word = cleanWord(word);
                if (word && word.length > 0 && word.length < 100) {
                    words.push(word);
                }
            }
        }

        return [...new Set(words.filter(w => !!w))];
    }

    function cleanWord(word) {
        // Remove surrounding quotes
        word = word.replace(/^["']|["']$/g, '');
        // Remove numbers at the beginning (like numbered lists: "1. word")
        word = word.replace(/^\d+[\.\)\-\s]+/, '');
        // Remove extra spaces
        word = word.replace(/\s+/g, ' ').trim();
        // Basic validation: must contain at least one letter
        if (!/[a-zA-Z]/.test(word)) return '';
        return word;
    }

    // ==========================================
    // Add Words
    // ==========================================
    function handleAddWord() {
        const singleWord = els.newWordInput.value.trim();
        const bulkWords = els.newWordsBulk.value.trim();

        const wordsToAdd = [];

        if (singleWord) {
            const cleaned = cleanWord(singleWord);
            if (cleaned) wordsToAdd.push(cleaned);
        }

        if (bulkWords) {
            const lines = bulkWords.split('\n');
            for (const line of lines) {
                const cleaned = cleanWord(line.trim());
                if (cleaned) wordsToAdd.push(cleaned);
            }
        }

        if (wordsToAdd.length === 0) {
            showToast('Vui lòng nhập ít nhất một từ', 'warning');
            return;
        }

        // Remove duplicates within input
        const uniqueWords = [...new Set(wordsToAdd)];

        addWords(uniqueWords);
        closeModal('addWord');
        showToast(`Đã thêm ${uniqueWords.length} từ vựng!`, 'success');
    }

    function addWords(newWords) {
        // Filter out words that already exist
        const existingWords = new Set(state.words.map(w => w.english.toLowerCase()));
        const filtered = newWords.filter(w => !existingWords.has(w.toLowerCase()));

        if (filtered.length === 0) {
            showToast('Tất cả từ đã có trong danh sách', 'info');
            return;
        }

        const wordObjects = filtered.map(word => ({
            id: generateId(),
            english: word,
            vietnamese: '',
            definition: '',
            example: '',
            loaded: false,
        }));

        state.words.push(...wordObjects);
        saveState();
        renderUI();

        // Fetch data in batches for speed
        fetchWordsBatch(wordObjects);
    }

    // ==========================================
    // Gemini API Integration (Batch Mode)
    // ==========================================
    const BATCH_SIZE = 15;       // words per API call
    const MAX_CONCURRENT = 3;    // parallel API calls

    async function fetchWordsBatch(wordObjects) {
        if (!state.apiKey) {
            for (const wo of wordObjects) {
                updateCardUI(wo.id, {
                    vietnamese: '⚠️ Cần API Key',
                    definition: 'Vui lòng thêm Gemini API Key trong phần cài đặt để nhận bản dịch, định nghĩa và ví dụ.',
                    example: '',
                    loaded: false,
                });
            }
            return;
        }

        // Show loading on all cards
        for (const wo of wordObjects) {
            updateCardLoadingState(wo.id, true);
        }

        // Split into batches
        const batches = [];
        for (let i = 0; i < wordObjects.length; i += BATCH_SIZE) {
            batches.push(wordObjects.slice(i, i + BATCH_SIZE));
        }

        // Process batches with concurrency limit
        const queue = [...batches];
        const workers = [];
        for (let i = 0; i < Math.min(MAX_CONCURRENT, queue.length); i++) {
            workers.push(processBatchQueue(queue));
        }
        await Promise.all(workers);
    }

    async function processBatchQueue(queue) {
        while (queue.length > 0) {
            const batch = queue.shift();
            await fetchBatch(batch);
        }
    }

    async function fetchBatch(wordObjects) {
        const wordList = wordObjects.map(w => w.english);
        const wordListStr = wordList.map((w, i) => `${i + 1}. ${w}`).join('\n');

        const prompt = `Hãy dịch và cung cấp thông tin cho các từ tiếng Anh sau. Trả về ĐÚNG một JSON array (không thêm text nào khác ngoài JSON):

${wordListStr}

Format trả về:
[
  {
    "word": "từ tiếng Anh gốc",
    "vietnamese": "nghĩa tiếng Việt (ngắn gọn)",
    "definition": "định nghĩa bằng tiếng Việt (rõ ràng, dễ hiểu)",
    "example": "câu ví dụ bằng tiếng Anh"
  }
]

QUAN TRỌNG: Trả về đúng ${wordList.length} phần tử trong array, theo đúng thứ tự.`;

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${state.apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.3,
                            maxOutputTokens: 4096,
                        },
                    }),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMsg = errorData?.error?.message || `HTTP ${response.status}`;
                throw new Error(errorMsg);
            }

            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

            const parsed = parseGeminiArrayResponse(text);

            if (parsed && Array.isArray(parsed)) {
                // Match results back to word objects
                for (let i = 0; i < wordObjects.length; i++) {
                    const wo = wordObjects[i];
                    // Try to find matching result by index or by word name
                    const result = parsed[i] || parsed.find(
                        p => p.word && p.word.toLowerCase() === wo.english.toLowerCase()
                    );

                    if (result) {
                        wo.vietnamese = result.vietnamese || '';
                        wo.definition = result.definition || '';
                        wo.example = result.example || '';
                        wo.loaded = true;

                        const idx = state.words.findIndex(w => w.id === wo.id);
                        if (idx !== -1) state.words[idx] = { ...wo };

                        updateCardUI(wo.id, wo);
                    } else {
                        // Fallback: fetch individually
                        await fetchSingleWord(wo);
                    }
                    updateCardLoadingState(wo.id, false);
                }
                saveState();
            } else {
                throw new Error('Không thể phân tích phản hồi từ AI');
            }
        } catch (error) {
            console.error('Batch fetch error:', error);
            // Fallback: try fetching each word individually
            for (const wo of wordObjects) {
                await fetchSingleWord(wo);
                updateCardLoadingState(wo.id, false);
            }
        }
    }

    async function fetchSingleWord(wordObj) {
        const prompt = `Hãy cung cấp thông tin cho từ tiếng Anh "${wordObj.english}" theo đúng format JSON sau (không thêm bất kỳ text nào khác ngoài JSON):
{
  "vietnamese": "nghĩa tiếng Việt (ngắn gọn, chính xác)",
  "definition": "định nghĩa bằng tiếng Việt (giải thích rõ ràng, dễ hiểu)",
  "example": "một câu ví dụ bằng tiếng Anh sử dụng từ này"
}`;

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${state.apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
                    }),
                }
            );

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const parsed = parseGeminiResponse(text);

            if (parsed) {
                wordObj.vietnamese = parsed.vietnamese || '';
                wordObj.definition = parsed.definition || '';
                wordObj.example = parsed.example || '';
                wordObj.loaded = true;

                const idx = state.words.findIndex(w => w.id === wordObj.id);
                if (idx !== -1) state.words[idx] = { ...wordObj };
                saveState();
                updateCardUI(wordObj.id, wordObj);
            } else {
                throw new Error('Parse failed');
            }
        } catch (error) {
            console.error(`Error fetching "${wordObj.english}":`, error);
            updateCardUI(wordObj.id, {
                vietnamese: '❌ Lỗi',
                definition: `Không thể lấy dữ liệu: ${error.message}`,
                example: '',
                loaded: false,
            });
        }
    }

    function parseGeminiArrayResponse(text) {
        try {
            let jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
            return JSON.parse(jsonStr);
        } catch (e) {
            // Try to find JSON array in text
            const match = text.match(/\[[\s\S]*\]/);
            if (match) {
                try { return JSON.parse(match[0]); } catch (e2) { /* fall through */ }
            }
            return null;
        }
    }

    function parseGeminiResponse(text) {
        try {
            // Try to extract JSON from the response
            // Remove markdown code block if present
            let jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

            // Try direct parse
            return JSON.parse(jsonStr);
        } catch (e) {
            // Try to find JSON object in the text
            const match = text.match(/\{[\s\S]*?\}/);
            if (match) {
                try {
                    return JSON.parse(match[0]);
                } catch (e2) {
                    return null;
                }
            }
            return null;
        }
    }

    // ==========================================
    // UI Rendering
    // ==========================================
    function renderUI() {
        updateWordCounter();

        if (state.words.length === 0) {
            els.heroSection.classList.remove('hidden');
            els.toolbar.classList.remove('visible');
            els.flashcardGrid.innerHTML = '';
        } else {
            els.heroSection.classList.add('hidden');
            els.toolbar.classList.add('visible');
            renderFlashcards();
        }
    }

    function updateWordCounter() {
        els.wordCounter.textContent = state.words.length;
    }

    function renderFlashcards() {
        const container = els.flashcardGrid;

        // Filter by search query
        let filteredWords = state.words;
        if (state.searchQuery) {
            filteredWords = state.words.filter(w =>
                w.english.toLowerCase().includes(state.searchQuery) ||
                w.vietnamese.toLowerCase().includes(state.searchQuery)
            );
        }

        container.innerHTML = '';

        filteredWords.forEach((word, index) => {
            const card = createFlashcardElement(word, index);
            container.appendChild(card);
        });
    }

    function createFlashcardElement(word, index) {
        const wrapper = document.createElement('div');
        wrapper.className = 'flashcard-wrapper';
        wrapper.setAttribute('data-word-id', word.id);
        wrapper.style.animationDelay = `${index * 0.05}s`;

        const isLoading = !word.loaded && !word.vietnamese;
        const backContent = word.loaded
            ? createBackContentLoaded(word)
            : word.vietnamese
                ? createBackContentError(word)
                : createBackContentLoading();

        wrapper.innerHTML = `
            <div class="flashcard" id="card-${word.id}">
                <div class="flashcard-face flashcard-front">
                    <span class="card-number">#${index + 1}</span>
                    <button class="card-delete" onclick="event.stopPropagation(); window.VocabFlash.deleteWord('${word.id}')" title="Xóa từ này">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                    <div class="word-english">${escapeHtml(word.english)}</div>
                    <div class="card-hint">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/>
                        </svg>
                        Nhấn để lật thẻ
                    </div>
                </div>
                <div class="flashcard-face flashcard-back">
                    ${backContent}
                    <div class="back-hint">Nhấn để quay lại</div>
                </div>
            </div>
        `;

        // Flip card on click
        const card = wrapper.querySelector('.flashcard');
        card.addEventListener('click', () => {
            card.classList.toggle('flipped');
        });

        return wrapper;
    }

    function createBackContentLoaded(word) {
        return `
            <div class="back-header">
                <span class="word-english-small">${escapeHtml(word.english)}</span>
                <span class="word-vietnamese">${escapeHtml(word.vietnamese)}</span>
            </div>
            <div class="card-section">
                <div class="card-section-label">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="16" x2="12" y2="12"/>
                        <line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                    Định nghĩa
                </div>
                <div class="card-section-content">${escapeHtml(word.definition)}</div>
            </div>
            ${word.example ? `
            <div class="card-section">
                <div class="card-section-label">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                    Ví dụ
                </div>
                <div class="card-section-content">
                    <div class="example-text">${escapeHtml(word.example)}</div>
                </div>
            </div>` : ''}
        `;
    }

    function createBackContentError(word) {
        return `
            <div class="back-header">
                <span class="word-english-small">${escapeHtml(word.english)}</span>
                <span class="word-vietnamese">${escapeHtml(word.vietnamese)}</span>
            </div>
            <div class="card-section">
                <div class="card-section-content">${escapeHtml(word.definition)}</div>
            </div>
        `;
    }

    function createBackContentLoading() {
        return `
            <div class="card-loading">
                <span>Đang tải dữ liệu từ AI</span>
                <div class="dot-flashing">
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                </div>
            </div>
        `;
    }

    function updateCardUI(wordId, data) {
        const wrapper = document.querySelector(`[data-word-id="${wordId}"]`);
        if (!wrapper) return;

        const backFace = wrapper.querySelector('.flashcard-back');
        if (!backFace) return;

        let content;
        if (data.loaded) {
            content = createBackContentLoaded(data);
        } else {
            content = createBackContentError(data);
        }

        backFace.innerHTML = content + '<div class="back-hint">Nhấn để quay lại</div>';
    }

    function updateCardLoadingState(wordId, isLoading) {
        const wrapper = document.querySelector(`[data-word-id="${wordId}"]`);
        if (!wrapper) return;

        if (isLoading) {
            const backFace = wrapper.querySelector('.flashcard-back');
            if (backFace) {
                backFace.innerHTML = createBackContentLoading() + '<div class="back-hint">Nhấn để quay lại</div>';
            }
        }
    }

    // ==========================================
    // Delete & Clear
    // ==========================================
    function deleteWord(wordId) {
        state.words = state.words.filter(w => w.id !== wordId);
        saveState();

        // Animate removal
        const wrapper = document.querySelector(`[data-word-id="${wordId}"]`);
        if (wrapper) {
            wrapper.style.transition = 'all 0.3s ease';
            wrapper.style.opacity = '0';
            wrapper.style.transform = 'scale(0.8)';
            setTimeout(() => {
                renderUI();
            }, 300);
        } else {
            renderUI();
        }

        showToast('Đã xóa từ vựng', 'info');
    }

    let clearAllClickedOnce = false;
    let clearAllTimer = null;

    function handleClearAll() {
        if (state.words.length === 0) return;

        if (!clearAllClickedOnce) {
            // First click: show warning, wait for second click
            clearAllClickedOnce = true;
            els.btnClearAll.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Nhấn lần nữa để xác nhận!
            `;
            els.btnClearAll.style.background = 'rgba(248, 113, 113, 0.3)';
            showToast('Nhấn "Xóa tất cả" lần nữa để xác nhận', 'warning');

            // Reset after 3 seconds if no second click
            clearAllTimer = setTimeout(() => {
                clearAllClickedOnce = false;
                els.btnClearAll.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    Xóa tất cả
                `;
                els.btnClearAll.style.background = '';
            }, 3000);
        } else {
            // Second click: actually clear
            clearTimeout(clearAllTimer);
            clearAllClickedOnce = false;
            state.words = [];
            saveState();
            renderUI();
            els.btnClearAll.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Xóa tất cả
            `;
            els.btnClearAll.style.background = '';
            showToast('Đã xóa tất cả từ vựng', 'info');
        }
    }

    // ==========================================
    // Toast Notifications
    // ==========================================
    function showToast(message, type = 'info') {
        const icons = {
            success: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            error: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            warning: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            info: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${escapeHtml(message)}</span>
        `;

        els.toastContainer.appendChild(toast);

        // Auto remove after 4 seconds
        setTimeout(() => {
            toast.classList.add('toast-exit');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 4000);
    }

    // ==========================================
    // Utility Functions
    // ==========================================
    function generateId() {
        return 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ==========================================
    // Public API (for inline event handlers)
    // ==========================================
    window.VocabFlash = {
        deleteWord,
    };

    // ==========================================
    // Start the app
    // ==========================================
    document.addEventListener('DOMContentLoaded', init);
})();
