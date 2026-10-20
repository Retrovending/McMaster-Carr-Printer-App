/* Label layout + rendering. Pure canvas code so it can run in the popup
 * (and be tested outside the browser). Depends on the global `qrcode`
 * (qrcode-generator, MIT) or a `qrcode` passed in via opts.
 */
(function (root) {
  const DPI = 300; // Label raster resolution; the printer driver handles device resolution

  // Label presets, described in landscape (width = long side).
  // dymo: values for DYMO's label XML (DrawCommands use portrait twips).
  const LABEL_SIZES = {
    "4x6": {
      name: "4 × 6 Shipping (Rollo) — landscape",
      width: 6, height: 4
    },
    "30252": {
      name: "30252 Address — 1-1/8\" × 3-1/2\"",
      width: 3.5, height: 1.125,
      dymo: { id: "Address", paperName: "30252 Address", portraitW: 1581, portraitH: 5040, r: 270 }
    },
    "30336": {
      name: "30336 Small Multipurpose — 1\" × 2-1/8\"",
      width: 2.125, height: 1.0,
      dymo: { id: "Small30336", paperName: "30336 1 in x 2-1/8 in", portraitW: 1440, portraitH: 3060, r: 180 }
    },
    "30256": {
      name: "30256 Shipping — 2-5/16\" × 4\"",
      width: 4.0, height: 2.3125,
      dymo: { id: "Shipping", paperName: "30256 Shipping", portraitW: 3331, portraitH: 5760, r: 180 }
    }
  };

  const FONT = "Arial, Helvetica, sans-serif";

  function wrapText(ctx, text, maxWidth) {
    const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    const lines = [];
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width <= maxWidth) { line = test; continue; }
      if (line) lines.push(line);
      // Break a single over-long word by characters.
      if (ctx.measureText(word).width > maxWidth) {
        let chunk = "";
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width > maxWidth && chunk) { lines.push(chunk); chunk = ch; }
          else chunk += ch;
        }
        line = chunk;
      } else {
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function ellipsize(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1);
    return t.trimEnd() + "…";
  }

  function drawQR(ctx, qrLib, text, x, y, size) {
    const qr = qrLib(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const quiet = 1; // a little quiet zone; label padding supplies the rest
    const cell = Math.floor(size / (n + quiet * 2));
    const drawn = cell * (n + quiet * 2);
    const ox = Math.round(x + (size - drawn) / 2) + cell * quiet;
    const oy = Math.round(y + (size - drawn) / 2) + cell * quiet;
    ctx.fillStyle = "#000";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(ox + c * cell, oy + r * cell, cell, cell);
      }
    }
  }

  // Bounding box of the non-white content of an image (null if blank).
  function contentBox(img, makeCanvas) {
    const iw = img.width, ih = img.height;
    const k = Math.min(1, 400 / Math.max(iw, ih));
    const w = Math.max(1, Math.round(iw * k)), h = Math.max(1, Math.round(ih * k));
    const c = makeCanvas(w, h);
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (Math.min(d[i], d[i + 1], d[i + 2]) < 235) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    const m = 2; // keep a hair of margin
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m);
    x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
    return { sx: x0 / k, sy: y0 / k, sw: (x1 - x0 + 1) / k, sh: (y1 - y0 + 1) / k };
  }

  // Draw an image "contain"-fit into a box, trimmed of white borders and
  // converted to high-contrast grayscale so it survives thermal printing.
  function drawPartImage(ctx, img, x, y, w, h, makeCanvas) {
    if (!img.width || !img.height) return;
    const b = contentBox(img, makeCanvas) || { sx: 0, sy: 0, sw: img.width, sh: img.height };
    const s = Math.min(w / b.sw, h / b.sh);
    const dw = Math.max(1, Math.round(b.sw * s)), dh = Math.max(1, Math.round(b.sh * s));
    const tmp = makeCanvas(dw, dh);
    const t = tmp.getContext("2d");
    t.fillStyle = "#fff";
    t.fillRect(0, 0, dw, dh);
    t.imageSmoothingQuality = "high";
    t.drawImage(img, b.sx, b.sy, b.sw, b.sh, 0, 0, dw, dh);
    const data = t.getImageData(0, 0, dw, dh);
    const p = data.data;
    for (let i = 0; i < p.length; i += 4) {
      let g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      g = (g - 128) * 1.25 + 128 - 8;       // boost contrast, darken slightly
      g = g > 245 ? 255 : Math.max(0, Math.min(255, g)); // keep background clean
      p[i] = p[i + 1] = p[i + 2] = g;
      p[i + 3] = 255;
    }
    t.putImageData(data, 0, 0);
    ctx.drawImage(tmp, Math.round(x + (w - dw) / 2), Math.round(y + (h - dh) / 2));
  }

  // Draw part number + wrapped description inside a box.
  // o: { pnMax (px), descRatio, align: "top"|"center", pnColor }
  function drawTextBlock(ctx, part, x, y0, w, h, o = {}) {
    const pn = part.partNumber || "";
    const desc = part.description || "";
    let pnSize = Math.round(o.pnMax || h * 0.3);
    ctx.textBaseline = "top";
    ctx.font = `bold ${pnSize}px ${FONT}`;
    while (pnSize > 20 && ctx.measureText(pn).width > w) {
      pnSize -= 2;
      ctx.font = `bold ${pnSize}px ${FONT}`;
    }
    const pnLineH = pn && !o.skipPn ? Math.round(pnSize * 1.12) : 0;

    const availH = h - pnLineH;
    const minSize = o.minDesc || 20;
    let size = Math.max(minSize, Math.round(o.descMax || pnSize * (o.descRatio || 0.62)));
    let lines = [];
    for (; size >= minSize; size -= 1) {
      ctx.font = `${size}px ${FONT}`;
      lines = wrapText(ctx, desc, w);
      if (lines.length * size * 1.15 <= availH) break;
    }
    if (size < minSize) { size = minSize; ctx.font = `${size}px ${FONT}`; lines = wrapText(ctx, desc, w); }
    const maxLines = Math.max(0, Math.floor(availH / (size * 1.15)));
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      if (maxLines) lines[maxLines - 1] = ellipsize(ctx, lines[maxLines - 1] + "…", w);
    }
    const lh = Math.round(size * 1.15);
    const blockH = pnLineH + lines.length * lh;
    let y = o.align === "top" ? y0 : y0 + Math.max(0, Math.round((h - blockH) / 2));
    ctx.fillStyle = "#000";
    if (pnLineH) {
      ctx.font = `bold ${pnSize}px ${FONT}`;
      ctx.fillText(pn, x, y);
      y += pnLineH;
    }
    ctx.font = `${size}px ${FONT}`;
    for (const l of lines) { ctx.fillText(l, x, y); y += lh; }
    return pnSize;
  }

  // Largest bold size (<= max) at which `text` fits in width w.
  function fitBold(ctx, text, w, max) {
    let s = Math.round(max);
    ctx.font = `bold ${s}px ${FONT}`;
    while (s > 20 && ctx.measureText(text).width > w) { s -= 2; ctx.font = `bold ${s}px ${FONT}`; }
    return s;
  }


  // Editable element boxes use fractions of the label so preview and print agree.
  const ELEMENT_DEFAULTS = {
    company: { x: .04, y: .04, w: .92, h: .20 },
    partNumber: { x: .30, y: .28, w: .43, h: .18 },
    description: { x: .30, y: .48, w: .43, h: .46 },
    image: { x: .04, y: .30, w: .23, h: .60 },
    qr: { x: .77, y: .30, w: .19, h: .60 }
  };
  function editorElements(value = {}) {
    const out = {};
    for (const [key, defaults] of Object.entries(ELEMENT_DEFAULTS)) {
      const e = { ...defaults, ...value[key] };
      const number = (n, fallback) => Number.isFinite(Number(n)) ? Number(n) : fallback;
      e.scale = Math.max(.4, Math.min(2.5, number(e.scale, 1)));
      e.w = Math.max(.04, Math.min(.96, number(e.w, defaults.w)));
      e.h = Math.max(.04, Math.min(.96, number(e.h, defaults.h)));
      e.x = Math.max(.02, Math.min(.98 - e.w, number(e.x, defaults.x)));
      e.y = Math.max(.02, Math.min(.98 - e.h, number(e.y, defaults.y)));
      out[key] = e;
    }
    return out;
  }
  function companyName(part) {
    let host = '';
    try { host = new URL(part.url).hostname; } catch (_) {}
    if (/^(www\.)?automationdirect\.com$/i.test(host)) return 'Automation Direct';
    if (/^([a-z0-9-]+\.)*mcmaster\.com$/i.test(host)) return 'McMaster';
    return '';
  }
  function drawEditable(ctx, part, opts, W, H, makeCanvas, qrLib) {
    const elements = editorElements(opts.elements);
    for (const [key, e] of Object.entries(elements)) {
      const x = Math.round(e.x * W), y = Math.round(e.y * H);
      const w = Math.round(e.w * W), h = Math.round(e.h * H);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      if (key === 'company') {
        const name = companyName(part);
        if (name) {
          ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h);
          let size = Math.max(8, Math.round(h * .78));
          ctx.font = 'bold ' + size + 'px ' + FONT;
          while (size > 8 && ctx.measureText(name).width > w * .94) ctx.font = 'bold ' + (--size) + 'px ' + FONT;
          ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(name, x + w / 2, y + h / 2);
        }
      } else if (key === 'image') {
        if (opts.image) drawPartImage(ctx, opts.image, x, y, w, h, makeCanvas);
      } else if (key === 'qr') {
        if (part.url) { const side = Math.min(w, h); drawQR(ctx, qrLib, part.url, x + (w - side) / 2, y + (h - side) / 2, side); }
      } else if (key === 'partNumber') {
        ctx.fillStyle = '#000'; ctx.textBaseline = 'top';
        const size = fitBold(ctx, part.partNumber || '', w, h * .85);
        ctx.fillText(part.partNumber || '', x, y);
      } else {
        // Fixed readable type: larger boxes enlarge text; overflow ends with ….
        const size = Math.max(10, Math.min(h * .22, w * .085));
        ctx.font = size + 'px ' + FONT; ctx.fillStyle = '#000'; ctx.textBaseline = 'top';
        const lines = wrapText(ctx, part.description || '', w);
        const count = Math.max(1, Math.floor(h / (size * 1.15)));
        const visible = lines.slice(0, count);
        if (lines.length > count) visible[count - 1] = ellipsize(ctx, visible[count - 1] + '…', w);
        visible.forEach((line, i) => ctx.fillText(line, x, y + i * size * 1.15));
      }
      ctx.restore();
    }
  }

  const LAYOUTS = {
    editable: { name: "Editable — drag and resize elements", draw() {} },
    // Picture | part number + description | QR
    classic: {
      name: "Classic — picture · text · QR",
      draw(c) {
        const { ctx, W, H, pad, padL, gap, img, url } = c;
        const inner = H - pad * 2;
        const qr = Math.round(Math.min(inner, W * 0.28));
        const im = img ? Math.round(Math.min(inner, W * 0.24)) : 0;
        let x = padL;
        if (img) { c.image(x, pad + (inner - im) / 2, im, im); x += im + gap; }
        const qx = W - pad - qr;
        if (url) c.qr(qx, pad + (inner - qr) / 2, qr);
        drawTextBlock(ctx, c.part, x, pad, qx - gap - x, inner, { pnMax: Math.min(H * 0.26, 0.42 * DPI) });
      }
    },
    // Big part number across the top, then picture · description · QR
    banner: {
      name: "Banner — big part number on top",
      draw(c) {
        const { ctx, W, H, pad, padL, gap, img, url, part } = c;
        const bandH = Math.round(H * 0.3);
        const s = fitBold(ctx, part.partNumber || "", W - padL - pad, bandH * 1.05);
        ctx.fillStyle = "#000"; ctx.textBaseline = "top";
        ctx.font = `bold ${s}px ${FONT}`;
        ctx.fillText(part.partNumber || "", padL, pad + Math.round((bandH - s * 0.92) / 2));
        const ry = pad + bandH + Math.round(gap / 2);
        const rh = H - pad - ry;
        const qr = rh;
        const im = img ? Math.round(Math.min(rh, W * 0.24)) : 0;
        let x = padL;
        if (img) { c.image(x, ry, im, rh); x += im + gap; }
        const qx = W - pad - qr;
        if (url) c.qr(qx, ry, qr);
        drawTextBlock(ctx, { description: part.description }, x, ry, qx - gap - x, rh, { descMax: 30, minDesc: 18 });
      }
    },
    // Same as banner, but the part number is white on a black bar
    inverted: {
      name: "Black bar — white part number header",
      draw(c) {
        const { ctx, W, H, pad, padL, gap, img, url, part } = c;
        const barH = Math.round(H * 0.3);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, barH);
        const s = fitBold(ctx, part.partNumber || "", W - padL - pad, barH * 0.8);
        ctx.fillStyle = "#fff"; ctx.textBaseline = "top";
        ctx.font = `bold ${s}px ${FONT}`;
        const tw = ctx.measureText(part.partNumber || "").width;
        ctx.fillText(part.partNumber || "", Math.round((W - tw) / 2), Math.round((barH - s * 0.92) / 2) + 2);
        const ry = barH + gap;
        const rh = H - pad - ry;
        const qr = rh;
        const im = img ? Math.round(Math.min(rh, W * 0.24)) : 0;
        let x = padL;
        if (img) { c.image(x, ry, im, rh); x += im + gap; }
        const qx = W - pad - qr;
        if (url) c.qr(qx, ry, qr);
        drawTextBlock(ctx, { description: part.description }, x, ry, qx - gap - x, rh, { descMax: 30, minDesc: 18 });
      }
    },
    // Large picture on the left; text above a small QR on the right
    picture: {
      name: "Big picture — text with small QR",
      draw(c) {
        const { ctx, W, H, pad, padL, gap, img, url, part } = c;
        const inner = H - pad * 2;
        const im = img ? Math.round(Math.min(inner, W * 0.4)) : 0;
        let x = padL;
        if (img) { c.image(x, pad, im, inner); x += im + gap; }
        const colW = W - pad - x;
        const qr = Math.round(inner * 0.5);
        if (url) c.qr(W - pad - qr, H - pad - qr, qr);
        const s = fitBold(ctx, part.partNumber || "", colW, H * 0.24);
        ctx.fillStyle = "#000"; ctx.textBaseline = "top";
        ctx.font = `bold ${s}px ${FONT}`;
        ctx.fillText(part.partNumber || "", x, pad);
        const dy = pad + Math.round(s * 1.12);
        // Description fills the space left of the QR.
        drawTextBlock(ctx, { description: part.description }, x, dy, colW - qr - gap, H - pad - dy,
          { descMax: 30, minDesc: 18, align: "top" });
      }
    },
    // QR on the left, text on the right, small picture bottom-right
    qrleft: {
      name: "QR first — QR · text, picture tucked in",
      draw(c) {
        const { ctx, W, H, pad, padL, gap, img, url, part } = c;
        const inner = H - pad * 2;
        const qr = Math.round(Math.min(inner, W * 0.4));
        if (url) c.qr(padL, pad + (inner - qr) / 2, qr);
        const x = padL + qr + gap;
        const colW = W - pad - x;
        const s = fitBold(ctx, part.partNumber || "", colW, H * 0.24);
        ctx.fillStyle = "#000"; ctx.textBaseline = "top";
        ctx.font = `bold ${s}px ${FONT}`;
        ctx.fillText(part.partNumber || "", x, pad);
        const dy = pad + Math.round(s * 1.12);
        // Picture sits bottom-right; description wraps in the space beside it.
        const imH = img ? Math.round(H - pad - dy) : 0;
        const imW = img ? Math.round(colW * 0.38) : 0;
        if (img) c.image(W - pad - imW, dy, imW, imH);
        drawTextBlock(ctx, { description: part.description }, x, dy, colW - (img ? imW + gap / 2 : 0), H - pad - dy,
          { descMax: 28, minDesc: 18, align: "top" });
      }
    },
    // No picture: maximum text size
    textonly: {
      name: "Text only — biggest type, no picture",
      draw(c) {
        const { ctx, W, H, pad, padL, gap, url, part } = c;
        const inner = H - pad * 2;
        const qr = Math.round(Math.min(inner, W * 0.34));
        const qx = W - pad - qr;
        if (url) c.qr(qx, pad + (inner - qr) / 2, qr);
        drawTextBlock(ctx, part, padL, pad, qx - gap - padL, inner, { pnMax: H * 0.3, descRatio: 0.55 });
      }
    }
  };

  /**
   * Render a label.
   * @param {object} part { partNumber, description, url }
   * @param {object} opts { widthIn, heightIn, image (drawable or null), layout,
   *                        padIn, leftPadIn, makeCanvas(w,h), qrcode }
   * @returns canvas
   */
  function renderLabel(part, opts) {
    const makeCanvas = opts.makeCanvas || ((w, h) => {
      const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
    });
    const qrLib = opts.qrcode || root.qrcode;
    const W = Math.round(opts.widthIn * DPI);
    const H = Math.round(opts.heightIn * DPI);
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    if (opts.layout === 'editable') {
      drawEditable(ctx, part, opts, W, H, makeCanvas, qrLib);
      return canvas;
    }
    // Reserve physical space for the seller banner before drawing any layout.
    let company = '';
    let host = '';
    try { host = new URL(part.url).hostname; } catch (_) {}
    if (/^(www\.)?automationdirect\.com$/i.test(host)) company = 'Automation Direct';
    else if (/^([a-z0-9-]+\.)*mcmaster\.com$/i.test(host)) company = 'McMaster';
    const bannerH = company ? Math.round(Math.min(66, H * 0.16)) : 0;
    if (company) {
      const inset = Math.round((opts.padIn ?? 0.06) * DPI);
      ctx.fillStyle = '#000';
      ctx.fillRect(inset, inset, W - inset * 2, bannerH - inset);
      let fontSize = Math.round((bannerH - inset) * 0.65);
      ctx.font = 'bold ' + fontSize + 'px ' + FONT;
      while (fontSize > 8 && ctx.measureText(company).width > W - inset * 4) {
        ctx.font = 'bold ' + (--fontSize) + 'px ' + FONT;
      }
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(company, W / 2, inset + (bannerH - inset) / 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    }
    ctx.save();
    ctx.translate(0, bannerH);
    const c = {
      ctx, W, H: H - bannerH, part,
      pad: Math.round((opts.padIn ?? 0.06) * DPI),
      padL: Math.round((opts.leftPadIn ?? opts.padIn ?? 0.06) * DPI),
      gap: Math.round(0.05 * DPI),
      img: opts.image || null,
      url: part.url,
      image: (x, y, w, h) => drawPartImage(ctx, opts.image, x, y, w, h, makeCanvas),
      qr: (x, y, s) => drawQR(ctx, qrLib, part.url, x, y, s)
    };
    (LAYOUTS[opts.layout] || LAYOUTS.classic).draw(c);
    ctx.restore();
    return canvas;
  }

  function escapeXml(s) {
    return String(s).replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]));
  }

  // Printable rectangle (landscape twips) we place the label image into.
  function dymoBounds(size) {
    const d = size.dymo;
    const long = d.portraitH, short = d.portraitW;
    const x = 317, y = 60; // LabelWriter leading/side non-printable allowance
    return { x, y, w: long - x - 100, h: short - y * 2 };
  }

  // DYMO label XML (the classic DieCutLabel format DYMO Connect still accepts)
  // containing one full-label image.
  function dymoLabelXml(size, pngBase64) {
    const d = size.dymo;
    const b = dymoBounds(size);
    return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>${escapeXml(d.id)}</Id>
  <PaperName>${escapeXml(d.paperName)}</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="${d.portraitW}" Height="${d.portraitH}" Rx="${d.r}" Ry="${d.r}" />
  </DrawCommands>
  <ObjectInfo>
    <ImageObject>
      <Name>LABEL</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <Image>${pngBase64}</Image>
      <ScaleMode>Uniform</ScaleMode>
      <BorderWidth>0</BorderWidth>
      <BorderColor Alpha="255" Red="0" Green="0" Blue="0" />
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Center</VerticalAlignment>
    </ImageObject>
    <Bounds X="${b.x}" Y="${b.y}" Width="${b.w}" Height="${b.h}" />
  </ObjectInfo>
</DieCutLabel>`;
  }

  const api = { ELEMENT_DEFAULTS, editorElements, DPI, LABEL_SIZES, LAYOUTS, renderLabel, dymoLabelXml, dymoBounds };
  root.McmLabel = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
