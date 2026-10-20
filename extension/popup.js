/* global McmLabel, Dymo, McmPrinting, chrome, extractMcMaster */
const BROWSER = "__browser__";
const $ = id => document.getElementById(id);

let part = null;       // { partNumber, description, url, images[], imageDataUrls[] }
let partImages = [];   // ImageBitmap[] (best guess first)
let imgIndex = 0;
let attributeSelections = [];
let adPreferences = {};
let imagePreference = true;
let savedDesigns = {};
let selectedElement = 'company';
const ELEMENT_NAMES = { company: 'Company banner', partNumber: 'Part number', description: 'Description', image: 'Picture', qr: 'QR code' };
function currentElements() { return McmLabel.editorElements(savedDesigns[$('size').value]); }
function saveDesign(elements) {
  savedDesigns[$('size').value] = McmLabel.editorElements(elements);
  chrome.storage.local.set({ labelDesigns: savedDesigns });
}
function enableEditor() {
  $('layout').value = 'editable';
  $('elementControls').hidden = false;
}
function editorWarning() {
  const elements = currentElements(), keys = Object.keys(elements).filter(k => k !== 'image' || imageIfOn());
  const overlaps = keys.some((a,i) => keys.slice(i+1).some(b => {
    const x=elements[a], y=elements[b];
    return x.x < y.x+y.w && x.x+x.w > y.x && x.y < y.y+y.h && x.y+x.h > y.y;
  }));
  $('editorHint').textContent = overlaps ? 'Some elements overlap. Drag them apart before printing.' : 'Drag any element in the preview. Resize the selected element below. Check the QR code before printing.';
}
function updateEditorControls() {
  const e = currentElements()[selectedElement], d = McmLabel.ELEMENT_DEFAULTS[selectedElement];
  $('elementSelect').value = selectedElement;
  $('elementScale').value = Math.round((e.scale || 1) * 100);
  $('elementPercent').textContent = $('elementScale').value + '%';
}
function initEditor() {
  for (const [key,name] of Object.entries(ELEMENT_NAMES)) $('elementSelect').add(new Option(name,key));
  $('elementSelect').addEventListener('change', () => { enableEditor(); selectedElement=$('elementSelect').value; updateEditorControls(); refreshPreview(); saveSettings(); });
  $('elementScale').addEventListener('input', () => {
    enableEditor(); const elements=currentElements(), e=elements[selectedElement], d=McmLabel.ELEMENT_DEFAULTS[selectedElement];
    const factor=Number($('elementScale').value)/100;
    const cx=e.x+e.w/2, cy=e.y+e.h/2;
    e.scale=factor; e.w=d.w*factor; e.h=d.h*factor; e.x=cx-e.w/2; e.y=cy-e.h/2;
    saveDesign(elements); refreshPreview(); updateEditorControls(); saveSettings();
  });
  $('resetDesign').addEventListener('click', () => { enableEditor(); saveDesign({}); updateEditorControls(); refreshPreview(); saveSettings(); });
  const canvas=$('preview'); let drag=null;
  const point=event=>{ const r=canvas.getBoundingClientRect(); return {x:(event.clientX-r.left)/r.width,y:(event.clientY-r.top)/r.height}; };
  canvas.addEventListener('pointerdown', event => {
    if ($('layout').value !== 'editable') return;
    const p=point(event), elements=currentElements();
    // Small boxes win when two overlap, so they can still be selected.
    const hit=Object.keys(elements).filter(k=>k!=='image'||imageIfOn()).sort((a,b)=>elements[a].w*elements[a].h-elements[b].w*elements[b].h).find(k=>{const e=elements[k];return p.x>=e.x&&p.x<=e.x+e.w&&p.y>=e.y&&p.y<=e.y+e.h;});
    if (!hit) return;
    event.preventDefault(); selectedElement=hit;
    drag={start:p,original:{...elements[hit]}};canvas.setPointerCapture(event.pointerId);updateEditorControls();refreshPreview();
  });
  canvas.addEventListener('pointermove', event => {
    if(!drag) return; const p=point(event), elements=currentElements();
    elements[selectedElement]={...drag.original,x:drag.original.x+p.x-drag.start.x,y:drag.original.y+p.y-drag.start.y};
    // Keep the draft in memory while dragging; persist once released.
    savedDesigns[$('size').value]=McmLabel.editorElements(elements);refreshPreview();
  });
  const finish=()=>{if(drag){saveDesign(currentElements());drag=null;}};
  canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);
  updateEditorControls();
}



async function loadImageAt(p, i) {
  const tries = [];
  if (p.images[i]) tries.push(() => fetch(p.images[i], { credentials: "include", signal: AbortSignal.timeout(8000) }).then(r => { if (!r.ok) throw new Error("Image unavailable"); return r.blob(); }));
  if (p.imageDataUrls[i]) tries.push(() => fetch(p.imageDataUrls[i]).then(r => r.blob()));
  for (const t of tries) {
    try { return await createImageBitmap(await t()); } catch (_) {}
  }
  return null;
}

// Load every candidate; keep the ones that decode.
async function loadImages(p) {
  const out = await Promise.all(p.images.map((_, i) => loadImageAt(p, i)));
  return out.filter(Boolean);
}

function currentSize() {
  return McmLabel.LABEL_SIZES[$("size").value] || McmLabel.LABEL_SIZES["30252"];
}

function currentPart() {
  return { ...part, description: part?.source === 'automationdirect'
    ? AdProduct.description(part.attributes, attributeSelections) : $("desc").value };
}

function imageIfOn() {
  return $("showImage").checked ? (partImages[imgIndex] || null) : null;
}

// Full-size label (used for the preview and the Chrome print dialog).
function renderFull() {
  const s = currentSize();
  return McmLabel.renderLabel(currentPart(), {
    widthIn: s.width, heightIn: s.height, padIn: 0.06, leftPadIn: 0.1, image: imageIfOn(), layout: $("layout").value, elements: currentElements()
  });
}

function refreshPreview() {
  const src = renderFull();
  const pv = $("preview");
  pv.width = src.width; pv.height = src.height;
  pv.getContext("2d").drawImage(src, 0, 0);
  if ($('layout').value === 'editable') {
    const e=currentElements()[selectedElement], ctx=pv.getContext('2d');
    ctx.save();ctx.strokeStyle='#1671d9';ctx.lineWidth=Math.max(2,src.width/300);ctx.setLineDash([8,5]);
    ctx.strokeRect(e.x*src.width,e.y*src.height,e.w*src.width,e.h*src.height);ctx.restore();
  }
  $('elementControls').hidden = $('layout').value !== 'editable';
  editorWarning();
  const size = currentSize();
  $('previewSize').textContent = `${size.width} × ${size.height} inches · landscape`;
}

function setStatus(html, isErr = false) {
  $("status").innerHTML = html;
  $("status").classList.toggle("err", isErr);
}

function saveSettings() {
  if (!$("showImage").disabled) imagePreference = $("showImage").checked;
  chrome.storage.sync.set({
    size: $("size").value,
    layout: $("layout").value,
    printer: $("printer").value,
    copies: +$("copies").value || 1,
    showImage: imagePreference
  });
}

async function loadPrinters(preferred) {
  const sel = $("printer");
  sel.innerHTML = "";
  let printers = [];
  try {
    printers = await Dymo.getPrinters();
  } catch (e) {
    setStatus(`DYMO Connect not found — will use Chrome's print dialog. ` +
      `If DYMO Connect is running, <a href="${Dymo.statusUrl}" target="_blank">open this link</a> once to trust its certificate, then reopen this popup.`);
  }
  for (const p of printers) {
    const o = new Option(p.name + (p.connected ? "" : " (offline)"), p.name);
    sel.add(o);
  }
  sel.add(new Option("Any printer — Chrome print dialog", BROWSER));
  if (!currentSize().dymo) {
    sel.value = BROWSER;
    return;
  }
  const names = printers.map(p => p.name);
  if (preferred && (names.includes(preferred) || preferred === BROWSER)) sel.value = preferred;
  else {
    const p550 = printers.find(p => /550/.test(p.name) && p.connected) || printers.find(p => p.connected) || printers[0];
    sel.value = p550 ? p550.name : BROWSER;
  }
}

async function onPrint() {
  saveSettings();
  const btn = $("print");
  btn.disabled = true;
  try {
    const printer = $("printer").value;
    const result = await McmPrinting.create({ label: McmLabel, dymo: Dymo, chrome }).print(printer, {
      part: currentPart(), size: currentSize(), image: imageIfOn(),
      layout: $("layout").value, elements: currentElements(), copies: +$("copies").value || 1
    });
    $("status").textContent = result.backend === "dymo" ? "Sent to DYMO ✓" : "Choose your printer in the print dialog.";
  } catch (e) {
    $("status").textContent = "Printing failed: " + e.message;
    $("status").classList.add("err");
  } finally { btn.disabled = false; }
}

async function init() {
  const sizeSel = $("size");
  for (const [k, v] of Object.entries(McmLabel.LABEL_SIZES)) sizeSel.add(new Option(v.name, k));
  for (const [k, v] of Object.entries(McmLabel.LAYOUTS)) $("layout").add(new Option(v.name, k));

  const settings = await chrome.storage.sync.get({ size: "30336", layout: "editable", printer: "", copies: 1, showImage: true });
  sizeSel.value = settings.size;
  $("layout").value = McmLabel.LAYOUTS[settings.layout] ? settings.layout : "classic";
  $("copies").value = settings.copies;
  $("showImage").checked = settings.showImage;
  imagePreference = settings.showImage;

  savedDesigns = (await chrome.storage.local.get({ labelDesigns: {} })).labelDesigns;
  initEditor();
  adPreferences = (await chrome.storage.local.get({ adSelections: {} })).adSelections;
  $("adLookup").addEventListener("submit", lookupProduct);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    if (/^https:\/\/(www\.)?automationdirect\.com\//i.test(tab?.url || '')) {
      $("lookupStatus").textContent = 'Reading attributes from this page…';
      const deadline = Date.now() + 15000;
      let result;
      do {
        const [injected] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractAutomationDirect });
        if (injected.result?.partNumber && injected.result.attributes?.length) { result = injected.result; break; }
        await new Promise(r => setTimeout(r, 500));
      } while (Date.now() < deadline);
      if (!result) throw new Error('No product attributes found. Let the product detail page finish loading, then reopen this popup.');
      await showPart(result);
      $("lookupStatus").textContent = result.attributes.length + ' attributes read from the open page.';
    } else if (/^https:\/\/([a-z0-9-]+\.)*mcmaster\.com\//i.test(tab?.url || '')) {
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractMcMaster });
      if (result.partNumber || result.description) await showPart(result);
      else $("notPart").hidden = false;
    } else $("notPart").hidden = false;
  } catch (e) { $("lookupStatus").textContent = e.message; }

  const step = d => {
    if (!partImages.length) return;
    imgIndex = (imgIndex + d + partImages.length) % partImages.length;
    $("imgCount").textContent = `${imgIndex + 1}/${partImages.length}`;
    $("showImage").checked = true;
    refreshPreview();
  };
  $("imgPrev").addEventListener("click", () => step(-1));
  $("imgNext").addEventListener("click", () => step(1));
  $("imgNav").hidden = partImages.length < 2;
  $("imgCount").textContent = `1/${partImages.length}`;
  refreshPreview();

  $('customize').addEventListener('click', () => { enableEditor(); updateEditorControls(); refreshPreview(); saveSettings(); });
  for (const id of ["desc", "size", "layout", "showImage"]) $(id).addEventListener("input", refreshPreview);
  $("size").addEventListener("change", () => {
    updateEditorControls();
    if (!currentSize().dymo) $("printer").value = BROWSER;
    refreshPreview();
    saveSettings();
  });
  for (const id of ["size", "layout", "printer", "copies", "showImage"]) $(id).addEventListener("change", saveSettings);
  $("print").addEventListener("click", onPrint);

  await loadPrinters(settings.printer);
}

async function showPart(result) {
  part = result; partImages = []; imgIndex = 0;
  $("main").hidden = false; $("notPart").hidden = true;
  $("partNo").textContent = part.partNumber || '';
  const ad = part.source === 'automationdirect';
  $("attributePanel").hidden = !ad;
  $("desc").readOnly = ad;
  $("descLabel").textContent = ad ? 'Selected attribute text' : 'Description';
  $("attributes").replaceChildren();
  if (ad) {
    const saved = adPreferences[part.partNumber];
    attributeSelections = Array.isArray(saved) ? saved.filter(n => part.attributes.some(a => a.name === n)) : AdProduct.defaults(part.attributes);
    for (const a of part.attributes) {
      const label = document.createElement('label');
      const box = document.createElement('input'); box.type = 'checkbox';
      box.checked = attributeSelections.includes(a.name);
      label.append(box, document.createTextNode(' ' + a.name + ': ' + a.value));
      box.addEventListener('change', () => {
        attributeSelections = [...$("attributes").querySelectorAll('input')].flatMap((b,i) => b.checked ? [part.attributes[i].name] : []);
        // Bound storage growth; preserve an intentionally empty selection.
        delete adPreferences[part.partNumber];
        adPreferences[part.partNumber] = attributeSelections;
        const entries = Object.entries(adPreferences).slice(-50);
        adPreferences = Object.fromEntries(entries);
        chrome.storage.local.set({ adSelections: adPreferences });
        $("desc").value = currentPart().description;
        refreshPreview();
      });
      $("attributes").append(label);
    }
  }
  $("desc").value = ad ? currentPart().description : part.description;
  refreshPreview();
  partImages = await loadImages(part);
  $("showImage").disabled = !partImages.length;
  $("showImage").checked = imagePreference && partImages.length > 0;
  $("imgNav").hidden = partImages.length < 2;
  $("imgCount").textContent = partImages.length ? '1/' + partImages.length : '';
  refreshPreview();
}

async function lookupProduct(event) {
  event.preventDefault();
  let tab;
  $("lookup").disabled = true; $("print").disabled = true;
  $("lookupStatus").textContent = 'Loading product attributes…';
  try {
    const url = AdProduct.lookupUrl($("adQuery").value);
    const isMcMaster = /^([a-z0-9-]+\.)*mcmaster\.com$/i.test(new URL(url).hostname);
    tab = await chrome.tabs.create({ url, active: false });
    const deadline = Date.now() + 25000;
    let result;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 750));
      try {
        const current = await chrome.tabs.get(tab.id);
        const host = new URL(current.url || 'about:blank').hostname;
        if (isMcMaster ? !/^([a-z0-9-]+\.)*mcmaster\.com$/i.test(host) : !/^(www\.)?automationdirect\.com$/i.test(host)) continue;
        const [injected] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: isMcMaster ? extractMcMaster : extractAutomationDirect });
        if (injected.result?.partNumber && (isMcMaster ? injected.result.description : injected.result.attributes?.length)) { result = injected.result; break; }
      } catch (_) { /* Redirect or table still loading. */ }
    }
    if (!result) throw new Error('No product data loaded. Check the product link, or open the product page in Chrome and try again.');
    await showPart(result);
    $("lookupStatus").textContent = isMcMaster ? 'Product loaded.' : result.attributes.length + ' product attributes loaded.';
  } catch (e) { $("lookupStatus").textContent = 'website not supported'; }
  finally {
    if (tab) await chrome.tabs.remove(tab.id).catch(() => {});
    $("lookup").disabled = false; $("print").disabled = false;
  }
}

init();
