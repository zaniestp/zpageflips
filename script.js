// Ensure PDF.js worker is set up
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

const pdfUrl = './data/document.pdf'; // Path to your PDF
let pdfDoc = null;
let pageFlip = null;

// DOM Elements
const flipbookEl = document.getElementById('flipbook');
const totalPagesEl = document.getElementById('total-pages');
const currentPageEl = document.getElementById('current-page');

async function init() {
    try {
        // 1. Load the PDF
        pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
        const totalPages = pdfDoc.numPages;
        totalPagesEl.textContent = totalPages;

        // 2. Render all pages to canvases
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            
            // Create DOM elements for the page
            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            pageDiv.appendChild(canvas);
            flipbookEl.appendChild(pageDiv);

            // Calculate scale based on standard viewport
            const viewport = page.getViewport({ scale: 1.5 });
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            // Render PDF page into canvas context
            await page.render({
                canvasContext: ctx,
                viewport: viewport
            }).promise;
        }

        // 3. Initialize StPageFlip
        pageFlip = new St.PageFlip(flipbookEl, {
            width: 450, // Base width per page
            height: 600, // Base height per page
            size: "fit", // Automatically fit parent container
            showCover: true,
            maxShadowOpacity: 0.5,
            drawShadow: true,
            flippingTime: 1000
        });

        // Load pages from DOM
        pageFlip.loadFromHTML(document.querySelectorAll('.page'));

        // Update UI when pages flip
        pageFlip.on('flip', (e) => {
            currentPageEl.textContent = e.data + 1; // e.data is the 0-indexed page number
        });

        setupControls();

    } catch (error) {
        console.error("Error loading PDF or setting up flipbook:", error);
        flipbookEl.innerHTML = `<h2 style="color: white;">Error loading PDF. Ensure you are running this on a local server.</h2>`;
    }
}

function setupControls() {
    // Prev / Next
    document.getElementById('btn-prev').addEventListener('click', () => {
        pageFlip.flipPrev();
    });

    document.getElementById('btn-next').addEventListener('click', () => {
        pageFlip.flipNext();
    });

    // Go to Page
    document.getElementById('btn-goto').addEventListener('click', () => {
        const pageNum = parseInt(document.getElementById('goto-input').value, 10);
        if (pageNum >= 1 && pageNum <= pdfDoc.numPages) {
            // PageFlip uses 0-based indexing
            pageFlip.flip(pageNum - 1);
        }
    });

    // Search functionality
    document.getElementById('btn-search').addEventListener('click', async () => {
        const term = document.getElementById('search-input').value.toLowerCase();
        const statusEl = document.getElementById('search-status');
        
        if (!term) return;
        
        statusEl.textContent = "Searching...";
        
        // Loop through PDF text content to find the word
        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            
            // Combine all text items on the page into one string
            const pageText = textContent.items.map(item => item.str).join(' ').toLowerCase();
            
            if (pageText.includes(term)) {
                statusEl.textContent = `Found on page ${i}!`;
                pageFlip.flip(i - 1);
                return; // Stop searching after first match
            }
        }
        statusEl.textContent = "Word not found.";
    });
}

// Start the app
init();
