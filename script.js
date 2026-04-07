// Ensure PDF.js worker is set up
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

let pdfDoc = null;
let pageFlip = null;

// Zoom State
let currentZoom = 1;
const ZOOM_STEP = 0.2;
const MAX_ZOOM = 2.5;
const MIN_ZOOM = 0.5;

// DOM Elements & Audio
const bookContainerEl = document.querySelector('.book-container');
const totalPagesEl = document.getElementById('total-pages');
const currentPageEl = document.getElementById('current-page');
const selectorEl = document.getElementById('pdf-selector');
const searchStatusEl = document.getElementById('search-status');
const gotoInputEl = document.getElementById('goto-input'); // Added reference

// The Page Flip Sound Effect
const flipSound = new Audio('./data/flip.mp3'); 

// 1. Load and Render the PDF
async function loadPDF(pdfUrl) {
    try {
        // CLEANUP: Safely destroy the old instance
        if (pageFlip) {
            try {
                pageFlip.destroy();
            } catch (cleanupError) {
                console.warn("Minor cleanup error ignored:", cleanupError);
            }
            pageFlip = null;
        }

        // CRITICAL FIX: Completely recreate the flipbook DOM element
        bookContainerEl.innerHTML = '<div id="flipbook"></div>';
        const flipbookEl = document.getElementById('flipbook');

        // Reset Zoom on new book load
        currentZoom = 1;
        bookContainerEl.style.transform = `scale(${currentZoom})`;
        bookContainerEl.style.transformOrigin = 'top center'; // Keeps it anchored nicely

        searchStatusEl.textContent = 'Loading...';
        currentPageEl.textContent = '-';
        totalPagesEl.textContent = '-';

        // Load the new PDF
        pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
        const totalPages = pdfDoc.numPages;
        totalPagesEl.textContent = totalPages;

        // CRITICAL UX: Restrict the goto input visually and functionally
        if (gotoInputEl) {
            gotoInputEl.setAttribute('min', 1);
            gotoInputEl.setAttribute('max', totalPages);
            gotoInputEl.value = 1;
        }

        // Render all pages to canvases
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            
            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            pageDiv.appendChild(canvas);
            flipbookEl.appendChild(pageDiv);

            // Using a higher scale here (1.5 or 2.0) ensures it stays crisp when zoomed in
            const viewport = page.getViewport({ scale: 1.5 });
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
            maxShadowOpacity: 0.9,  
            drawShadow: true,
            flippingTime: 1000
        });

        const newPages = flipbookEl.querySelectorAll('.page');
        pageFlip.loadFromHTML(newPages);

        pageFlip.on('flip', (e) => {
            currentPageEl.textContent = e.data + 1;
            
            // Keep goto input in sync with current page
            if (gotoInputEl) gotoInputEl.value = e.data + 1;

            flipSound.currentTime = 0; 
            flipSound.play().catch(err => console.warn("Browser blocked audio:", err));
        });

        searchStatusEl.textContent = ''; 
        currentPageEl.textContent = '1';

    } catch (error) {
        console.error("FULL SYSTEM ERROR:", error);
        
        bookContainerEl.innerHTML = `
            <div style="background: rgba(0,0,0,0.8); padding: 30px; border-radius: 8px; text-align: center;">
                <h2 style="color: #e74c3c; margin-bottom: 10px;">System Crash</h2>
                <p style="color: white; margin-bottom: 15px;">The PDF loaded, but the flipbook failed to build.</p>
                <div style="background: #2c3e50; padding: 15px; color: #f1c40f; font-family: monospace; border-radius: 4px;">
                    ${error.message || error}
                </div>
            </div>
        `;
        searchStatusEl.textContent = 'Error';
    }
}

// 2. Setup Buttons
function setupControls() {
    document.getElementById('btn-prev').addEventListener('click', () => {
        if (pageFlip) pageFlip.flipPrev();
    });

    document.getElementById('btn-next').addEventListener('click', () => {
        if (pageFlip) pageFlip.flipNext();
    });

    // Updated Goto Logic
    document.getElementById('btn-goto').addEventListener('click', () => {
        if (!pageFlip || !pdfDoc || !gotoInputEl) return;
        
        let pageNum = parseInt(gotoInputEl.value, 10);
        
        // Enforce hard limits in code just in case they bypass the HTML input
        if (pageNum < 1) pageNum = 1;
        if (pageNum > pdfDoc.numPages) pageNum = pdfDoc.numPages;
        
        gotoInputEl.value = pageNum; // Correct the input field if they typed something invalid
        pageFlip.flip(pageNum - 1);
    });

    // NEW: Zoom Logic
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
        if (currentZoom < MAX_ZOOM) {
            currentZoom += ZOOM_STEP;
            bookContainerEl.style.transform = `scale(${currentZoom})`;
        }
    });

    document.getElementById('btn-zoom-out').addEventListener('click', () => {
        if (currentZoom > MIN_ZOOM) {
            currentZoom -= ZOOM_STEP;
            bookContainerEl.style.transform = `scale(${currentZoom})`;
        }
    });

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
        if (!response.ok) throw new Error("Could not find books.inc in the /data folder.");
        
        const text = await response.text();
        const fileNames = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
        
        if (fileNames.length === 0) throw new Error("books.inc is empty.");

        fileNames.forEach(fileName => {
            const option = document.createElement('option');
            option.value = `./data/${fileName}`;
            
            let prettyTitle = fileName.replace('.pdf', '');
            prettyTitle = prettyTitle.charAt(0).toUpperCase() + prettyTitle.slice(1);
            option.textContent = prettyTitle;
            
            selectorEl.appendChild(option);
        });

        selectorEl.addEventListener('change', (e) => {
            loadPDF(e.target.value);
        });

        setupControls();
        loadPDF(`./data/${fileNames[0]}`);

    } catch (error) {
        console.error("Initialization Error:", error);
        bookContainerEl.innerHTML = `
            <div style="background: rgba(0,0,0,0.8); padding: 30px; border-radius: 8px; text-align: center;">
                <h2 style="color: #e74c3c; margin-bottom: 10px;">Library Error</h2>
                <p style="color: white; margin-bottom: 15px;">Could not load the book list.</p>
                <div style="background: #2c3e50; padding: 15px; color: #f1c40f; font-family: monospace; border-radius: 4px;">
                    ${error.message || error}
                </div>
            </div>
        `;
    }
}

initApp();
