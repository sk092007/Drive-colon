/* app.js — main logic (camera, editor, pdf, storage) */
(async function(){
  // libs
  const { jsPDF } = window.jspdf;
  const lf = localforage;

  // init localforage store
  lf.config({ name: 'DriveScan', storeName: 'pdf_store' });

  // elements
  const navBtns = document.querySelectorAll('.nav-btn');
  const views = document.querySelectorAll('.view');
  const picker = document.getElementById('picker');
  const fabBtn = document.getElementById('fabBtn');
  const fabMenu = document.getElementById('fabMenu');
  const menuScan = document.getElementById('menuScan');
  const menuUpload = document.getElementById('menuUpload');
  const fabScan = document.getElementById('fabScan');
  const fabUpload = document.getElementById('fabUpload');
  const filePicker = document.getElementById('picker');
  const selectedRow = document.getElementById('selectedRow');
  const createPdfBtn = document.getElementById('createPdfBtn');
  const clearSelected = document.getElementById('clearSelected');
  const pdfNameInput = document.getElementById('pdfName');
  const driveList = document.getElementById('driveList');
  const storageInfo = document.getElementById('storageInfo');
  const themeToggle = document.getElementById('themeToggle');
  const searchInput = document.getElementById('searchInput');
  
  // camera elements
  const viewScan = document.getElementById('view-scan');
  const video = document.getElementById('video');
  const camCapture = document.getElementById('camCapture');
  const camClose = document.getElementById('camClose');
  const camFlip = document.getElementById('camFlip');
  let stream = null;
  let facingMode = 'environment';

  // editor elements
  const viewEditor = document.getElementById('view-editor');
  const editorCanvas = document.getElementById('editorCanvas');
  const editorWrap = document.getElementById('editorWrap');
  const filterSelect = document.getElementById('filterSelect');
  const bright = document.getElementById('bright');
  const contrast = document.getElementById('contrast');
  const rotateBtn = document.getElementById('rotateBtn');
  const cropToggleBtn = document.getElementById('cropToggleBtn');
  const applyEdit = document.getElementById('applyEdit');
  const discardEdit = document.getElementById('discardEdit');
  const editorThumbs = document.getElementById('editorThumbs');

  // state
  let selectedImages = []; // {id, dataUrl}
  let editingImage = null;
  let rotateDeg = 0;
  let cropActive = false;
  let cropRect = null;
  
  // routing
  navBtns.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelector('.nav-btn.active').classList.remove('active');
      btn.classList.add('active');
      const route = btn.dataset.route;
      views.forEach(v => v.classList.remove('active'));
      document.getElementById('view-' + route).classList.add('active');
    })
  });

  // FAB menu
  fabBtn.addEventListener('click', ()=> fabMenu.classList.toggle('hidden'));
  menuScan.addEventListener('click', ()=> { fabMenu.classList.add('hidden'); openCameraView(); });
  menuUpload.addEventListener('click', ()=> { fabMenu.classList.add('hidden'); filePicker.click(); });
  fabScan.addEventListener('click', openCameraView);
  fabUpload.addEventListener('click', ()=> filePicker.click());

  // picker upload handling
  filePicker.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    for(const f of files){
      const data = await fileToDataURL(f);
      selectedImages.push({ id: uid(), data });
    }
    renderSelected();
    filePicker.value = '';
    // go to home view
    document.querySelector('.nav-btn[data-route="home"]').click();
  });

  // clear selected
  clearSelected.addEventListener('click', ()=> {
    if(!confirm('Clear selected images?')) return;
    selectedImages = [];
    renderSelected();
  });
  
  // create pdf
  createPdfBtn.addEventListener('click', async () => {
    if(selectedImages.length === 0){ alert('Select images first'); return; }
    const name = pdfNameInput.value.trim() || ('Scan_' + new Date().toISOString().slice(0,19).replace('T','_'));
    try {
      createPdfBtn.disabled = true;
      createPdfBtn.textContent = 'Creating...';
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });

      for(let i=0;i<selectedImages.length;i++){
        const img = new Image(); img.src = selectedImages[i].data;
        await new Promise(r => img.onload = r);
        const pw = doc.internal.pageSize.getWidth();
        const ph = doc.internal.pageSize.getHeight();
        const ratio = Math.min(pw / img.width, ph / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        const x = (pw - w)/2; const y = (ph - h)/2;
        if(i>0) doc.addPage();
        doc.addImage(img, 'JPEG', x, y, w, h);
      }

      const dataUrl = doc.output('dataurlstring');
      const id = uid();
      await lf.setItem('pdf_'+id, { id, name, dataUrl, createdAt: new Date().toISOString() });
      // maintain index list
      let idx = (await lf.getItem('pdf_index')) || [];
      idx.unshift(id);
      await lf.setItem('pdf_index', idx);
      alert('Saved PDF locally');
      selectedImages = []; renderSelected(); renderDrive();
      pdfNameInput.value = '';
    } catch(err){
      console.error(err); alert('Create failed: ' + (err.message || err));
} finally {
      createPdfBtn.disabled = false; createPdfBtn.textContent = 'Create PDF';
    }
  });

  // storage clear
  document.getElementById('clearStorage').addEventListener('click', async ()=>{
    if(!confirm('Clear ALL saved PDFs?')) return;
    const idx = (await lf.getItem('pdf_index')) || [];
    for(const id of idx) await lf.removeItem('pdf_'+id);
    await lf.setItem('pdf_index', []);
    renderDrive();
  });

  // search
  searchInput.addEventListener('input', renderDrive);

  // theme toggle (naive)
  themeToggle.addEventListener('click', ()=>{
    const body = document.body;
    if(body.dataset.theme === 'dark'){ body.dataset.theme=''; themeToggle.textContent='Dark'; }
    else { body.dataset.theme='dark'; themeToggle.textContent='Light'; }
  });

  // CAMERA: open camera view
  function openCameraView(){
    document.querySelector('.nav-btn[data-route="scan"]').click();
    startCamera();
  }

  async function startCamera(){
    try {
      if(stream) stopCamera();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio:false });
      video.srcObject = stream;
      await video.play();
      
      viewScan.scrollIntoView({ behavior:'smooth' });
    } catch(err){
      console.error('camera error', err);
      alert('Cannot access camera: ' + (err.message || err));
    }
  }

  function stopCamera(){ if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } }

  camClose.addEventListener('click', ()=>{ stopCamera(); document.querySelector('.nav-btn[data-route="home"]').click(); });
  camFlip.addEventListener('click', async ()=> {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    await startCamera();
  });

  camCapture.addEventListener('click', ()=> {
    if(!stream){ alert('Camera not ready'); return; }
    const cvs = document.getElementById('captureCanvas');
    const v = video;
    cvs.width = v.videoWidth; cvs.height = v.videoHeight;
    const ctx = cvs.getContext('2d');
    ctx.drawImage(v, 0, 0, cvs.width, cvs.height);
    const data = cvs.toDataURL('image/jpeg', 0.9);
    selectedImages.push({ id: uid(), data });
    renderSelected();
    // go back to home
    document.querySelector('.nav-btn[data-route="home"]').click();
  });

  // EDITOR: load an image to edit
  rotateBtn.addEventListener('click', ()=> { rotateDeg = (rotateDeg + 90) % 360; renderEditor(); });
  cropToggleBtn.addEventListener('click', ()=> { cropActive = !cropActive; initCrop(); });

  applyEdit.addEventListener('click', ()=> {
    const exported = exportEditor();
    if(exported){ selectedImages.push({ id: uid(), data: exported }); renderSelected(); document.querySelector('.nav-btn[data-route="home"]').click(); }
  });
  discardEdit.addEventListener('click', ()=> { document.querySelector('.nav-btn[data-route="home"]').click(); });

  // edit thumbnail action: open editor with a selected image (when clicking Edit)
  window.openEditor = function(index){
    const it = selectedImages[index];
    if(!it) return;
    editingImage = it;
    // remove it from list while editing (it will be replaced later)
    selectedImages.splice(index,1);
    renderSelected();
    document.querySelector('.nav-btn[data-route="editor"]').click();
    loadEditorImage(it.data);
  }

  // utility: render selected thumbnails
  function renderSelected(){
    selectedRow.innerHTML = '';
    if(selectedImages.length === 0){ selectedRow.innerHTML = '<div class="muted">No images. Tap + to scan or upload.</div>'; return; }
    selectedImages.forEach((it, idx) => {
      const el = document.createElement('div'); el.className='thumb';
      el.innerHTML = `<div class="index">${idx+1}</div><img src="${it.data}" /><div class="controls">
        <button class="btn ghost" onclick="openEditor(${idx})">Edit</button>
        <button class="btn ghost" onclick="moveLeft(${idx})">←</button>
        <button class="btn ghost" onclick="moveRight(${idx})">→</button>
        <button class="btn ghost" onclick="removeIdx(${idx})">Del</button>
      </div>`;
      selectedRow.appendChild(el);
    });
    updateStorageInfo();
  }

  window.moveLeft = function(i){ if(i>0){ [selectedImages[i-1],selectedImages[i]]=[selectedImages[i],selectedImages[i-1]]; renderSelected(); } }
  window.moveRight = function(i){ if(i<selectedImages.length-1){ [selectedImages[i+1],selectedImages[i]]=[selectedImages[i],selectedImages[i+1]]; renderSelected(); } }
  window.removeIdx = function(i){ if(confirm('Remove this image?')){ selectedImages.splice(i,1); renderSelected(); } }

  // EDITOR implementation (canvas draw with filters & rotate & simple crop)
  const ectx = editorCanvas.getContext('2d');
  let currentImg = null;
  let currentScale = 1;

  async function loadEditorImage(dataUrl){
    const img = new Image(); img.src = dataUrl; await new Promise(r=>img.onload=r);
    currentImg = img; rotateDeg=0; cropActive=false; cropRect=null; filterSelect.value='none'; bright.value=1; contrast.value=1;
    // set canvas size to fit width (max 900)
    const max = 1200;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    editorCanvas.width = Math.round(img.width * scale);
    editorCanvas.height = Math.round(img.height * scale);
    editorCanvas.dataset.naturalWidth = img.width;
    editorCanvas.dataset.naturalHeight = img.height;
    currentScale = scale;
    renderEditor();
  }

  function renderEditor(){
    if(!currentImg) return;
    // clear
    ectx.save();
    ectx.setTransform(1,0,0,1,0,0);
    ectx.clearRect(0,0,editorCanvas.width, editorCanvas.height);

    // draw with rotation into temp canvas if rotated
    const tmp = document.createElement('canvas');
    tmp.width = currentImg.width; tmp.height = currentImg.height;
    const t = tmp.getContext('2d'); t.drawImage(currentImg,0,0);
    let final = tmp;
    if(rotateDeg !== 0){
      const rot = document.createElement('canvas');
      if(rotateDeg % 180 !== 0){ rot.width = tmp.height; rot.height = tmp.width; } else { rot.width = tmp.width; rot.height = tmp.height; }
      const r = rot.getContext('2d');
      r.translate(rot.width/2, rot.height/2);
      r.rotate(rotateDeg * Math.PI / 180);
      r.drawImage(tmp, -tmp.width/2, -tmp.height/2);
      final = rot;
    }
    // draw final to editor canvas with scale
    const dw = editorCanvas.width; const dh = editorCanvas.height;
    ectx.filter = (filterSelect.value === 'none' ? '' : filterSelect.value) + ` brightness(${bright.value}) contrast(${contrast.value})`;
    // fit
    const ratio = Math.min(dw/final.width, dh/final.height);
    const w = final.width * ratio; const h = final.height * ratio;
    const x = (dw - w)/2; const y = (dh - h)/2;
    ectx.drawImage(final, 0,0, final.width, final.height, x, y, w, h);
    ectx.filter = 'none';
    ectx.restore();

    // set default crop rect
    if(!cropRect){
      cropRect = { x: x+20, y: y+20, w: Math.max(80, w-40), h: Math.max(80, h-40) };
    }
    // if cropActive show overlay (simple)
    drawCropOverlay();
  }

  function drawCropOverlay(){
    // remove existing overlay
    const old = editorWrap.querySelector('.crop-overlay'); if(old) old.remove();
    if(!cropActive) return;
    const o = document.createElement('div'); o.className='crop-overlay';
    Object.assign(o.style, { position:'absolute', left: editorCanvas.offsetLeft + cropRect.x + 'px', top: editorCanvas.offsetTop + cropRect.y + 'px', width: cropRect.w + 'px', height: cropRect.h + 'px', border:'2px dashed rgba(0,0,0,0.6)', pointerEvents:'none' });
    editorWrap.appendChild(o);
  }

  function initCrop(){
    cropActive = !cropActive;
    if(!cropActive) { // remove overlay
      const old = editorWrap.querySelector('.crop-overlay'); if(old) old.remove();
    } else {
      drawCropOverlay();
    }
  }

  // export editor canvas to dataURL (apply crop if active)
  function exportEditor(){
    if(!currentImg) return null;
    // render into temp canvas at natural resolution
    const naturalW = editorCanvas.dataset.naturalWidth || currentImg.width;
    const naturalH = editorCanvas.dataset.naturalHeight || currentImg.height;
    const tmp = document.createElement('canvas');
    tmp.width = naturalW; tmp.height = naturalH;
    const tctx = tmp.getContext('2d');

    // draw current state (rotation & filters) at natural res
    // draw image into an offscreen canvas with rotate similar to renderEditor
    const big = document.createElement('canvas'); big.width = currentImg.width; big.height = currentImg.height;
    const bctx = big.getContext('2d'); bctx.drawImage(currentImg,0,0);
    let final = big;
    if(rotateDeg !== 0){
      const rot = document.createElement('canvas');
      if(rotateDeg % 180 !== 0){ rot.width = big.height; rot.height = big.width; } else { rot.width = big.width; rot.height = big.height; }
      const rctx = rot.getContext('2d'); rctx.translate(rot.width/2, rot.height/2); rctx.rotate(rotateDeg * Math.PI / 180); rctx.drawImage(big, -big.width/2, -big.height/2);
      final = rot;
    }
    // apply filters using ctx.filter
    tctx.filter = (filterSelect.value === 'none' ? '' : filterSelect.value) + ` brightness(${bright.value}) contrast(${contrast.value})`;
    // fit final canvas to tmp
    const fitRatio = Math.min(tmp.width / final.width, tmp.height / final.height);
    const fw = final.width * fitRatio; const fh = final.height * fitRatio; const fx=(tmp.width-fw)/2; const fy=(tmp.height-fh)/2;
    tctx.drawImage(final, 0,0, final.width, final.height, fx, fy, fw, fh);
    tctx.filter = 'none';

    // cropping if active: calculate crop in natural coords
    if(cropActive && cropRect){
      const scale = tmp.width / editorCanvas.width;
      const sx = Math.round(cropRect.x * scale), sy = Math.round(cropRect.y * scale), sw = Math.round(cropRect.w * scale), sh = Math.round(cropRect.h * scale);
      const out = document.createElement('canvas'); out.width = sw; out.height = sh;
      out.getContext('2d').drawImage(tmp, sx, sy, sw, sh, 0,0, sw, sh);
      return out.toDataURL('image/jpeg', 0.9);
    } else {
      return tmp.toDataURL('image/jpeg', 0.9);
    }
  }
  
  // DRIVE rendering
  async function renderDrive(){
    driveList.innerHTML = '';
    let idx = (await lf.getItem('pdf_index')) || [];
    const q = searchInput.value.trim().toLowerCase();
    if(q) idx = idx.filter(id => (lf.getItem('pdf_'+id).then(obj=>obj?.name?.toLowerCase().includes(q)))); // naive - we will just render all and filter visually
    for(const id of idx){
      try{
        const item = await lf.getItem('pdf_'+id);
        const el = document.createElement('div'); el.className='file-item';
        el.innerHTML = `<div><strong>${item.name}</strong><div class="muted">${new Date(item.createdAt).toLocaleString()}</div></div>`;
        const actions = document.createElement('div');
        const open = document.createElement('button'); open.className='btn ghost'; open.textContent='Open';
        open.onclick = ()=> {
          const w = window.open('','_blank'); w.document.write(`<iframe src="${item.dataUrl}" style="width:100%;height:100vh;border:none"></iframe>`);
        };
        const dl = document.createElement('button'); dl.className='btn primary'; dl.textContent='Download';
        dl.onclick = ()=> fetch(item.dataUrl).then(r=>r.blob()).then(blob=>{ const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=item.name+'.pdf'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),800);});
        const del = document.createElement('button'); del.className='btn ghost'; del.textContent='Delete';
        del.onclick = async ()=> { if(!confirm('Delete '+item.name+'?')) return; await lf.removeItem('pdf_'+id); let arr = (await lf.getItem('pdf_index'))||[]; arr = arr.filter(x=>x!==id); await lf.setItem('pdf_index',arr); renderDrive(); };
        actions.append(open,dl,del);
        el.appendChild(actions);
        driveList.appendChild(el);
      } catch(e){ console.warn('drive item load fail', e); }
    }
  }

  // helpers
  function uid(){ return 'id_'+Math.random().toString(36).slice(2,9); }
  function fileToDataURL(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); }

  function updateStorageInfo(){
    lf.keys().then(keys=>{
      const pdfKeys = keys.filter(k=>k.startsWith('pdf_'));
      document.getElementById('storageInfo').textContent = pdfKeys.length + ' PDFs';
    });
  }

  // initial render
  renderSelected(); renderDrive(); updateStorageInfo();

  // register service worker
  if('serviceWorker' in navigator){
    try{
      navigator.serviceWorker.register('sw.js');
      console.log('sw registered');
    }catch(e){ console.warn('sw fail', e); }
  }

  // expose for debugging
  window._driveScan = { selectedImages, renderDrive, lf };

})();