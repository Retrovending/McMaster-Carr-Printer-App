const test=require('node:test'),assert=require('node:assert/strict');
const Import=require('../extension/layout-import'),Label=require('../extension/label');
const current=()=>({layouts:[{id:'old',name:'Warehouse',size:'30336',elements:Label.editorElements()}],sizes:{'custom:old':{name:'Custom stock',width:3,height:2}},presets:Label.LABEL_SIZES});
const options=()=>{let i=0;return {newId:()=>String(++i),normalizeElements:Label.editorElements}};
function bundle(){const elements=Label.editorElements({custom:{type:'text',text:'Hello',fontFamily:'Consolas',fontSize:12,bindings:{mcmaster:'attribute:Thread Size'}}});elements.image.enabled=false;return {version:1,layouts:[{id:'old',name:'Warehouse',size:'30336',elements,rotation:270,invert:true}],sizes:{}};}
test('import preserves all element settings without replacing originals',()=>{
 const old=current(),before=structuredClone(old),data=bundle(),result=Import.prepare(data,old,options());
 assert.deepEqual(old,before);assert.equal(result.layouts.length,2);assert.deepEqual(result.layouts[0],old.layouts[0]);
 assert.equal(result.layouts[1].name,'Warehouse (imported)');assert.notEqual(result.layouts[1].id,'old');
 assert.deepEqual(result.layouts[1].elements,data.layouts[0].elements);assert.equal(result.layouts[1].rotation,270);assert.equal(result.layouts[1].invert,true);
});
test('conflicting custom IDs remap while identical size definitions are reused',()=>{
 const data=bundle();data.sizes={'custom:old':{name:'A different stock',width:4,height:6}};data.layouts[0].size='custom:old';
 const first=Import.prepare(data,current(),options());
 assert.equal(first.sizes['custom:old'].width,3);assert.equal(first.layouts[1].size,first.addedSizeIds[0]);assert.equal(first.sizes[first.addedSizeIds[0]].height,6);
 const second=Import.prepare(data,{...current(),layouts:first.layouts,sizes:first.sizes},options());
 assert.equal(second.addedSizeIds.length,0);assert.equal(second.layouts[2].name,'Warehouse (imported)');
 assert.equal(new Set(second.layouts.map(e=>e.id)).size,second.layouts.length);
});
test('older exports without sizes or rotation work when sizes are known',()=>{
 const data=bundle();delete data.sizes;delete data.layouts[0].rotation;delete data.layouts[0].invert;
 const out=Import.prepare(data,current(),options());assert.equal(out.layouts[1].rotation,0);assert.equal(out.layouts[1].invert,false);
});
test('rejects malformed versions, missing sizes, invalid geometry and unsafe keys before mutation',()=>{
 const cases=[null,{}, {version:2,layouts:[]},{version:1,layouts:[],sizes:[]},JSON.parse('{"version":1,"layouts":[],"sizes":{"__proto__":{}}}')];
 for(const change of [d=>d.layouts[0].size='missing',d=>d.layouts[0].rotation=45,d=>d.layouts[0].elements.company.w=-1,d=>d.layouts[0].elements.company.bindings={mcmaster:3},d=>d.sizes.bad={name:'bad',width:0,height:2},d=>d.layouts.push({name:'Broken'})]){const d=bundle();change(d);cases.push(d);}
 for(const data of cases){const state=current(),before=structuredClone(state);assert.throws(()=>Import.prepare(data,state,options()));assert.deepEqual(state,before);}
});
