/* ================================================================
   FILEFORGE — image-tools.js
   All image processing: compress, resize, convert, crop,
   background removal.

   KEY IMPROVEMENTS:
   - Interactive drag-to-select crop region on canvas
   - Resize live dimension preview
   - BG color toggle
   Depends on: app.js (loaded first)
================================================================ */

/* ================================================================
   1. RESIZE MODE TOGGLE
================================================================ */
function toggleResizeMode() {
  const mode = document.getElementById('resize-mode').value;
  document.getElementById('resize-w-group').classList.toggle('hidden',   mode !== 'dimensions');
  document.getElementById('resize-h-group').classList.toggle('hidden',   mode !== 'dimensions');
  document.getElementById('resize-pct-group').classList.toggle('hidden', mode !== 'percentage');
  _updateResizeDims();
}

/* ================================================================
   2. BG COLOR TOGGLE
================================================================ */
function toggleBgColor() {
  const val = document.getElementById('bg-replace-type').value;
  document.getElementById('bg-color-group').classList.toggle('hidden', val !== 'color');
}

/* ================================================================
   3. INTERACTIVE CANVAS CROP
   Users drag directly on the image to select a crop region.
================================================================ */
const Crop = {
  img:        null,   // loaded HTMLImageElement
  file:       null,   // original File
  canvas:     null,   // display canvas element
  ctx:        null,
  scale:      1,      // ratio: display px / real image px
  isDragging: false,
  startX:     0,
  startY:     0,
  rect:       null,   // { x, y, w, h } in DISPLAY space
};

/** Called when user picks/drops an image into the crop zone */
async function showCropPreview(file) {
  if (!file) return;
  Crop.file = file;

  try {
    const img = await loadImageToCanvas(file);
    Crop.img  = img;

    const area = document.getElementById('img-crop-preview-area');
    if (!area) return;

    area.innerHTML = `
      <div class="crop-canvas-wrap" id="crop-canvas-wrap">
        <div class="crop-canvas-header">
          <span class="crop-canvas-label">🖱️ Drag on the image to select crop area</span>
          <div class="crop-canvas-actions">
            <button class="crop-preset-btn" onclick="applyCropPreset('square')">1:1</button>
            <button class="crop-preset-btn" onclick="applyCropPreset('16:9')">16:9</button>
            <button class="crop-preset-btn" onclick="applyCropPreset('4:3')">4:3</button>
            <button class="crop-preset-btn" onclick="applyCropPreset('9:16')">9:16</button>
            <button class="crop-preset-btn crop-preset-clear" onclick="clearCropSelection()">✕ Clear</button>
          </div>
        </div>
        <div class="crop-canvas-container">
          <canvas id="crop-canvas" class="crop-canvas"></canvas>
        </div>
        <div class="crop-info-bar">
          <span>Image: ${img.naturalWidth} × ${img.naturalHeight} px</span>
          <span class="crop-sep">·</span>
          <span id="crop-sel-info" style="color:var(--accent-light)">No selection — drag to crop</span>
        </div>
      </div>
    `;

    const canvas = document.getElementById('crop-canvas');
    Crop.canvas  = canvas;
    Crop.ctx     = canvas.getContext('2d');
    Crop.rect    = null;

    _fitCropCanvas(img);
    _drawCropCanvas();
    _bindCropEvents(canvas);

    window.removeEventListener('resize', _onCropResize);
    window.addEventListener('resize', _onCropResize);

  } catch (err) {
    console.warn('Crop preview failed:', err);
  }
}

function _onCropResize() {
  if (!Crop.img || !Crop.canvas) return;
  const imgRect = Crop.rect ? _displayToImg(Crop.rect) : null;
  _fitCropCanvas(Crop.img);
  if (imgRect) Crop.rect = _imgToDisplay(imgRect);
  _drawCropCanvas();
}

function _fitCropCanvas(img) {
  const wrap = document.getElementById('crop-canvas-wrap');
  if (!wrap || !Crop.canvas) return;
  const maxW = Math.max(wrap.clientWidth - 4, 300);
  const maxH = Math.min(500, Math.round(window.innerHeight * 0.55));
  const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
  Crop.scale        = scale;
  Crop.canvas.width  = Math.round(img.naturalWidth  * scale);
  Crop.canvas.height = Math.round(img.naturalHeight * scale);
}

function _drawCropCanvas() {
  const { canvas, ctx, img, rect } = Crop;
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (!rect || Math.abs(rect.w) < 2 || Math.abs(rect.h) < 2) return;

  const { x, y, w, h } = _normalizeRect(rect);

  // Darken outside
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0,     0,            canvas.width, y);
  ctx.fillRect(0,     y + h,        canvas.width, canvas.height - y - h);
  ctx.fillRect(0,     y,            x,            h);
  ctx.fillRect(x + w, y,            canvas.width - x - w, h);

  // Selection border
  ctx.strokeStyle = '#7b7fff';
  ctx.lineWidth   = 2;
  ctx.setLineDash([]);
  ctx.strokeRect(x, y, w, h);

  // Corner + edge handles
  const hs = 9;
  const pts = [
    [x,       y],       [x + w,     y],
    [x,       y + h],   [x + w,     y + h],
    [x + w/2, y],       [x + w/2,   y + h],
    [x,       y + h/2], [x + w,     y + h/2],
  ];
  pts.forEach(([cx, cy]) => {
    ctx.fillStyle   = '#ffffff';
    ctx.strokeStyle = '#5b5fef';
    ctx.lineWidth   = 1.5;
    ctx.fillRect(cx - hs/2, cy - hs/2, hs, hs);
    ctx.strokeRect(cx - hs/2, cy - hs/2, hs, hs);
  });

  // Rule-of-thirds
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([4, 4]);
  [1/3, 2/3].forEach(t => {
    ctx.beginPath(); ctx.moveTo(x + w*t, y);     ctx.lineTo(x + w*t, y+h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x,       y+h*t); ctx.lineTo(x+w, y+h*t);  ctx.stroke();
  });
  ctx.setLineDash([]);

  // Dimension badge
  const ir = _displayToImg({ x, y, w, h });
  const badge = `${ir.w} × ${ir.h}`;
  ctx.font      = 'bold 13px DM Sans, sans-serif';
  const tw      = ctx.measureText(badge).width;
  const bx      = Math.min(x + 8, canvas.width - tw - 16);
  const by      = y + h - 10 > y + 24 ? y + h - 10 : y + 24;
  ctx.fillStyle = 'rgba(91,95,239,0.85)';
  ctx.beginPath();
  ctx.roundRect(bx - 6, by - 16, tw + 12, 22, 5);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(badge, bx, by);

  // Info bar
  const info = document.getElementById('crop-sel-info');
  if (info) info.textContent = `Selected: ${ir.w} × ${ir.h} px  (at ${ir.x}, ${ir.y})`;
}

function _bindCropEvents(canvas) {
  canvas.addEventListener('mousedown',  _cropStart);
  canvas.addEventListener('mousemove',  _cropMove);
  canvas.addEventListener('mouseup',    _cropEnd);
  canvas.addEventListener('mouseleave', _cropEnd);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); _cropStart(_touchToMouse(e, canvas)); }, { passive: false });
  canvas.addEventListener('touchmove',  e => { e.preventDefault(); _cropMove(_touchToMouse(e, canvas));  }, { passive: false });
  canvas.addEventListener('touchend',   () => _cropEnd(), { passive: false });
}

function _touchToMouse(e, canvas) {
  const t = e.touches[0];
  const r = canvas.getBoundingClientRect();
  return { offsetX: t.clientX - r.left, offsetY: t.clientY - r.top };
}

function _cropStart(e) {
  Crop.isDragging = true;
  Crop.startX = e.offsetX;
  Crop.startY = e.offsetY;
  Crop.rect   = { x: Crop.startX, y: Crop.startY, w: 0, h: 0 };
}

function _cropMove(e) {
  if (!Crop.isDragging) return;
  Crop.rect = {
    x: Crop.startX,
    y: Crop.startY,
    w: e.offsetX - Crop.startX,
    h: e.offsetY - Crop.startY,
  };
  _drawCropCanvas();
}

function _cropEnd() {
  if (!Crop.isDragging) return;
  Crop.isDragging = false;
  if (!Crop.rect || (Math.abs(Crop.rect.w) < 5 && Math.abs(Crop.rect.h) < 5)) {
    Crop.rect = null;
    _drawCropCanvas();
  }
}

function _normalizeRect(r) {
  return {
    x: r.w >= 0 ? r.x : r.x + r.w,
    y: r.h >= 0 ? r.y : r.y + r.h,
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  };
}

function _displayToImg(r) {
  const nr = _normalizeRect(r);
  const s  = Crop.scale;
  return {
    x: Math.round(nr.x / s),
    y: Math.round(nr.y / s),
    w: Math.round(nr.w / s),
    h: Math.round(nr.h / s),
  };
}

function _imgToDisplay(r) {
  const s = Crop.scale;
  return { x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s };
}

function applyCropPreset(preset) {
  if (!Crop.img) { showToast('Load an image first', 'error'); return; }
  const W = Crop.img.naturalWidth;
  const H = Crop.img.naturalHeight;
  let iw = W, ih = H, ix = 0, iy = 0;

  switch (preset) {
    case 'square': { const s = Math.min(W,H); ix=(W-s)/2; iy=(H-s)/2; iw=s; ih=s; break; }
    case '16:9':   { ih=W*9/16; if(ih>H){ih=H;iw=H*16/9;} ix=(W-iw)/2; iy=(H-ih)/2; break; }
    case '4:3':    { ih=W*3/4;  if(ih>H){ih=H;iw=H*4/3;}  ix=(W-iw)/2; iy=(H-ih)/2; break; }
    case '9:16':   { iw=H*9/16; if(iw>W){iw=W;ih=W*16/9;} ix=(W-iw)/2; iy=(H-ih)/2; break; }
  }

  Crop.rect = _imgToDisplay({ x: ix, y: iy, w: iw, h: ih });
  _drawCropCanvas();
}

function clearCropSelection() {
  Crop.rect = null;
  _drawCropCanvas();
  const info = document.getElementById('crop-sel-info');
  if (info) info.textContent = 'No selection — drag to crop';
}

/* ================================================================
   4. PROCESS CROP
================================================================ */
async function processImageCrop() {
  const files = App.files['img-crop-files'] || [];
  if (!files.length) { showToast('Please select an image first', 'error'); return; }

  if (!Crop.rect || (Math.abs(Crop.rect.w) < 5 && Math.abs(Crop.rect.h) < 5)) {
    showToast('Drag on the image to select a crop area first', 'error');
    return;
  }

  const f    = Crop.file || files[0];
  const img  = Crop.img  || await loadImageToCanvas(f);
  const imgR = _displayToImg(Crop.rect);

  const x = Math.max(0, imgR.x);
  const y = Math.max(0, imgR.y);
  const w = Math.min(imgR.w, img.naturalWidth  - x);
  const h = Math.min(imgR.h, img.naturalHeight - y);

  if (w <= 0 || h <= 0) { showToast('Invalid crop selection', 'error'); return; }

  const fmtSelect = document.getElementById('crop-fmt').value;
  const outFmt    = resolveFormat(f, fmtSelect);

  const canvas = document.createElement('canvas');
  canvas.width  = w; canvas.height = h;
  canvas.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);

  const blob = await canvasToBlob(canvas, outFmt, 0.95);
  const ext  = fmtToExt(outFmt);
  const name = `${f.name.replace(/\.[^.]+$/, '')}_crop_${w}x${h}.${ext}`;
  storeBlob(name, blob);

  const previewUrl = URL.createObjectURL(blob);
  document.getElementById('img-crop-result').innerHTML = `
    <div class="result-area">
      <div class="result-header">
        <div class="result-icon">✅</div>
        <div><h3>Crop Complete</h3><p>${w} × ${h} px · ${formatSize(blob.size)}</p></div>
      </div>
      <img src="${previewUrl}" class="result-preview-img" alt="Cropped preview">
      <div class="result-files">
        <div class="result-file">
          <div class="result-file-info">
            <div class="result-file-name">${escHtml(name)}</div>
            <div class="result-file-meta">${w} × ${h} px · ${formatSize(blob.size)}</div>
          </div>
          <button class="download-btn" onclick="saveBlob(this, '${escHtml(name)}')">⬇ Download</button>
        </div>
      </div>
    </div>
  `;
  showToast('Image cropped!', 'success');
}

/* ================================================================
   5. COMPRESS
================================================================ */
async function processImageCompress() {
  const files = App.files['img-compress-files'] || [];
  if (!files.length) { showToast('Please add at least one image', 'error'); return; }

  const quality   = parseInt(document.getElementById('img-quality').value) / 100;
  const fmtSelect = document.getElementById('img-compress-fmt').value;
  const results   = [];

  setProgress('img-compress-progress-wrap', 'img-compress-progress', 5);

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    setProgress('img-compress-progress-wrap', 'img-compress-progress', 10 + (i / files.length) * 84);
    try {
      const img    = await loadImageToCanvas(f);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const outFmt = resolveFormat(f, fmtSelect);
      const blob   = await canvasToBlob(canvas, outFmt, quality);
      const name   = `${f.name.replace(/\.[^.]+$/, '')}_compressed.${fmtToExt(outFmt)}`;
      storeBlob(name, blob);
      results.push({ blob, name, original: f.size, compressed: blob.size });
    } catch (err) { console.error(err); showToast(`Failed: ${f.name}`, 'error'); }
  }

  setProgress('img-compress-progress-wrap', 'img-compress-progress', 100);
  renderCompressResult('img-compress-result', results);
  if (results.length) showToast(`Compressed ${results.length} image(s)!`, 'success');
}

/* ================================================================
   6. RESIZE  (with live preview)
================================================================ */
async function showResizePreview(file) {
  if (!file) return;
  try {
    const img  = await loadImageToCanvas(file);
    const area = document.getElementById('img-resize-preview-area');
    if (!area) return;
    area.innerHTML = `
      <div class="resize-preview-wrap">
        <div class="resize-preview-header">
          <span class="resize-label">Original</span>
          <span class="resize-original-dims">${img.naturalWidth} × ${img.naturalHeight} px</span>
        </div>
        <img src="${URL.createObjectURL(file)}" class="resize-preview-img" alt="Preview">
        <div class="resize-output-dims">
          Output size: <strong id="resize-out-label" style="color:var(--text-secondary)">${img.naturalWidth} × ${img.naturalHeight} px</strong>
        </div>
      </div>
    `;
    area.dataset.origW = img.naturalWidth;
    area.dataset.origH = img.naturalHeight;
    _updateResizeDims();
  } catch(err) { console.warn(err); }
}

function _updateResizeDims() {
  const area  = document.getElementById('img-resize-preview-area');
  const label = document.getElementById('resize-out-label');
  if (!area || !label || !area.dataset.origW) return;

  const origW = parseInt(area.dataset.origW);
  const origH = parseInt(area.dataset.origH);
  const mode  = document.getElementById('resize-mode')?.value;
  const keep  = document.getElementById('resize-keep-ratio')?.value === 'yes';
  let outW = origW, outH = origH;

  if (mode === 'percentage') {
    const pct = parseFloat(document.getElementById('resize-pct')?.value) / 100 || 1;
    outW = Math.round(origW * pct); outH = Math.round(origH * pct);
  } else {
    let tw = parseInt(document.getElementById('resize-w')?.value) || 0;
    let th = parseInt(document.getElementById('resize-h')?.value) || 0;
    if (keep) {
      if (tw && !th)      { th = Math.round(origH * tw / origW); }
      else if (th && !tw) { tw = Math.round(origW * th / origH); }
      else if (tw && th)  { const sc = Math.min(tw/origW, th/origH); tw=Math.round(origW*sc); th=Math.round(origH*sc); }
    }
    if (tw > 0) outW = tw;
    if (th > 0) outH = th;
  }

  label.textContent = `${outW} × ${outH} px`;
  const changed = outW !== origW || outH !== origH;
  label.style.color = changed ? 'var(--green)' : 'var(--text-secondary)';
}

async function processImageResize() {
  const files = App.files['img-resize-files'] || [];
  if (!files.length) { showToast('Please add at least one image', 'error'); return; }

  const mode      = document.getElementById('resize-mode').value;
  const keepRatio = document.getElementById('resize-keep-ratio').value === 'yes';
  const fmtSelect = document.getElementById('resize-fmt').value;
  const results   = [];

  for (const f of files) {
    try {
      const img = await loadImageToCanvas(f);
      let w = img.naturalWidth, h = img.naturalHeight;

      if (mode === 'percentage') {
        const pct = parseFloat(document.getElementById('resize-pct').value) / 100;
        w = Math.max(1, Math.round(w * pct));
        h = Math.max(1, Math.round(h * pct));
      } else {
        let tw = parseInt(document.getElementById('resize-w').value, 10) || 0;
        let th = parseInt(document.getElementById('resize-h').value, 10) || 0;
        if (keepRatio) {
          if (tw && !th)      { th = Math.round(h * tw / w); }
          else if (th && !tw) { tw = Math.round(w * th / h); }
          else if (tw && th)  { const sc = Math.min(tw/w, th/h); tw=Math.round(w*sc); th=Math.round(h*sc); }
        }
        if (tw > 0) w = tw;
        if (th > 0) h = th;
      }

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const outFmt = resolveFormat(f, fmtSelect);
      const blob   = await canvasToBlob(canvas, outFmt, 0.93);
      const name   = `${f.name.replace(/\.[^.]+$/, '')}_${w}x${h}.${fmtToExt(outFmt)}`;
      storeBlob(name, blob);
      results.push({ blob, name, info: `${w} × ${h} px · ${formatSize(blob.size)}` });
    } catch(err) { console.error(err); showToast(`Failed: ${f.name}`, 'error'); }
  }

  renderSimpleResult('img-resize-result', results, 'Resize Complete', `${results.length} image(s) resized`);
  if (results.length) showToast('Images resized!', 'success');
}

/* ================================================================
   7. CONVERT
================================================================ */
async function processImageConvert() {
  const files = App.files['img-convert-files'] || [];
  if (!files.length) { showToast('Please add images to convert', 'error'); return; }

  const toFmt   = document.getElementById('convert-to-fmt').value;
  const quality = parseInt(document.getElementById('convert-quality').value) / 100;
  const results = [];

  for (const f of files) {
    try {
      const img    = await loadImageToCanvas(f);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const blob = await canvasToBlob(canvas, toFmt, quality);
      const name = `${f.name.replace(/\.[^.]+$/, '')}.${fmtToExt(toFmt)}`;
      storeBlob(name, blob);
      results.push({ blob, name, info: formatSize(blob.size) });
    } catch(err) { console.error(err); showToast(`Failed: ${f.name}`, 'error'); }
  }

  renderSimpleResult('img-convert-result', results, 'Conversion Complete', `${results.length} image(s) → ${toFmt.toUpperCase()}`);
  if (results.length) showToast('Images converted!', 'success');
}

/* ================================================================
   8. BACKGROUND REMOVAL
================================================================ */
async function processBackgroundRemoval() {
  const files = App.files['img-bg-files'] || [];
  if (!files.length) { showToast('Please select an image', 'error'); return; }

  const f           = files[0];
  const replaceType = document.getElementById('bg-replace-type').value;
  const threshold   = parseInt(document.getElementById('bg-threshold').value, 10);

  showToast('Processing background removal...', 'info');

  try {
    const img    = await loadImageToCanvas(f);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx    = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data      = imageData.data;
    const bgColor   = _sampleBgColor(data, canvas.width, canvas.height);

    let replaceRgb = null;
    if (replaceType === 'color') {
      const hex = document.getElementById('bg-color').value;
      replaceRgb = [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
    }

    let blurData = null;
    if (replaceType === 'blur') {
      const tc = document.createElement('canvas');
      tc.width = canvas.width; tc.height = canvas.height;
      const tctx = tc.getContext('2d');
      tctx.filter = 'blur(10px)';
      tctx.drawImage(img, 0, 0);
      blurData = tctx.getImageData(0, 0, canvas.width, canvas.height).data;
    }

    _removeBackground(data, bgColor, threshold, replaceRgb, blurData);
    ctx.putImageData(imageData, 0, 0);

    const outFmt = replaceType === 'transparent' ? 'png' : 'jpeg';
    const blob   = await canvasToBlob(canvas, outFmt, 0.95);
    const name   = `${f.name.replace(/\.[^.]+$/, '')}_nobg.${fmtToExt(outFmt)}`;
    storeBlob(name, blob);

    const checkerStyle = replaceType === 'transparent'
      ? 'background: repeating-conic-gradient(#aaa 0% 25%, #fff 0% 50%) 0 0/18px 18px;' : '';

    document.getElementById('img-bg-result').innerHTML = `
      <div class="result-area">
        <div class="result-header">
          <div class="result-icon">✅</div>
          <div><h3>Background Removed</h3><p>${formatSize(blob.size)}</p></div>
        </div>
        <img src="${URL.createObjectURL(blob)}" class="result-preview-img" style="${checkerStyle}" alt="Result">
        <div class="result-files">
          <div class="result-file">
            <div class="result-file-info">
              <div class="result-file-name">${escHtml(name)}</div>
              <div class="result-file-meta">${formatSize(blob.size)}</div>
            </div>
            <button class="download-btn" onclick="saveBlob(this,'${escHtml(name)}')">⬇ Download</button>
          </div>
        </div>
      </div>`;
    showToast('Background removed!', 'success');
  } catch(err) { console.error(err); showToast('Background removal failed', 'error'); }
}

/* ================================================================
   PRIVATE HELPERS
================================================================ */
function _sampleBgColor(data, w, h) {
  const px = i => [data[i], data[i+1], data[i+2]];
  const c  = [px(0), px((w-1)*4), px((h-1)*w*4), px(((h-1)*w+(w-1))*4)];
  return [
    Math.round(c.reduce((s,v)=>s+v[0],0)/4),
    Math.round(c.reduce((s,v)=>s+v[1],0)/4),
    Math.round(c.reduce((s,v)=>s+v[2],0)/4),
  ];
}

function _removeBackground(data, bgColor, threshold, replaceRgb, blurData) {
  const dist  = (a,b) => Math.sqrt((a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2);
  const limit = threshold * 2.55;
  for (let i = 0; i < data.length; i += 4) {
    if (dist([data[i],data[i+1],data[i+2]], bgColor) < limit) {
      if (blurData)      { data[i]=blurData[i]; data[i+1]=blurData[i+1]; data[i+2]=blurData[i+2]; }
      else if (replaceRgb){ data[i]=replaceRgb[0]; data[i+1]=replaceRgb[1]; data[i+2]=replaceRgb[2]; }
      else               { data[i+3]=0; }
    }
  }
}