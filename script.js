// Ensure PDF.js worker is set up
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// --- YOUR PDF LIBRARY ---
const pdfLibrary = [
    { title: "Main Document", path: "./data/document.pdf" },
    { title: "Sample Book 2", path: "./data/book2.pdf" }, 
    { title: "Sample Book 3", path: "./data/book3.pdf" }  
];

let pdfDoc = null;
let pageFlip = null;

// DOM Elements
const bookContainerEl = document.querySelector('.book-container'); // NEW: Target the parent wrapper
const totalPagesEl = document.getElementById('total-pages');
const currentPageEl = document.getElementById('current-page');
const selectorEl = document.getElementById('pdf-selector');
const searchStatusEl = document.getElementById('search-status');

// 1. Populate the Dropdown Menu
function populateDropdown() {
    pdfLibrary.forEach((pdf, index) => {
        const option = document.createElement('option');
        option.value = pdf.path;
        option.textContent = pdf.title;
        selectorEl.appendChild(option);
    });

    selectorEl.addEventListener('change', (e) => {
        loadPDF(e.target.value);
    });
}

// 2. Load and Render the PDF
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

        searchStatusEl.textContent = 'Loading...';
        currentPageEl.textContent = '-';
        totalPagesEl.textContent = '-';

        // Load the new PDF
        pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
        const totalPages = pdfDoc.numPages;
        totalPagesEl.textContent = totalPages;

        // Render all pages to canvases
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            
            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            pageDiv.appendChild(canvas);
            flipbookEl.appendChild(pageDiv);

            const viewport = page.getViewport({ scale: 1.5 });
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        }

        // Initialize StPageFlip
        pageFlip = new St.PageFlip(flipbookEl, {
            width: 450,
            height: 600,
            size: "fit",
            showCover: true,
            maxShadowOpacity: 0.5,
            drawShadow: true,
            flippingTime: 1000
        });

        // CRITICAL FIX: Only grab pages from inside the NEW flipbook element
        const newPages = flipbookEl.querySelectorAll('.page');
        pageFlip.loadFromHTML(newPages);

        pageFlip.on('flip', (e) => {
            currentPageEl.textContent = e.data + 1;
        });

        searchStatusEl.textContent = ''; 
        currentPageEl.textContent = '1';

    } catch (error) {
        console.error("FULL SYSTEM ERROR:", error);
        
        // DEBUG MODE: Print the exact error to the screen
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

// 3. Setup Buttons (Only needs to run once)
function setupControls() {
    document.getElementById('btn-prev').addEventListener('click', () => {
        if (pageFlip) pageFlip.flipPrev();
    });

    document.getElementById('btn-next').addEventListener('click', () => {
        if (pageFlip) pageFlip.flipNext();
    });

    document.getElementById('btn-goto').addEventListener('click', () => {
        if (!pageFlip || !pdfDoc) return;
        const pageNum = parseInt(document.getElementById('goto-input').value, 10);
        if (pageNum >= 1 && pageNum <= pdfDoc.numPages) {
            pageFlip.flip(pageNum - 1);
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

// Start the app
populateDropdown();
setupControls();
if (pdfLibrary.length > 0) {
    loadPDF(pdfLibrary[0].path);
}
