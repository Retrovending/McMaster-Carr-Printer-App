/* global McmLabel, McmPrinting, chrome, extractMcMaster, AdProduct, extractAutomationDirect */
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
let namedLayouts = [];
let activeLayouts = {};
let customSizes = {};
let savedRotations = {};
let savedInversions = {};
const currentInvert=()=>!!savedInversions[$("size").value];
const currentRotation = () => Number(savedRotations[$('size').value]) || 0;
function allSizes() { return {...McmLabel.LABEL_SIZES,...customSizes}; }
function initCustomSizes() {
  $('addSize').addEventListener('click',async()=>{
    const name=$('sizeName').value.trim(), width=Number($('sizeWidth').value), height=Number($('sizeHeight').value);
    if(!name || name.length>60 || !Number.isFinite(width) || !Number.isFinite(height) || width<.25 || height<.25 || width>24 || height>24) {
      $('sizeMessage').textContent='Enter a name and dimensions from 0.25 to 24 inches.';return;
    }
    const id='custom:'+crypto.randomUUID();
    customSizes[id]={name:name+' — '+width+' × '+height+' in',width,height};
    try { await chrome.storage.local.set({customLabelSizes:customSizes});
      $('size').add(new Option(customSizes[id].name,id));$('size').value=id;
      $('size').dispatchEvent(new Event('change'));$('sizeMessage').textContent='Label size added.';
    } catch(e) { delete customSizes[id];$('sizeMessage').textContent='Could not save size: '+e.message; }
  });
  $('rotation').addEventListener('change',()=>{
    enableEditor();savedRotations[$('size').value]=Number($('rotation').value);
    chrome.storage.local.set({labelRotations:savedRotations});refreshPreview();saveSettings();
  });
}
function createLayout() {
  $('layout').value='editable';saveDesign({});savedRotations[$('size').value]=0;savedInversions[$('size').value]=false;chrome.storage.local.set({labelInversions:savedInversions});
  chrome.storage.local.set({labelRotations:savedRotations});$('rotation').value='0';
  $('layoutName').value='';$('layoutMessage').textContent='New layout. Edit it, enter a name, then save.';
  updateEditorControls();refreshPreview();saveSettings();$('layoutName').focus();
}
function presetLibrary() {
  // All starting layouts are regular editable records, removable like user layouts.
  const preset = (key) => {
    const e=McmLabel.editorElements();
    if(key==='banner'||key==='inverted') {
      e.partNumber={...e.partNumber,x:.04,y:.28,w:.92,h:.22};
      e.description={...e.description,x:.30,y:.53,w:.43,h:.40};
      e.image={...e.image,y:.53,h:.40};e.qr={...e.qr,y:.53,h:.40};
    }
    if(key==='inverted') e.partNumber.inverted=true;
    if(key==='picture') { e.image={...e.image,w:.38};e.partNumber={...e.partNumber,x:.45,w:.50};e.description={...e.description,x:.45,w:.28}; }
    if(key==='qrleft') { e.qr={...e.qr,x:.04,w:.25};e.image={...e.image,x:.77,w:.19}; }
    if(key==='textonly') {e.image.enabled=false;e.partNumber={...e.partNumber,x:.04,w:.68};e.description={...e.description,x:.04,w:.68};}
    return McmLabel.editorElements(e);
  };
  return Object.entries(McmLabel.LAYOUTS).map(([key,v])=>({id:'builtin-'+key,name:v.name,size:'*',elements:preset(key),rotation:0}));
}
const isNamedLayout = () => $('layout').value.startsWith('saved:');
const isEditorLayout = () => true;
const renderLayout = () => isEditorLayout() ? 'editable' : $('layout').value;
function populateNamedLayouts(preferred) {
  for (const option of [...$('layout').options]) if (option.value.startsWith('saved:')) option.remove();
  for (const entry of namedLayouts.filter(e => (e.size === '*' || e.size === $('size').value))) $('layout').add(new Option(entry.name, 'saved:' + entry.id));
  const valid = [...$('layout').options].some(o => o.value === preferred);
  $('layout').value = valid ? preferred : 'editable';
}
function useNamedLayout() {
  const entry = namedLayouts.find(e => 'saved:' + e.id === $('layout').value && (e.size === '*' || e.size === $('size').value));
  if (entry) {
    saveDesign(entry.elements);
    $('layoutName').value = entry.name;
    savedRotations[$('size').value]=entry.rotation || 0;
    savedInversions[$('size').value]=!!entry.invert;
    chrome.storage.local.set({labelInversions:savedInversions});
    chrome.storage.local.set({labelRotations:savedRotations});
  }
  updateEditorControls();
}
async function storeNamedLayouts() {
  await chrome.storage.local.set({ namedLabelLayouts: namedLayouts });
}
function initNamedLayouts() {
  $('createLayout').addEventListener('click',createLayout);
  $('exportLayouts').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify({version:1,layouts:namedLayouts,sizes:customSizes},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob), link=document.createElement('a');
    link.href=url;link.download='product-label-layouts.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('saveLayout').addEventListener('click', async () => {
    const name=$('layoutName').value.trim();
    if (!name || name.length > 60) { $('layoutMessage').textContent='Enter a layout name (1–60 characters).'; return; }
    if (namedLayouts.some(e=>(e.size==='*'||e.size===$('size').value) && e.name.toLowerCase()===name.toLowerCase())) {
      $('layoutMessage').textContent='That name already exists for this label size. Use Update saved layout or choose another name.'; return;
    }
    const entry={id:crypto.randomUUID(),name,size:$('size').value,elements:currentElements(),rotation:currentRotation(),invert:currentInvert()};
    namedLayouts.push(entry);
    try { await storeNamedLayouts(); populateNamedLayouts('saved:'+entry.id); saveSettings(); refreshPreview(); $('layoutMessage').textContent='Layout saved.'; }
    catch(e) { namedLayouts.pop(); $('layoutMessage').textContent='Could not save layout: '+e.message; }
  });
  $('updateLayout').addEventListener('click', async () => {
    const entry=namedLayouts.find(e=>(e.size==='*'||e.size===$('size').value) && e.name.toLowerCase()===$('layoutName').value.trim().toLowerCase());
    if (!entry) { $('layoutMessage').textContent='Enter the name of an existing layout to update it.'; return; }
    const previous=entry.elements, previousRotation=entry.rotation,previousInvert=entry.invert;entry.elements=currentElements();entry.rotation=currentRotation();entry.invert=currentInvert();
    try { await storeNamedLayouts(); populateNamedLayouts('saved:'+entry.id); saveSettings(); refreshPreview(); $('layoutMessage').textContent='Saved layout updated.'; }
    catch(e) { entry.elements=previous;entry.rotation=previousRotation;entry.invert=previousInvert; $('layoutMessage').textContent='Could not update layout: '+e.message; }
  });
  $('deleteLayout').addEventListener('click', async () => {
    const entry=namedLayouts.find(e=>'saved:'+e.id===$('layout').value);
    if(!entry) { $('layoutMessage').textContent='Select a saved layout to delete.'; return; }
    const previous=namedLayouts;namedLayouts=namedLayouts.filter(e=>e.id!==entry.id);
    try { await storeNamedLayouts(); populateNamedLayouts('editable'); saveSettings(); refreshPreview(); $('layoutMessage').textContent='Saved layout deleted; the current arrangement is still editable.'; }
    catch(e) { namedLayouts=previous; $('layoutMessage').textContent='Could not delete layout: '+e.message; }
  });
}

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
  const elements = currentElements(), keys = Object.keys(elements).filter(k => elements[k].enabled && (k !== 'image' || imageIfOn()));
  const overlaps = keys.some((a,i) => keys.slice(i+1).some(b => {
    const x=elements[a], y=elements[b];
    return x.x < y.x+y.w && x.x+x.w > y.x && x.y < y.y+y.h && x.y+x.h > y.y;
  }));
  $('editorHint').textContent = overlaps ? 'Some elements overlap. Drag them apart before printing.' : 'Drag any element in the preview. Resize the selected element below. Test code readability after resizing or color inversion.';
}

function elementTitle(key,e) { return e.name || ELEMENT_NAMES[key] || (e.type==='code'?'Code field':'Text field'); }
function rebuildElements() {
  const elements=currentElements();
  if(!elements[selectedElement]) selectedElement=Object.keys(elements)[0];
  $('elementSelect').replaceChildren();$('elementVisibility').replaceChildren();
  for(const [key,e] of Object.entries(elements)) {
    const name=elementTitle(key,e);$('elementSelect').add(new Option(name,key));
    const label=document.createElement('label');label.className='check';
    const box=document.createElement('input');box.type='checkbox';box.id='visible-'+key;box.checked=e.enabled;
    label.append(box,document.createTextNode(' '+name));$('elementVisibility').append(label);
    box.addEventListener('change',()=>{enableEditor();const fields=currentElements();fields[key].enabled=box.checked;saveDesign(fields);refreshPreview();saveSettings();});
  }
}
function bindingOptions(site,stored) {
  const values=[['default','Default/template'],['literal','Fixed text/template'],['company','Company'],['partNumber','Part number'],['description','Product description'],['selectedAttributes','Selected attribute text'],['url','Product URL']];
  for(const a of part?.attributes || []) if(site==='automationdirect') values.push(['attribute:'+a.name,a.name]);
  if(stored?.startsWith('attribute:')&&!values.some(e=>e[0]===stored))values.push([stored,stored.slice(10)]);
  values.push(['attribute:','Other attribute (enter name below)']);
  return values;
}
function updateEditorControls() {
  rebuildElements();
  const e=currentElements()[selectedElement];
  $('rotation').value=String(currentRotation());$('invertLabel').checked=currentInvert();
  $('elementSelect').value=selectedElement;
  $('elementScale').value=Math.round((e.scale||1)*100);$('elementPercent').textContent=$('elementScale').value+'%';
  $('fieldName').value=elementTitle(selectedElement,e);$('fieldType').value=e.type;
  const defaults={company:'{company}',partNumber:'{partNumber}',description:'{selectedAttributes}',qr:'{url}'};
  $('fieldText').value=e.text ?? defaults[selectedElement] ?? 'Custom text';
  $('fieldFont').value=e.fontFamily;$('fieldFontSize').value=e.fontSize;
  $('fieldBold').checked=e.bold ?? (selectedElement==='company'||selectedElement==='partNumber');
  $('fieldItalic').checked=!!e.italic;$('fieldInvert').checked=!!e.inverted;
  $('fieldAlign').value=e.align || (selectedElement==='company'?'center':'left');
  $('codeType').value=e.symbology;$('codeHumanText').checked=!!e.codeText;
  $('codeOptions').value=JSON.stringify(e.codeOptions || {},null,2);
  $('codeSettings').hidden=e.type!=='code';$('textSettings').hidden=e.type!=='text';
  for(const axis of ['x','y','w','h'])$('box-'+axis).value=(e[axis]*100).toFixed(1);
  for(const [site,id] of [['mcmaster','bindingMc'],['automationdirect','bindingAd']]) {
    const stored=e.bindings[site] || 'default';$(id).replaceChildren();
    for(const [value,name] of bindingOptions(site,stored))$(id).add(new Option(name,value));
    $(id).value=stored;
    $(id+'Attribute').value=stored.startsWith('attribute:')?stored.slice(10):'';
    $(id+'Attribute').hidden=!stored.startsWith('attribute:');
  }
}
function editField(patch,update=false) {
  enableEditor();const elements=currentElements();Object.assign(elements[selectedElement],patch);saveDesign(elements);refreshPreview();saveSettings();if(update)updateEditorControls();
}
function initModularFields() {
  const formats=rootBarcodeFormats();
  for(const f of formats)$('codeType').add(new Option(f.desc,f.bcid));
  $('addText').addEventListener('click',()=>addField('text'));
  $('addCode').addEventListener('click',()=>addField('code'));
  $('removeField').addEventListener('click',()=>{
    enableEditor();const elements=currentElements();
    if(McmLabel.ELEMENT_DEFAULTS[selectedElement])elements[selectedElement].enabled=false;
    else {delete elements[selectedElement];selectedElement='company';}
    saveDesign(elements);updateEditorControls();refreshPreview();saveSettings();
  });
  $('invertLabel').addEventListener('change',()=>{enableEditor();savedInversions[$('size').value]=$('invertLabel').checked;chrome.storage.local.set({labelInversions:savedInversions});refreshPreview();saveSettings();});
  $('fieldName').addEventListener('change',()=>editField({name:$('fieldName').value.trim()},true));
  $('fieldType').addEventListener('change',()=>editField({type:$('fieldType').value},true));
  $('fieldText').addEventListener('input',()=>editField({text:$('fieldText').value}));
  $('fieldFont').addEventListener('change',()=>editField({fontFamily:$('fieldFont').value}));
  $('fieldFontSize').addEventListener('input',()=>editField({fontSize:Number($('fieldFontSize').value)}));
  for(const [id,key] of [['fieldBold','bold'],['fieldItalic','italic'],['fieldInvert','inverted'],['codeHumanText','codeText']])$(id).addEventListener('change',()=>editField({[key]:$(id).checked}));
  $('fieldAlign').addEventListener('change',()=>editField({align:$('fieldAlign').value}));
  $('codeOptions').addEventListener('change',()=>{
    try {const value=JSON.parse($('codeOptions').value || '{}');
      if(!value || typeof value!=='object'||Array.isArray(value))throw new Error('Options must be a JSON object');
      editField({codeOptions:value});
    } catch(error){$('status').textContent='Code options: '+error.message;$('print').disabled=true;}
  });
  $('codeType').addEventListener('change',()=>editField({symbology:$('codeType').value}));
  for(const axis of ['x','y','w','h'])$('box-'+axis).addEventListener('change',()=>editField({[axis]:Number($('box-'+axis).value)/100},true));
  for(const [site,id] of [['mcmaster','bindingMc'],['automationdirect','bindingAd']]) {
    const apply=()=>{const e=currentElements()[selectedElement],value=$(id).value;
      editField({bindings:{...e.bindings,[site]:value.startsWith('attribute:')?'attribute:'+($(id+'Attribute').value||value.slice(10)):value}},true);
    };
    $(id).addEventListener('change',apply);$(id+'Attribute').addEventListener('change',apply);
  }
}
function rootBarcodeFormats() {
  const formats=globalThis.bwipjs?.symbolList || [];
  return formats.length ? [...formats].sort((a,b)=>a.desc.localeCompare(b.desc)) : [{bcid:'qrcode',desc:'QR Code'}];
}
function addField(type) {
  enableEditor();const elements=currentElements(),id='field-'+crypto.randomUUID();
  elements[id]={x:.1,y:.3,w:.4,h:.2,type,name:type==='code'?'Code field':'Custom text',text:type==='code'?'{partNumber}':'Custom text',symbology:type==='code'?'code128':'qrcode'};
  saveDesign(elements);selectedElement=id;updateEditorControls();refreshPreview();saveSettings();
}
function initEditor() {
  initModularFields();
  initNamedLayouts();
  $('elementSelect').addEventListener('change', () => { selectedElement=$('elementSelect').value; updateEditorControls(); refreshPreview(); saveSettings(); });
  $('elementScale').addEventListener('input', () => {
    enableEditor(); const elements=currentElements(), e=elements[selectedElement], d=McmLabel.ELEMENT_DEFAULTS[selectedElement] || {w:.4,h:.2};
    const factor=Number($('elementScale').value)/100;
    const cx=e.x+e.w/2, cy=e.y+e.h/2;
    e.scale=factor; e.w=d.w*factor; e.h=d.h*factor; e.x=cx-e.w/2; e.y=cy-e.h/2;
    saveDesign(elements); refreshPreview(); updateEditorControls(); saveSettings();
  });
  $('resetDesign').addEventListener('click', () => { enableEditor(); saveDesign({}); updateEditorControls(); refreshPreview(); saveSettings(); });
  const canvas=$('preview'); let drag=null;
  const point=event=>{
    const r=canvas.getBoundingClientRect(),x=(event.clientX-r.left)/r.width,y=(event.clientY-r.top)/r.height;
    switch(currentRotation()) {case 90:return {x:y,y:1-x};case 180:return {x:1-x,y:1-y};case 270:return {x:1-y,y:x};default:return {x,y};}
  };
  canvas.addEventListener('pointerdown', event => {
    if (!isEditorLayout()) return;
    const p=point(event), elements=currentElements();
    const active=elements[selectedElement];
    if(active?.enabled && Math.abs(p.x-active.x-active.w)<.035 && Math.abs(p.y-active.y-active.h)<.05) {
      event.preventDefault();drag={start:p,original:{...active},resize:true};canvas.setPointerCapture(event.pointerId);return;
    }
    // Small boxes win when two overlap, so they can still be selected.
    const hit=Object.keys(elements).filter(k=>elements[k].enabled && (k!=='image'||imageIfOn())).sort((a,b)=>elements[a].w*elements[a].h-elements[b].w*elements[b].h).find(k=>{const e=elements[k];return p.x>=e.x&&p.x<=e.x+e.w&&p.y>=e.y&&p.y<=e.y+e.h;});
    if (!hit) return;
    event.preventDefault(); selectedElement=hit;
    drag={start:p,original:{...elements[hit]}};canvas.setPointerCapture(event.pointerId);updateEditorControls();refreshPreview();
  });
  canvas.addEventListener('pointermove', event => {
    if(!drag) return; enableEditor(); const p=point(event), elements=currentElements();
    elements[selectedElement]=drag.resize
      ? {...drag.original,w:Math.max(.04,drag.original.w+p.x-drag.start.x),h:Math.max(.04,drag.original.h+p.y-drag.start.y)}
      : {...drag.original,x:drag.original.x+p.x-drag.start.x,y:drag.original.y+p.y-drag.start.y};
    // Keep the draft in memory while dragging; persist once released.
    savedDesigns[$('size').value]=McmLabel.editorElements(elements);refreshPreview();
  });
  const finish=()=>{if(drag){saveDesign(currentElements());drag=null;updateEditorControls();}};
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
  return allSizes()[$("size").value] || McmLabel.LABEL_SIZES["30336"];
}

function currentPart() {
  return { ...part, productDescription: part?.description || '', selectedAttributes: part?.source === 'automationdirect' ? AdProduct.description(part.attributes,attributeSelections) : $('desc').value, description: part?.source === 'automationdirect'
    ? AdProduct.description(part.attributes, attributeSelections) : $("desc").value };
}

function imageIfOn() {
  const visible = isEditorLayout() ? Object.values(currentElements()).some(e=>e.type==='image'&&e.enabled) : $('showImage').checked;
  return visible ? (partImages[imgIndex] || null) : null;
}

// Full-size label (used for the preview and the Chrome print dialog).
function renderFull() {
  const s = currentSize();
  return McmLabel.renderLabel(currentPart(), {
    widthIn: s.width, heightIn: s.height, padIn: 0.06, leftPadIn: 0.1, image: imageIfOn(), layout: renderLayout(), elements: currentElements(), rotation: currentRotation(), invert: currentInvert()
  });
}

function refreshPreview() {
  let src;
  try {src=renderFull();$('print').disabled=false;if($('status').textContent.startsWith('Design error:'))$('status').textContent='';}
  catch(error){$('status').textContent='Design error: '+error.message;$('print').disabled=true;return;}
  const pv = $("preview");
  pv.width = src.width; pv.height = src.height;
  pv.getContext("2d").drawImage(src, 0, 0);
  if (isEditorLayout() && currentElements()[selectedElement].enabled) {
    const e=currentElements()[selectedElement], ctx=pv.getContext('2d');
    ctx.save();ctx.strokeStyle='#1671d9';ctx.lineWidth=Math.max(2,src.width/300);ctx.setLineDash([8,5]);
    let x=e.x,y=e.y,w=e.w,h=e.h;
    switch(currentRotation()) {case 90:[x,y,w,h]=[1-e.y-e.h,e.x,e.h,e.w];break;case 180:[x,y]=[1-e.x-e.w,1-e.y-e.h];break;case 270:[x,y,w,h]=[e.y,1-e.x-e.w,e.h,e.w];break;}
    ctx.strokeRect(x*src.width,y*src.height,w*src.width,h*src.height);
    let hx=e.x+e.w,hy=e.y+e.h;
    switch(currentRotation()){case 90:[hx,hy]=[1-hy,hx];break;case 180:[hx,hy]=[1-hx,1-hy];break;case 270:[hx,hy]=[hy,1-hx];break;}
    ctx.fillStyle='#1671d9';ctx.fillRect(hx*src.width-5,hy*src.height-5,10,10);ctx.restore();
  }
  $('elementControls').hidden = !isEditorLayout();
  $('pictureToggle').hidden = isEditorLayout();
  editorWarning();
  const size = currentSize();
  $('previewSize').textContent = `${currentRotation()%180 ? size.height : size.width} × ${currentRotation()%180 ? size.width : size.height} inches · ${currentRotation()}°`;
}

function setStatus(html, isErr = false) {
  $("status").innerHTML = html;
  $("status").classList.toggle("err", isErr);
}

function saveSettings() {
  activeLayouts[$('size').value]=$('layout').value;
  chrome.storage.local.set({ activeLabelLayouts: activeLayouts });
  if (!$("showImage").disabled) imagePreference = $("showImage").checked;
  chrome.storage.sync.set({
    size: $("size").value,
    layout: $("layout").value,
    copies: +$("copies").value || 1,
    showImage: imagePreference
  });
}

async function onPrint() {
  saveSettings();
  const btn = $("print");
  btn.disabled = true;
  try {
    await McmPrinting.create({ label: McmLabel, chrome }).print(BROWSER, {
      part: currentPart(), size: currentSize(), image: imageIfOn(),
      layout: renderLayout(), elements: currentElements(), rotation: currentRotation(), invert: currentInvert(), copies: +$("copies").value || 1
    });
    $("status").textContent = "Choose your printer in the Chrome print dialog.";
  } catch (e) {
    $("status").textContent = "Printing failed: " + e.message;
    $("status").classList.add("err");
  } finally { btn.disabled = false; }
}

async function init() {
  const sizeSel = $("size");
  const librarySettings=await chrome.storage.local.get({customLabelSizes:{},labelRotations:{},labelInversions:{},layoutLibraryInitialized:false});
  customSizes=librarySettings.customLabelSizes || {};savedRotations=librarySettings.labelRotations || {};savedInversions=librarySettings.labelInversions || {};
  for (const [k,v] of Object.entries(allSizes())) sizeSel.add(new Option(v.name,k));
  $('layout').add(new Option('Unsaved layout','editable'));
  initCustomSizes();

  const settings = await chrome.storage.sync.get({ size: "30336", layout: "editable", copies: 1, showImage: true });
  sizeSel.value = allSizes()[settings.size] ? settings.size : "30336";

  $("copies").value = settings.copies;
  $("showImage").checked = settings.showImage;
  imagePreference = settings.showImage;

  savedDesigns = (await chrome.storage.local.get({ labelDesigns: {} })).labelDesigns;
  const savedLayoutState=await chrome.storage.local.get({ namedLabelLayouts: [], activeLabelLayouts: {} });
  namedLayouts=Array.isArray(savedLayoutState.namedLabelLayouts) ? savedLayoutState.namedLabelLayouts : [];
  activeLayouts=savedLayoutState.activeLabelLayouts || {};
  if(!librarySettings.layoutLibraryInitialized) {
    namedLayouts=[...presetLibrary(),...namedLayouts];
    await chrome.storage.local.set({namedLabelLayouts:namedLayouts,layoutLibraryInitialized:true});
  }
  populateNamedLayouts(activeLayouts[$('size').value] || (McmLabel.LAYOUTS[settings.layout] && settings.layout!=='editable' ? 'saved:builtin-'+settings.layout : settings.layout));
  initEditor();
  useNamedLayout();
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
  $('layout').addEventListener('change',()=>{useNamedLayout();refreshPreview();});
  for (const id of ["desc", "size", "layout", "showImage"]) $(id).addEventListener("input", refreshPreview);
  $("size").addEventListener("change", () => {
    populateNamedLayouts(activeLayouts[$('size').value] || 'editable');
    useNamedLayout();
    refreshPreview();
    saveSettings();
  });
  for (const id of ["size", "layout", "copies", "showImage"]) $(id).addEventListener("change", saveSettings);
  $("print").addEventListener("click", onPrint);

  document.body.dataset.ready="true";
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
  updateEditorControls();
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
