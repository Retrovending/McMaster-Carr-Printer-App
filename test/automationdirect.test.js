const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright-core');
const {chromeLaunchOptions,render,decodeQR}=require('./helpers');
const {AdProduct}=require('../extension/automationdirect');
test('lookup input is constrained to supported supplier products',()=>{
  assert.equal(AdProduct.lookupUrl('https://www.mcmaster.com/91290A115/'),'https://www.mcmaster.com/91290A115/');
  assert.equal(AdProduct.lookupUrl(' C0-00DD1-D '),'https://www.automationdirect.com/pn/C0-00DD1-D');
  assert.equal(AdProduct.lookupUrl('https://www.automationdirect.com/pn/C0-00DD1-D?x=1'),'https://www.automationdirect.com/pn/C0-00DD1-D');
  for(const value of ['https://evil.com/pn/A','https://automationdirect.com.evil.com/pn/A','http://automationdirect.com/pn/A','https://automationdirect.com/','https://mcmaster.com.evil.com/91290A115/','https://mcmaster.com/','<bad>','']) assert.throws(()=>AdProduct.lookupUrl(value));
});
test('actual rendered product table preserves displayed values and list separators',async()=>{
  const browser=await chromium.launch(chromeLaunchOptions());
  try {
    const page=await browser.newPage();
    await page.setContent(fs.readFileSync(path.join(__dirname,'fixtures/ad-c0-00dd1-d.html'),'utf8'));
    await page.addScriptTag({path:path.join(__dirname,'../extension/automationdirect.js')});
    const part=await page.evaluate(()=>extractAutomationDirect());
    assert.equal(part.partNumber,'C0-00DD1-D');
    assert.ok(part.attributes.length>20);
    const find=name=>part.attributes.find(a=>a.name===name)?.value;
    assert.equal(find('External Power Requirement'),'24 VDC');
    assert.equal(find('Number of Discrete Input Points'),'8');
    assert.equal(find('Port Protocol(s)'),'Modbus RTU Master/Slave; ASCII In/out; programming and monitoring');
    assert.equal(AdProduct.description(part.attributes,[]),'');
    part.description=AdProduct.description(part.attributes,['External Power Requirement']);
    assert.equal(part.description,'External Power Requirement: 24 VDC');
    assert.equal(decodeQR(render(part)),part.url);
    part.description=AdProduct.description(part.attributes,part.attributes.map(a=>a.name));
    assert.equal(decodeQR(render(part)),part.url,'overflow preserves QR and rendering');
    assert.ok(AdProduct.defaults(part.attributes).length<=3);
    await page.setContent('<h1>Missing product</h1><table><tr><td>Cart</td><td>10</td></tr></table>');
    assert.deepEqual((await page.evaluate(()=>extractAutomationDirect())).attributes,[]);
  } finally { await browser.close(); }
});

test('popup lookup, checkbox persistence, preview and print use the same selected text',async()=>{
 const browser=await chromium.launch(chromeLaunchOptions());
 try {
  const page=await browser.newPage();
  const root=path.join(__dirname,'..');
  await page.setContent(fs.readFileSync(path.join(root,'extension/popup.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,''));
  await page.evaluate(()=>{
   window.saved={}; window.removed=[];
   window.chrome={
    storage:{sync:{get:async d=>d,set:()=>{}},local:{get:async d=>({...d,...saved}),set:v=>Object.assign(saved,v)}},
    tabs:{query:async()=>[{id:1,url:'https://example.com'}],create:async()=>({id:2}),get:async()=>({url:'https://www.automationdirect.com/pn/C0-00DD1-D'}),remove:async id=>removed.push(id)},
    scripting:{executeScript:async()=>[{result:{source:'automationdirect',partNumber:'C0-00DD1-D',url:'https://www.automationdirect.com/pn/C0-00DD1-D',description:'Unused description',attributes:[{name:'Series',value:'Basic'},{name:'Voltage',value:'24 VDC'}],images:[],imageDataUrls:[]}}]}
   };
   window.Dymo={getPrinters:async()=>[]};
   window.McmPrinting={create:()=>({print:async(printer,job)=>{window.printed=job;return {backend:'browser'}}})};
  });
  for(const name of ['lib/qrcode.js','label.js','extract.js','automationdirect.js','popup.js']) await page.addScriptTag({path:path.join(root,'extension',name)});
  await page.waitForFunction(()=>document.querySelector('#printer').value==='__browser__');
  await page.locator('#manualLookup summary').click();
  await page.fill('#adQuery','C0-00DD1-D'); await page.click('#lookup');
  await page.waitForFunction(()=>document.querySelectorAll('#attributes input').length===2);
  assert.equal(await page.inputValue('#desc'),'Series: Basic; Voltage: 24 VDC');
  await page.locator('#attributes input').first().uncheck();
  assert.equal(await page.inputValue('#desc'),'Voltage: 24 VDC');
  assert.deepEqual(await page.evaluate(()=>saved.adSelections['C0-00DD1-D']),['Voltage']);
  await page.click('#print');
  assert.equal(await page.evaluate(()=>printed.part.description),'Voltage: 24 VDC');
  assert.deepEqual(await page.evaluate(()=>removed),[2]);
  await page.fill('#adQuery','https://evil.com/pn/x');await page.click('#lookup');
  await page.waitForFunction(()=>document.querySelector('#lookupStatus').textContent==='website not supported');
  assert.equal(await page.isDisabled('#print'),false);
  assert.equal(await page.locator('#adQuery').getAttribute('placeholder'),null);
  assert.equal(await page.locator('label[for="adQuery"]').textContent(),'Product link or part number');
  await page.fill('#adQuery','<invalid part>');await page.click('#lookup');
  await page.waitForFunction(()=>document.querySelector('#lookupStatus').textContent==='website not supported');
  await page.evaluate(()=>{
    chrome.tabs.get=async()=>({url:'https://www.mcmaster.com/91290A115/'});
    chrome.scripting.executeScript=async options=>{
      if(options.func.name!=='extractMcMaster') throw new Error('Wrong extractor for McMaster URL');
      return [{result:{partNumber:'91290A115',description:'Socket Head Screw',url:'https://www.mcmaster.com/91290A115/',images:[],imageDataUrls:[]}}];
    };
  });
  await page.fill('#adQuery','https://www.mcmaster.com/91290A115/');await page.click('#lookup');
  await page.waitForFunction(()=>document.querySelector('#lookupStatus').textContent==='Product loaded.');
  assert.equal(await page.inputValue('#desc'),'Socket Head Screw');
  assert.equal(await page.isVisible('#attributePanel'),false);
  await page.click('#print');
  assert.equal(await page.evaluate(()=>printed.part.partNumber),'91290A115');
  assert.equal(await page.evaluate(()=>printed.part.description),'Socket Head Screw');

 } finally {await browser.close()}
});

for (const source of ['automationdirect','mcmaster']) test('popup automatically reads the open '+source+' page',async()=>{
 const browser=await chromium.launch(chromeLaunchOptions());
 try {
  const page=await browser.newPage(); const root=path.join(__dirname,'..');
  await page.setContent(fs.readFileSync(path.join(root,'extension/popup.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,''));
  await page.evaluate(source=>{
   window.readCount=0; window.created=0; window.printed=null;
   window.chrome={storage:{sync:{get:async d=>d,set:()=>{}},local:{get:async d=>d,set:()=>{}}},
    tabs:{query:async()=>[{id:7,url:source==='automationdirect'?'https://www.automationdirect.com/pn/C0-00DD1-D':'https://www.mcmaster.com/91290A115/'}],create:async()=>{created++;throw new Error('Should read the open page')}},
    scripting:{executeScript:async options=>{
     if(options.target.tabId!==7) throw new Error('Wrong tab');
     readCount++;
     if(source==='automationdirect') {
      if(options.func.name!=='extractAutomationDirect') throw new Error('Wrong extractor');
      if(readCount===1) return [{result:{attributes:[]}}];
      return [{result:{source,partNumber:'C0-00DD1-D',url:'https://www.automationdirect.com/pn/C0-00DD1-D',attributes:[{name:'Voltage',value:'24 VDC'}],images:[],imageDataUrls:[]}}];
     }
     if(options.func.name!=='extractMcMaster') throw new Error('Wrong extractor');
     return [{result:{partNumber:'91290A115',description:'Socket Head Screw',url:'https://www.mcmaster.com/91290A115/',images:[],imageDataUrls:[]}}];
    }}};
   window.Dymo={getPrinters:async()=>[]};
   window.McmPrinting={create:()=>({print:async(printer,job)=>{printed=job;return {backend:'browser'}}})};
  },source);
  for(const name of ['lib/qrcode.js','label.js','extract.js','automationdirect.js','popup.js']) await page.addScriptTag({path:path.join(root,'extension',name)});
  await page.waitForFunction(()=>document.querySelector('#printer').value==='__browser__');
  assert.equal(await page.evaluate(()=>created),0);
  assert.equal(await page.locator('#manualLookup').getAttribute('open'),null);
  if(source==='automationdirect') {
   assert.equal(await page.inputValue('#desc'),'Voltage: 24 VDC');
   assert.equal(await page.locator('#attributes input').count(),1);
   assert.equal(await page.evaluate(()=>readCount),2);
  } else {
   assert.equal(await page.inputValue('#desc'),'Socket Head Screw');
   assert.equal(await page.isVisible('#attributePanel'),false);
   await page.fill('#desc','Edited screw description');
  }
  await page.click('#print');
  assert.equal(await page.evaluate(()=>printed.part.description),source==='automationdirect'?'Voltage: 24 VDC':'Edited screw description');
 } finally {await browser.close()}
});
