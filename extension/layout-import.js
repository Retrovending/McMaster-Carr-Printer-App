/* Validate exported libraries before making any storage changes. Browser + Node. */
(function(root) {
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  const fail = message => { throw new Error(message); };
  const name = (value, label, limit = 60) => typeof value === 'string' && value.trim() && value.trim().length <= limit
    ? value.trim() : fail(label + ' must have a valid name.');
  function checkKeys(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('The file contains an invalid property.');
      checkKeys(entry);
    }
  }
  function validateElements(elements, layoutName) {
    if (!record(elements) || !Object.keys(elements).length) fail('Layout "' + layoutName + '" has no elements.');
    for (const [id, e] of Object.entries(elements)) {
      if (!id || !record(e)) fail('Layout "' + layoutName + '" has an invalid element.');
      for (const key of ['x', 'y', 'w', 'h']) {
        if (!Number.isFinite(e[key]) || e[key] < 0 || e[key] > 1 || (['w', 'h'].includes(key) && !e[key]))
          fail('Layout "' + layoutName + '" has invalid element dimensions.');
      }
      if (e.x + e.w > 1.000001 || e.y + e.h > 1.000001) fail('An element in "' + layoutName + '" is outside the label.');
      if (e.type !== undefined && !['text', 'code', 'image'].includes(e.type)) fail('An element in "' + layoutName + '" has an unknown type.');
      for (const key of ['name', 'text', 'fontFamily', 'align', 'symbology'])
        if (e[key] !== undefined && typeof e[key] !== 'string') fail('An element in "' + layoutName + '" has invalid text settings.');
      for (const key of ['enabled', 'bold', 'italic', 'inverted', 'codeText'])
        if (e[key] !== undefined && typeof e[key] !== 'boolean') fail('An element in "' + layoutName + '" has an invalid checkbox setting.');
      if (e.fontSize !== undefined && (!Number.isFinite(e.fontSize) || e.fontSize < 0 || e.fontSize > 200)) fail('An element in "' + layoutName + '" has an invalid font size.');
      if (e.bindings !== undefined && (!record(e.bindings) || Object.values(e.bindings).some(v => typeof v !== 'string'))) fail('An element in "' + layoutName + '" has invalid site bindings.');
      if (e.codeOptions !== undefined && !record(e.codeOptions)) fail('An element in "' + layoutName + '" has invalid code options.');
    }
  }
  function prepare(data, current, options) {
    if (!record(data) || data.version !== 1 || !Array.isArray(data.layouts)) fail('Choose an exported label-layout JSON file (version 1).');
    if (data.sizes !== undefined && !record(data.sizes)) fail('The label sizes must be an object.');
    checkKeys(data);
    const layouts = structuredClone(current.layouts), sizes = structuredClone(current.sizes);
    const knownSizes = {...current.presets, ...sizes}, sizeMap = new Map(), addedSizeIds = [], importedIds = [];
    const ids = new Set([...Object.keys(knownSizes), ...layouts.map(e => e.id)]);
    const newId = prefix => {
      let id;
      do { id = prefix + options.newId(); } while (ids.has(id));
      ids.add(id); return id;
    };
    for (const [oldId, size] of Object.entries(data.sizes || {})) {
      if (!record(size)) fail('The file contains an invalid label size.');
      const sizeName = name(size.name, 'Label size', 200);
      if (![size.width, size.height].every(n => Number.isFinite(n) && n >= .25 && n <= 24)) fail('Label dimensions must be between 0.25 and 24 inches.');
      const same = Object.entries(knownSizes).find(([, e]) => e.name === sizeName && e.width === size.width && e.height === size.height);
      const id = same ? same[0] : newId('custom:');
      sizeMap.set(oldId, id);
      if (!same) { sizes[id] = {name:sizeName, width:size.width, height:size.height}; knownSizes[id] = sizes[id]; addedSizeIds.push(id); }
    }
    for (const entry of data.layouts) {
      if (!record(entry)) fail('The file contains an invalid layout.');
      const originalName = name(entry.name, 'Layout');
      const size = sizeMap.get(entry.size) || entry.size;
      if (size !== '*' && (typeof size !== 'string' || !Object.hasOwn(knownSizes, size))) fail('Layout "' + originalName + '" refers to a missing label size. Export its custom sizes too.');
      if (entry.rotation !== undefined && ![0,90,180,270].includes(entry.rotation)) fail('Layout "' + originalName + '" has an invalid rotation.');
      if (entry.invert !== undefined && typeof entry.invert !== 'boolean') fail('Layout "' + originalName + '" has invalid inversion settings.');
      validateElements(entry.elements, originalName);
      let candidate = originalName, count = 1;
      while (layouts.some(e => (e.size === '*' || size === '*' || e.size === size) && e.name.toLowerCase() === candidate.toLowerCase())) {
        const suffix = count++ === 1 ? ' (imported)' : ' (imported ' + (count - 1) + ')';
        candidate = originalName.slice(0,60 - suffix.length) + suffix;
      }
      const id = newId('imported:');
      layouts.push({id, name:candidate, size, elements:options.normalizeElements(structuredClone(entry.elements)), rotation:entry.rotation || 0, invert:!!entry.invert});
      importedIds.push(id);
    }
    if (!importedIds.length && !addedSizeIds.length) fail('The file has no layouts or label sizes to import.');
    return {layouts, sizes, importedIds, addedSizeIds};
  }
  const api = {prepare}; root.McmLayoutImport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
