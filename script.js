// Ensure PDF.js worker is set up
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

let pdfDoc = null;
let pageFlip = null;

// Zoom State
let currentZoom = 1;
const ZOOM_STEP = 0.2;
const MAX_ZOOM = 3.0;
const MIN_ZOOM = 0.5;

// DOM Elements & Audio
const bookContainerEl = document.querySelector('.book-container');
const scaleWrapperEl = document.getElementById('scale-wrapper'); 
const scrollWrapperEl = document.getElementById('scroll-wrapper'); 
const totalPagesEl = document.getElementById('total-pages');
const currentPageEl = document.getElementById('current-page');
const selectorEl = document.getElementById('pdf-selector');
const searchStatusEl = document.getElementById('search-status');
const gotoInputEl = document.getElementById('goto-input');

const flipSound = new Audio('./data/flip.mp3'); 

// 1. Load and Render the PDF
async function loadPDF(pdfUrl) {
    try {
        if (pageFlip) {
            try { pageFlip.destroy(); } catch (e) { }
            pageFlip = null;
        }

        bookContainerEl.innerHTML = '<div id="flipbook"></div>';
        const flipbookEl = document.getElementById('flipbook');

        // Reset Zoom and Wrapper Sizes on new book load
        currentZoom = 1;
        bookContainerEl.style.transform = `scale(${currentZoom})`;
        if (scaleWrapperEl) {
            scaleWrapperEl.style.width = '900px'; 
            scaleWrapperEl.style.height = '600px'; 
        }

        searchStatusEl.textContent = 'Loading...';
        currentPageEl.textContent = '-';
        totalPagesEl.textContent = '-';

        pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
        const totalPages = pdfDoc.numPages;
        totalPagesEl.textContent = totalPages;

        if (gotoInputEl) {
            gotoInputEl.setAttribute('min', 1);
            gotoInputEl.setAttribute('max', totalPages);
            gotoInputEl.value = 1;
        }

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            pageDiv.appendChild(canvas);
            flipbookEl.appendChild(pageDiv);

            const viewport = page.getViewport({ scale: 2.0 });
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        }

        // Initialize StPageFlip
        pageFlip = new St.PageFlip(flipbookEl, {
            width: 450,
            height: 600,
            size: "fixed",          
            showCover: true,  
            usePortrait: false,     // CRITICAL FIX: Forces 2-page landscape mode ALWAYS
            maxShadowOpacity: 0.9,  
            drawShadow: true,
            flippingTime: 1000
        });

        const newPages = flipbookEl.querySelectorAll('.page');
        pageFlip.loadFromHTML(newPages);

        pageFlip.on('flip', (e) => {
            currentPageEl.textContent = e.data + 1;
            if (gotoInputEl) gotoInputEl.value = e.data + 1;
            flipSound.currentTime = 0; 
            flipSound.play().catch(err => console.warn("Audio blocked:", err));
        });

        searchStatusEl.textContent = ''; 
        currentPageEl.textContent = '1';

    } catch (error) {
        console.error("FULL SYSTEM ERROR:", error);
        searchStatusEl.textContent = 'Error loading book';
    }
}

// 2. Setup Buttons and Interactivity
function setupControls() {
    document.getElementById('btn-prev').addEventListener('click', () => { if (pageFlip) pageFlip.flipPrev(); });
    document.getElementById('btn-next').addEventListener('click', () => { if (pageFlip) pageFlip.flipNext(); });

    document.getElementById('btn-goto').addEventListener('click', () => {
        if (!pageFlip || !pdfDoc || !gotoInputEl) return;
        let pageNum = parseInt(gotoInputEl.value, 10);
        if (pageNum < 1) pageNum = 1;
        if (pageNum > pdfDoc.numPages) pageNum = pdfDoc.numPages;
        gotoInputEl.value = pageNum; 
        pageFlip.flip(pageNum - 1);
    });

    function updateZoom() {
        bookContainerEl.style.transform = `scale(${currentZoom})`;
        if (scaleWrapperEl) {
            scaleWrapperEl.style.width = `${900 * currentZoom}px`;
            scaleWrapperEl.style.height = `${600 * currentZoom}px`;
        }
    }

    document.getElementById('btn-zoom-in').addEventListener('click', () => {
        if (currentZoom < MAX_ZOOM) {
            currentZoom += ZOOM_STEP;
            updateZoom();
        }
    });

    document.getElementById('btn-zoom-out').addEventListener('click', () => {
        if (currentZoom > MIN_ZOOM) {
            currentZoom -= ZOOM_STEP;
            updateZoom();
        }
    });

    // Drag-to-Pan Functionality
    let isDown = false;
    let startX, startY, scrollLeft, scrollTop;

    scrollWrapperEl.addEventListener('mousedown', (e) => {
        if (e.target.closest('.book-container')) return; 
        isDown = true;
        scrollWrapperEl.style.cursor = 'grabbing';
        startX = e.pageX - scrollWrapperEl.offsetLeft;
        startY = e.pageY - scrollWrapperEl.offsetTop;
        scrollLeft = scrollWrapperEl.scrollLeft;
        scrollTop = scrollWrapperEl.scrollTop;
    });

    scrollWrapperEl.addEventListener('mouseleave', () => {
        isDown = false;
        scrollWrapperEl.style.cursor = 'grab';
    });

    scrollWrapperEl.addEventListener('mouseup', () => {
        isDown = false;
        scrollWrapperEl.style.cursor = 'grab';
    });

    scrollWrapperEl.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - scrollWrapperEl.offsetLeft;
        const y = e.pageY - scrollWrapperEl.offsetTop;
        const walkX = (x - startX) * 1.5; 
        const walkY = (y - startY) * 1.5;
        scrollWrapperEl.scrollLeft = scrollLeft - walkX;
        scrollWrapperEl.scrollTop = scrollTop - walkY;
    });

    // Search Logic
    document.getElementById('btn-search').addEventListener('click', async () => {
        if (!pdfDoc) return;
        const term = document.getElementById('search-input').value.toLowerCase();
        if (!term) return;
        
        searchStatusEl.textContent = "Searching...";
        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ').toLowerCase();
            
            if (pageText.includes(term)) {
                searchStatusEl.textContent = `Found on page ${i}!`;
                pageFlip.flip(i - 1);
                return;
            }
        }
        searchStatusEl.textContent = "Word not found.";
    });
}

// 3. Fetch books.inc and start the app
async function initApp() {
    try {
        const response = await fetch('./data/books.inc');
        if (!response.ok) throw new Error("Could not find books.inc");
        
        const text = await response.text();
        const fileNames = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
        
        fileNames.forEach(fileName => {
            const option = document.createElement('option');
            option.value = `./data/${fileName}`;
            let prettyTitle = fileName.replace('.pdf', '');
            prettyTitle = prettyTitle.charAt(0).toUpperCase() + prettyTitle.slice(1);
            option.textContent = prettyTitle;
            selectorEl.appendChild(option);
        });

        selectorEl.addEventListener('change', (e) => loadPDF(e.target.value));
        setupControls();
        loadPDF(`./data/${fileNames[0]}`);

    } catch (error) {
        console.error("Initialization Error:", error);
    }
}

initApp();// Ensure PDF.js worker is set up
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

let pdfDoc = null;
let pageFlip = null;

// Zoom State
let currentZoom = 1;
const ZOOM_STEP = 0.2;
const MAX_ZOOM = 3.0;
const MIN_ZOOM = 0.5;

// DOM Elements & Audio
const bookContainerEl = document.querySelector('.book-container');
const scaleWrapperEl = document.getElementById('scale-wrapper'); 
const scrollWrapperEl = document.getElementById('scroll-wrapper'); 
const totalPagesEl = document.getElementById('total-pages');
const currentPageEl = document.getElementById('current-page');
const selectorEl = document.getElementById('pdf-selector');
const searchStatusEl = document.getElementById('search-status');
const gotoInputEl = document.getElementById('goto-input');

const flipSound = new Audio('./data/flip.mp3'); 

// 1. Load and Render the PDF
async function loadPDF(pdfUrl) {
    try {
        if (pageFlip) {
            try { pageFlip.destroy(); } catch (e) { }
            pageFlip = null;
        }

        bookContainerEl.innerHTML = '<div id="flipbook"></div>';
        const flipbookEl = document.getElementById('flipbook');

        // Reset Zoom and Wrapper Sizes on new book load
        currentZoom = 1;
        bookContainerEl.style.transform = `scale(${currentZoom})`;
        if (scaleWrapperEl) {
            scaleWrapperEl.style.width = '900px'; 
            scaleWrapperEl.style.height = '600px'; 
        }

        searchStatusEl.textContent = 'Loading...';
        currentPageEl.textContent = '-';
        totalPagesEl.textContent = '-';

        pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
        const totalPages = pdfDoc.numPages;
        totalPagesEl.textContent = totalPages;

        if (gotoInputEl) {
            gotoInputEl.setAttribute('min', 1);
            gotoInputEl.setAttribute('max', totalPages);
            gotoInputEl.value = 1;
        }

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            pageDiv.appendChild(canvas);
            flipbookEl.appendChild(pageDiv);

            const viewport = page.getViewport({ scale: 2.0 });
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        }

        // Initialize StPageFlip
        pageFlip = new St.PageFlip(flipbookEl, {
            width: 450,
            height: 600,
            size: "fixed",          
            showCover: true,  
            usePortrait: false,     // CRITICAL FIX: Forces 2-page landscape mode ALWAYS
            maxShadowOpacity: 0.9,  
            drawShadow: true,
            flippingTime: 1000
        });

        const newPages = flipbookEl.querySelectorAll('.page');
        pageFlip.loadFromHTML(newPages);

        pageFlip.on('flip', (e) => {
            currentPageEl.textContent = e.data + 1;
            if (gotoInputEl) gotoInputEl.value = e.data + 1;
            flipSound.currentTime = 0; 
            flipSound.play().catch(err => console.warn("Audio blocked:", err));
        });

        searchStatusEl.textContent = ''; 
        currentPageEl.textContent = '1';

    } catch (error) {
        console.error("FULL SYSTEM ERROR:", error);
        searchStatusEl.textContent = 'Error loading book';
    }
}

// 2. Setup Buttons and Interactivity
function setupControls() {
    document.getElementById('btn-prev').addEventListener('click', () => { if (pageFlip) pageFlip.flipPrev(); });
    document.getElementById('btn-next').addEventListener('click', () => { if (pageFlip) pageFlip.flipNext(); });

    document.getElementById('btn-goto').addEventListener('click', () => {
        if (!pageFlip || !pdfDoc || !gotoInputEl) return;
        let pageNum = parseInt(gotoInputEl.value, 10);
        if (pageNum < 1) pageNum = 1;
        if (pageNum > pdfDoc.numPages) pageNum = pdfDoc.numPages;
        gotoInputEl.value = pageNum; 
        pageFlip.flip(pageNum - 1);
    });

    function updateZoom() {
        bookContainerEl.style.transform = `scale(${currentZoom})`;
        if (scaleWrapperEl) {
            scaleWrapperEl.style.width = `${900 * currentZoom}px`;
            scaleWrapperEl.style.height = `${600 * currentZoom}px`;
        }
    }

    document.getElementById('btn-zoom-in').addEventListener('click', () => {
        if (currentZoom < MAX_ZOOM) {
            currentZoom += ZOOM_STEP;
            updateZoom();
        }
    });

    document.getElementById('btn-zoom-out').addEventListener('click', () => {
        if (currentZoom > MIN_ZOOM) {
            currentZoom -= ZOOM_STEP;
            updateZoom();
        }
    });

    // Drag-to-Pan Functionality
    let isDown = false;
    let startX, startY, scrollLeft, scrollTop;

    scrollWrapperEl.addEventListener('mousedown', (e) => {
        if (e.target.closest('.book-container')) return; 
        isDown = true;
        scrollWrapperEl.style.cursor = 'grabbing';
        startX = e.pageX - scrollWrapperEl.offsetLeft;
        startY = e.pageY - scrollWrapperEl.offsetTop;
        scrollLeft = scrollWrapperEl.scrollLeft;
        scrollTop = scrollWrapperEl.scrollTop;
    });

    scrollWrapperEl.addEventListener('mouseleave', () => {
        isDown = false;
        scrollWrapperEl.style.cursor = 'grab';
    });

    scrollWrapperEl.addEventListener('mouseup', () => {
        isDown = false;
        scrollWrapperEl.style.cursor = 'grab';
    });

    scrollWrapperEl.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - scrollWrapperEl.offsetLeft;
        const y = e.pageY - scrollWrapperEl.offsetTop;
        const walkX = (x - startX) * 1.5; 
        const walkY = (y - startY) * 1.5;
        scrollWrapperEl.scrollLeft = scrollLeft - walkX;
        scrollWrapperEl.scrollTop = scrollTop - walkY;
    });

    // Search Logic
    document.getElementById('btn-search').addEventListener('click', async () => {
        if (!pdfDoc) return;
        const term = document.getElementById('search-input').value.toLowerCase();
        if (!term) return;
        
        searchStatusEl.textContent = "Searching...";
        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ').toLowerCase();
            
            if (pageText.includes(term)) {
                searchStatusEl.textContent = `Found on page ${i}!`;
                pageFlip.flip(i - 1);
                return;
            }
        }
        searchStatusEl.textContent = "Word not found.";
    });
}

// 3. Fetch books.inc and start the app
async function initApp() {
    try {
        const response = await fetch('./data/books.inc');
        if (!response.ok) throw new Error("Could not find books.inc");
        
        const text = await response.text();
        const fileNames = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
        
        fileNames.forEach(fileName => {
            const option = document.createElement('option');
            option.value = `./data/${fileName}`;
            let prettyTitle = fileName.replace('.pdf', '');
            prettyTitle = prettyTitle.charAt(0).toUpperCase() + prettyTitle.slice(1);
            option.textContent = prettyTitle;
            selectorEl.appendChild(option);
        });

        selectorEl.addEventListener('change', (e) => loadPDF(e.target.value));
        setupControls();
        loadPDF(`./data/${fileNames[0]}`);

    } catch (error) {
        console.error("Initialization Error:", error);
    }
}

initApp();
