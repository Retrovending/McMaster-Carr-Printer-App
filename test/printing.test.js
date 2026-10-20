const test = require('node:test');
const assert = require('node:assert/strict');
const Printing = require('../extension/printing');
function fixture() {
  const calls = [];
  const service = Printing.create({
    label: {
      renderLabel: (part, opts) => { calls.push(['render', opts]); return { toDataURL: () => 'data:image/png;base64,QUJD' }; },
      dymoBounds: () => ({ w: 1440, h: 720 }),
      dymoLabelXml: (size, png) => { calls.push(['xml', png]); return '<label/>'; }
    },
    dymo: { printLabel: async (...args) => calls.push(['dymo', ...args]) },
    chrome: {
      storage: { session: { set: async value => calls.push(['store', value]), remove: async () => {} } },
      runtime: { getURL: name => 'chrome-extension://test/' + name },
      tabs: { create: async value => calls.push(['tab', value]) }
    }
  });
  return { service, calls };
}
const job = { part: { partNumber: '123' }, size: { width: 4, height: 2 }, copies: 2, layout: 'classic' };
test('generic printer uses physical dimensions without DYMO metadata', async () => {
  const { service, calls } = fixture();
  assert.deepEqual(await service.print(Printing.BROWSER, job), { backend: 'browser' });
  assert.equal(calls[0][1].widthIn, 4);
  assert.equal(Object.values(calls[1][1])[0].copies, 2);
  assert.match(calls[2][1].url, /print.html\?job=/);
  assert.ok(!calls.some(c => c[0] === 'dymo'));
});
test('DYMO keeps its printable bounds, XML and selected printer', async () => {
  const { service, calls } = fixture();
  await service.print('LabelWriter 550', { ...job, size: { ...job.size, dymo: {} } });
  assert.equal(calls[0][1].widthIn, 1);
  assert.deepEqual(calls[2], ['dymo', 'LabelWriter 550', '<label/>', 2]);
  assert.ok(!calls.some(c => c[0] === 'tab'));
});
test('invalid copies and incompatible DYMO media fail before submission', async () => {
  const { service } = fixture();
  for (const copies of [0, -1, 100, 1.5, NaN]) {
    await assert.rejects(service.print(Printing.BROWSER, { ...job, copies }), /Copies/);
  }
  await assert.rejects(service.print('DYMO', job), /not supported/);
});
test('DYMO submission errors propagate without a browser retry', async () => {
  let opened = false;
  const service = Printing.create({
    label: { dymoBounds: () => ({ w: 1440, h: 720 }),
      renderLabel: () => ({ toDataURL: () => 'data:image/png;base64,QUJD' }),
      dymoLabelXml: () => '<label/>' },
    dymo: { printLabel: async () => { throw new Error('Service timeout'); } },
    chrome: { tabs: { create: async () => { opened = true; } } }
  });
  await assert.rejects(service.print('DYMO', { ...job, size: { ...job.size, dymo: {} } }), /Service timeout/);
  assert.equal(opened, false);
});

test('both print backends pass editable element geometry to the renderer',async()=>{
 for(const printer of [Printing.BROWSER,'DYMO']) {
  const {service,calls}=fixture();
  const elements={company:{x:.1,y:.1,w:.8,h:.2}};
  await service.print(printer,{...job,layout:'editable',elements,size:{...job.size,dymo:{}}});
  assert.deepEqual(calls[0][1].elements,elements);
  assert.equal(calls[0][1].layout,'editable');
 }
});
