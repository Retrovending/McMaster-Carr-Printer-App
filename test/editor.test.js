const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright-core');const {chromeLaunchOptions,Label,createCanvas,qrcode,decodeQR,SAMPLE_PARTS}=require('./helpers');
const extension=path.join(__dirname,'../extension');
async function popup(browser,state={}){
 const p=await browser.newPage();await p.setContent(fs.readFileSync(path.join(extension,'popup.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,''));
 await p.evaluate(state=>{
  window.localState=state.local||{};window.syncState=state.sync||{};let id=0;
  if(!crypto.randomUUID)crypto.randomUUID=()=> 'test-id-'+(++id);
  window.chrome={storage:{local:{get:async d=>structuredClone({...d,...localState}),set:async v=>Object.assign(localState,structuredClone(v))},sync:{get:async d=>({...d,...syncState}),set:async v=>Object.assign(syncState,structuredClone(v))}},
   tabs:{query:async()=>[{id:1,url:'https://www.mcmaster.com/91290A115/'}]},scripting:{executeScript:async()=>[{result:{partNumber:'91290A115',description:'Socket Head Screw',attributes:state.attributes || [],url:'https://www.mcmaster.com/91290A115/',images:[],imageDataUrls:[]}}]}};
  window.McmPrinting={create:()=>({print:async(printer,job)=>{window.printed=job;return {backend:'browser'}}})};
 },state);
 for(const name of ['lib/qrcode.js','lib/bwip-js-min.js','label.js','extract.js','automationdirect.js','popup.js'])await p.addScriptTag({path:path.join(extension,name)});
 await p.waitForFunction(()=>document.body.dataset.ready==='true');return p;
}
test('visibility, draft isolation, named layouts, rotation, custom sizes and reopen persist',async()=>{
 const b=await chromium.launch(chromeLaunchOptions());try{
  const p=await popup(b);assert.equal(await p.locator('#printer').count(),0);
  await p.click('#createLayout');assert.equal(await p.inputValue('#layout'),'editable');
  assert.equal(await p.isVisible('#elementControls'),true);
  for(const key of ['company','partNumber','description','image','qr'])assert.equal(await p.isChecked('#visible-'+key),true);
  await p.uncheck('#visible-image');await p.uncheck('#visible-qr');await p.selectOption('#rotation','90');
  await p.fill('#layoutName','My rotated layout');await p.click('#saveLayout');
  await p.waitForFunction(()=>document.querySelector('#layoutMessage').textContent==='Layout saved.');
  const id=await p.inputValue('#layout');assert.ok(id.startsWith('saved:'));
  await p.check('#visible-image');assert.equal(await p.inputValue('#layout'),'editable');
  const saved=await p.evaluate(()=>localState.namedLabelLayouts.find(e=>e.name==='My rotated layout'));
  assert.equal(saved.elements.image.enabled,false);assert.equal(saved.rotation,90);
  await p.selectOption('#layout',id);assert.equal(await p.isChecked('#visible-image'),false);
  await p.selectOption('#elementSelect','partNumber');
  await p.locator('#elementScale').evaluate(e=>{e.value='125';e.dispatchEvent(new Event('input',{bubbles:true}));});
  const before=await p.evaluate(()=>localState.labelDesigns['30336'].partNumber);
  await p.locator('#preview').scrollIntoViewIfNeeded();
  const rect=await p.locator('#preview').boundingBox();const x=rect.x+(1-before.y-before.h/2)*rect.width,y=rect.y+(before.x+before.w/2)*rect.height;
  await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x-8,y+8);await p.mouse.up();
  const after=await p.evaluate(()=>localState.labelDesigns['30336'].partNumber);assert.ok(after.x>before.x&&after.y>before.y,'rotated dragging maps to source coordinates');
  await p.click('#updateLayout');await p.waitForFunction(()=>document.querySelector('#layoutMessage').textContent==='Saved layout updated.');
  await p.click('#print');assert.equal(await p.evaluate(()=>printed.rotation),90);assert.equal(await p.evaluate(()=>printed.elements.qr.enabled),false);assert.equal(await p.evaluate(()=>printed.layout),'editable');
  await p.click('#saveLayout');await p.waitForFunction(()=>document.querySelector('#layoutMessage').textContent.includes('already exists'));
  await p.selectOption('#layout','saved:builtin-textonly');assert.equal(await p.isChecked('#visible-image'),false,'starting layouts are editable');
  await p.check('#visible-qr');await p.uncheck('#visible-qr');await p.click('#updateLayout');
  await p.waitForFunction(()=>document.querySelector('#layoutMessage').textContent==='Saved layout updated.');
  await p.click('#deleteLayout');await p.waitForFunction(()=>!document.querySelector('option[value="saved:builtin-textonly"]'));
  await p.locator('#customSizePanel summary').click();await p.fill('#sizeName','Test stock');await p.fill('#sizeWidth','3.5');await p.fill('#sizeHeight','2');await p.click('#addSize');
  await p.waitForFunction(()=>document.querySelector('#sizeMessage').textContent==='Label size added.');
  const size=await p.inputValue('#size');assert.ok(size.startsWith('custom:'));
  await p.click('#createLayout');await p.selectOption('#rotation','270');await p.fill('#layoutName','Custom stock layout');await p.click('#saveLayout');
  await p.waitForFunction(()=>document.querySelector('#layoutMessage').textContent==='Layout saved.');
  const customId=await p.inputValue('#layout');await p.click('#print');
  assert.equal(await p.evaluate(()=>printed.size.width),3.5);assert.equal(await p.evaluate(()=>printed.size.height),2);assert.equal(await p.evaluate(()=>printed.rotation),270);
  const state=await p.evaluate(()=>({local:localState,sync:syncState}));const r=await popup(b,state);
  assert.equal(await r.inputValue('#size'),size);assert.equal(await r.inputValue('#layout'),customId);assert.equal(await r.inputValue('#rotation'),'270');
  assert.equal(await r.locator('option[value="saved:builtin-textonly"]').count(),0,'deleted starting layout stays deleted after reopening');
  await r.close();
 }finally{await b.close()}
});
test('rotated raster preserves QR and swaps pixels in quarter-turns',()=>{
 for(const rotation of [0,90,180,270]){
  const canvas=Label.renderLabel(SAMPLE_PARTS.screw,{widthIn:3.5,heightIn:2,layout:'editable',rotation,makeCanvas:createCanvas,qrcode});
  assert.equal(canvas.width,rotation%180?600:1050);assert.equal(canvas.height,rotation%180?1050:600);
  assert.equal(decodeQR(canvas),SAMPLE_PARTS.screw.url);
 }
});
test('Chrome print document uses exact custom dimensions with one page per copy',async()=>{
 const b=await chromium.launch(chromeLaunchOptions());try{
  const p=await b.newPage();await p.setContent(fs.readFileSync(path.join(extension,'print.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,''));
  const image=createCanvas(1050,600);image.getContext('2d').fillRect(0,0,1050,600);
  await p.evaluate(dataUrl=>{window.chrome={storage:{session:{get:async key=>({[key]:{widthIn:3.5,heightIn:2,copies:2,dataUrl}}),remove:async()=>{}}}};window.print=()=>{window.printCalled=true;};window.close=()=>{};},image.toDataURL());
  await p.addScriptTag({path:path.join(extension,'print.js')});await p.waitForFunction(()=>window.printCalled);
  assert.match(await p.locator('#page').textContent(),/size: 3.5in 2in/);
  assert.equal(await p.locator('img.label').count(),2);
  const pdf=await p.pdf({preferCSSPageSize:true});const text=pdf.toString('latin1');
  assert.match(text,/\/MediaBox \[0 0 252 144\]/);assert.equal((text.match(/\/Type \/Page\b/g)||[]).length,2);
 }finally{await b.close()}
});

test('custom fields preserve fonts, boxes, bindings, codes and inversion in named presets',async()=>{
 const b=await chromium.launch(chromeLaunchOptions());try{
  const p=await popup(b);
  await p.selectOption('#layout','saved:builtin-classic');await p.click('#addText');
  const field=await p.inputValue('#elementSelect');assert.ok(field.startsWith('field-'));
  await p.fill('#fieldName','Seller description');await p.locator('#fieldName').blur();
  await p.fill('#fieldText','Custom fixed text');await p.fill('#fieldFont','Courier New');await p.locator('#fieldFont').blur();
  await p.fill('#fieldFontSize','12');await p.check('#fieldBold');await p.check('#fieldInvert');
  const fontBefore=await p.inputValue('#fieldFontSize');await p.fill('#box-w','55');await p.locator('#box-w').blur();
  assert.equal(await p.inputValue('#fieldFontSize'),fontBefore,'box width does not change font');
  // All supplier bindings are configured even while another site is open.
  await p.locator('details').filter({has:p.locator('#bindingMc')}).locator('summary').click();
  await p.selectOption('#bindingMc','description');await p.selectOption('#bindingAd','attribute:');
  await p.fill('#bindingAdAttribute','External Power Requirement');await p.locator('#bindingAdAttribute').blur();
  const values=await p.evaluate(id=>{
    const e=currentElements()[id];return {e,mc:McmLabel.elementText({url:'https://www.mcmaster.com/1/',description:'Steel screw'},id,e),ad:McmLabel.elementText({source:'automationdirect',attributes:[{name:'External Power Requirement',value:'24 VDC'}]},id,e)};
  },field);
  assert.equal(values.mc,'Steel screw');assert.equal(values.ad,'24 VDC');assert.equal(values.e.fontFamily,'Courier New');assert.equal(values.e.inverted,true);
  await p.check('#invertLabel');await p.selectOption('#rotation','180');
  await p.fill('#layoutName','Modular full designer');await p.click('#saveLayout');
  await p.waitForFunction(()=>document.querySelector('#layoutMessage').textContent==='Layout saved.');
  const id=await p.inputValue('#layout'),saved=await p.evaluate(()=>localState.namedLabelLayouts.find(e=>e.name==='Modular full designer'));
  assert.equal(saved.invert,true);assert.equal(saved.rotation,180);assert.equal(saved.elements[field].bindings.automationdirect,'attribute:External Power Requirement');
  await p.click('#createLayout');await p.selectOption('#layout',id);assert.equal(await p.isChecked('#invertLabel'),true);
  await p.selectOption('#elementSelect',field);assert.equal(await p.inputValue('#fieldFont'),'Courier New');
  await p.click('#addCode');assert.ok(await p.locator('#codeType option').count()>50);
  await p.fill('#fieldText','ABC123');await p.selectOption('#codeType','code128');
  await p.click('#print');assert.equal(await p.evaluate(()=>printed.invert),true);
  const code=await p.inputValue('#elementSelect');assert.equal(await p.evaluate(id=>printed.elements[id].symbology,code),'code128');
  await p.selectOption('#codeType','ean13');await p.fill('#fieldText','INVALID');
  assert.equal(await p.isDisabled('#print'),true,'invalid encoding blocks printing');
  await p.fill('#fieldText','9520123456788');assert.equal(await p.isDisabled('#print'),false);
  await p.click('#removeField');assert.equal(await p.locator('#elementSelect option[value="'+code+'"]').count(),0);
 }finally{await b.close()}
});
test('pixel inversion is exact and bindings use each suppliers data',()=>{
 const opts={widthIn:3.5,heightIn:2,layout:'editable',makeCanvas:createCanvas,qrcode};
 const a=Label.renderLabel(SAMPLE_PARTS.screw,opts),b=Label.renderLabel(SAMPLE_PARTS.screw,{...opts,invert:true});
 const da=a.getContext('2d').getImageData(0,0,a.width,a.height).data,db=b.getContext('2d').getImageData(0,0,b.width,b.height).data;
 for(let i=0;i<da.length;i+=4)for(let c=0;c<3;c++)assert.equal(db[i+c],255-da[i+c]);
 const fields=Label.editorElements({custom:{type:'text',text:'Fixed',bindings:{mcmaster:'description',automationdirect:'attribute:Voltage'}}});
 assert.equal(Label.elementText({url:'https://www.mcmaster.com/1/',description:'Screw'},'custom',fields.custom),'Screw');
 assert.equal(Label.elementText({source:'automationdirect',attributes:[{name:'Voltage',value:'24 VDC'}]},'custom',fields.custom),'24 VDC');
 assert.equal(Label.elementText({source:'automationdirect',attributes:[]},'custom',fields.custom),'');
});

test('individual color inversion changes only that element box',()=>{
 const opts={widthIn:3.5,heightIn:2,layout:'editable',makeCanvas:createCanvas,qrcode};
 const a=Label.renderLabel(SAMPLE_PARTS.screw,opts),elements=Label.editorElements();elements.company.inverted=true;
 const b=Label.renderLabel(SAMPLE_PARTS.screw,{...opts,elements});
 const da=a.getContext('2d').getImageData(0,0,a.width,a.height).data,db=b.getContext('2d').getImageData(0,0,b.width,b.height).data;
 const e=elements.company,left=Math.round(e.x*a.width),top=Math.round(e.y*a.height),right=left+Math.round(e.w*a.width),bottom=top+Math.round(e.h*a.height);
 for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
  const i=(y*a.width+x)*4,inside=x>=left&&x<right&&y>=top&&y<bottom;
  assert.equal(db[i],inside?255-da[i]:da[i]);
 }
});

test('McMaster detected specs use the shared selector, persist checks and bind directly to fields',async()=>{
 const b=await chromium.launch(chromeLaunchOptions());try{
  const attributes=[{name:'Thread Size',value:'M3 × 0.5 mm'},{name:'Length',value:'10 mm'},{name:'Material',value:'Black-Oxide Alloy Steel'}];
  const p=await popup(b,{attributes});
  assert.equal(await p.isVisible('#attributePanel'),true);assert.equal(await p.locator('#attributes input').count(),3);
  assert.ok((await p.inputValue('#desc')).includes('Thread Size: M3 × 0.5 mm'));
  await p.locator('#attributes input').nth(2).uncheck();await p.click('#print');
  assert.equal(await p.evaluate(()=>printed.part.description),'Thread Size: M3 × 0.5 mm; Length: 10 mm');
  await p.click('#addText');const field=await p.inputValue('#elementSelect');
  await p.selectOption('#detectedField','attribute:Thread Size');
  assert.equal(await p.evaluate(id=>McmLabel.elementText(currentPart(),id,currentElements()[id]),field),'M3 × 0.5 mm');
  assert.equal(await p.locator('#bindingMc option[value="attribute:Thread Size"]').count(),1);
  await p.uncheck('#useAttributeText');await p.click('#print');
  assert.equal(await p.evaluate(()=>printed.part.description),'Socket Head Screw');
  assert.equal(await p.evaluate(()=>McmLabel.elementText(currentPart(),'description',currentElements().description)),'Socket Head Screw');
  const state=await p.evaluate(()=>({local:localState,sync:syncState}));state.attributes=attributes;
  const r=await popup(b,state);assert.equal(await r.isChecked('#useAttributeText'),false);
  assert.equal(await r.locator('#attributes input').nth(2).isChecked(),false);
  await r.check('#useAttributeText');await r.click('#print');
  assert.equal(await r.evaluate(()=>printed.part.description),'Thread Size: M3 × 0.5 mm; Length: 10 mm');
 }finally{await b.close()}
});
