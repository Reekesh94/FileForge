/* ================================================================
   FILEFORGE — doc-tools.js
   Document processing: TXT→DOCX, merge docs, extract text, file info.
   Depends on: app.js (loaded first), JSZip (CDN)
================================================================ */

/* ================================================================
   1. TXT / MD → DOCX
================================================================ */
async function processTxt2Docx() {
  const files = App.files['doc-txt-files'] || [];
  if (!files.length) {
    showToast('Please add text files to convert', 'error');
    return;
  }

  const title    = document.getElementById('docx-title').value.trim()    || 'Document';
  const author   = document.getElementById('docx-author').value.trim()   || 'FileForge';
  const font     = document.getElementById('docx-font').value            || 'Calibri';
  const fontSize = parseInt(document.getElementById('docx-fontsize').value, 10) || 12;

  const results = [];

  for (const f of files) {
    try {
      const text  = await f.text();
      const lines = text.split('\n');
      const blob  = _buildDocx(title, author, font, fontSize, lines);
      const name  = f.name.replace(/\.[^.]+$/, '') + '.docx';

      storeBlob(name, blob);
      results.push({ blob, name, info: `${lines.length} lines · ${formatSize(blob.size)}` });

    } catch (err) {
      console.error(err);
      showToast(`Failed: ${f.name}`, 'error');
    }
  }

  renderSimpleResult(
    'doc-txt-result',
    results,
    'Conversion Complete',
    `${results.length} DOCX document(s) created`
  );

  if (results.length) showToast('Documents created!', 'success');
}

/* ================================================================
   2. MERGE DOCUMENTS
================================================================ */
async function processMergeDocs() {
  const files = App.files['doc-merge-files'] || [];
  if (files.length < 2) {
    showToast('Please add at least 2 files to merge', 'error');
    return;
  }

  const sepMode = document.getElementById('merge-separator').value;
  const outFmt  = document.getElementById('merge-doc-fmt').value;

  // Read all files
  const parts = [];
  for (const f of files) {
    const text = await f.text();
    parts.push({ name: f.name, content: text });
  }

  // Build separator
  const getSep = () => {
    if (sepMode === 'line')      return '\n\n' + '─'.repeat(60) + '\n\n';
    if (sepMode === 'pagebreak') return '\n\n\f\n\n'; // form-feed char
    return '\n\n';
  };

  let blob, name;

  if (outFmt === 'html') {
    const htmlParts = parts.map((p, i) => {
      const sep = i < parts.length - 1 ? _htmlSep(sepMode) : '';
      return `<section>
  <p class="source-label">📄 ${escHtml(p.name)}</p>
  <div class="content">${escHtml(p.content).replace(/\n/g, '<br>')}</div>
</section>${sep}`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Merged Document</title>
  <style>
    body { font-family: Georgia, serif; max-width: 820px; margin: 0 auto; padding: 48px 32px; line-height: 1.85; color: #222; }
    .source-label { font-size: 11px; color: #999; margin-bottom: 6px; font-family: monospace; }
    .content { margin-bottom: 32px; }
    hr { border: none; border-top: 2px solid #e0e0e0; margin: 40px 0; }
    .page-break { page-break-after: always; }
  </style>
</head>
<body>
${htmlParts}
</body>
</html>`;

    blob = new Blob([html], { type: 'text/html' });
    name = 'fileforge_merged.html';

  } else if (outFmt === 'docx') {
    const combined = parts.map(p => p.content).join(getSep());
    blob = _buildDocx('Merged Document', 'FileForge', 'Calibri', 12, combined.split('\n'));
    name = 'fileforge_merged.docx';

  } else {
    // Plain text
    const combined = parts
      .map((p, i) => `[${p.name}]\n${p.content}`)
      .join(getSep());
    blob = new Blob([combined], { type: 'text/plain' });
    name = 'fileforge_merged.txt';
  }

  storeBlob(name, blob);

  document.getElementById('doc-merge-result').innerHTML = `
    <div class="result-area">
      <div class="result-header">
        <div class="result-icon">✅</div>
        <div>
          <h3>Merge Complete</h3>
          <p>${files.length} files merged · ${formatSize(blob.size)}</p>
        </div>
      </div>
      <div class="result-files">
        <div class="result-file">
          <div class="result-file-info">
            <div class="result-file-name">${escHtml(name)}</div>
            <div class="result-file-meta">${formatSize(blob.size)}</div>
          </div>
          <button class="download-btn" onclick="saveBlob(this, '${escHtml(name)}')">⬇ Download</button>
        </div>
      </div>
    </div>
  `;

  showToast('Documents merged!', 'success');
}

function _htmlSep(mode) {
  if (mode === 'line')      return '<hr>';
  if (mode === 'pagebreak') return '<div class="page-break"></div>';
  return '';
}

/* ================================================================
   3. EXTRACT TEXT & ANALYZE
================================================================ */
async function processExtractText() {
  const files = App.files['doc-extract-files'] || [];
  if (!files.length) {
    showToast('Please select a file', 'error');
    return;
  }

  const f = files[0];

  let text;
  try {
    text = await f.text();
  } catch (err) {
    showToast('Could not read file as text', 'error');
    return;
  }

  // Analysis
  const lines     = text.split('\n');
  const words     = text.trim().split(/\s+/).filter(Boolean);
  const chars     = text.length;
  const sentences = (text.match(/[.!?]+(?:\s|$)/g) || []).length;
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim()).length;
  const avgWordLen = words.length
    ? (text.replace(/\s+/g, '').length / words.length).toFixed(1)
    : 0;

  // Download extracted text
  const blob = new Blob([text], { type: 'text/plain' });
  const name = f.name.replace(/\.[^.]+$/, '') + '_extracted.txt';
  storeBlob(name, blob);

  // Preview (first 900 chars)
  const preview = text.length > 900
    ? text.slice(0, 900) + '\n\n... (truncated)'
    : text;

  document.getElementById('doc-extract-result').innerHTML = `
    <div class="result-area">
      <div class="result-header">
        <div class="result-icon">✅</div>
        <div>
          <h3>Text Extracted & Analyzed</h3>
          <p>${escHtml(f.name)} · ${formatSize(f.size)}</p>
        </div>
      </div>

      <div class="compress-stats">
        <div class="compress-stat">
          <div class="compress-stat-value text-accent">${words.length.toLocaleString()}</div>
          <div class="compress-stat-label">Words</div>
        </div>
        <div class="compress-stat">
          <div class="compress-stat-value text-green">${chars.toLocaleString()}</div>
          <div class="compress-stat-label">Characters</div>
        </div>
        <div class="compress-stat">
          <div class="compress-stat-value text-cyan">${lines.length.toLocaleString()}</div>
          <div class="compress-stat-label">Lines</div>
        </div>
        <div class="compress-stat">
          <div class="compress-stat-value text-pink">${sentences}</div>
          <div class="compress-stat-label">Sentences</div>
        </div>
        <div class="compress-stat">
          <div class="compress-stat-value" style="color:var(--orange)">${paragraphs}</div>
          <div class="compress-stat-label">Paragraphs</div>
        </div>
        <div class="compress-stat">
          <div class="compress-stat-value">${avgWordLen}</div>
          <div class="compress-stat-label">Avg Word Len</div>
        </div>
      </div>

      <div class="text-preview">${escHtml(preview)}</div>

      <div class="result-files" style="margin-top: 14px;">
        <div class="result-file">
          <div class="result-file-info">
            <div class="result-file-name">${escHtml(name)}</div>
            <div class="result-file-meta">${formatSize(blob.size)}</div>
          </div>
          <button class="download-btn" onclick="saveBlob(this, '${escHtml(name)}')">⬇ Download Text</button>
        </div>
      </div>
    </div>
  `;

  showToast('Text extracted and analyzed!', 'success');
}

/* ================================================================
   4. FILE INFO
================================================================ */
async function processDocInfo() {
  const files = App.files['doc-info-files'] || [];
  if (!files.length) {
    showToast('Please select a file', 'error');
    return;
  }

  const f   = files[0];
  const ext = f.name.split('.').pop().toLowerCase();
  const isText = ['txt','md','csv','json','html','htm','js','ts','css','xml','yaml','yml','toml','ini'].includes(ext);

  let extraStats = '';
  let wordCount  = '';

  if (isText) {
    try {
      const text = await f.text();
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      const lns   = text.split('\n').length;
      wordCount = `
        <div class="compress-stat">
          <div class="compress-stat-value text-accent">${words.toLocaleString()}</div>
          <div class="compress-stat-label">Words</div>
        </div>
        <div class="compress-stat">
          <div class="compress-stat-value text-green">${lns.toLocaleString()}</div>
          <div class="compress-stat-label">Lines</div>
        </div>
      `;
    } catch (_) {}
  }

  const lastModified = f.lastModified
    ? new Date(f.lastModified).toLocaleString()
    : 'Unknown';

  const mime = f.type || _guessMime(ext);

  document.getElementById('doc-info-result').innerHTML = `
    <div class="result-area">
      <div class="result-header">
        <div class="result-icon" style="background:var(--cyan-dim); color:var(--cyan);">ℹ️</div>
        <div>
          <h3>File Information</h3>
          <p>${escHtml(f.name)}</p>
        </div>
      </div>

      <div class="compress-stats">
        <div class="compress-stat">
          <div class="compress-stat-value text-accent">${formatSize(f.size)}</div>
          <div class="compress-stat-label">File Size</div>
        </div>
        <div class="compress-stat">
          <div class="compress-stat-value text-cyan">.${ext.toUpperCase()}</div>
          <div class="compress-stat-label">Format</div>
        </div>
        ${wordCount}
      </div>

      <div style="background:var(--bg-input); border:1px solid var(--border); border-radius:var(--radius-md); padding:16px; margin-top:16px;">
        <table class="info-table">
          <tr>
            <td class="label-cell">File Name</td>
            <td class="value-cell">${escHtml(f.name)}</td>
          </tr>
          <tr>
            <td class="label-cell">File Size</td>
            <td class="value-cell">${formatSize(f.size)} <span style="color:var(--text-muted)">(${f.size.toLocaleString()} bytes)</span></td>
          </tr>
          <tr>
            <td class="label-cell">MIME Type</td>
            <td class="value-cell">${escHtml(mime)}</td>
          </tr>
          <tr>
            <td class="label-cell">Extension</td>
            <td class="value-cell">.${escHtml(ext)}</td>
          </tr>
          <tr>
            <td class="label-cell">Last Modified</td>
            <td class="value-cell">${escHtml(lastModified)}</td>
          </tr>
          <tr>
            <td class="label-cell">Category</td>
            <td class="value-cell">${_fileCategory(ext)}</td>
          </tr>
        </table>
      </div>
    </div>
  `;

  showToast('File info loaded!', 'success');
}

function _guessMime(ext) {
  const map = {
    pdf:  'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt:  'text/plain',
    md:   'text/markdown',
    html: 'text/html',
    css:  'text/css',
    js:   'text/javascript',
    json: 'application/json',
    csv:  'text/csv',
    xml:  'application/xml',
    jpg:  'image/jpeg', jpeg: 'image/jpeg',
    png:  'image/png',
    webp: 'image/webp',
    gif:  'image/gif',
    svg:  'image/svg+xml',
    mp3:  'audio/mpeg',
    mp4:  'video/mp4',
    zip:  'application/zip',
  };
  return map[ext] || 'application/octet-stream';
}

function _fileCategory(ext) {
  if (['jpg','jpeg','png','webp','gif','bmp','svg','ico','tiff','avif'].includes(ext)) return '🖼 Image';
  if (['pdf'].includes(ext))                         return '📄 PDF Document';
  if (['doc','docx'].includes(ext))                  return '📘 Word Document';
  if (['xls','xlsx','csv'].includes(ext))            return '📗 Spreadsheet';
  if (['ppt','pptx'].includes(ext))                  return '📊 Presentation';
  if (['txt','md','rtf'].includes(ext))              return '📝 Text File';
  if (['html','htm'].includes(ext))                  return '🌐 Web Page';
  if (['js','ts','jsx','tsx'].includes(ext))         return '⚙️ JavaScript';
  if (['css','scss','sass'].includes(ext))           return '🎨 Stylesheet';
  if (['json','yaml','yml','toml','xml'].includes(ext)) return '🔧 Data / Config';
  if (['zip','rar','gz','tar','7z'].includes(ext))   return '📦 Archive';
  if (['mp3','wav','ogg','flac'].includes(ext))      return '🎵 Audio';
  if (['mp4','webm','avi','mov'].includes(ext))      return '🎬 Video';
  return '📁 Other';
}

/* ================================================================
   5. DOCX BUILDER (Office Open XML via JSZip)
   Builds a real .docx file from an array of text lines.
================================================================ */
function _buildDocx(title, author, font, fontSize, lines) {
  if (typeof JSZip === 'undefined') {
    console.error('JSZip not loaded');
    return new Blob(['JSZip not loaded'], { type: 'text/plain' });
  }

  const zip  = new JSZip();
  const fsSz = fontSize * 2; // half-points (OOXML unit)

  // ── [Content_Types].xml ──────────────────────────────────────
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml"
    ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`);

  // ── _rels/.rels ───────────────────────────────────────────────
  zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="word/document.xml"/>
  <Relationship Id="rId2"
    Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties"
    Target="docProps/core.xml"/>
</Relationships>`);

  // ── word/_rels/document.xml.rels ─────────────────────────────
  zip.folder('word').folder('_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"
    Target="styles.xml"/>
</Relationships>`);

  // ── docProps/core.xml ─────────────────────────────────────────
  zip.folder('docProps').file('core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties
  xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escXml(title)}</dc:title>
  <dc:creator>${escXml(author)}</dc:creator>
  <cp:lastModifiedBy>${escXml(author)}</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`);

  // ── word/styles.xml ───────────────────────────────────────────
  zip.folder('word').file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
          xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
  <!-- Normal -->
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr>
      <w:rFonts w:ascii="${escXml(font)}" w:hAnsi="${escXml(font)}" w:cs="${escXml(font)}"/>
      <w:sz w:val="${fsSz}"/>
      <w:szCs w:val="${fsSz}"/>
    </w:rPr>
  </w:style>
  <!-- Heading 1 -->
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="${escXml(font)}" w:hAnsi="${escXml(font)}"/>
      <w:b/><w:sz w:val="${fsSz * 2}"/><w:szCs w:val="${fsSz * 2}"/>
    </w:rPr>
  </w:style>
  <!-- Heading 2 -->
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:pStyle w:val="Heading2"/><w:spacing w:before="200" w:after="80"/></w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="${escXml(font)}" w:hAnsi="${escXml(font)}"/>
      <w:b/><w:sz w:val="${Math.round(fsSz * 1.5)}"/><w:szCs w:val="${Math.round(fsSz * 1.5)}"/>
    </w:rPr>
  </w:style>
</w:styles>`);

  // ── word/document.xml — Build paragraphs ─────────────────────
  const paragraphsXml = lines.map(line => {
    const safe  = escXml(line);
    const blank = !line.trim();

    if (blank) {
      // Empty paragraph with small spacing
      return `<w:p><w:pPr><w:spacing w:after="80"/></w:pPr></w:p>`;
    }

    // Markdown-like headings
    if (line.startsWith('# ')) {
      return `<w:p>
  <w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:after="120"/></w:pPr>
  <w:r>
    <w:rPr><w:rFonts w:ascii="${escXml(font)}" w:hAnsi="${escXml(font)}"/><w:b/>
      <w:sz w:val="${fsSz * 2}"/></w:rPr>
    <w:t xml:space="preserve">${escXml(line.slice(2))}</w:t>
  </w:r>
</w:p>`;
    }

    if (line.startsWith('## ')) {
      return `<w:p>
  <w:pPr><w:pStyle w:val="Heading2"/><w:spacing w:after="80"/></w:pPr>
  <w:r>
    <w:rPr><w:rFonts w:ascii="${escXml(font)}" w:hAnsi="${escXml(font)}"/><w:b/>
      <w:sz w:val="${Math.round(fsSz * 1.5)}"/></w:rPr>
    <w:t xml:space="preserve">${escXml(line.slice(3))}</w:t>
  </w:r>
</w:p>`;
    }

    // Bullet list
    if (line.startsWith('- ') || line.startsWith('* ')) {
      return `<w:p>
  <w:pPr>
    <w:pStyle w:val="Normal"/>
    <w:ind w:left="360" w:hanging="360"/>
    <w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>
    <w:spacing w:after="80"/>
  </w:pPr>
  <w:r>
    <w:rPr><w:rFonts w:ascii="${escXml(font)}" w:hAnsi="${escXml(font)}"/>
      <w:sz w:val="${fsSz}"/></w:rPr>
    <w:t xml:space="preserve">${escXml(line.slice(2))}</w:t>
  </w:r>
</w:p>`;
    }

    // Horizontal rule
    if (/^[-*]{3,}$/.test(line.trim())) {
      return `<w:p>
  <w:pPr>
    <w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CCCCCC"/></w:pBdr>
    <w:spacing w:before="120" w:after="120"/>
  </w:pPr>
</w:p>`;
    }

    // Regular paragraph
    return `<w:p>
  <w:pPr><w:spacing w:after="120"/></w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="${escXml(font)}" w:hAnsi="${escXml(font)}" w:cs="${escXml(font)}"/>
      <w:sz w:val="${fsSz}"/><w:szCs w:val="${fsSz}"/>
    </w:rPr>
    <w:t xml:space="preserve">${safe}</w:t>
  </w:r>
</w:p>`;
  }).join('\n');

  zip.folder('word').file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${paragraphsXml}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"
               w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`);

  // Generate ZIP synchronously and return Blob
  const uint8 = zip.generateSync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return new Blob(
    [uint8],
    { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
  );
}
