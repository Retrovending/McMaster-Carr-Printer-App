/* global chrome */
(async () => {
  const id = new URLSearchParams(location.search).get("job");
  const key = id ? "printJob:" + id : "pendingLabel";
  const stored = await chrome.storage.session.get(key);
  const L = stored[key];
  if (!L) { document.body.textContent = "No label to print."; return; }
  await chrome.storage.session.remove(key);
  if (L.title) document.title = "Label " + L.title;
  document.getElementById("page").textContent =
    `@page { size: ${L.widthIn}in ${L.heightIn}in; margin: 0; }
     img.label { width: ${L.widthIn}in; height: ${L.heightIn}in; }`;
  const box = document.getElementById("labels");
  const loads = [];
  for (let i = 0; i < Math.max(1, L.copies || 1); i++) {
    const img = new Image();
    img.className = "label";
    img.src = L.dataUrl;
    box.appendChild(img);
    loads.push(img.decode().catch(() => {}));
  }
  await Promise.all(loads);
  window.addEventListener("afterprint", () => window.close());
  setTimeout(() => window.print(), 100);
})();
