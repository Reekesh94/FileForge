/* ================================================================
   FILEFORGE — image-tools.js
   All image processing: compress, resize, convert, crop,
   background removal.
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
}

/* ================================================================
   2. BG COLOR TOGGLE
================================================================ */
function toggleBgColor() {
  const val = document.getElementById('bg-replace-type').value;
  document.getElementById('bg-color-group').classList.toggle('hidden', val !== 'color');
}

/* ================================================================
   3. CROP PREVIEW
================================================================ */
let _cropImageEl = null; // stores loaded image for crop

async function showCropPreview(file) {
  if (!file) return;
  try {
    const img = await loadImageToCanvas(file);
    _cropImageEl = img;

    const area = document.getElementById('img-crop-preview-area');
    if (!area) return;

    // Create a temporary object URL for the preview
    const previewUrl = URL.createObjectURL(file);

    area.innerHTML = `
      <div style="margin-top: 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px;">
        <div style="font-size: 0.76rem; color: var(--text-muted); margin-bottom: 10px;">
          Preview — ${img.naturalWidth} × ${img.naturalHeight} px
        </div>
        <img src="${previewUrl}" style="max-width:100%; max-height:280px; object-fit:contain; border-radius: var(--radius-md); display:block;" alt="Preview">
      </div>
    `;

    // Pre-fill size hints
    const wEl = document.getElementById('crop-w');
    const hEl = document.getElementById('crop-h');
    if (wEl) wEl.placeholder = img.naturalWidth;
    if (hEl) hEl.placeholder = img.naturalHeight;

  } catch (err) {
    console.warn('Crop preview failed:', err);
  }
}

/* ================================================================
   4. CROP PRESET APPLIER
================================================================ */
function applyCropPreset() {
  if (!_cropImageEl) {
    showToast('Load an image first', 'error');
    return;
  }

  const preset = document.getElementById('crop-preset').value;
  if (!preset) return;

  const W = _cropImageEl.naturalWidth;
  const H = _cropImageEl.naturalHeight;
  let x = 0, y = 0, w = W, h = H;

  switch (preset) {
    case 'square': {
      const s = Math.min(W, H);
      x = Math.round((W - s) / 2);
      y = Math.round((H - s) / 2);
      w = s; h = s;
      break;
    }
    case '16:9': {
      h = Math.round(W * 9 / 16);
      if (h > H) { h = H; w = Math.round(H * 16 / 9); }
      x = Math.round((W - w) / 2);
      y = Math.round((H - h) / 2);
      break;
    }
    case '4:3': {
      h = Math.round(W * 3 / 4);
      if (h > H) { h = H; w = Math.round(H * 4 / 3); }
      x = Math.round((W - w) / 2);
      y = Math.round((H - h) / 2);
      break;
    }
    case '9:16': {
      w = Math.round(H * 9 / 16);
      if (w > W) { w = W; h = Math.round(W * 16 / 9); }
      x = Math.round((W - w) / 2);
      y = Math.round((H - h) / 2);
      break;
    }
  }

  document.getElementById('crop-x').value = x;
  document.getElementById('crop-y').value = y;
  document.getElementById('crop-w').value = w;
  document.getElementById('crop-h').value = h;
}

/* ================================================================
   5. COMPRESS
================================================================ */
async function processImageCompress() {
  const files = App.files['img-compress-files'] || [];
  if (!files.length) {
    showToast('Please add at least one image', 'error');
    return;
  }

  const quality    = parseInt(document.getElementById('img-quality').value) / 100;
  const fmtSelect  = document.getElementById('img-compress-fmt').value;
  const results    = [];

  setProgress('img-compress-progress-wrap', 'img-compress-progress', 5);

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    setProgress('img-compress-progress-wrap', 'img-compress-progress', 10 + (i / files.length) * 84);

    try {
      const img    = await loadImageToCanvas(f);
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);

      const outFmt = resolveFormat(f, fmtSelect);
      const blob   = await canvasToBlob(canvas, outFmt, quality);
      const ext    = fmtToExt(outFmt);
      const base   = f.name.replace(/\.[^.]+$/, '');
      const name   = `${base}_compressed.${ext}`;

      storeBlob(name, blob);
      results.push({ blob, name, original: f.size, compressed: blob.size });

    } catch (err) {
      console.error(err);
      showToast(`Failed to compress: ${f.name}`, 'error');
    }
  }

  setProgress('img-compress-progress-wrap', 'img-compress-progress', 100);
  renderCompressResult('img-compress-result', results);

  if (results.length) showToast(`Compressed ${results.length} image(s)!`, 'success');
}

/* ================================================================
   6. RESIZE
================================================================ */
async function processImageResize() {
  const files = App.files['img-resize-files'] || [];
  if (!files.length) {
    showToast('Please add at least one image', 'error');
    return;
  }

  const mode       = document.getElementById('resize-mode').value;
  const keepRatio  = document.getElementById('resize-keep-ratio').value === 'yes';
  const fmtSelect  = document.getElementById('resize-fmt').value;
  const results    = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      const img = await loadImageToCanvas(f);
      let w = img.naturalWidth;
      let h = img.naturalHeight;

      if (mode === 'percentage') {
        const pct = parseFloat(document.getElementById('resize-pct').value) / 100;
        w = Math.max(1, Math.round(w * pct));
        h = Math.max(1, Math.round(h * pct));

      } else {
        let tw = parseInt(document.getElementById('resize-w').value, 10) || 0;
        let th = parseInt(document.getElementById('resize-h').value, 10) || 0;

        if (keepRatio) {
          if (tw && !th) {
            th = Math.round(h * tw / w);
          } else if (th && !tw) {
            tw = Math.round(w * th / h);
          } else if (tw && th) {
            const scale = Math.min(tw / w, th / h);
            tw = Math.round(w * scale);
            th = Math.round(h * scale);
          }
        }
        if (tw > 0) w = tw;
        if (th > 0) h = th;
      }

      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);

      const outFmt = resolveFormat(f, fmtSelect);
      const blob   = await canvasToBlob(canvas, outFmt, 0.93);
      const ext    = fmtToExt(outFmt);
      const name   = `${f.name.replace(/\.[^.]+$/, '')}_${w}x${h}.${ext}`;

      storeBlob(name, blob);
      results.push({ blob, name, info: `${w} × ${h} px · ${formatSize(blob.size)}` });

    } catch (err) {
      console.error(err);
      showToast(`Failed to resize: ${f.name}`, 'error');
    }
  }

  renderSimpleResult('img-resize-result', results, 'Resize Complete', `${results.length} image(s) resized`);
  if (results.length) showToast('Images resized!', 'success');
}

/* ================================================================
   7. CONVERT
================================================================ */
async function processImageConvert() {
  const files = App.files['img-convert-files'] || [];
  if (!files.length) {
    showToast('Please add images to convert', 'error');
    return;
  }

  const toFmt   = document.getElementById('convert-to-fmt').value;
  const quality = parseInt(document.getElementById('convert-quality').value) / 100;
  const results = [];

  for (const f of files) {
    try {
      const img    = await loadImageToCanvas(f);
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);

      const blob = await canvasToBlob(canvas, toFmt, quality);
      const ext  = fmtToExt(toFmt);
      const name = `${f.name.replace(/\.[^.]+$/, '')}.${ext}`;

      storeBlob(name, blob);
      results.push({ blob, name, info: formatSize(blob.size) });

    } catch (err) {
      console.error(err);
      showToast(`Failed to convert: ${f.name}`, 'error');
    }
  }

  renderSimpleResult(
    'img-convert-result',
    results,
    'Conversion Complete',
    `${results.length} image(s) → ${toFmt.toUpperCase()}`
  );

  if (results.length) showToast('Images converted!', 'success');
}

/* ================================================================
   8. CROP
================================================================ */
async function processImageCrop() {
  const files = App.files['img-crop-files'] || [];
  if (!files.length) {
    showToast('Please select an image to crop', 'error');
    return;
  }

  const f   = files[0];
  const img = _cropImageEl || await loadImageToCanvas(f);

  const x = parseInt(document.getElementById('crop-x').value, 10)  || 0;
  const y = parseInt(document.getElementById('crop-y').value, 10)   || 0;
  const w = parseInt(document.getElementById('crop-w').value, 10)   || img.naturalWidth  - x;
  const h = parseInt(document.getElementById('crop-h').value, 10)   || img.naturalHeight - y;

  if (w <= 0 || h <= 0) {
    showToast('Invalid crop dimensions', 'error');
    return;
  }

  const fmtSelect = document.getElementById('crop-fmt').value;
  const outFmt    = resolveFormat(f, fmtSelect);

  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h);

  const blob   = await canvasToBlob(canvas, outFmt, 0.95);
  const ext    = fmtToExt(outFmt);
  const name   = `${f.name.replace(/\.[^.]+$/, '')}_crop_${w}x${h}.${ext}`;

  storeBlob(name, blob);

  const previewUrl = URL.createObjectURL(blob);

  document.getElementById('img-crop-result').innerHTML = `
    <div class="result-area">
      <div class="result-header">
        <div class="result-icon">✅</div>
        <div>
          <h3>Crop Complete</h3>
          <p>${w} × ${h} px · ${formatSize(blob.size)}</p>
        </div>
      </div>
      <img src="${previewUrl}" class="result-preview-img" alt="Cropped preview">
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

  showToast('Image cropped!', 'success');
}

/* ================================================================
   9. BACKGROUND REMOVAL
================================================================ */
async function processBackgroundRemoval() {
  const files = App.files['img-bg-files'] || [];
  if (!files.length) {
    showToast('Please select an image', 'error');
    return;
  }

  const f           = files[0];
  const replaceType = document.getElementById('bg-replace-type').value;
  const threshold   = parseInt(document.getElementById('bg-threshold').value, 10);

  showToast('Processing background removal...', 'info');

  try {
    const img    = await loadImageToCanvas(f);
    const canvas = document.createElement('canvas');
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx    = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data      = imageData.data;

    // Sample background color from four corners
    const bgColor = _sampleBgColor(data, canvas.width, canvas.height);

    // Get replacement color if needed
    let replaceRgb = null;
    if (replaceType === 'color') {
      const hex = document.getElementById('bg-color').value;
      replaceRgb = [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
      ];
    }

    // Blur data for blur mode
    let blurData = null;
    if (replaceType === 'blur') {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width  = canvas.width;
      tempCanvas.height = canvas.height;
      const tctx = tempCanvas.getContext('2d');
      tctx.filter = 'blur(10px)';
      tctx.drawImage(img, 0, 0);
      blurData = tctx.getImageData(0, 0, canvas.width, canvas.height).data;
    }

    // Apply background removal
    _removeBackground(data, bgColor, threshold, replaceRgb, blurData);
    ctx.putImageData(imageData, 0, 0);

    // Output format
    const outFmt = replaceType === 'transparent' ? 'png' : 'jpeg';
    const blob   = await canvasToBlob(canvas, outFmt, 0.95);
    const ext    = fmtToExt(outFmt);
    const name   = `${f.name.replace(/\.[^.]+$/, '')}_nobg.${ext}`;

    storeBlob(name, blob);
    const previewUrl = URL.createObjectURL(blob);

    // Checkerboard bg for transparent preview
    const checkerStyle = replaceType === 'transparent'
      ? 'background: repeating-conic-gradient(#aaa 0% 25%, #fff 0% 50%) 0 0 / 18px 18px;'
      : '';

    document.getElementById('img-bg-result').innerHTML = `
      <div class="result-area">
        <div class="result-header">
          <div class="result-icon">✅</div>
          <div>
            <h3>Background Removed</h3>
            <p>${formatSize(blob.size)}</p>
          </div>
        </div>
        <img src="${previewUrl}" class="result-preview-img" style="${checkerStyle}" alt="Result">
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

    showToast('Background removed!', 'success');

  } catch (err) {
    console.error(err);
    showToast('Background removal failed', 'error');
  }
}

/* ----------------------------------------------------------------
   Private: Sample average background color from corners
---------------------------------------------------------------- */
function _sampleBgColor(data, width, height) {
  function px(i) { return [data[i], data[i + 1], data[i + 2]]; }

  const corners = [
    px(0),                                          // top-left
    px((width - 1) * 4),                            // top-right
    px((height - 1) * width * 4),                   // bottom-left
    px(((height - 1) * width + (width - 1)) * 4),   // bottom-right
  ];

  return [
    Math.round(corners.reduce((s, c) => s + c[0], 0) / 4),
    Math.round(corners.reduce((s, c) => s + c[1], 0) / 4),
    Math.round(corners.reduce((s, c) => s + c[2], 0) / 4),
  ];
}

/* ----------------------------------------------------------------
   Private: Remove background pixels
---------------------------------------------------------------- */
function _removeBackground(data, bgColor, threshold, replaceRgb, blurData) {
  const dist = (a, b) =>
    Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

  const limit = threshold * 2.55; // convert 0-100 to 0-255 range

  for (let i = 0; i < data.length; i += 4) {
    const px = [data[i], data[i + 1], data[i + 2]];

    if (dist(px, bgColor) < limit) {
      if (blurData) {
        // Replace with blurred version
        data[i]     = blurData[i];
        data[i + 1] = blurData[i + 1];
        data[i + 2] = blurData[i + 2];
      } else if (replaceRgb) {
        // Replace with solid color
        data[i]     = replaceRgb[0];
        data[i + 1] = replaceRgb[1];
        data[i + 2] = replaceRgb[2];
      } else {
        // Make transparent
        data[i + 3] = 0;
      }
    }
  }
}
