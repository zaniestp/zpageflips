// Ensure PDF.js worker is set up
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// --- YOUR PDF LIBRARY ---
// You MUST manually update this list whenever you add/remove PDFs in the /data folder
const pdfLibrary = [
    { title: "Main Document", path: "./document.pdf" },
    { title: "Sample Book 2", path: "./book2.pdf" }, // Example: Add more here
    { title: "Sample Book 3", path: "./book3.pdf" }  // Example: Add more here
];

let pdfDoc = null;
let pageFlip = null;

// DOM Elements
const flipbookEl = document.getElementById('flipbook');
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

    // Listen for user changing the PDF
    selectorEl.addEventListener('change', (e) => {
        loadPDF(e.target.value);
    });
}

// 2. Load and Render the PDF
async function loadPDF(pdfUrl) {
    try {
        // CLEANUP: If a flipbook already exists, destroy it before making a new one
        if (pageFlip) {
            pageFlip.destroy();
            pageFlip = null;
        }
        flipbookEl.innerHTML = ''; // Clear out the old canvas elements
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

        // Initialize StPageFlip on the new elements
        pageFlip = new St.PageFlip(flipbookEl, {
            width: 450,
            height: 600,
            size: "fit",
            showCover: true,
            maxShadowOpacity: 0.5,
            drawShadow: true,
            flippingTime: 1000
        });

        pageFlip.loadFromHTML(document.querySelectorAll('.page'));

        pageFlip.on('flip', (e) => {
            currentPageEl.textContent = e.data + 1;
        });

        searchStatusEl.textContent = ''; // Clear loading text
        currentPageEl.textContent = '1';

    } catch (error) {
        console.error("Error loading PDF:", error);
        flipbookEl.innerHTML = `<h2 style="color: white; text-align:center;">Error loading PDF.<br>Check console or ensure path is correct.</h2>`;
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
// Load the first PDF in the library by default
if (pdfLibrary.length > 0) {
    loadPDF(pdfLibrary[0].path);
}
