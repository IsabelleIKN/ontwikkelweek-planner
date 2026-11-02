/* Ontwikkelweek-planner — data blijft in deze browser (localStorage); delen gaat via export. */
const DAYS = ['ma', 'di', 'wo', 'do', 'vr'];
const DAYNAMES = { ma: 'Maandag', di: 'Dinsdag', wo: 'Woensdag', do: 'Donderdag', vr: 'Vrijdag' };
const PARTS = ['o', 'm'];
const PARTNAME = { o: 'Ochtend', m: 'Middag' };
const PARTTIME = { o: '10:00–12:15', m: '12:45–15:00' };
const PROFILES = ['WEB', 'GD', 'XR'];
const TYPES = { onderwijs: 'Onderwijs', studiedag: 'Studiedag', excursie: 'Excursie', voornazorg: 'Voor-/nazorg' };
const REDENEN = ['Cursus', 'Verplichting', 'Compensatie vrij', 'Ziek/afwezig', 'Anders'];
const KEY = 'ontwikkelweek-planner-v1';
const TAGS = ['AVO', 'WEB', 'AI', 'XR', 'GD']; // rol/richting van een docent
const tagBadges = t => (t.tags || []).map(g => `<span class="badge" style="margin-left:4px">${g}</span>`).join('');
// Structuur (rooster doorlopend/aangepast, dagtypes) geldt per groep: jaar 1 gedeeld, jaar 2 en 3 per profiel
const GROUPS = ['1', '2-WEB', '2-GD', '2-XR', '3-WEB', '3-GD', '3-XR'];
const gk = c => c.year === 1 ? '1' : c.year + '-' + c.profile;
const gYear = g => +g[0];
const gLabel = g => g === '1' ? 'Jaar 1 (gedeeld)' : `Jaar ${g[0]} · ${g.slice(2)}`;
const gShort = g => g === '1' ? 'J1' : 'J' + g[0] + ' ' + g.slice(2);

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);

let S, ui = { tab: 'week', modal: null, filter: { tags: [], free: false } };

/* ---------- state ---------- */
function fresh() { return { v: 1, teachers: [], classes: [], weeks: [], cur: null }; }
function load() { try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch (e) { } return null; }
let saveWarned = false;
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { if (!saveWarned) { saveWarned = true; toast('Let op: opslaan in de browser lukt niet. Exporteer regelmatig een JSON-bestand.'); } } }
function normalize(s) {
  s = s && typeof s === 'object' ? s : fresh();
  s.teachers = s.teachers || []; s.classes = s.classes || []; s.weeks = s.weeks || [];
  s.teachers.forEach(t => { t.tags = Array.isArray(t.tags) ? t.tags.filter(x => TAGS.includes(x)) : (t.avo ? ['AVO'] : []); delete t.avo; t.avail = t.avail || {}; DAYS.forEach(d => { t.avail[d] = t.avail[d] || { o: true, m: true }; }); });
  s.classes.forEach(c => { delete c.vast; c.profile = c.profile || (c.year === 1 ? 'gedeeld' : 'WEB'); });
  s.weeks.forEach(w => {
    w.mode = w.mode || {}; w.dt = w.dt || {}; w.desc = w.desc || {}; w.bureau = w.bureau || {};
    GROUPS.forEach(g => { // oudere data had alleen per jaar een structuur: die kopiëren we naar de profielen
      const y = String(gYear(g));
      if (!w.mode[g]) w.mode[g] = w.mode[y] || 'aangepast';
      if (!w.dt[g]) w.dt[g] = w.dt[y] ? JSON.parse(JSON.stringify(w.dt[y])) : {};
      DAYS.forEach(d => { w.dt[g][d] = w.dt[g][d] || { type: 'onderwijs', label: '' }; });
    });
    w.hidden = w.hidden || {}; w.cells = w.cells || {}; w.ovr = w.ovr || {}; w.steps = w.steps || {}; w.okdbl = w.okdbl || {};
  });
  if (!s.weeks.find(w => w.id === s.cur)) s.cur = s.weeks[0] ? s.weeks[0].id : null;
  return s;
}
function newTeacher(name) { const avail = {}; DAYS.forEach(d => avail[d] = { o: true, m: true }); return { id: uid(), name, avail, tags: [] }; }
function newClass(name, year, profile) { return { id: uid(), name, year, profile: year === 1 ? 'gedeeld' : (profile || 'WEB') }; }
function newWeek(label) {
  const dt = {}, mode = {};
  GROUPS.forEach(g => { mode[g] = 'aangepast'; dt[g] = {}; DAYS.forEach(d => { dt[g][d] = { type: d === 'ma' ? 'studiedag' : d === 'vr' ? 'voornazorg' : 'onderwijs', label: '' }; }); });
  return { id: uid(), label, start: '', mode, dt, hidden: {}, desc: {}, bureau: {}, cells: {}, ovr: {}, steps: {}, okdbl: {} };
}
const T = id => S.teachers.find(t => t.id === id);
const C = id => S.classes.find(c => c.id === id);
const curWeek = () => S.weeks.find(w => w.id === S.cur) || null;
const cmpClass = (a, b) => a.year - b.year || a.name.localeCompare(b.name, 'nl', { numeric: true });
const cmpName = (a, b) => a.name.localeCompare(b.name, 'nl');
const cellKey = (c, d, p) => `${c}|${d}|${p}`;
const isBureau = (w, c, d) => c.year === 3 && !!w.bureau[c.id + '|' + d] && w.dt[gk(c)][d].type === 'onderwijs'; // excursie, studiedag en voor-/nazorg gaan voor // jaar 3: Bureau, hele dag, loopt door met vaste docenten
const bureauIds = (w, c, d) => [...new Set(PARTS.flatMap(p => classTeachers(w, c, d, p).ids))];
const isFree = (w, c, d, p) => { const k = w.cells[cellKey(c.id, d, p)]; return !!(k && k.free); }; // klas heeft vrij volgens het normale rooster

function dateOf(w, d) {
  if (!w.start) return '';
  const dt = new Date(w.start + 'T12:00:00'); if (isNaN(dt)) return '';
  dt.setDate(dt.getDate() + DAYS.indexOf(d));
  return dt.getDate() + '/' + (dt.getMonth() + 1);
}

/* ---------- planning-logica ---------- */
const isTeamDay = (w, d) => GROUPS.every(g => w.dt[g][d].type === 'studiedag');
function teachState(w, t, d, p) {
  if (isTeamDay(w, d)) return { ok: false, why: 'Teamstudiedag' };
  const o = w.ovr[`${t.id}|${d}|${p}`];
  if (o && o.s === 'nee') return { ok: false, why: o.r || 'Niet beschikbaar', n: o.n, ovr: true };
  if (o && o.s === 'ja') return { ok: true, why: 'Extra beschikbaar', ovr: true, extra: true };
  return t.avail[d][p] ? { ok: true } : { ok: false, why: 'Werkt dan niet' };
}
// docenten van een klas in een dagdeel
function classTeachers(w, c, d, p) {
  const ty = w.dt[gk(c)][d].type;
  if (ty === 'studiedag' || ty === 'voornazorg' || isFree(w, c, d, p)) return { ids: [] };
  const cell = w.cells[cellKey(c.id, d, p)];
  return { ids: cell ? cell.t.filter(id => T(id)) : [] };
}
function assignments(w, tid, d, p) {
  const res = [];
  for (const c of S.classes) {
    const ct = classTeachers(w, c, d, p);
    if (ct.ids.includes(tid)) res.push({ cls: c, exc: w.dt[gk(c)][d].type === 'excursie' });
  }
  return res.sort((a, b) => cmpClass(a.cls, b.cls));
}
function slot(w, t, d, p) {
  const st = teachState(w, t, d, p), as = assignments(w, t.id, d, p);
  // dubbele inzet kan bewust zijn (bijv. een gezamenlijke les): dan geen waarschuwing
  const bewust = as.length > 1 && !!(w.okdbl && w.okdbl[`${t.id}|${d}|${p}`]);
  const level = !st.ok ? (as.length ? 'bad' : 'off') : (as.length > 1 && !bewust) ? 'dbl' : as.length ? 'in' : 'free';
  return { st, as, level, bewust };
}
function issues(w) {
  const list = [], teachers = [...S.teachers].sort(cmpName);
  for (const t of teachers) for (const d of DAYS) for (const p of PARTS) {
    const s = slot(w, t, d, p);
    if (s.level === 'bad') list.push({ k: 'bad', t: t.id, d, p, txt: `${t.name} · ${DAYNAMES[d]} ${PARTNAME[p].toLowerCase()}: ingezet terwijl niet beschikbaar (${s.st.why}) bij ${s.as.map(a => a.cls.name).join(', ')}` });
    if (s.level === 'dbl') list.push({ k: 'dbl', t: t.id, d, p, txt: `${t.name} · ${DAYNAMES[d]} ${PARTNAME[p].toLowerCase()}: dubbel ingezet bij ${s.as.map(a => a.cls.name).join(' en ')}` });
  }
  let empty = 0;
  for (const c of S.classes) {
    if (w.hidden[c.id]) continue;
    for (const d of DAYS) for (const p of PARTS) {
      const ty = w.dt[gk(c)][d].type;
      if ((ty === 'excursie' || (ty === 'onderwijs' && w.mode[gk(c)] === 'aangepast')) && !isBureau(w, c, d) && !isFree(w, c, d, p) && !classTeachers(w, c, d, p).ids.length) empty++;
    }
  }
  return { list, empty };
}
const teachableDay = (w, d) => GROUPS.some(g => ['onderwijs', 'excursie'].includes(w.dt[g][d].type));

/* ---------- UI helpers ---------- */
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 3200); }
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
const slug = s => (s || 'week').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'week';
function confirmDlg(msg, onOk, okLabel = 'Doorgaan') { ui.modal = { t: 'confirm', msg, onOk, okLabel }; render(); }

/* ---------- views ---------- */
function render() {
  const tabs = [['week', 'Week'], ['bezetting', 'Bezetting'], ['overzicht', 'Overzicht'], ['docenten', 'Docenten'], ['klassen', 'Klassen'], ['delen', 'Delen & import']];
  $('#nav').innerHTML = tabs.map(([k, l]) => `<button data-a="tab" data-v="${k}" class="${ui.tab === k ? 'on' : ''}">${l}</button>`).join('');
  const w = curWeek();
  let h = '';
  if (ui.tab === 'week') h = weekBar(w) + (w ? viewWeek(w) : noWeek());
  else if (ui.tab === 'bezetting') h = weekBar(w) + (w ? viewOcc(w) : noWeek());
  else if (ui.tab === 'overzicht') h = weekBar(w) + (w ? viewOverzicht(w) : noWeek());
  else if (ui.tab === 'docenten') h = viewTeachers();
  else if (ui.tab === 'klassen') h = viewClasses();
  else h = viewShare();
  $('#app').innerHTML = h;
  renderModal();
}
function noWeek() {
  const start = !S.teachers.length || !S.classes.length;
  return `<div class="card empty-state"><p><b>Nog geen ontwikkelweek.</b></p><p>${start ? 'Begin met je <a href="#" data-a="tab" data-v="docenten">docenten</a> en <a href="#" data-a="tab" data-v="klassen">klassen</a> (of laad de voorbeelddata onder Delen & import).' : 'Maak een eerste week aan.'}</p><button class="pri" data-a="newweek">+ Nieuwe week</button></div>`;
}
function weekBar(w) {
  return `<div class="weekbar noprint"><label>Ontwikkelweek<select data-c="wsel">${S.weeks.length ? S.weeks.map(x => `<option value="${x.id}" ${x.id === S.cur ? 'selected' : ''}>${esc(x.label || '(zonder naam)')}</option>`).join('') : '<option>—</option>'}</select></label>
  <button data-a="newweek">+ Nieuwe week</button>${w ? `<button data-a="dupweek">Kopieer deze week</button><button class="danger" data-a="delweek">Verwijderen</button><button data-a="print">Print / PDF</button><button data-a="exportxlsx">Excel</button>` : ''}</div>
  ${w && ui.tab !== 'overzicht' ? `<h2 class="printonly" style="margin:0 0 6px">${esc(w.label)}</h2>` : ''}`;
}

function alertsHtml(w) {
  const { list, empty } = issues(w);
  if (!list.length && !empty) return `<div class="alert ok"><span class="kop">Geen dubbelboekingen of conflicten.</span> Alle klas-dagdelen met onderwijs hebben een docent.</div>`;
  const bad = list.filter(i => i.k === 'bad').length, dbl = list.filter(i => i.k === 'dbl').length;
  const parts = [];
  if (bad) parts.push(`${bad} keer ingezet terwijl niet beschikbaar`);
  if (dbl) parts.push(`${dbl} dubbele inzet`);
  if (empty) parts.push(`${empty} klas-dagdelen nog zonder docent`);
  return `<div class="alert warn"><span class="kop">${parts.join(' · ')}</span>${list.length ? `<ul>${list.slice(0, 12).map(i => `<li data-a="openovr" data-t="${i.t}" data-d="${i.d}" data-p="${i.p}" style="cursor:pointer" title="Klik om te openen">${esc(i.txt)}</li>`).join('')}${list.length > 12 ? `<li>… en ${list.length - 12} meer (zie Bezetting)</li>` : ''}</ul>` : ''}</div>`;
}

const STEPS = [
  ['Check met de curriculumhouders of het rooster doorloopt of aangepast is, en stem de algemene invulling van de beroepsuren / inhoud af', 'Per jaarlaag en richting. Stel het rooster hieronder in bij “Structuur van de week”.'],
  ['Stel de data vast voor excursies en andere evenementen', 'Koppel ze terug naar de curriculumhouders; zij laten de moduleleiders weten dat die dag geen onderwijs is. Excursies hebben voorrang.'],
  ['Stel de inzet vast: eerst het doorlopende rooster, daarna het aangepaste rooster', 'Gebruik AVO-docenten waar mogelijk, zeker voor excursiebegeleiding. Dat geeft ruimte bij de beroepsdocenten.', 'bezetting'],
  ['Check het overzicht met het team (Teams of teamoverleg)', 'Voor onverwachte omstandigheden: afspraken, cursussen enzovoort.', 'export'],
  ['Pas aan indien nodig en koppel de inzet door naar de roostermaker', '', 'export'],
];
function stepsCard(w) {
  const done = STEPS.filter((_, i) => w.steps[i + 1]).length, next = STEPS.findIndex((_, i) => !w.steps[i + 1]);
  return `<details class="card noprint steps" open><summary><h2>Zo plan je een ontwikkelweek</h2><span class="badge">${done} / ${STEPS.length} gedaan voor deze week</span></summary><ol>${STEPS.map(([t, d, b], i) => `<li class="${w.steps[i + 1] ? 'done' : ''} ${i === next ? 'next' : ''}"><label><input type="checkbox" data-c="step" data-n="${i + 1}" ${w.steps[i + 1] ? 'checked' : ''}><span><b>${esc(t)}</b>${d ? `<span class="muted">${esc(d)}</span>` : ''}${b === 'bezetting' ? '<span class="btns"><button class="small" data-a="tab" data-v="bezetting">Naar bezetting</button></span>' : ''}${b === 'export' ? '<span class="btns"><button class="small" data-a="exportxlsx">Excel</button><button class="small" data-a="printover">Print / PDF</button></span>' : ''}</span></label></li>`).join('')}</ol></details>`;
}
function viewWeek(w) {
  /* structuur */
  let h = stepsCard(w) + `<section class="card noprint"><div class="card-h"><h2>Structuur van de week</h2><span class="muted">Per jaarlaag en richting: loopt het rooster door of is het aangepast, en wat voor soort dag het is. Excursies hebben voorrang.</span></div>
  <div class="row"><label>Naam<input data-c="wlabel" value="${esc(w.label)}" style="width:260px"></label><label>Maandag van deze week (optioneel)<input type="date" data-c="wstart" value="${esc(w.start)}"></label></div>
  <div class="scroll"><table class="struct"><thead><tr><th></th>${DAYS.map(d => `<th>${DAYNAMES[d]}<small>${dateOf(w, d) || '&nbsp;'}</small></th>`).join('')}</tr></thead><tbody>
  <tr><th><span class="muted">Voor alle groepen</span><div class="seg">${['doorlopend', 'aangepast'].map(m => `<button data-a="modeall" data-v="${m}">${m === 'doorlopend' ? 'Loopt door' : 'Aangepast'}</button>`).join('')}</div></th>${DAYS.map(d => `<td><select data-c="dtypeall" data-d="${d}"><option value="">—</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></td>`).join('')}</tr>`;
  for (const g of GROUPS) {
    h += `<tr><th>${esc(gLabel(g))}<div class="seg">${['doorlopend', 'aangepast'].map(m => `<button data-a="mode" data-g="${g}" data-v="${m}" class="${w.mode[g] === m ? 'on' : ''}">${m === 'doorlopend' ? 'Rooster loopt door' : 'Aangepast rooster'}</button>`).join('')}</div></th>`;
    for (const d of DAYS) {
      const x = w.dt[g][d];
      h += `<td class="t-${x.type}"><select data-c="dtype" data-g="${g}" data-d="${d}">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${x.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>${x.type === 'excursie' ? `<input data-c="dlabel" data-g="${g}" data-d="${d}" placeholder="Waarheen?" value="${esc(x.label)}">` : ''}</td>`;
    }
    h += `</tr><tr class="descrow"><td colspan="6"><label>Inhoud van de week — ${esc(gLabel(g))}<textarea rows="2" data-c="gdesc" data-g="${g}" placeholder="Algemene beschrijving van de inhoud, van de curriculumhouder (excursies beschrijf je in het blok zelf)">${esc(w.desc[g] || '')}</textarea></label></td></tr>`;
  }
  h += `</tbody></table></div><p class="muted" style="margin:10px 0 0">Aangepast rooster = twee blokken per dag: ochtend ${PARTTIME.o}, pauze 12:15–12:45, middag ${PARTTIME.m}.</p></section>`;

  /* klasfilter */
  h += `<section class="card noprint"><div class="card-h"><h2>Welke klassen tonen</h2><span class="muted">Verborgen klassen blijven wel meetellen voor dubbelboekingen.</span></div>`;
  if (!S.classes.length) h += `<p class="muted">Nog geen klassen. Voeg ze toe onder Klassen.</p>`;
  for (const y of [1, 2, 3]) {
    const cl = S.classes.filter(c => c.year === y).sort(cmpClass); if (!cl.length) continue;
    h += `<div class="chips"><span class="lbl" style="min-width:48px">Jaar ${y}</span>${cl.map(c => `<span class="chip ${w.hidden[c.id] ? '' : 'on'}" data-a="togglecls" data-id="${c.id}">${esc(c.name)}${c.year > 1 ? `<span class="prof">${esc(c.profile)}</span>` : ''}</span>`).join('')}</div>`;
  }
  if (S.classes.length) h += `<div class="chips"><span class="lbl" style="min-width:48px">Snel</span><button class="small" data-a="allcls" data-v="1">Alles aan</button><button class="small" data-a="allcls" data-v="0">Alles uit</button>${PROFILES.map(p => `<button class="small" data-a="toggleprof" data-v="${p}">Profiel ${p}</button>`).join('')}</div>`;
  h += `</section>`;

  h += alertsHtml(w);
  h += gridCard(w);
  return h;
}

function gridCard(w) {
  const vis = S.classes.filter(c => !w.hidden[c.id]).sort(cmpClass);
  if (!vis.length) return `<section class="card"><p class="muted">Geen klassen zichtbaar.</p></section>`;
  let h = `<section class="card"><div class="card-h"><h2>Bezetting per klas</h2><span class="muted noprint">Klik op een vak om docenten te koppelen.</span></div><div class="scroll"><table class="grid"><thead><tr><th class="sticky" rowspan="2">Klas</th>${DAYS.map(d => `<th colspan="2">${DAYNAMES[d]}<small>${dateOf(w, d) || '&nbsp;'}</small></th>`).join('')}</tr><tr>${DAYS.map(d => PARTS.map(p => `<th class="sticky-sub" style="font-weight:500;font-size:12px">${PARTNAME[p]}</th>`).join('')).join('')}</tr></thead><tbody>`;
  for (const g of GROUPS) {
    const cl = vis.filter(c => gk(c) === g); if (!cl.length) continue;
    h += `<tr class="grp"><th colspan="11">${esc(gLabel(g))}<span class="badge">${w.mode[g] === 'doorlopend' ? 'rooster loopt door' : 'aangepast rooster'}</span></th></tr>`;
    for (const c of cl) {
      h += `<tr><th class="sticky">${esc(c.name)}${c.year > 1 ? `<span class="prof">${esc(c.profile)}</span>` : ''}</th>`;
      for (const d of DAYS) {
        const x = w.dt[g][d];
        if (x.type === 'studiedag' || x.type === 'voornazorg') { h += `<td colspan="2" class="blk t-${x.type}">${TYPES[x.type]}${x.type === 'voornazorg' ? '<br><span class="muted">studenten vrij</span>' : ''}</td>`; continue; }
        if (isBureau(w, c, d)) { h += `<td colspan="2" class="cell edit bureau" data-a="opencell" data-cl="${c.id}" data-d="${d}" data-p="dag"><b>Bureau</b>${bureauIds(w, c, d).length ? `<div>${chipsFor(w, d, 'dag', bureauIds(w, c, d))}</div>` : '<div class="muted">loopt door</div>'}</td>`; continue; }
        if (x.type === 'onderwijs' && w.mode[g] === 'doorlopend') { h += dayCellHtml(w, c, d); continue; }
        for (const p of PARTS) h += cellHtml(w, c, d, p, x);
      }
      h += '</tr>';
    }
  }
  h += `</tbody></table></div><div class="legend"><span><i style="background:var(--in)"></i>ingezet</span><span><i style="background:var(--dbl)"></i>dubbel ingezet</span><span><i style="background:var(--bad)"></i>ingezet terwijl niet beschikbaar</span><span><i style="background:var(--exc)"></i>excursie</span><span><i style="background:var(--bur)"></i>Bureau (jaar 3)</span></div></section>`;
  return h;
}
function chipsFor(w, d, p, ids) {
  const ps = p === 'dag' ? PARTS : [p];
  return ids.map(id => {
    const t = T(id), lv = ps.map(pp => slot(w, t, d, pp).level);
    const cls = lv.includes('bad') ? 'bad' : lv.includes('dbl') ? 'dbl' : '';
    return `<span class="chip t ${cls}" title="${esc(t.name)}">${esc(t.name)}</span>`;
  }).join('');
}
function cellHtml(w, c, d, p, x) {
  if (isFree(w, c, d, p)) return `<td class="cell edit free" data-a="opencell" data-cl="${c.id}" data-d="${d}" data-p="${p}">Vrij</td>`;
  const ct = classTeachers(w, c, d, p), cell = w.cells[cellKey(c.id, d, p)];
  const exc = x.type === 'excursie';
  const act = cell && cell.a ? `<div class="act">${esc(cell.a)}</div>` : '';
  return `<td class="cell edit ${exc ? 't-excursie' : ''} ${ct.ids.length ? '' : 'empty'}" data-a="opencell" data-cl="${c.id}" data-d="${d}" data-p="${p}">${exc ? `<div class="act" style="color:var(--exc-ink)">🚌 ${esc(x.label || 'Excursie')}</div>` : ''}${ct.ids.length ? chipsFor(w, d, p, ct.ids) : '<span class="none">nog niemand</span>'}${act}</td>`;
}
// rooster loopt door: één vak per dag (ochtend en middag samen); leeg = geen aanpassing nodig
function dayCellHtml(w, c, d) {
  if (PARTS.every(p => isFree(w, c, d, p))) return `<td colspan="2" class="cell edit free" data-a="opencell" data-cl="${c.id}" data-d="${d}" data-p="dag">Vrij</td>`;
  const ids = [...new Set([...classTeachers(w, c, d, 'o').ids, ...classTeachers(w, c, d, 'm').ids])];
  const cell = w.cells[cellKey(c.id, d, 'o')], act = cell && cell.a ? `<div class="act">${esc(cell.a)}</div>` : '';
  return `<td colspan="2" class="cell edit run" data-a="opencell" data-cl="${c.id}" data-d="${d}" data-p="dag">${ids.length ? chipsFor(w, d, 'dag', ids) : '<span class="muted">rooster loopt door</span>'}${act}</td>`;
}
function flags(w, d) {
  const ty = GROUPS.map(g => w.dt[g][d].type);
  if (ty.every(t => t === ty[0])) return ty[0] === 'onderwijs' ? '' : `alle groepen: ${TYPES[ty[0]].toLowerCase()}`;
  return GROUPS.filter(g => w.dt[g][d].type !== 'onderwijs').map(g => `${gShort(g)}: ${TYPES[w.dt[g][d].type].toLowerCase()}`).join(' · ');
}
function viewOcc(w) {
  if (!S.teachers.length) return `<div class="card empty-state">Nog geen docenten. Voeg ze toe onder <a href="#" data-a="tab" data-v="docenten">Docenten</a>.</div>`;
  const teachers = [...S.teachers].sort(cmpName);
  let h = alertsHtml(w) + `<section class="card"><div class="card-h"><h2>Wie is waar ingezet</h2><span class="muted noprint">Klik op een vak om een afwijking voor deze week in te stellen (cursus, compensatie, extra beschikbaar).</span></div><div class="scroll"><table class="occ"><thead><tr><th class="sticky" rowspan="2">Docent</th>${DAYS.map(d => `<th colspan="2">${DAYNAMES[d]}<small>${dateOf(w, d)} ${flags(w, d) ? `<span class="flags">${esc(flags(w, d))}</span>` : ''}</small></th>`).join('')}<th rowspan="2">Ingezet</th></tr><tr>${DAYS.map(d => PARTS.map(p => `<th style="font-weight:500;font-size:12px">${PARTNAME[p]}</th>`).join('')).join('')}</tr></thead><tbody>`;
  for (const t of teachers) {
    h += `<tr><th class="sticky">${esc(t.name)}${tagBadges(t)}</th>`;
    let used = 0, can = 0;
    for (const d of DAYS) for (const p of PARTS) {
      const s = slot(w, t, d, p);
      if (s.as.length) used++;
      if (s.st.ok && teachableDay(w, d)) can++;
      let inner = '';
      if (s.level === 'off') inner = esc(s.st.why || '');
      else if (s.as.length) inner = s.as.map(a => (a.exc ? '🚌 ' : '') + esc(a.cls.name)).join(', ') + (s.level === 'dbl' ? ' ⚠' : '') + (s.level === 'bad' ? ' !' : '') + (s.bewust ? ' ✓' : '');
      h += `<td class="s ${s.level} ${s.st.extra ? 'extra' : ''} ${s.bewust ? 'bw' : ''}" data-a="openovr" data-t="${t.id}" data-d="${d}" data-p="${p}" title="${esc(s.st.why || '')}${s.st.n ? ': ' + esc(s.st.n) : ''}">${inner}</td>`;
    }
    h += `<td style="text-align:center;white-space:nowrap">${used} / ${can}</td></tr>`;
  }
  h += `</tbody></table></div><div class="legend"><span><i style="background:var(--in)"></i>ingezet</span><span><i style="background:var(--dbl)"></i>⚠ dubbel (klik het vak en markeer als bewust als het zo bedoeld is)</span><span><i style="background:var(--in)"></i>✓ bewust dubbel</span><span><i style="background:var(--bad)"></i>! ingezet terwijl niet beschikbaar</span><span><i style="background:var(--off)"></i>niet beschikbaar</span><span><i style="background:var(--card)"></i>vrij</span><span>Ingezet = dagdelen met inzet / dagdelen beschikbaar</span></div></section>`;
  return h;
}

/* ---------- weekoverzicht per klas: gedeeld door scherm, PDF en Excel ---------- */
// spec van een vak (ps = ['o'], ['m'] of beide dagdelen samen)
function specPart(w, c, d, ps) {
  const g = gk(c), x = w.dt[g][d];
  if (x.type === 'studiedag') return { kind: 'studie', title: 'Studiedag' };
  if (x.type === 'voornazorg') return { kind: 'vn', title: 'Voor-/nazorg', sub: 'studenten vrij' };
  if (isBureau(w, c, d)) { const bi = bureauIds(w, c, d); return { kind: 'bureau', title: 'Bureau', sub: bi.length ? '' : 'loopt door', people: bi.map(id => { const lv = PARTS.map(p => slot(w, T(id), d, p).level); return { name: T(id).name, lvl: lv.includes('bad') ? 'bad' : lv.includes('dbl') ? 'dbl' : 'ok' }; }) }; }
  if (ps.every(p => isFree(w, c, d, p))) return { kind: 'vrij', title: 'Vrij' };
  const ids = [...new Set(ps.flatMap(p => classTeachers(w, c, d, p).ids))];
  const people = ids.map(id => { const lv = ps.map(p => slot(w, T(id), d, p).level); return { name: T(id).name, lvl: lv.includes('bad') ? 'bad' : lv.includes('dbl') ? 'dbl' : 'ok' }; });
  const cell = w.cells[cellKey(c.id, d, ps[0])], exc = x.type === 'excursie', run = x.type === 'onderwijs' && w.mode[g] === 'doorlopend';
  return { kind: exc ? 'exc' : people.length ? 'les' : run ? 'run' : 'leeg', title: exc ? '🚌 ' + (x.label || 'Excursie') : '', people, act: cell && cell.a ? cell.a : '' };
}
// één samengevoegd vak voor de hele dag, of twee dagdelen
function specDay(w, c, d) {
  const g = gk(c), x = w.dt[g][d];
  if (x.type === 'studiedag' || x.type === 'voornazorg' || (x.type === 'onderwijs' && w.mode[g] === 'doorlopend') || isBureau(w, c, d) || PARTS.every(p => isFree(w, c, d, p))) return [specPart(w, c, d, PARTS)];
  return PARTS.map(p => specPart(w, c, d, [p]));
}
const weekRange = w => w.start ? `${dateOf(w, 'ma')} – ${dateOf(w, 'vr')}` : '';
function specHtml(sp) {
  const pp = (sp.people || []).map(pe => `<span class="chip t ${pe.lvl === 'bad' ? 'bad' : pe.lvl === 'dbl' ? 'dbl' : ''}">${esc(pe.name)}</span>`).join('');
  const act = sp.act ? `<div class="act">${esc(sp.act)}</div>` : '';
  if (sp.kind === 'bureau') return `<b>Bureau</b>${pp ? '<div>' + pp + '</div>' : '<div class="muted">loopt door</div>'}`;
  if (sp.kind === 'run') return '<span class="muted">rooster loopt door</span>';
  if (sp.kind === 'leeg') return '<span class="none">nog niemand</span>';
  if (sp.kind === 'exc') return `<div class="exc-t">${esc(sp.title)}</div>${pp || '<span class="none">nog niemand</span>'}${act}`;
  if (sp.kind === 'les') return pp + act;
  return `<div class="lab">${esc(sp.title)}</div>${sp.sub ? `<div class="muted">${esc(sp.sub)}</div>` : ''}`;
}
function viewOverzicht(w) {
  const vis = S.classes.filter(c => !w.hidden[c.id]).sort(cmpClass);
  if (!vis.length) return `<section class="card"><p class="muted">Geen klassen zichtbaar. Zet klassen aan op het tabblad Week.</p></section>`;
  let h = `<div class="ov-head"><h2>${esc(w.label)}</h2><span class="muted">${esc(weekRange(w))}</span></div>`;
  h += '<div class="cards">';
  for (const g of GROUPS) {
    for (const c of vis.filter(c => gk(c) === g)) {
      const days = DAYS.map(d => specDay(w, c, d));
      const cellsOf = i => DAYS.map((d, k) => days[k].length === 1 ? (i === 0 ? `<td rowspan="2" class="k-${days[k][0].kind}">${specHtml(days[k][0])}</td>` : '') : `<td class="k-${days[k][i].kind}">${specHtml(days[k][i])}</td>`).join('');
      h += `<article class="vc"><header><b>${esc(c.name)}</b><span class="prof">${esc(gLabel(g))}</span><span class="badge">${w.mode[g] === 'doorlopend' ? 'rooster loopt door' : 'aangepast rooster'}</span></header>${w.desc[g] ? `<p class="vdesc">${esc(w.desc[g])}</p>` : ''}<table><thead><tr><th></th>${DAYS.map(d => `<th>${DAYNAMES[d].slice(0, 2)}<small>${dateOf(w, d) || '&nbsp;'}</small></th>`).join('')}</tr></thead><tbody><tr><th class="pl">Och&shy;tend</th>${cellsOf(0)}</tr><tr><th class="pl">Mid&shy;dag</th>${cellsOf(1)}</tr></tbody></table></article>`;
    }
  }
  h += '</div>';
  h += `<div class="legend"><span><i style="background:var(--in)"></i>docent(en)</span><span><i style="background:var(--dbl)"></i>dubbel ingezet</span><span><i style="background:var(--bad)"></i>ingezet terwijl niet beschikbaar</span><span><i style="background:var(--exc)"></i>excursie</span><span><i style="background:var(--stu)"></i>studiedag / vrij</span><span><i style="background:var(--vn)"></i>voor-/nazorg</span><span>Aangepast rooster: ochtend ${PARTTIME.o}, middag ${PARTTIME.m}</span></div>`;
  return h;
}
// Excel: kaartje per klas onder elkaar, met kleur
function specCell(sp) {
  const nm = (sp.people || []).map(pe => (pe.lvl === 'bad' ? '! ' : pe.lvl === 'dbl' ? '⚠ ' : '') + pe.name);
  const lines = [];
  if (sp.title) lines.push(sp.title);
  if (sp.kind === 'run') lines.push('Rooster loopt door');
  if (sp.kind === 'leeg' || (sp.kind === 'exc' && !nm.length)) lines.push('nog niemand');
  if (sp.sub) lines.push(sp.sub);
  lines.push(...nm); if (sp.act) lines.push('(' + sp.act + ')');
  const st = sp.kind === 'les' ? (sp.people.some(p => p.lvl === 'bad') ? 'bad' : sp.people.some(p => p.lvl === 'dbl') ? 'dbl' : 'les') : sp.kind;
  return { v: lines.join('\n'), s: st };
}
function overviewSheet(w) {
  const rows = [], merges = [], heights = {};
  rows.push([{ v: w.label + (weekRange(w) ? '  ·  ' + weekRange(w) : ''), s: 'title' }]); merges.push('A1:F1'); heights[0] = 26; rows.push([]);
  const breaks = []; let k = 0;
  for (const c of S.classes.filter(c => !w.hidden[c.id]).sort(cmpClass)) {
    const r0 = rows.length;
    rows.push([{ v: `${c.name}${c.year > 1 ? ' · ' + c.profile : ''}   —   ${w.mode[gk(c)] === 'doorlopend' ? 'rooster loopt door' : 'aangepast rooster'}`, s: 'title' }]); merges.push(`A${r0 + 1}:F${r0 + 1}`); heights[r0] = 22;
    if (w.desc[gk(c)]) { rows.push([{ v: w.desc[gk(c)], s: 'name' }]); merges.push(`A${rows.length}:F${rows.length}`); heights[rows.length - 1] = Math.max(20, Math.ceil(w.desc[gk(c)].length / 120 + w.desc[gk(c)].split('\n').length - 1) * 15 + 6); }
    rows.push([{ v: '', s: 'head' }, ...DAYS.map(d => ({ v: DAYNAMES[d] + (dateOf(w, d) ? '  ' + dateOf(w, d) : ''), s: 'head' }))]);
    const ro = [{ v: 'Ochtend', s: 'part' }], rm = [{ v: 'Middag', s: 'part' }];
    DAYS.forEach((d, i) => {
      const sp = specDay(w, c, d);
      if (sp.length === 1) { const cc = specCell(sp[0]); ro.push(cc); rm.push({ v: '', s: cc.s }); const col = String.fromCharCode(66 + i), n = rows.length + 1; merges.push(`${col}${n}:${col}${n + 1}`); }
      else { ro.push(specCell(sp[0])); rm.push(specCell(sp[1])); }
    });
    rows.push(ro); rows.push(rm);
    // rijhoogte groeit mee met het aantal regels (inclusief afgebroken lange regels)
    const nl = v => String(v || '').split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 24)), 0);
    const need = r => Math.max(...r.slice(1).map((cc, i) => { const merged = rm[i + 1].v === '' && rm[i + 1].s === cc.s && ro[i + 1] === cc; return merged ? nl(cc.v) / 2 : nl(cc.v); }), 1);
    heights[rows.length - 2] = Math.max(46, need(ro) * 15 + 8); heights[rows.length - 1] = Math.max(46, need(rm) * 15 + 8);
    rows.push([]);
    if (++k % 3 === 0) breaks.push(rows.length); // pagina-einde na elk derde kaartje
  }
  return { name: 'Weekoverzicht', rows, merges, heights, breaks, widths: [11, 24, 24, 24, 24, 24], headerRows: 0, landscape: true };
}
function viewTeachers() {
  const ts = [...S.teachers].sort(cmpName);
  let h = `<section class="card"><div class="card-h"><h2>Docenten</h2><span class="muted">Vast patroon: op welke dagdelen (O = ochtend, M = middag) is iemand normaal inzetbaar. Afwijkingen per week stel je in onder Bezetting.</span></div>`;
  if (ts.length) {
    h += `<div class="scroll"><table class="docs"><thead><tr><th>Naam</th><th>Rol / richting</th>${DAYS.map(d => `<th style="text-align:center">${d}</th>`).join('')}<th></th></tr></thead><tbody>`;
    for (const t of ts) h += `<tr><td><input data-c="tname" data-t="${t.id}" value="${esc(t.name)}"></td><td style="white-space:nowrap">${TAGS.map(g => `<button class="tg ${t.tags.includes(g) ? 'on' : ''}" data-a="ttag" data-t="${t.id}" data-v="${g}">${g}</button>`).join(' ')}</td>${DAYS.map(d => `<td class="dd" style="text-align:center">${PARTS.map(p => `<button class="tg ${t.avail[d][p] ? 'on' : ''}" data-a="tavail" data-t="${t.id}" data-d="${d}" data-p="${p}" title="${DAYNAMES[d]} ${PARTNAME[p].toLowerCase()}">${p.toUpperCase()}</button>`).join(' ')}</td>`).join('')}<td><button class="small danger" data-a="delteacher" data-t="${t.id}">Verwijder</button></td></tr>`;
    h += `</tbody></table></div>`;
  } else h += `<p class="muted">Nog geen docenten.</p>`;
  h += `<div class="row" style="margin-top:14px;align-items:flex-end"><label>Namen toevoegen (één per regel of gescheiden door komma's)<textarea id="newT" rows="3" style="width:340px" placeholder="Anna&#10;Bram&#10;Chris"></textarea></label><button class="pri" data-a="addteachers">Toevoegen</button><button data-a="pickfile" data-v="xlsx">Importeer uit Excel/CSV…</button></div></section>`;
  return h;
}
function viewClasses() {
  let h = '';
  for (const y of [1, 2, 3]) {
    const cl = S.classes.filter(c => c.year === y).sort(cmpClass);
    h += `<section class="card"><div class="card-h"><h2>Jaar ${y}</h2><span class="muted">${y === 1 ? 'Gedeelde basis, nog geen profielen.' : 'Profielen: WEB, GD, XR.'}</span></div>`;
    if (cl.length) {
      h += `<div class="scroll"><table class="docs"><thead><tr><th>Klas</th>${y > 1 ? '<th>Profiel</th>' : ''}<th></th></tr></thead><tbody>`;
      for (const c of cl) h += `<tr><td><input data-c="cname" data-cl="${c.id}" value="${esc(c.name)}" style="width:140px"></td>${y > 1 ? `<td><select data-c="cprof" data-cl="${c.id}">${PROFILES.map(p => `<option ${c.profile === p ? 'selected' : ''}>${p}</option>`).join('')}</select></td>` : ''}<td><button class="small danger" data-a="delclass" data-cl="${c.id}">Verwijder</button></td></tr>`;
      h += `</tbody></table></div>`;
    } else h += `<p class="muted">Nog geen klassen in dit jaar.</p>`;
    h += `<div class="row" style="margin-top:12px;align-items:flex-end"><label>Klassen toevoegen<textarea id="newC${y}" rows="2" style="width:260px" placeholder="${y === 1 ? '1A&#10;1B' : '2A&#10;2B'}"></textarea></label>${y > 1 ? `<label>Profiel<select id="newCP${y}">${PROFILES.map(p => `<option>${p}</option>`).join('')}</select></label>` : ''}<button class="pri" data-a="addclasses" data-y="${y}">Toevoegen</button></div></section>`;
  }
  return h;
}
function viewShare() {
  return `<div class="grid3">
  <section class="card"><h2>Opslaan & delen</h2><p class="muted">Alles staat in deze browser. Wil je het met collega's delen of een back-up maken, exporteer dan een JSON-bestand; collega's kunnen dat hier importeren en aanpassen.</p>
  <div class="row"><button class="pri" data-a="exportjson">Alles exporteren (JSON)</button><button data-a="pickfile" data-v="json">JSON importeren…</button></div><p class="muted">Importeren vervangt alles wat je nu hebt.</p></section>
  <section class="card"><h2>Excel</h2><p class="muted">Export van de huidige week in kleur: weekoverzicht per klas, bezetting per docent, plus rooster (tekst), structuur, docenten en klassen. Importeren leest docenten (en klassen als er een tabblad Klassen is) uit Excel of CSV.</p>
  <div class="row"><button class="pri" data-a="exportxlsx">Week exporteren (.xlsx)</button><button data-a="pickfile" data-v="xlsx">Docenten/klassen importeren…</button></div></section>
  <section class="card"><h2>PDF</h2><p class="muted">Opent het printvenster met het weekoverzicht per klas in liggend formaat. Kies daar “Opslaan als PDF”.</p><div class="row"><button class="pri" data-a="printover">Overzicht printen / PDF</button></div></section>
  <section class="card"><h2>Voorbeelddata & wissen</h2><p class="muted">Voorbeelddata laat zien hoe het werkt met verzonnen namen. Vervangt alles.</p><div class="row"><button data-a="demo">Voorbeelddata laden</button><button class="danger" data-a="reset">Alles wissen</button></div></section></div>`;
}

/* ---------- modals ---------- */
function renderModal() {
  const dlg = $('#dlg'), m = ui.modal;
  if (!m) { renderModal.key = null; if (dlg.open) dlg.close(); return; }
  const key = [m.t, m.cl, m.d, m.p, m.tid].join('|'), oldBox = dlg.querySelector('.dlg'), keepScroll = renderModal.key === key && oldBox ? oldBox.scrollTop : 0; // scrollstand behouden bij hertekenen
  renderModal.key = key;
  let h = '';
  if (m.t === 'confirm') h = `<h3>Weet je het zeker?</h3><p>${esc(m.msg)}</p><div class="foot"><button data-a="closemodal">Annuleren</button><button class="pri" data-a="okconfirm">${esc(m.okLabel)}</button></div>`;
  else if (m.t === 'cell') {
    const w = curWeek(), c = C(m.cl), parts = m.p === 'dag' ? PARTS : [m.p], g = gk(c);
    const cells = parts.map(p => w.cells[cellKey(m.cl, m.d, p)]), cell = cells[0] || { a: '' };
    const x = w.dt[g][m.d], doorl = x.type === 'onderwijs' && w.mode[g] === 'doorlopend';
    const cur = new Set(); parts.forEach(p => classTeachers(w, c, m.d, p).ids.forEach(i => cur.add(i)));
    const fr = parts.every(p => isFree(w, c, m.d, p)), bu = isBureau(w, c, m.d);
    const rows = S.teachers.map(t => {
      const sts = parts.map(p => teachState(w, t, m.d, p)), bad = sts.find(s => !s.ok);
      const others = parts.flatMap(p => assignments(w, t.id, m.d, p).filter(a => a.cls.id !== c.id));
      const names = [...new Set(others.map(a => a.cls.name))];
      const sel = cur.has(t.id), rank = bad ? 3 : names.length ? 2 : 0;
      let label, cls;
      if (bad) { label = 'niet beschikbaar: ' + (bad.why || ''); cls = 'off'; }
      else if (names.length) { label = 'al ingezet: ' + names.join(', '); cls = 'dbl'; }
      else { label = 'vrij'; cls = 'free'; }
      if (sel && bad) cls = 'bad';
      return { t, sel, label, cls, rank };
    }).sort((a, b) => a.rank - b.rank || (+b.t.tags.includes('AVO')) - (+a.t.tags.includes('AVO')) || cmpName(a.t, b.t)); // AVO-docenten eerst bij gelijke beschikbaarheid
    const F = ui.filter, shown = rows.filter(r => r.sel || ((!F.tags.length || r.t.tags.some(g => F.tags.includes(g))) && (!F.free || r.rank === 0)));
    h = `<h3>${esc(c.name)} · ${DAYNAMES[m.d]}${m.p === 'dag' ? '' : ' ' + PARTNAME[m.p].toLowerCase()}</h3><div class="muted">${x.type === 'excursie' ? '🚌 ' + esc(x.label || 'Excursie') + ' — kies de begeleiders' : bu ? 'Bureau (hele dag, loopt door): zet er de docenten bij die deze dag op deze klas staan' : doorl ? 'Rooster loopt door: kies alleen als er iemand op deze klas staat die dag (hele dag)' : (PARTTIME[m.p] || '')}</div>
    ${c.year === 3 ? `<div class="row" style="margin:12px 0 0"><label class="radio" style="flex-direction:row;color:var(--ink);font-size:14.5px;padding:0"><input type="checkbox" data-c="cellBureau" ${bu ? 'checked' : ''}><span><b>Bureau</b> <span class="muted">(hele dag, loopt door met de vaste docenten)</span></span></label></div>` : ''}
    ${bu ? '' : `<div class="row" style="margin:12px 0 4px;align-items:center"><label class="radio" style="flex-direction:row;color:var(--ink);font-size:14.5px;padding:0"><input type="checkbox" data-c="cellFree" ${fr ? 'checked' : ''}><span><b>Klas heeft vrij</b> <span class="muted">(zit al zo in het normale rooster)</span></span></label>${m.p !== 'dag' ? `<select data-c="cellFreeScope"><option value="dagdeel" ${m.fscope !== 'dag' ? 'selected' : ''}>dit dagdeel</option><option value="dag" ${m.fscope === 'dag' ? 'selected' : ''}>hele dag</option></select>` : ''}</div>`}
    ${fr && !bu ? '<p class="muted">Geen inzet nodig. Eerder gekoppelde docenten blijven bewaard als je dit weer uitzet.</p><div class="foot"><button class="pri" data-a="closemodal">Klaar</button></div>' : `<label style="margin:8px 0">Activiteit / moduleleider (optioneel)<input data-c="cellA" value="${esc(cell.a || '')}" placeholder="bijv. oplevering module 5.2, leider: …"></label>
    <div class="chips" style="margin:4px 0 6px"><span class="lbl">Filter</span>${TAGS.map(g => `<span class="chip ${F.tags.includes(g) ? 'on' : ''}" data-a="ftag" data-v="${g}">${g}</span>`).join('')}<span class="chip ${F.free ? 'on' : ''}" data-a="ffree">Alleen nog inzetbaar</span>${shown.length < rows.length ? `<span class="muted">${shown.length} van ${rows.length}</span>` : ''}</div>
    <div>${shown.map(r => `<label class="tl ${r.cls}" style="flex-direction:row;font-size:14.5px;color:var(--ink)"><input type="checkbox" data-c="cellT" data-id="${r.t.id}" ${r.sel ? 'checked' : ''}> ${esc(r.t.name)}${tagBadges(r.t)}<span class="st">${esc(r.label)}</span></label>`).join('') || '<p class="muted">Geen docenten voor dit filter.</p>'}</div>
    <div class="foot"><button class="pri" data-a="closemodal">Klaar</button></div>`}`;
  } else if (m.t === 'ovr') {
    const w = curWeek(), t = T(m.tid), s = slot(w, t, m.d, m.p);
    h = `<h3>${esc(t.name)} · ${DAYNAMES[m.d]} ${PARTNAME[m.p].toLowerCase()}</h3><div class="muted">Vaste patroon: ${t.avail[m.d][m.p] ? 'inzetbaar' : 'niet inzetbaar'}${s.as.length ? ' · nu bij ' + s.as.map(a => a.cls.name).join(', ') : ''}</div>
    <div style="margin-top:10px">
    ${[['std', 'Volgens vast patroon'], ['nee', 'Niet beschikbaar deze week'], ['ja', 'Extra beschikbaar deze week']].map(([v, l]) => `<label class="radio" style="flex-direction:row;color:var(--ink);font-size:14.5px"><input type="radio" name="ovs" data-c="ovrS" value="${v}" ${m.s === v ? 'checked' : ''}> ${l}</label>`).join('')}
    ${m.s === 'nee' ? `<div class="row"><label>Reden<select data-c="ovrR">${REDENEN.map(r => `<option ${m.r === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label><label style="flex:1">Toelichting<input data-c="ovrN" value="${esc(m.n || '')}"></label></div>` : ''}
    ${m.dbl ? `<label class="radio" style="flex-direction:row;color:var(--ink);font-size:14.5px"><input type="checkbox" data-c="ovrBw" ${m.bw ? 'checked' : ''}><span><b>Dubbele inzet is bewust</b> (${esc(m.dbl)})<br><span class="muted">Geen waarschuwing meer voor dit dagdeel.</span></span></label>` : ''}
    <label class="radio" style="flex-direction:row;color:var(--ink);font-size:14px"><span class="muted">Geldt voor:</span><select data-c="ovrScope"><option value="dagdeel" ${m.scope === 'dagdeel' ? 'selected' : ''}>dit dagdeel</option><option value="dag" ${m.scope === 'dag' ? 'selected' : ''}>hele dag</option></select></label></div>
    <p class="muted">Tip: wie op vrijdag (voor/nazorg) normaal vrij is, geef je op een andere dag compensatie vrij.</p>
    <div class="foot"><button data-a="closemodal">Annuleren</button><button class="pri" data-a="saveovr">Opslaan</button></div>`;
  }
  dlg.innerHTML = `<div class="dlg"><button class="x" data-a="closemodal" aria-label="Sluiten" title="Sluiten">×</button>${h}</div>`;
  if (!dlg.open) dlg.showModal();
  const nb = dlg.querySelector('.dlg'); if (nb) nb.scrollTop = keepScroll;
}

/* ---------- acties ---------- */
function changed() { save(); render(); }
// na een tekstveld-wijziging pas iets later hertekenen, zodat een klik op een knop niet verloren gaat
function later() { clearTimeout(later.h); later.h = setTimeout(render, 300); }
function ensureCell(w, k) { return w.cells[k] || (w.cells[k] = { t: [], a: '' }); }
function parseNames(s) { return String(s || '').split(/[\n,;]+/).map(x => x.trim()).filter(Boolean); }

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  if (el.tagName === 'A') e.preventDefault();
  const D = el.dataset, w = curWeek();
  switch (D.a) {
    case 'tab': ui.tab = D.v; render(); window.scrollTo(0, 0); break;
    case 'newweek': { const n = newWeek('Nieuwe ontwikkelweek'); S.weeks.push(n); S.cur = n.id; if (ui.tab !== 'week' && ui.tab !== 'bezetting') ui.tab = 'week'; changed(); toast('Nieuwe week aangemaakt. Geef hem een naam.'); break; }
    case 'dupweek': { const n = JSON.parse(JSON.stringify(w)); n.id = uid(); n.label = w.label + ' (kopie)'; n.start = ''; n.steps = {}; n.desc = {}; S.weeks.push(n); S.cur = n.id; changed(); toast('Week gekopieerd, inclusief inzet.'); break; }
    case 'delweek': confirmDlg(`Week “${w.label}” definitief verwijderen?`, () => { S.weeks = S.weeks.filter(x => x.id !== w.id); S.cur = S.weeks[0] ? S.weeks[0].id : null; ui.modal = null; changed(); }, 'Verwijderen'); break;
    case 'mode': w.mode[D.g] = D.v; changed(); break;
    case 'modeall': GROUPS.forEach(g => { w.mode[g] = D.v; }); changed(); break;
    case 'togglecls': w.hidden[D.id] = !w.hidden[D.id]; changed(); break;
    case 'allcls': S.classes.forEach(c => { w.hidden[c.id] = D.v === '0'; }); changed(); break;
    case 'toggleprof': { const cl = S.classes.filter(c => c.profile === D.v); const anyVis = cl.some(c => !w.hidden[c.id]); cl.forEach(c => { w.hidden[c.id] = anyVis; }); changed(); break; }
    case 'opencell': ui.modal = { t: 'cell', cl: D.cl, d: D.d, p: D.p }; render(); break;
    case 'openovr': { const o = w.ovr[`${D.t}|${D.d}|${D.p}`], as = assignments(w, D.t, D.d, D.p); ui.modal = { t: 'ovr', tid: D.t, d: D.d, p: D.p, s: o ? o.s : 'std', r: o ? o.r : REDENEN[0], n: o ? o.n : '', scope: 'dagdeel', dbl: as.length > 1 ? as.map(a => a.cls.name).join(' en ') : '', bw: !!w.okdbl[`${D.t}|${D.d}|${D.p}`] }; render(); break; }
    case 'saveovr': {
      const m = ui.modal, parts = m.scope === 'dag' ? PARTS : [m.p];
      parts.forEach(p => {
        const k = `${m.tid}|${m.d}|${p}`; if (m.s === 'std') delete w.ovr[k]; else w.ovr[k] = { s: m.s, r: m.s === 'nee' ? m.r : '', n: m.s === 'nee' ? m.n : '' };
        if (m.dbl) { if (m.bw && assignments(w, m.tid, m.d, p).length > 1) w.okdbl[k] = true; else delete w.okdbl[k]; }
      });
      ui.modal = null; changed(); break;
    }
    case 'closemodal': ui.modal = null; render(); break;
    case 'okconfirm': { const f = ui.modal.onOk; ui.modal = null; render(); f(); break; }
    case 'ttag': { const t = T(D.t); t.tags = t.tags.includes(D.v) ? t.tags.filter(g => g !== D.v) : TAGS.filter(g => g === D.v || t.tags.includes(g)); changed(); break; }
    case 'ftag': ui.filter.tags = ui.filter.tags.includes(D.v) ? ui.filter.tags.filter(g => g !== D.v) : [...ui.filter.tags, D.v]; render(); break;
    case 'ffree': ui.filter.free = !ui.filter.free; render(); break;
    case 'tavail': { const t = T(D.t); t.avail[D.d][D.p] = !t.avail[D.d][D.p]; changed(); break; }
    case 'delteacher': { const t = T(D.t); confirmDlg(`${t.name} verwijderen? De docent verdwijnt ook uit alle weken.`, () => { S.teachers = S.teachers.filter(x => x.id !== t.id); S.weeks.forEach(wk => { Object.values(wk.cells).forEach(c => { c.t = c.t.filter(i => i !== t.id); }); Object.keys(wk.ovr).forEach(k => { if (k.startsWith(t.id + '|')) delete wk.ovr[k]; }); Object.keys(wk.okdbl).forEach(k => { if (k.startsWith(t.id + '|')) delete wk.okdbl[k]; }); }); ui.modal = null; changed(); }, 'Verwijderen'); break; }
    case 'addteachers': { const names = parseNames($('#newT').value); let n = 0; names.forEach(nm => { if (!S.teachers.some(t => t.name.toLowerCase() === nm.toLowerCase())) { S.teachers.push(newTeacher(nm)); n++; } }); changed(); toast(n ? `${n} docent(en) toegevoegd.` : 'Niets toegevoegd (bestaat al of leeg).'); break; }
    case 'addclasses': { const y = +D.y, prof = $('#newCP' + y) ? $('#newCP' + y).value : null; let n = 0; parseNames($('#newC' + y).value).forEach(nm => { if (!S.classes.some(c => c.year === y && c.name.toLowerCase() === nm.toLowerCase())) { S.classes.push(newClass(nm, y, prof)); n++; } }); changed(); toast(n ? `${n} klas(sen) toegevoegd.` : 'Niets toegevoegd.'); break; }
    case 'delclass': { const c = C(D.cl); confirmDlg(`Klas ${c.name} verwijderen? Inzet in alle weken verdwijnt mee.`, () => { S.classes = S.classes.filter(x => x.id !== c.id); S.weeks.forEach(wk => { Object.keys(wk.cells).forEach(k => { if (k.startsWith(c.id + '|')) delete wk.cells[k]; }); delete wk.hidden[c.id]; }); ui.modal = null; changed(); }, 'Verwijderen'); break; }
    case 'print': window.print(); break;
    case 'printover': ui.tab = 'overzicht'; render(); setTimeout(() => window.print(), 150); break;
    case 'exportjson': download(`ontwikkelweek-planner-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' })); break;
    case 'exportxlsx': exportXlsx(); break;
    case 'pickfile': { const f = $('#file'); f.dataset.kind = D.v; f.accept = D.v === 'json' ? '.json,application/json' : '.xlsx,.csv,.tsv,.txt'; f.value = ''; f.click(); break; }
    case 'demo': confirmDlg('De voorbeelddata vervangt alles wat je nu hebt. Doorgaan?', () => { S = normalize(demoData()); ui.tab = 'week'; ui.modal = null; changed(); toast('Voorbeelddata geladen.'); }, 'Laden'); break;
    case 'reset': confirmDlg('Alle docenten, klassen en weken wissen? Exporteer eerst een back-up als je twijfelt.', () => { S = normalize(fresh()); ui.modal = null; changed(); toast('Alles gewist.'); }, 'Alles wissen'); break;
  }
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-c]'); if (!el) return;
  const D = el.dataset, w = curWeek(), m = ui.modal, v = el.value;
  switch (D.c) {
    case 'wsel': S.cur = v; changed(); break;
    case 'step': if (el.checked) w.steps[D.n] = true; else delete w.steps[D.n]; changed(); break;
    case 'wlabel': w.label = v; save(); later(); break;
    case 'gdesc': w.desc[D.g] = v; save(); later(); break;
    case 'wstart': w.start = v; changed(); break;
    case 'dtype': w.dt[D.g][D.d].type = v; changed(); break;
    case 'dtypeall': if (v) { GROUPS.forEach(g => { w.dt[g][D.d].type = v; }); changed(); } break;
    case 'dlabel': w.dt[D.g][D.d].label = v; save(); later(); break;
    case 'tname': { const t = T(D.t); if (v.trim()) t.name = v.trim(); save(); later(); break; }
    case 'cname': { const c = C(D.cl); if (v.trim()) c.name = v.trim(); save(); later(); break; }
    case 'cprof': C(D.cl).profile = v; changed(); break;
    case 'cellBureau': { const k = m.cl + '|' + m.d; if (el.checked) w.bureau[k] = true; else delete w.bureau[k]; save(); render(); break; }
    case 'cellFreeScope': m.fscope = v; break;
    case 'cellFree': (m.p === 'dag' || m.fscope === 'dag' ? PARTS : [m.p]).forEach(p => { const cell = ensureCell(w, cellKey(m.cl, m.d, p)); if (el.checked) cell.free = true; else delete cell.free; }); save(); render(); break;
    case 'cellT': {
      const parts = m.p === 'dag' ? PARTS : [m.p], c = C(m.cl), cur = new Set();
      parts.forEach(p => classTeachers(w, c, m.d, p).ids.forEach(i => cur.add(i)));
      if (el.checked) cur.add(D.id); else cur.delete(D.id);
      parts.forEach(p => { const cell = ensureCell(w, cellKey(m.cl, m.d, p)); cell.t = [...cur]; });
      save(); render(); break;
    }
    case 'cellA': (m.p === 'dag' ? PARTS : [m.p]).forEach(p => { ensureCell(w, cellKey(m.cl, m.d, p)).a = v; }); save(); later(); break;
    case 'ovrS': m.s = v; renderModal(); break;
    case 'ovrR': m.r = v; break;
    case 'ovrN': m.n = v; break;
    case 'ovrBw': m.bw = el.checked; break;
    case 'ovrScope': m.scope = v; break;
  }
});
$('#dlg').addEventListener('click', e => { if (e.target === e.currentTarget) { ui.modal = null; render(); } }); // klik naast het venster sluit
$('#dlg').addEventListener('close', () => { if (ui.modal) { ui.modal = null; render(); } });
$('#file').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return; const kind = e.target.dataset.kind;
  try {
    if (kind === 'json') {
      const data = JSON.parse(await f.text());
      if (!data || !Array.isArray(data.teachers) || !Array.isArray(data.classes) || !Array.isArray(data.weeks)) throw new Error('Dit lijkt geen planner-export.');
      confirmDlg(`Importeren vervangt alles: ${data.teachers.length} docenten, ${data.classes.length} klassen, ${data.weeks.length} week/weken. Doorgaan?`, () => { S = normalize(data); ui.modal = null; changed(); toast('Geïmporteerd.'); }, 'Importeren');
    } else {
      let sheets;
      if (/\.xlsx$/i.test(f.name)) sheets = await XL.read(await f.arrayBuffer());
      else sheets = [{ name: 'Docenten', rows: XL.parseCsv(await f.text()) }];
      const msg = importSheets(sheets); changed(); toast(msg);
    }
  } catch (err) { toast('Importeren mislukt: ' + err.message); }
});

/* ---------- Excel import/export ---------- */
const parseAv = v => {
  v = String(v ?? '').toLowerCase().trim();
  if (!v || v === 'nee' || v === '-') return { o: false, m: false };
  if (/^(ja|x|1|hele|dag|true|om)$/.test(v)) return { o: true, m: true };
  return { o: /o/.test(v), m: /m/.test(v) };
};
const avStr = a => (a.o && a.m) ? 'om' : a.o ? 'o' : a.m ? 'm' : '';
function importSheets(sheets) {
  const pick = n => sheets.find(s => s.name.toLowerCase() === n);
  const ts = pick('docenten') || sheets[0], ks = pick('klassen');
  let nt = 0, nc = 0;
  if (ts && ts.rows.length) {
    const head = (ts.rows[0] || []).map(x => String(x ?? '').toLowerCase().trim());
    const ni = head.findIndex(x => ['naam', 'docent', 'name'].includes(x)), hasHead = ni >= 0 || head.some(x => DAYS.includes(x.slice(0, 2)));
    const nameCol = ni >= 0 ? ni : 0;
    const avoCol = head.indexOf('avo'), tagCol = head.findIndex(x => ['tags', 'richting', 'richtingen'].includes(x));
    const dayCol = {}; DAYS.forEach(d => { const i = head.findIndex(x => x.startsWith(d)); if (i >= 0 && i !== nameCol) dayCol[d] = i; });
    for (const r of ts.rows.slice(hasHead ? 1 : 0)) {
      const nm = String(r[nameCol] ?? '').trim(); if (!nm) continue;
      let t = S.teachers.find(x => x.name.toLowerCase() === nm.toLowerCase());
      if (!t) { t = newTeacher(nm); S.teachers.push(t); nt++; }
      else if (!Object.keys(dayCol).length && avoCol < 0 && tagCol < 0) continue;
      DAYS.forEach(d => { if (dayCol[d] !== undefined) t.avail[d] = parseAv(r[dayCol[d]]); });
      if (tagCol >= 0) t.tags = String(r[tagCol] ?? '').split(/[\s,;]+/).map(x => TAGS.find(g => g.toLowerCase() === x.toLowerCase())).filter(Boolean);
      else if (avoCol >= 0) { const on = /^(ja|x|1|true)$/i.test(String(r[avoCol] ?? '').trim()); t.tags = on ? [...new Set([...t.tags, 'AVO'])] : t.tags.filter(g => g !== 'AVO'); }
    }
  }
  if (ks && ks.rows.length) {
    const head = ks.rows[0].map(x => String(x ?? '').toLowerCase().trim());
    const ci = n => head.findIndex(x => x.startsWith(n));
    const iN = Math.max(0, ci('naam')), iY = ci('jaar'), iP = ci('profiel');
    for (const r of ks.rows.slice(1)) {
      const nm = String(r[iN] ?? '').trim(); const y = iY >= 0 ? parseInt(r[iY]) : NaN; if (!nm || ![1, 2, 3].includes(y)) continue;
      let c = S.classes.find(x => x.year === y && x.name.toLowerCase() === nm.toLowerCase());
      if (!c) { const p = String(r[iP] ?? '').toUpperCase(); c = newClass(nm, y, PROFILES.includes(p) ? p : 'WEB'); S.classes.push(c); nc++; }
    }
  }
  return `Geïmporteerd: ${nt} nieuwe docent(en), ${nc} nieuwe klas(sen).`;
}
function exportXlsx() {
  const w = curWeek(); if (!w) { toast('Maak eerst een week aan.'); return; }
  const hdr = ['', ...DAYS.flatMap(d => PARTS.map(p => `${DAYNAMES[d]} ${PARTNAME[p].toLowerCase()}${dateOf(w, d) ? ' (' + dateOf(w, d) + ')' : ''}`))];
  const lvlStyle = { in: 'les', dbl: 'dbl', bad: 'bad', off: 'off', free: 'free' };
  const occ = [[{ v: 'Docent', s: 'head' }, ...hdr.slice(1).map(v => ({ v, s: 'head' })), { v: 'Ingezet', s: 'head' }], ...[...S.teachers].sort(cmpName).map(t => {
    let used = 0;
    const cells = DAYS.flatMap(d => PARTS.map(p => { const s = slot(w, t, d, p); if (s.as.length) used++; const txt = s.level === 'off' ? 'n.b. ' + (s.st.why || '') : !s.as.length ? '' : (s.level === 'bad' ? '! ' : s.level === 'dbl' ? 'DUBBEL: ' : s.bewust ? 'Bewust dubbel: ' : '') + s.as.map(a => (a.exc ? 'Excursie ' : '') + a.cls.name).join(', '); return { v: txt, s: lvlStyle[s.level] }; }));
    return [{ v: t.name + ((t.tags || []).length ? ' (' + t.tags.join(', ') + ')' : ''), s: 'name' }, ...cells, { v: used, s: 'free' }];
  })];
  const ros = [['Klas', ...hdr.slice(1)], ...S.classes.filter(c => !w.hidden[c.id]).sort(cmpClass).map(c => [c.name + (c.year > 1 ? ' ' + c.profile : ''), ...DAYS.flatMap(d => PARTS.map(p => {
    const x = w.dt[gk(c)][d]; if (x.type === 'studiedag' || x.type === 'voornazorg') return TYPES[x.type];
    if (isBureau(w, c, d)) { const bn = classTeachers(w, c, d, p).ids.map(id => T(id).name).join(', '); return 'Bureau' + (bn ? ' — ' + bn : ' (loopt door)'); }
    if (isFree(w, c, d, p)) return 'Vrij';
    const ct = classTeachers(w, c, d, p), cell = w.cells[cellKey(c.id, d, p)];
    const base = ct.ids.map(id => T(id).name).join(', ');
    if (x.type === 'excursie') return 'Excursie' + (x.label ? ': ' + x.label : '') + (base ? ' — ' + base : '');
    if (w.mode[gk(c)] === 'doorlopend') return 'Rooster loopt door' + (base ? ' — ' + base : '');
    return base + (cell && cell.a ? (base ? ' — ' : '') + cell.a : '');
  }))])];
  const struct = [['Groep', 'Rooster', ...DAYS.map(d => DAYNAMES[d]), 'Inhoud van de week'], ...GROUPS.map(g => [gLabel(g), w.mode[g] === 'doorlopend' ? 'Rooster loopt door' : 'Aangepast rooster', ...DAYS.map(d => TYPES[w.dt[g][d].type] + (w.dt[g][d].label ? ': ' + w.dt[g][d].label : '')), w.desc[g] || '']),
  [], ['Aangepast rooster', `ochtend ${PARTTIME.o}`, 'pauze 12:15–12:45', `middag ${PARTTIME.m}`]];
  const docs = [['Naam', ...DAYS, 'Tags'], ...[...S.teachers].sort(cmpName).map(t => [t.name, ...DAYS.map(d => avStr(t.avail[d])), t.tags.join(', ')])];
  const kl = [['Naam', 'Jaar', 'Profiel'], ...[...S.classes].sort(cmpClass).map(c => [c.name, c.year, c.year > 1 ? c.profile : 'gedeeld'])];
  const wc = [24, ...Array(10).fill(22), 9];
  const bytes = XL.write([
    overviewSheet(w),
    { name: 'Bezetting docenten', rows: occ, widths: [26, ...Array(10).fill(15), 9], headerRows: 0, landscape: true }, { name: 'Rooster per klas', rows: ros, widths: wc },
    { name: 'Structuur', rows: struct, widths: [18, 22, 18, 18, 18, 18, 18, 60] },
    { name: 'Docenten', rows: docs, widths: [26, 8, 8, 8, 8, 8, 8] }, { name: 'Klassen', rows: kl, widths: [18, 8, 12] }]);
  download(`ontwikkelweek-${slug(w.label)}.xlsx`, new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

/* ---------- demo ---------- */
function demoData() {
  const s = fresh();
  const names = ['Anna', 'Bram', 'Chris', 'Daan', 'Eva', 'Femke', 'Gijs', 'Hanna', 'Ilse', 'Joost'];
  s.teachers = names.map(newTeacher);
  const t = n => s.teachers.find(x => x.name === n);
  [['Hanna', ['AVO']], ['Ilse', ['AVO', 'WEB']], ['Daan', ['GD']], ['Femke', ['GD', 'XR']], ['Gijs', ['XR']], ['Anna', ['WEB', 'AI']], ['Bram', ['WEB']], ['Chris', ['AI']]].forEach(([n, g]) => { t(n).tags = g; });
  t('Chris').avail.vr = { o: false, m: false }; t('Eva').avail.vr = { o: false, m: false }; t('Eva').avail.wo = { o: false, m: false }; t('Joost').avail.di = { o: false, m: false }; t('Joost').avail.wo = { o: true, m: false };
  const cl = [['1A', 1], ['1B', 1], ['2A', 2, 'WEB'], ['2B', 2, 'GD'], ['2C', 2, 'XR'], ['3A', 3, 'WEB'], ['3B', 3, 'GD'], ['3C', 3, 'XR']];
  s.classes = cl.map(([n, y, p]) => newClass(n, y, p));
  const c = n => s.classes.find(x => x.name === n);
  const w = newWeek('Demo: ontwikkelweek periode 5'); w.mode['2-GD'] = 'doorlopend'; w.mode['2-XR'] = 'doorlopend';
  w.dt['3-WEB'].wo = { type: 'excursie', label: 'Museumbezoek' };
  const put = (cn, d, p, ids, a) => { w.cells[cellKey(c(cn).id, d, p)] = { t: ids.map(n => t(n).id), a: a || '' }; };
  put('1A', 'di', 'o', ['Anna', 'Bram']); put('1A', 'di', 'm', ['Anna']); put('1B', 'di', 'o', ['Bram'], 'Zelftest + SMART-leerdoel');
  put('1B', 'di', 'm', ['Hanna']); put('1A', 'wo', 'o', ['Hanna']);
  put('3A', 'wo', 'o', ['Ilse', 'Eva'], 'Museumbezoek begeleiden'); put('3A', 'wo', 'm', ['Ilse']); put('3B', 'wo', 'o', ['Ilse']);
  // doorlopend rooster: per dag wie erop staat
  ['o', 'm'].forEach(p => { ['di', 'do'].forEach(d => { w.cells[cellKey(c('2B').id, d, p)] = { t: [t('Daan').id, t('Femke').id], a: '' }; }); w.cells[cellKey(c('2B').id, 'wo', p)] = { t: [t('Anna').id], a: '' }; ['di', 'wo', 'do'].forEach(d => { w.cells[cellKey(c('2C').id, d, p)] = { t: [t('Gijs').id], a: '' }; }); });
  w.ovr[`${t('Anna').id}|do|o`] = { s: 'nee', r: 'Cursus', n: 'Scrumcursus' };
  s.weeks = [w]; s.cur = w.id;
  return s;
}

/* ---------- init ---------- */
S = normalize(load() || fresh());
render();
