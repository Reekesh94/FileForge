/* ================================================================
   FILEFORGE — pdf-tools.js
   All PDF processing: image→PDF, PDF→pages, merge, split, compress.
   Depends on: app.js, pdf-lib (CDN)
================================================================ */

/* ================================================================
   1. IMAGES → PDF
================================================================ */
async function processImg2Pdf() {
  const files = App.files['pdf-img2pdf-files'] || [];
  if (!files.length) {
    showToast('Please add images to convert', 'error');
    return;
  }

  if (typeof PDFLib === 'undefined') {
    showToast('PDF library not loaded yet — please wait a moment and retry', 'error');
    return;
  }

  const { PDFDocument } = PDFLib;

  const pageSize   = document.getElementById('pdf-page-size').value;
  const orientation = document.getElementById('pdf-orientation').value;
  const margin     = parseInt(document.getElementById('pdf-margin').value, 10) || 0;
  const imgFit     = document.getElementById('pdf-img-fit').value;

  // Standard page sizes in points [width, height] in portrait
  const pageSizeMap = {
    A4:     [595.28, 841.89],
    Letter: [612,    792],
    A3:     [841.89, 1190.55],
  };

  setProgress('img2pdf-progress-wrap', 'img2pdf-progress', 5);

  const pdfDoc = await PDFDocument.create();
  let skipped  = 0;

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    setProgress('img2pdf-progress-wrap', 'img2pdf-progress', 10 + (i / files.length) * 84);

    try {
      // Always embed as JPEG (most widely supported by pdf-lib in browser)
      const arrayBuf = await _fileToJpegArrayBuffer(f);
      const embImg   = await pdfDoc.embedJpg(arrayBuf);

      const imgW = embImg.width;
      const imgH = embImg.height;

      // Determine page dimensions
      let pgW, pgH;
      if (pageSize === 'fit') {
        pgW = imgW;
        pgH = imgH;
      } else {
        [pgW, pgH] = pageSizeMap[pageSize] || pageSizeMap.A4;
        const autoOrient = orientation === 'auto'
          ? (imgW > imgH ? 'landscape' : 'portrait')
          : orientation;
        if (autoOrient === 'landscape' && pgW < pgH) [pgW, pgH] = [pgH, pgW];
      }

      const page    = pdfDoc.addPage([pgW, pgH]);
      const availW  = pgW - margin * 2;
      const availH  = pgH - margin * 2;

      let drawW, drawH;
      if (imgFit === 'fill') {
        drawW = availW;
        drawH = availH;
      } else {
        const scale = Math.min(availW / imgW, availH / imgH);
        drawW = imgW * scale;
        drawH = imgH * scale;
      }

      page.drawImage(embImg, {
        x:      margin + (availW - drawW) / 2,
        y:      margin + (availH - drawH) / 2,
        width:  drawW,
        height: drawH,
      });

    } catch (err) {
      console.error(`Skipped ${f.name}:`, err);
      skipped++;
    }
  }

  setProgress('img2pdf-progress-wrap', 'img2pdf-progress', 98);

  const pdfBytes = await pdfDoc.save();
  const blob     = new Blob([pdfBytes], { type: 'application/pdf' });
  const name     = 'fileforge_images.pdf';
  storeBlob(name, blob);

  setProgress('img2pdf-progress-wrap', 'img2pdf-progress', 100);

  const pageCount = pdfDoc.getPageCount();

  document.getElementById('img2pdf-result').innerHTML = `
    <div class="result-area">
      <div class="result-header">
        <div class="result-icon">✅</div>
        <div>
          <h3>PDF Created</h3>
          <p>
            ${files.length - skipped} image(s) → ${pageCount} page PDF
            ${skipped ? `· <span style="color:var(--yellow)">${skipped} skipped</span>` : ''}
            · ${formatSize(blob.size)}
          </p>
        </div>
      </div>
      <div class="result-files">
        <div class="result-file">
          <div class="result-file-info">
            <div class="result-file-name">${name}</div>
            <div class="result-file-meta">${pageCount} pages · ${formatSize(blob.size)}</div>
          </div>
          <button class="download-btn" onclick="saveBlob(this, '${name}')">⬇ Download PDF</button>
        </div>
      </div>
    </div>
  `;

  showToast('PDF created successfully!', 'success');
}

/* ----------------------------------------------------------------
   Convert any image File to a JPEG ArrayBuffer via Canvas
---------------------------------------------------------------- */
async function _fileToJpegArrayBuffer(file) {
  // If already JPEG, use directly
  if (file.type === 'image/jpeg') {
    return file.arrayBuffer();
  }

  // Otherwise transcode via Canvas → JPEG blob
  const img    = await loadImageToCanvas(file);
  const canvas = document.createElement('canvas');
  canvas.width  = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d').drawImage(img, 0, 0);

  const jpegBlob = await canvasToBlob(canvas, 'jpeg', 0.93);
  return jpegBlob.arrayBuffer();
}

/* ================================================================
   2. PDF → PAGES (extract individual pages)
================================================================ */
async function processPdf2Img() {
  const files = App.files['pdf-pdf2img-files'] || [];
  if (!files.length) {
    showToast('Please select a PDF file', 'error');
    return;
  }

  if (typeof PDFLib === 'undefined') {
    showToast('PDF library not loaded yet', 'error');
    return;
  }

  const { PDFDocument } = PDFLib;
  const f = files[0];

  showToast('Extracting PDF pages...', 'info');
  setProgress('pdf2img-progress-wrap', 'pdf2img-progress', 10);

  const pagesInput = document.getElementById('pdf2img-pages').value.trim();
  const buf        = await f.arrayBuffer();
  let srcDoc;

  try {
    srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
  } catch (err) {
    showToast('Could not read PDF — it may be corrupted or encrypted', 'error');
    return;
  }

  const totalPages  = srcDoc.getPageCount();
  const pageNums    = pagesInput
    ? parsePageRange(pagesInput, totalPages)
    : Array.from({ length: totalPages }, (_, i) => i + 1);

  const results  = [];
  const baseName = f.name.replace(/\.pdf$/i, '');

  for (let pi = 0; pi < pageNums.length; pi++) {
    const pageNum = pageNums[pi];
    setProgress('pdf2img-progress-wrap', 'pdf2img-progress', 15 + (pi / pageNums.length) * 80);

    try {
      const singleDoc = await PDFDocument.create();
      const [copiedPage] = await singleDoc.copyPages(srcDoc, [pageNum - 1]);
      singleDoc.addPage(copiedPage);

      const singleBytes = await singleDoc.save();
      const blob        = new Blob([singleBytes], { type: 'application/pdf' });
      const name        = `${baseName}_page${String(pageNum).padStart(3, '0')}.pdf`;

      storeBlob(name, blob);

      const { width, height } = srcDoc.getPage(pageNum - 1).getSize();
      results.push({
        blob,
        name,
        info: `Page ${pageNum} · ${Math.round(width)} × ${Math.round(height)} pt · ${formatSize(blob.size)}`,
      });
    } catch (err) {
      console.warn(`Page ${pageNum} failed:`, err);
    }
  }

  setProgress('pdf2img-progress-wrap', 'pdf2img-progress', 100);

  const namesJson = JSON.stringify(results.map(r => r.name));
  const filesHtml = results.map(r => `
    <div class="result-file">
      <div class="result-file-info">
        <div class="result-file-name">${escHtml(r.name)}</div>
        <div class="result-file-meta">${r.info}</div>
      </div>
      <button class="download-btn" onclick="saveBlob(this, '${escHtml(r.name)}')">⬇ Download</button>
    </div>
  `).join('');

  document.getElementById('pdf2img-result').innerHTML = `
    <div class="result-area">
      <div class="result-header">
        <div class="result-icon">✅</div>
        <div>
          <h3>${results.length} Pages Extracted</h3>
          <p>Each page saved as individual PDF · Download all as ZIP</p>
        </div>
      </div>
      <div class="info-notice">
        ℹ️ Pages are extracted as individual PDF files (full image rendering requires a server-side PDF renderer). Open each in a PDF viewer to view or print as an image.
      </div>
      <div class="result-files">${filesHtml}</div>
      ${results.length > 1 ? `<button class="download-all-btn" onclick="downloadAllAsZip(${namesJson})">⬇ Download All as ZIP</button>` : ''}
    </div>
  `;

  showToast(`${results.length} pages extracted!`, 'success');
}

/* ================================================================
   3. MERGE PDFs
================================================================ */
async function processMergePdf() {
  const files = App.files['pdf-merge-files'] || [];
  if (files.length < 2) {
    showToast('Please add at least 2 PDF files to merge', 'error');
    return;
  }

  if (typeof PDFLib === 'undefined') {
    showToast('PDF library not loaded yet', 'error');
    return;
  }

  const { PDFDocument } = PDFLib;

  setProgress('merge-progress-wrap', 'merge-progress', 5);

  const merged  = await PDFDocument.create();
  let skipped   = 0;

  for (let i = 0; i < files.length; i++) {
    setProgress('merge-progress-wrap', 'merge-progress', 10 + (i / files.length) * 84);

    try {
      const buf  = await files[i].arrayBuffer();
      const doc  = await PDFDocument.load(buf, { ignoreEncryption: true });
      const idxs = doc.getPageIndices();
      const pages = await merged.copyPages(doc, idxs);
      pages.forEach(p => merged.addPage(p));
    } catch (err) {
      console.error(`Skipped: ${files[i].name}`, err);
      skipped++;
    }
  }

  setProgress('merge-progress-wrap', 'merge-progress', 98);

  const bytes = await merged.save();
  const blob  = new Blob([bytes], { type: 'application/pdf' });
  const name  = 'fileforge_merged.pdf';
  storeBlob(name, blob);

  setProgress('merge-progress-wrap', 'merge-progress', 100);

  const pageCount = merged.getPageCount();

  document.getElementById('merge-result').innerHTML = `
    <div class="result-area">
      <div class="result-header">
        <div class="result-icon">✅</div>
        <div>
          <h3>Merge Complete</h3>
          <p>
            ${files.length - skipped} PDFs merged → ${pageCount} total pages
            ${skipped ? `· <span style="color:var(--yellow)">${skipped} skipped</span>` : ''}
            · ${formatSize(blob.size)}
          </p>
        </div>
      </div>
      <div class="result-files">
        <div class="result-file">
          <div class="result-file-info">
            <div class="result-file-name">${name}</div>
            <div class="result-file-meta">${pageCount} pages · ${formatSize(blob.size)}</div>
          </div>
          <button class="download-btn" onclick="saveBlob(this, '${name}')">⬇ Download Merged PDF</button>
        </div>
      </div>
    </div>
  `;

  showToast('PDFs merged successfully!', 'success');
}

/* ================================================================
   4. SPLIT PDF
================================================================ */
async function processSplitPdf() {
  const files = App.files['pdf-split-files'] || [];
  if (!files.length) {
    showToast('Please select a PDF to split', 'error');
    return;
  }

  if (typeof PDFLib === 'undefined') {
    showToast('PDF library not loaded yet', 'error');
    return;
  }

  const { PDFDocument } = PDFLib;
  const f    = files[0];
  const mode = document.getElementById('split-mode').value;

  setProgress('split-progress-wrap', 'split-progress', 10);

  const buf = await f.arrayBuffer();
  let src;
  try {
    src = await PDFDocument.load(buf, { ignoreEncryption: true });
  } catch (err) {
    showToast('Could not read PDF', 'error');
    return;
  }

  const total     = src.getPageCount();
  const baseName  = f.name.replace(/\.pdf$/i, '');

  // Build page groups
  let pageGroups = [];
  if (mode === 'all') {
    pageGroups = Array.from({ length: total }, (_, i) => [i + 1]);
  } else {
    const rangeStr = document.getElementById('split-range').value.trim();
    if (!rangeStr) {
      showToast('Please enter a page range', 'error');
      return;
    }
    pageGroups = [parsePageRange(rangeStr, total)];
  }

  const results = [];

  for (let g = 0; g < pageGroups.length; g++) {
    setProgress('split-progress-wrap', 'split-progress', 15 + (g / pageGroups.length) * 80);

    const group  = pageGroups[g];
    const newDoc = await PDFDocument.create();
    const copied = await newDoc.copyPages(src, group.map(p => p - 1));
    copied.forEach(p => newDoc.addPage(p));

    const bytes = await newDoc.save();
    const blob  = new Blob([bytes], { type: 'application/pdf' });

    const nameSuffix = (mode === 'all')
      ? `_p${String(group[0]).padStart(3, '0')}`
      : `_pages${group[0]}-${group[group.length - 1]}`;

    const name = `${baseName}${nameSuffix}.pdf`;
    storeBlob(name, blob);
    results.push({ blob, name, info: `${group.length} page(s) · ${formatSize(blob.size)}` });
  }

  setProgress('split-progress-wrap', 'split-progress', 100);
  renderSimpleResult('split-result', results, 'Split Complete', `${results.length} PDF(s) created`);
  showToast(`PDF split into ${results.length} file(s)!`, 'success');
}

/* ================================================================
   5. COMPRESS PDF
================================================================ */
async function processCompressPdf() {
  const files = App.files['pdf-cmp-files'] || [];
  if (!files.length) {
    showToast('Please select a PDF to compress', 'error');
    return;
  }

  if (typeof PDFLib === 'undefined') {
    showToast('PDF library not loaded yet', 'error');
    return;
  }

  const { PDFDocument } = PDFLib;
  const f = files[0];

  showToast('Compressing PDF...', 'info');
  setProgress('pdf-cmp-progress-wrap', 'pdf-cmp-progress', 20);

  const buf = await f.arrayBuffer();
  let doc;
  try {
    doc = await PDFDocument.load(buf, { ignoreEncryption: true });
  } catch (err) {
    showToast('Could not read PDF', 'error');
    return;
  }

  setProgress('pdf-cmp-progress-wrap', 'pdf-cmp-progress', 60);

  // Re-save with object stream compression
  const bytes = await doc.save({
    useObjectStreams: true,
    addDefaultPage:  false,
    objectsPerTick:  50,
  });

  setProgress('pdf-cmp-progress-wrap', 'pdf-cmp-progress', 100);

  const blob     = new Blob([bytes], { type: 'application/pdf' });
  const name     = f.name.replace(/\.pdf$/i, '_compressed.pdf');
  const origSize = f.size;
  const newSize  = blob.size;
  const savings  = ((1 - newSize / origSize) * 100).toFixed(1);

  storeBlob(name, blob);

  document.getElementById('pdf-cmp-result').innerHTML = `
    <div class="result-area">
      <div class="result-header">
        <div class="result-icon">✅</div>
        <div>
          <h3>Compression Complete</h3>
          <p>${formatSize(origSize)} → ${formatSize(newSize)}</p>
        </div>
      </div>
      <div class="compress-stats">
        <div class="compress-stat">
          <div class="compress-stat-value text-muted">${formatSize(origSize)}</div>
          <div class="compress-stat-label">Original</div>
        </div>
        <div class="compress-stat">
          <div class="compress-stat-value text-green">${formatSize(newSize)}</div>
          <div class="compress-stat-label">Compressed</div>
        </div>
        <div class="compress-stat">
          <div class="compress-stat-value text-accent">${savings}%</div>
          <div class="compress-stat-label">Saved</div>
        </div>
      </div>
      <div class="result-files" style="margin-top: 16px;">
        <div class="result-file">
          <div class="result-file-info">
            <div class="result-file-name">${escHtml(name)}</div>
            <div class="result-file-meta">${formatSize(newSize)}</div>
          </div>
          <button class="download-btn" onclick="saveBlob(this, '${escHtml(name)}')">⬇ Download</button>
        </div>
      </div>
    </div>
  `;

  showToast('PDF compressed!', 'success');
}