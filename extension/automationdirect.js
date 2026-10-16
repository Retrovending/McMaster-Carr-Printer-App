/* Self-contained: also injected into an AutomationDirect product tab. */
function extractAutomationDirect() {
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const attributes = [];
  const seen = new Set();
  for (const row of document.querySelectorAll('#taTable tr')) {
    const cells = [...row.children].filter(c => c.tagName === 'TD');
    if (cells.length < 3) continue;
    const name = clean(cells[1].textContent);
    const list = [...cells[2].querySelectorAll('li')];
    const value = list.length ? list.map(el => clean(el.textContent)).join('; ') : clean(cells[2].textContent);
    if (!name || !value || seen.has(name)) continue;
    seen.add(name);
    attributes.push({ name, value });
  }
  const match = document.title.match(/\(PN#\s*([^)]*)\)/i);
  const partNumber = match ? clean(match[1]) : '';
  const description = clean(document.querySelector('meta[name="description"]')?.content);
  const images = [...document.images].map(i => i.currentSrc || i.src)
    .filter(s => /cdn\.automationdirect\.com\/static\/images\/products\/large\//i.test(s));
  return { source: 'automationdirect', partNumber, description, attributes,
    url: partNumber ? `https://www.automationdirect.com/pn/${encodeURIComponent(partNumber)}` : location.href,
    images: [...new Set(images)].slice(0, 6), imageDataUrls: [] };
}

const AdProduct = {
  lookupUrl(input) {
    const value = input.trim();
    if (/^https?:/i.test(value)) {
      let url;
      try { url = new URL(value); } catch (_) { throw new Error('website not supported'); }
      const ad = /^(www\.)?automationdirect\.com$/i.test(url.hostname) && /^\/(pn\/|adc\/shopping\/catalog\/)/i.test(url.pathname);
      const mc = /^([a-z0-9-]+\.)*mcmaster\.com$/i.test(url.hostname) && url.pathname !== '/';
      if (url.protocol !== 'https:' || !(ad || mc) || url.username || url.password || url.port)
        throw new Error('website not supported');
      url.hash = ''; url.search = '';
      return url.href;
    }
    if (!/^[a-z0-9][a-z0-9._+\/-]{0,99}$/i.test(value)) throw new Error('website not supported');
    return `https://www.automationdirect.com/pn/${encodeURIComponent(value)}`;
  },
  defaults(attributes) {
    const useful = attributes.filter(a => /^(brand|item|series|.*voltage|.*power requirement|.*input points|.*output points|.*output type)$/i.test(a.name));
    return (useful.length ? useful : attributes).slice(0, 3).map(a => a.name);
  },
  description(attributes, selected) {
    return attributes.filter(a => selected.includes(a.name)).map(a => `${a.name}: ${a.value}`).join('; ');
  }
};
if (typeof module !== 'undefined') module.exports = { extractAutomationDirect, AdProduct };
