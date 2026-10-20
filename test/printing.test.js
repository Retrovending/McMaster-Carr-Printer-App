const test=require('node:test'),assert=require('node:assert/strict');
const Printing=require('../extension/printing');
function fixture(fail=false){const calls=[];return {calls,service:Printing.create({
 label:{renderLabel:(part,opts)=>{calls.push(['render',opts]);return {toDataURL:()=> 'data:image/png;base64,QUJD'}}},
 chrome:{storage:{session:{set:async v=>calls.push(['store',v]),remove:async k=>calls.push(['remove',k])}},runtime:{getURL:p=>'chrome-extension://test/'+p},tabs:{create:async v=>{if(fail)throw Error('Tab unavailable');calls.push(['tab',v])}}}
})};}
const job={part:{partNumber:'123'},size:{width:3.5,height:2},copies:2,layout:'editable',elements:{company:{enabled:false}}};
test('Chrome job carries custom physical sizes, editable geometry and copies',async()=>{
 const {service,calls}=fixture();assert.deepEqual(await service.print(Printing.BROWSER,job),{backend:'browser'});
 assert.deepEqual(calls[0][1].elements,job.elements);assert.equal(calls[0][1].widthIn,3.5);
 const stored=Object.values(calls[1][1])[0];assert.equal(stored.widthIn,3.5);assert.equal(stored.heightIn,2);assert.equal(stored.copies,2);
 assert.match(calls[2][1].url,/print.html\?job=/);
});
test('quarter-turns swap physical page dimensions; every rotation reaches renderer',async()=>{
 for(const rotation of [0,90,180,270]) {const {service,calls}=fixture();await service.print('old saved printer',{...job,rotation});
  const data=Object.values(calls[1][1])[0];assert.equal(calls[0][1].rotation,rotation);
  assert.equal(data.widthIn,rotation%180?2:3.5);assert.equal(data.heightIn,rotation%180?3.5:2);
 }
});
test('invalid copies or dimensions fail before opening print dialog',async()=>{
 const {service,calls}=fixture();for(const copies of [0,100,-1,1.5,NaN])await assert.rejects(service.print('',{...job,copies}),/Copies/);
 for(const width of [0,-1,NaN])await assert.rejects(service.print('',{...job,size:{width,height:2}}),/dimensions/);
 assert.equal(calls.length,0);
});
test('failure to open print tab cleans only its job without retry',async()=>{
 const {service,calls}=fixture(true);await assert.rejects(service.print('',job),/Tab unavailable/);
 assert.equal(calls.filter(c=>c[0]==='remove').length,1);
});
