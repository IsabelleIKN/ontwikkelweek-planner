/* xlsx-lite: minimale Excel (.xlsx) schrijver en lezer zonder afhankelijkheden. Lezen gebruikt DecompressionStream (alle moderne browsers). */
const XL = (() => {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const xe = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

  // benoemde celstijlen: naam -> [lettertype, vulkleur, rand, horizontaal, verticaal]
  const NS = {
    title: [3, null, 0, 'left', 'center'], head: [2, 'FF2F5FD0', 1, 'center', 'center'], part: [1, 'FFF0EEE8', 1, 'center', 'center'], name: [1, null, 1, 'left', 'center'],
    les: [0, 'FFDBE8FB', 1, 'center', 'center'], dbl: [0, 'FFFDE3B4', 1, 'center', 'center'], bad: [0, 'FFF9C9C9', 1, 'center', 'center'],
    leeg: [4, 'FFFFF4DD', 1, 'center', 'center'], studie: [4, 'FFE4E2DC', 1, 'center', 'center'], vn: [4, 'FFE0F0F0', 1, 'center', 'center'],
    exc: [0, 'FFE9DEFA', 1, 'center', 'center'], vrij: [4, 'FFEBE9E4', 1, 'center', 'center'], run: [4, null, 1, 'center', 'center'],
    off: [4, 'FFE0DED8', 1, 'center', 'center'], free: [0, null, 1, 'center', 'center'],
  };
  const NAMED = Object.keys(NS);
  function stylesXml() {
    const fills = [...new Set(NAMED.map(n => NS[n][1]).filter(Boolean))];
    const edge = t => `<${t} style="thin"><color rgb="FFC9C6BE"/></${t}>`;
    return '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><i/><sz val="11"/><color rgb="FF6A7280"/><name val="Calibri"/></font></fonts>' +
      `<fills count="${2 + fills.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fills.map(c => `<fill><patternFill patternType="solid"><fgColor rgb="${c}"/><bgColor indexed="64"/></patternFill></fill>`).join('')}</fills>` +
      `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${edge('left')}${edge('right')}${edge('top')}${edge('bottom')}<diagonal/></border></borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${3 + NAMED.length}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>` +
      NAMED.map(n => { const [fo, fi, bo, h, v] = NS[n]; return `<xf numFmtId="0" fontId="${fo}" fillId="${fi ? 2 + fills.indexOf(fi) : 0}" borderId="${bo}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${h}" vertical="${v}" wrapText="1"/></xf>`; }).join('') +
      '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  }

  function zipStore(files) { // files: [{name, data(Uint8Array)}]
    const parts = [], cen = []; let off = 0;
    const u16 = v => new Uint8Array([v & 255, (v >> 8) & 255]);
    const u32 = v => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
    const cat = arr => { const n = arr.reduce((a, b) => a + b.length, 0); const o = new Uint8Array(n); let p = 0; for (const a of arr) { o.set(a, p); p += a.length; } return o; };
    for (const f of files) {
      const nm = enc.encode(f.name), crc = crc32(f.data);
      const lh = cat([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(f.data.length), u32(f.data.length), u16(nm.length), u16(0), nm]);
      parts.push(lh, f.data);
      cen.push(cat([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(f.data.length), u32(f.data.length), u16(nm.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off), nm]));
      off += lh.length + f.data.length;
    }
    const cd = cat(cen);
    return cat([...parts, cd, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(off), u16(0)]);
  }

  // sheets: [{name, rows: [[cell,...]], widths?: [n,...], headerRows?: n}]
  function write(sheets) {
    const f = (name, txt) => ({ name, data: enc.encode(txt) });
    const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const files = [
      f('[Content_Types].xml', H + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>'),
      f('_rels/.rels', H + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
      f('xl/workbook.xml', H + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map((s, i) => `<sheet name="${xe(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>'),
      f('xl/_rels/workbook.xml.rels', H + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
      f('xl/styles.xml', H + stylesXml()),
    ];
    sheets.forEach((s, i) => {
      const hr = s.headerRows ?? 1;
      let x = H + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
      if (s.landscape) x += '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>';
      if (s.widths) x += '<cols>' + s.widths.map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
      x += '<sheetData>';
      s.rows.forEach((r, ri) => {
        const ht = s.heights && s.heights[ri];
        x += `<row r="${ri + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>`;
        r.forEach((cv, ci) => {
          const o = cv && typeof cv === 'object' ? cv : { v: cv }, v = o.v;
          const empty = v === null || v === undefined || v === '';
          if (empty && !o.s) return;
          const ref = colName(ci) + (ri + 1), st = o.s ? NAMED.indexOf(o.s) + 3 : (ri < hr || ci === 0 ? 1 : 0);
          if (empty) x += `<c r="${ref}" s="${st}"/>`;
          else if (typeof v === 'number') x += `<c r="${ref}" s="${st}"><v>${v}</v></c>`;
          else x += `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
        });
        x += '</row>';
      });
      x += '</sheetData>';
      if (s.merges && s.merges.length) x += `<mergeCells count="${s.merges.length}">${s.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`;
      if (s.landscape) x += '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>';
      if (s.breaks && s.breaks.length) x += `<rowBreaks count="${s.breaks.length}" manualBreakCount="${s.breaks.length}">${s.breaks.map(r => `<brk id="${r}" max="16383" man="1"/>`).join('')}</rowBreaks>`;
      x += '</worksheet>';
      files.push(f(`xl/worksheets/sheet${i + 1}.xml`, x));
    });
    return zipStore(files);
  }

  async function inflate(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter(); w.write(bytes); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
  async function unzip(buf) {
    const b = new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let e = b.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Geen geldig xlsx-bestand');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = {};
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = dec.decode(b.subarray(p + 46, p + 46 + nl));
      const lnl = dv.getUint16(lo + 26, true), lel = dv.getUint16(lo + 28, true), ds = lo + 30 + lnl + lel;
      const raw = b.subarray(ds, ds + csize);
      out[name] = { method, raw };
      p += 46 + nl + el + cl;
    }
    const get = async nm => { const f = out[nm]; if (!f) return null; return dec.decode(f.method === 0 ? f.raw : await inflate(f.raw)); };
    return { get, names: Object.keys(out) };
  }
  const colIdx = ref => { const m = /^([A-Z]+)/.exec(ref)[1]; let n = 0; for (const ch of m) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const txt = el => el ? Array.from(el.getElementsByTagName('t')).map(t => t.textContent).join('') : '';

  // -> [{name, rows}]
  async function read(buf) {
    const z = await unzip(buf), P = s => new DOMParser().parseFromString(s, 'application/xml');
    const wb = P(await z.get('xl/workbook.xml')), rels = P(await z.get('xl/_rels/workbook.xml.rels'));
    const ss = await z.get('xl/sharedStrings.xml'); const shared = ss ? Array.from(P(ss).getElementsByTagName('si')).map(txt) : [];
    const relMap = {}; for (const r of Array.from(rels.getElementsByTagName('Relationship'))) relMap[r.getAttribute('Id')] = r.getAttribute('Target');
    const res = [];
    for (const s of Array.from(wb.getElementsByTagName('sheet'))) {
      const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let t = relMap[rid]; if (!t) continue; t = t.replace(/^\//, ''); if (!t.startsWith('xl/')) t = 'xl/' + t;
      const xml = await z.get(t); if (!xml) continue;
      const rows = [];
      for (const r of Array.from(P(xml).getElementsByTagName('row'))) {
        const ri = (+r.getAttribute('r') || rows.length + 1) - 1, arr = [];
        for (const c of Array.from(r.getElementsByTagName('c'))) {
          const ci = colIdx(c.getAttribute('r') || 'A1'), ty = c.getAttribute('t'); let v;
          if (ty === 'inlineStr') v = txt(c.getElementsByTagName('is')[0]);
          else { const ve = c.getElementsByTagName('v')[0]; v = ve ? ve.textContent : ''; if (ty === 's') v = shared[+v] ?? ''; else if (ty !== 'str' && ty !== 'b' && ty !== 'e' && v !== '' && !isNaN(+v)) v = +v; }
          arr[ci] = v;
        }
        rows[ri] = arr;
      }
      for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
      res.push({ name: s.getAttribute('name'), rows });
    }
    return res;
  }

  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const d = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.includes('\t') ? '\t' : ',');
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === d) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  }
  return { write, read, parseCsv };
})();
