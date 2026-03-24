/* ================================================================
   FILEFORGE — app.js
   Core application: routing, navigation, file handling, utilities,
   drag-and-drop, toasts, theme, shared render helpers.
================================================================ */

/* ================================================================
   1. STATE
================================================================ */
const App = {
  currentPage: 'home',
  theme: 'dark',

  /* Blob storage — keyed by filename for download */
  blobs: {},

  /* File lists — keyed by listId */
  files: {},
};

/* ================================================================
   2. NAVIGATION (SPA Router)
================================================================ */
function navigate(page) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  // Remove all active nav states
  document.querySelectorAll('.navbar-nav a').forEach(a => a.classList.remove('active'));

  // Show target page
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');

  // Mark nav link active
  const navEl = document.getElementById('nav-' + page);
  if (navEl) navEl.classList.add('active');

  App.currentPage = page;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ================================================================
   3. THEME TOGGLE
================================================================ */
function toggleTheme() {
  App.theme = App.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', App.theme);
  document.getElementById('themeBtn').textContent = App.theme === 'dark' ? '🌙' : '☀️';
}

/* ================================================================
   4. MOBILE NAV
================================================================ */
function openMobileNav() {
  document.getElementById('mobileNav').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeMobileNav() {
  document.getElementById('mobileNav').classList.remove('open');
  document.body.style.overflow = '';
}

/* ================================================================
   5. TOAST NOTIFICATIONS
================================================================ */
/**
 * @param {string} msg
 * @param {'info'|'success'|'error'} type
 * @param {number} duration ms
 */
function showToast(msg, type = 'info', duration = 4000) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const container = document.getElementById('toasts');

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.style.animation = 'toastIn 0.3s ease reverse';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/* ================================================================
   6. PROGRESS BAR
================================================================ */
/**
 * @param {string} wrapId
 * @param {string} barId
 * @param {number} pct 0–100
 */
function setProgress(wrapId, barId, pct) {
  const wrap = document.getElementById(wrapId);
  const bar  = document.getElementById(barId);
  if (!wrap || !bar) return;

  wrap.classList.remove('hidden');
  bar.style.width = pct + '%';

  if (pct >= 100) {
    setTimeout(() => wrap.classList.add('hidden'), 1400);
  }
}

/* ================================================================
   7. SUB-TOOL SWITCHERS
================================================================ */
/**
 * Switches visible sub-panel and active tab for image tools.
 */
function setImageTool(tool, tabEl) {
  _switchSubTool(
    ['compress', 'resize', 'convert', 'crop', 'bgreplace'],
    'img-',
    tool,
    '#img-tabs .sub-tool-tab',
    tabEl
  );
}

function setPdfTool(tool, tabEl) {
  _switchSubTool(
    ['img2pdf', 'pdf2img', 'merge', 'split', 'compress'],
    'pdf-',
    tool,
    '#pdf-tabs .sub-tool-tab',
    tabEl
  );
}

function setDocTool(tool, tabEl) {
  _switchSubTool(
    ['txt2docx', 'merge', 'extract', 'info'],
    'doc-',
    tool,
    '#doc-tabs .sub-tool-tab',
    tabEl
  );
}

function _switchSubTool(tools, prefix, active, tabSelector, tabEl) {
  tools.forEach(t => {
    const el = document.getElementById(prefix + t);
    if (el) el.classList.toggle('active', t === active);
  });
  document.querySelectorAll(tabSelector).forEach(btn => btn.classList.remove('active'));
  if (tabEl) tabEl.classList.add('active');
}

/* ================================================================
   8. DRAG & DROP
================================================================ */
function handleDragOver(e, zoneId) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById(zoneId)?.classList.add('drag-over');
}

function handleDragLeave(zoneId) {
  document.getElementById(zoneId)?.classList.remove('drag-over');
}

/**
 * @param {DragEvent} e
 * @param {string} listId
 * @param {string} zoneId
 * @param {boolean} multiple
 */
function handleDrop(e, listId, zoneId, multiple) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById(zoneId)?.classList.remove('drag-over');

  const droppedFiles = Array.from(e.dataTransfer.files);
  if (!droppedFiles.length) return;

  const showPreview = listId.includes('img') || listId.includes('bg');

  if (multiple) {
    _addFilesToState(listId, droppedFiles);
  } else {
    App.files[listId] = [droppedFiles[0]];
  }

  renderFileList(listId, showPreview);

  // Special: crop preview
  if (listId === 'img-crop-files' && droppedFiles[0]) {
    showCropPreview(droppedFiles[0]);
  }
}

/* ================================================================
   9. FILE STATE MANAGEMENT
================================================================ */
/**
 * @param {string} listId
 * @param {FileList|File[]} fileList
 * @param {boolean} multiple
 * @param {boolean} showPreview
 */
function addFiles(listId, fileList, multiple, showPreview) {
  const files = Array.from(fileList);
  if (!files.length) return;

  if (multiple) {
    _addFilesToState(listId, files);
  } else {
    App.files[listId] = [files[0]];
  }

  renderFileList(listId, showPreview);
}

function _addFilesToState(listId, files) {
  if (!App.files[listId]) App.files[listId] = [];
  files.forEach(f => {
    const isDupe = App.files[listId].some(x => x.name === f.name && x.size === f.size);
    if (!isDupe) App.files[listId].push(f);
  });
}

function removeFile(listId, index) {
  if (App.files[listId]) {
    App.files[listId].splice(index, 1);
    const showPreview = listId.includes('img') || listId.includes('bg');
    renderFileList(listId, showPreview);
  }
}

/**
 * Renders the file list UI for a given listId.
 * @param {string} listId
 * @param {boolean} showPreview - show image thumbnails
 */
function renderFileList(listId, showPreview = false) {
  const container = document.getElementById(listId);
  if (!container) return;

  const files = App.files[listId] || [];
  container.innerHTML = '';

  files.forEach((f, i) => {
    const item = document.createElement('div');
    item.className = 'file-item';

    const ext = f.name.split('.').pop().toLowerCase();
    const isImage = f.type?.startsWith('image/');

    let mediaHtml = '';
    if (showPreview && isImage) {
      const url = URL.createObjectURL(f);
      mediaHtml = `<img class="file-preview-thumb" src="${url}" alt="${escHtml(f.name)}" loading="lazy">`;
    } else {
      mediaHtml = `<span class="file-icon">${getFileIcon(ext)}</span>`;
    }

    item.innerHTML = `
      ${mediaHtml}
      <div class="file-info">
        <div class="file-name" title="${escHtml(f.name)}">${escHtml(f.name)}</div>
        <div class="file-size">${formatSize(f.size)}</div>
      </div>
      <button class="file-remove" onclick="removeFile('${listId}', ${i})" title="Remove file">✕</button>
    `;

    container.appendChild(item);
  });
}

/* ================================================================
   10. BLOB STORAGE & DOWNLOAD
================================================================ */
function storeBlob(name, blob) {
  App.blobs[name] = blob;
}

function saveBlob(btnEl, name) {
  const blob = App.blobs[name];
  if (!blob) { showToast('File not found in memory', 'error'); return; }
  saveAs(blob, name);
}

/**
 * Download multiple blobs as a ZIP archive.
 * @param {string[]} names
 */
async function downloadAllAsZip(names) {
  const zip = new JSZip();
  names.forEach(name => {
    if (App.blobs[name]) zip.file(name, App.blobs[name]);
  });
  try {
    const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    saveAs(content, 'fileforge_files.zip');
    showToast('ZIP downloaded!', 'success');
  } catch (err) {
    showToast('ZIP creation failed', 'error');
    console.error(err);
  }
}

/* ================================================================
   11. RESULT RENDERERS (shared)
================================================================ */

/**
 * Renders a generic results panel with a list of files.
 * @param {string} containerId
 * @param {Array<{blob, name, info}>} results
 * @param {string} title
 * @param {string} subtitle
 */
function renderSimpleResult(containerId, results, title, subtitle) {
  if (!results.length) { showToast('No results to show', 'error'); return; }

  const namesJson = JSON.stringify(results.map(r => r.name));

  const filesHtml = results.map(r => `
    <div class="result-file">
      <div class="result-file-info">
        <div class="result-file-name" title="${escHtml(r.name)}">${escHtml(r.name)}</div>
        <div class="result-file-meta">${r.info || ''}</div>
      </div>
      <button class="download-btn" onclick="saveBlob(this, '${escHtml(r.name)}')">⬇ Download</button>
    </div>
  `).join('');

  const zipBtn = results.length > 1
    ? `<button class="download-all-btn" onclick="downloadAllAsZip(${namesJson})">⬇ Download All as ZIP</button>`
    : '';

  document.getElementById(containerId).innerHTML = `
    <div class="result-area">
      <div class="result-header">
        <div class="result-icon">✅</div>
        <div>
          <h3>${escHtml(title)}</h3>
          <p>${escHtml(subtitle)}</p>
        </div>
      </div>
      <div class="result-files">${filesHtml}</div>
      ${zipBtn}
    </div>
  `;
}

/**
 * Renders compression stats + file list.
 */
function renderCompressResult(containerId, results) {
  if (!results.length) return;

  const totalOrig = results.reduce((a, r) => a + r.original, 0);
  const totalComp = results.reduce((a, r) => a + r.compressed, 0);
  const savings   = ((1 - totalComp / totalOrig) * 100).toFixed(1);
  const namesJson = JSON.stringify(results.map(r => r.name));

  const filesHtml = results.map(r => {
    const saved = ((1 - r.compressed / r.original) * 100).toFixed(1);
    return `
      <div class="result-file">
        <div class="result-file-info">
          <div class="result-file-name">${escHtml(r.name)}</div>
          <div class="result-file-meta">
            ${formatSize(r.original)} → ${formatSize(r.compressed)}
            · <span class="text-green">-${saved}%</span>
          </div>
        </div>
        <button class="download-btn" onclick="saveBlob(this, '${escHtml(r.name)}')">⬇ Download</button>
      </div>
    `;
  }).join('');

  const zipBtn = results.length > 1
    ? `<button class="download-all-btn" onclick="downloadAllAsZip(${namesJson})">⬇ Download All as ZIP</button>`
    : '';

  document.getElementById(containerId).innerHTML = `
    <div class="result-area">
      <div class="result-header">
        <div class="result-icon">✅</div>
        <div>
          <h3>Compression Complete</h3>
          <p>${results.length} file(s) processed</p>
        </div>
      </div>
      <div class="compress-stats">
        <div class="compress-stat">
          <div class="compress-stat-value text-muted">${formatSize(totalOrig)}</div>
          <div class="compress-stat-label">Original</div>
        </div>
        <div class="compress-stat">
          <div class="compress-stat-value text-green">${formatSize(totalComp)}</div>
          <div class="compress-stat-label">Compressed</div>
        </div>
        <div class="compress-stat">
          <div class="compress-stat-value text-accent">${savings}%</div>
          <div class="compress-stat-label">Saved</div>
        </div>
      </div>
      <div class="result-files" style="margin-top:16px">${filesHtml}</div>
      ${zipBtn}
    </div>
  `;
}

/* ================================================================
   12. IMAGE UTILITIES
================================================================ */

/**
 * Load a File into an HTMLImageElement.
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 */
function loadImageToCanvas(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load: ' + file.name)); };
    img.src = url;
  });
}

/**
 * Convert canvas to Blob.
 * @param {HTMLCanvasElement} canvas
 * @param {'jpeg'|'png'|'webp'} format
 * @param {number} quality 0–1
 * @returns {Promise<Blob>}
 */
function canvasToBlob(canvas, format, quality = 0.92) {
  const mimeMap = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const mime    = mimeMap[format] || 'image/jpeg';
  return new Promise(resolve => canvas.toBlob(resolve, mime, quality));
}

/**
 * Detect output format from file MIME or fallback.
 * @param {File} file
 * @param {string} selectedFmt - user selection or 'same'
 * @returns {'jpeg'|'png'|'webp'}
 */
function resolveFormat(file, selectedFmt) {
  if (selectedFmt !== 'same') return selectedFmt;
  if (file.type.includes('png'))  return 'png';
  if (file.type.includes('webp')) return 'webp';
  return 'jpeg';
}

/**
 * Get file extension from format string.
 */
function fmtToExt(fmt) {
  return { jpeg: 'jpg', png: 'png', webp: 'webp' }[fmt] || fmt;
}

/* ================================================================
   13. GENERAL UTILITIES
================================================================ */

/**
 * Format byte count as human-readable string.
 */
function formatSize(bytes) {
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Return an emoji icon for a file extension.
 */
function getFileIcon(ext) {
  const map = {
    jpg: '🖼', jpeg: '🖼', png: '🖼', webp: '🖼', gif: '🖼', bmp: '🖼', svg: '🖼',
    pdf: '📄',
    txt: '📝', md: '📝', csv: '📊',
    json: '🔧', js: '⚙️', ts: '⚙️',
    html: '🌐', css: '🎨', xml: '📋',
    docx: '📘', doc: '📘', xlsx: '📗', xls: '📗',
    zip: '📦', rar: '📦', gz: '📦',
    mp3: '🎵', mp4: '🎬', wav: '🎵',
  };
  return map[ext] || '📁';
}

/**
 * HTML-escape a string for safe innerHTML use.
 */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * XML-escape (superset of HTML-escape).
 */
function escXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Parse a page range string like "1-3, 5, 7-9" into an array of page numbers.
 * @param {string} input
 * @param {number} total
 * @returns {number[]}
 */
function parsePageRange(input, total) {
  const pages = new Set();
  input.split(',').forEach(part => {
    part = part.trim();
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      for (let i = a; i <= Math.min(b, total); i++) pages.add(i);
    } else {
      const n = parseInt(part, 10);
      if (n >= 1 && n <= total) pages.add(n);
    }
  });
  return [...pages].sort((a, b) => a - b);
}

/* ================================================================
   14. CONTACT FORM
================================================================ */
function submitContact() {
  const name    = document.getElementById('contact-name').value.trim();
  const email   = document.getElementById('contact-email').value.trim();
  const subject = document.getElementById('contact-subject').value.trim();
  const msg     = document.getElementById('contact-msg').value.trim();

  if (!name || !email || !msg) {
    showToast('Please fill in all required fields', 'error');
    return;
  }

  document.getElementById('contact-result').innerHTML = `
    <div class="result-area" style="margin-top: 20px">
      <div class="result-header">
        <div class="result-icon">✅</div>
        <div>
          <h3>Message Sent!</h3>
          <p>Thank you, ${escHtml(name)}! We'll get back to you at ${escHtml(email)}.</p>
        </div>
      </div>
    </div>
  `;

  showToast('Message sent successfully!', 'success');

  // Clear form
  ['contact-name', 'contact-email', 'contact-subject', 'contact-msg'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

/* ================================================================
   15. INIT
================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // Confirm external libs loaded
  if (typeof PDFLib === 'undefined') {
    showToast('PDF library loading... PDF tools may be slow on first use.', 'info');
  }

  // Close mobile nav on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMobileNav();
  });

  // Welcome toast
  setTimeout(() => showToast('Welcome to FileForge — 100% private, browser-based!', 'info'), 900);
});
