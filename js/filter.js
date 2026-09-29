/* 建案篩選：漏斗按鈕往右側展開條件列（外觀沿用牙科系統待辦清單的篩選）
 * 同一條件內多選＝符合其一；不同條件之間＝全部符合；「周邊」多選＝全部都要有
 * 依賴：window.TC.projects、window.TC.nearby、window.TCProjects
 */
(function () {
  const D = window.TC.projects;
  const NB = (window.TC.nearby || { data: {} }).data;
  const TP = window.TCProjects;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const tierShort = t => (t || '').split(' ')[0];
  const builderOf = p => D.builders.find(b => b.brand === p.brand);
  const num = s => { const m = String(s || '').match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };

  // 房型：「3房37~46坪、4房48~53坪」「3~6房」→ 含有的房數
  function roomsOf(p) {
    const out = new Set();
    String(p.rooms || '').replace(/(\d)(?:\s*[~～-]\s*(\d))?\s*房/g, (m, a, b) => {
      for (let i = +a; i <= +(b || a); i++) out.add(i);
    });
    return out;
  }
  const schoolsOf = p => [p.elem, p.junior].join('／').split(/[／、,，]/)
    .map(s => s.replace(/（.*?）|\(.*?\)|推定/g, '').trim()).filter(s => s && !/^待/.test(s));

  // ---------- 條件定義 ----------
  const priceBucket = v => v == null ? 'none' : v < 45 ? 'a' : v < 55 ? 'b' : v < 65 ? 'c' : v < 75 ? 'd' : 'e';
  const ageBucket = p => p.cat !== '成屋' ? p.cat : (p.ageNum == null || p.ageNum < 5) ? '0-5' : p.ageNum < 10 ? '5-10' : p.ageNum < 20 ? '10-20' : '20+';
  const prBucket = p => { const v = num(p.publicRatio); return v == null ? 'none' : v <= 32 ? 'a' : v <= 34 ? 'b' : v <= 36 ? 'c' : 'd'; };
  const unitBucket = p => p.units == null ? 'none' : p.units < 100 ? 'a' : p.units < 200 ? 'b' : 'c';
  const walk = (p, c) => NB[p.id] && NB[p.id].walk[c] && NB[p.id].walk[c].count > 0;
  const drive = (p, c, m) => NB[p.id] && NB[p.id].drive[c] && NB[p.id].drive[c].min != null && NB[p.id].drive[c].min <= m;
  const NEAR = {
    mrt: ['步行 500m 有捷運站', p => walk(p, 'mrt')], park: ['步行 500m 有公園', p => walk(p, 'park')],
    market: ['步行 500m 有市場', p => walk(p, 'market')], clinic: ['步行 500m 有診所', p => walk(p, 'clinic')],
    ic: ['開車 10 分內到交流道', p => drive(p, 'ic', 10)], mall: ['開車 10 分內到百貨', p => drive(p, 'mall', 10)],
    hospital: ['開車 10 分內到醫院', p => drive(p, 'hospital', 10)],
  };
  const count = (vals) => { const m = {}; vals.forEach(v => { m[v] = (m[v] || 0) + 1; }); return m; };

  const FILTERS = [
    { k: 'cat', label: '類別', opts: () => ['預售', '興建中', '成屋'].map(v => [v, v]), val: p => [p.cat] },
    { k: 'dist', label: '行政區', opts: () => [...new Set(D.projects.map(p => p.district))].sort().map(v => [v, v]), val: p => [p.district] },
    { k: 'tier', label: '建商分級', opts: () => ['T1', 'T2', 'T2~T3', 'T3~T4', 'T4'].map(v => [v, v]),
      val: p => { const b = builderOf(p); return b ? [tierShort(b.tier)] : []; } },
    { k: 'brand', label: '建商', search: true,
      opts: () => [...new Set(D.projects.map(p => p.brand))].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
        .map(v => { const b = D.builders.find(x => x.brand === v); return [v, v + (b ? `（${tierShort(b.tier)}）` : '')]; }),
      val: p => [p.brand] },
    { k: 'total', label: '總價', opts: () => [['a', '2,000 萬以下'], ['b', '2,000～2,500 萬'], ['c', '2,500～3,000 萬'], ['d', '3,000～3,500 萬'],
        ['e', '3,500～4,000 萬'], ['f', '4,000 萬以上'], ['none', '總價待查']],
      // 建案總價是一段範圍，跟哪個區間有重疊就算符合
      val: p => {
        const t = TP.totalInfo(p);
        if (!t) return ['none'];
        const edges = [['a', 0, 2000], ['b', 2000, 2500], ['c', 2500, 3000], ['d', 3000, 3500], ['e', 3500, 4000], ['f', 4000, 1e9]];
        return edges.filter(([, lo, hi]) => t.lo < hi && t.hi >= lo).map(([k]) => k);
      } },
    { k: 'price', label: '每坪價位', opts: () => [['a', '45 萬以下'], ['b', '45～55 萬'], ['c', '55～65 萬'], ['d', '65～75 萬'], ['e', '75 萬以上'], ['none', '價格待查']],
      val: p => [priceBucket(p.price)] },
    { k: 'age', label: '屋齡', opts: () => [['預售', '預售'], ['興建中', '興建中'], ['0-5', '5 年內'], ['5-10', '5～10 年'], ['10-20', '10～20 年'], ['20+', '20 年以上']],
      val: p => [ageBucket(p)] },
    { k: 'rooms', label: '房型', opts: () => [['2', '2 房'], ['3', '3 房'], ['4', '4 房以上']],
      val: p => { const r = roomsOf(p); const o = []; if (r.has(2) || r.has(1)) o.push('2'); if (r.has(3)) o.push('3'); if ([...r].some(x => x >= 4)) o.push('4'); return o; } },
    { k: 'pr', label: '公設比', opts: () => [['a', '32% 以下'], ['b', '32～34%'], ['c', '34～36%'], ['d', '36% 以上'], ['none', '待查']], val: p => [prBucket(p)] },
    { k: 'units', label: '總戶數', opts: () => [['a', '100 戶以下'], ['b', '100～200 戶'], ['c', '200 戶以上'], ['none', '待查']], val: p => [unitBucket(p)] },
    { k: 'school', label: '學區', search: true,
      opts: () => { const c = count(D.projects.flatMap(schoolsOf)); return Object.keys(c).sort((a, b) => c[b] - c[a] || a.localeCompare(b, 'zh-Hant')).map(v => [v, v]); },
      val: p => schoolsOf(p) },
    { k: 'near', label: '周邊', all: true, opts: () => Object.entries(NEAR).map(([v, [l]]) => [v, l]),
      val: p => Object.entries(NEAR).filter(([, [, f]]) => f(p)).map(([v]) => v) },
    { k: 'mark', label: '我的標記', opts: () => [['fav', '有興趣'], ['seen', '已看過'], ['none', '未標記']],
      val: p => [TP.markOf(p.id) || 'none'] },
    { k: 'sale', label: '591 在售', opts: () => [['yes', '有在售']], val: p => p.onSale > 0 ? ['yes'] : [] },
  ];

  // ---------- 狀態（存在瀏覽器） ----------
  const KEY = 'tc-filter-v1';
  let st = { q: '', sel: {} };
  try { st = Object.assign(st, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* 沿用預設 */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 存不了只影響重開後 */ } };
  const selOf = k => st.sel[k] || [];
  const active = () => !!st.q.trim() || FILTERS.some(f => selOf(f.k).length);

  function pass(p, skipKey) {
    const q = st.q.trim();
    if (q && ![p.name, p.brand, p.company, p.address, p.zone, p.district, p.elem, p.junior].join(' ').toLowerCase().includes(q.toLowerCase())) return false;
    return FILTERS.every(f => {
      if (f.k === skipKey) return true;
      const s = selOf(f.k);
      if (!s.length) return true;
      const v = f.val(p);
      return f.all ? s.every(x => v.includes(x)) : s.some(x => v.includes(x));
    });
  }

  // ---------- 畫面 ----------
  const FUNNEL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/></svg>';
  const bar = document.createElement('div');
  bar.id = 'fbar';
  bar.innerHTML = `<button type="button" class="f-btn" aria-label="篩選建案" title="篩選建案">${FUNNEL}</button>
    <div class="f-opts">
      <label class="f-q"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
        <input type="search" placeholder="搜尋案名、建商、路名" autocomplete="off"></label>
      ${FILTERS.map(f => `<button type="button" class="f-chip" data-k="${f.k}"></button>`).join('')}
      <span class="f-result"></span>
    </div>`;
  document.body.appendChild(bar);
  const pop = document.createElement('div');
  pop.id = 'fpop';
  pop.hidden = true;
  document.body.appendChild(pop);

  const opts = bar.querySelector('.f-opts');
  [...opts.children].forEach((el, i) => { el.style.setProperty('--d', (Math.min(i, 12) * 0.03) + 's'); });
  const qIn = bar.querySelector('.f-q input');
  qIn.value = st.q;

  function chipText(f) {
    const s = selOf(f.k);
    if (!s.length) return `${f.label}<i class="car"></i>`;
    const labels = Object.fromEntries(f.opts());
    const names = s.map(v => labels[v] || v);
    const shown = names.length <= 2 ? names.join('、') : `${names[0]} 等 ${names.length} 項`;
    return `${f.label}<b>${esc(shown)}</b><i class="car"></i>`;
  }

  function apply() {
    const ids = active() ? D.projects.filter(p => pass(p)).map(p => p.id) : null;
    TP.setFilterIds(ids);
    bar.classList.toggle('active', active());
    FILTERS.forEach(f => {
      const c = bar.querySelector(`.f-chip[data-k="${f.k}"]`);
      c.innerHTML = chipText(f);
      c.classList.toggle('on', selOf(f.k).length > 0);
    });
    const res = bar.querySelector('.f-result');
    res.innerHTML = active()
      ? `符合 <b>${ids.length}</b>／${D.projects.length} 案<button type="button" class="f-clear">清除</button>`
      : `共 ${D.projects.length} 案`;
    save();
  }

  // 條件選單：每個選項後面顯示「在其他條件下」的符合數
  let popKey = null;
  function openPop(k, chip) {
    const f = FILTERS.find(x => x.k === k);
    popKey = k;
    const base = D.projects.filter(p => pass(p, k));
    const cnt = {};
    base.forEach(p => f.val(p).forEach(v => { cnt[v] = (cnt[v] || 0) + 1; }));
    const s = new Set(selOf(k));
    pop.innerHTML = `<div class="fp-head"><b>${f.label}</b>${f.all ? '<span>勾選的都要符合</span>' : '<span>可複選</span>'}
        <button type="button" class="fp-reset" ${s.size ? '' : 'disabled'}>清除</button></div>
      ${f.search ? '<input class="fp-find" type="search" placeholder="搜尋…" autocomplete="off">' : ''}
      <div class="fp-list">${f.opts().map(([v, l]) => `<label class="fp-opt${cnt[v] ? '' : ' zero'}" data-t="${esc(l)}">
        <input type="checkbox" value="${esc(v)}" ${s.has(v) ? 'checked' : ''}><span class="box"></span><span class="t">${esc(l)}</span><span class="n">${cnt[v] || 0}</span></label>`).join('')}</div>`;
    pop.hidden = false;
    const r = chip.getBoundingClientRect();
    const w = Math.min(260, window.innerWidth - 16);
    pop.style.width = w + 'px';
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
    pop.style.maxHeight = Math.max(200, window.innerHeight - r.bottom - 24) + 'px';
    const find = pop.querySelector('.fp-find');
    if (find) {
      find.addEventListener('input', () => {
        const q = find.value.trim();
        pop.querySelectorAll('.fp-opt').forEach(o => { o.hidden = q && !o.dataset.t.includes(q); });
      });
      if (window.innerWidth > 700) find.focus();
    }
    bar.querySelectorAll('.f-chip').forEach(c => c.classList.toggle('open', c === chip));
  }
  function closePop() {
    pop.hidden = true;
    popKey = null;
    bar.querySelectorAll('.f-chip.open').forEach(c => c.classList.remove('open'));
  }

  pop.addEventListener('change', e => {
    if (!e.target.matches('input[type=checkbox]')) return;
    st.sel[popKey] = [...pop.querySelectorAll('.fp-list input:checked')].map(i => i.value);
    apply();
    pop.querySelector('.fp-reset').disabled = !selOf(popKey).length;
  });
  pop.addEventListener('click', e => {
    if (e.target.closest('.fp-reset')) {
      st.sel[popKey] = [];
      pop.querySelectorAll('.fp-list input').forEach(i => { i.checked = false; });
      apply();
      e.target.disabled = true;
    }
  });

  bar.addEventListener('click', e => {
    if (e.target.closest('.f-btn')) {
      const open = !bar.classList.contains('open');
      bar.classList.toggle('open', open);
      if (!open) closePop();
      else if (window.innerWidth > 700) setTimeout(() => qIn.focus(), 250);
      return;
    }
    const chip = e.target.closest('.f-chip');
    if (chip) {
      if (popKey === chip.dataset.k) closePop(); else openPop(chip.dataset.k, chip);
      return;
    }
    if (e.target.closest('.f-clear')) {
      st = { q: '', sel: {} };
      qIn.value = '';
      closePop();
      apply();
    }
  });
  let qTimer = null;
  qIn.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { st.q = qIn.value; apply(); }, 150); });
  opts.addEventListener('scroll', closePop, { passive: true });
  document.addEventListener('mousedown', e => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.f-chip')) closePop();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) closePop(); });
  window.addEventListener('resize', closePop);
  window.addEventListener('tc-marks', () => { if (selOf('mark').length) apply(); });

  apply();
  if (active()) bar.classList.add('open');   // 上次有設定條件，打開時直接展開
})();
