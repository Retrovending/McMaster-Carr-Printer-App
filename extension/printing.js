/* Generic print job interface. Device-specific rendering belongs in adapters. */
(function (root) {
  const BROWSER = "__browser__";
  function copies(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 99) throw new Error("Copies must be between 1 and 99");
    return n;
  }
  function create({ label, dymo, chrome }) {
    const backends = {
      browser: async (_, job) => {
        const { size } = job;
        const canvas = label.renderLabel(job.part, {
          widthIn: size.width, heightIn: size.height, padIn: 0.06, leftPadIn: 0.1,
          image: job.image, layout: job.layout, elements: job.elements
        });
        // Each tab owns its job, so concurrent print tabs cannot overwrite it.
        const id = root.crypto.randomUUID();
        const key = "printJob:" + id;
        await chrome.storage.session.set({ [key]: {
          dataUrl: canvas.toDataURL("image/png"), widthIn: size.width,
          heightIn: size.height, copies: job.copies, title: job.part.partNumber
        } });
        try { await chrome.tabs.create({ url: chrome.runtime.getURL("print.html") + "?job=" + id }); }
        catch (e) { await chrome.storage.session.remove(key); throw e; }
      },
      dymo: async (printer, job) => {
        if (!job.size.dymo) throw new Error("This label size is not supported by DYMO Connect");
        const bounds = label.dymoBounds(job.size);
        const canvas = label.renderLabel(job.part, {
          widthIn: bounds.w / 1440, heightIn: bounds.h / 1440,
          padIn: 0.02, image: job.image, layout: job.layout, elements: job.elements
        });
        const xml = label.dymoLabelXml(job.size, canvas.toDataURL("image/png").split(",")[1]);
        await dymo.printLabel(printer, xml, job.copies);
      }
    };
    return { async print(printer, job) {
      if (!job.size || !Number.isFinite(job.size.width) || !Number.isFinite(job.size.height) ||
          job.size.width <= 0 || job.size.height <= 0) throw new Error("Invalid label dimensions");
      const backend = !printer || printer === BROWSER ? "browser" : "dymo";
      await backends[backend](printer, { ...job, copies: copies(job.copies) });
      return { backend };
    } };
  }
  const api = { create, BROWSER };
  root.McmPrinting = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
