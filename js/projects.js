/* 建案：地圖標記、基本資料卡、面板清單、建商／營造商／看房建議頁
 * 資料：window.TC.projects（tools/build_projects.py 產生）
 * 依賴：js/app.js 提供的 window.TCApp
 */
(function () {
  const APP = window.TCApp;
  const map = APP.map;
  const D = window.TC.projects;
  const P = Object.fromEntries(D.projects.map(p => [p.id, p]));

  // 顏色：降低飽和度，跟淡色底圖協調；文字用同色系深一階才讀得清楚
  const CAT_COLOR = { '預售': '#c0607a', '興建中': '#c4893b', '成屋': '#5b7db3' };
  const CAT_TEXT = { '預售': '#9a4560', '興建中': '#8f6224', '成屋': '#3f5d8a' };
  const CAT_KEY = { '預售': 'presale', '興建中': 'building', '成屋': 'done' };
  const CATS = ['預售', '興建中', '成屋'];
  const catOn = new Set(CATS);

  const builderOf = p => D.builders.find(b => b.brand === p.brand);
  const contractorOf = p => D.contractors.find(c => c.name === p.contractor);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const tierShort = t => (t || '').split(' ')[0];
  const shortName = p => p.name.replace(/（.*?）/g, '');

  // ---------- 我的標記：有興趣（空心星）、已看過（實心星），存在這台電腦的瀏覽器 ----------
  const MARK_KEY = 'tc-project-marks-v1';
  const MARK_NAME = { fav: '有興趣', seen: '已看過' };
  const NEXT_MARK = { '': 'fav', fav: 'seen', seen: '' };
  let marks = {};
  try { marks = JSON.parse(localStorage.getItem(MARK_KEY)) || {}; } catch (e) { marks = {}; }
  const markOf = id => marks[id] || '';
  function saveMarks() { try { localStorage.setItem(MARK_KEY, JSON.stringify(marks)); } catch (e) { /* 無痕模式等情況存不了，只影響重開後的保留 */ } }

  const STAR_PATH = 'M12 2.6l2.8 6.1 6.6.7-4.9 4.5 1.4 6.5L12 17.1l-5.9 3.3 1.4-6.5-4.9-4.5 6.6-.7z';
  const STAR_TITLE = { '': '標記為有興趣', fav: '有興趣（再點一下改為已看過）', seen: '已看過（再點一下取消標記）' };
  function starBtn(p, big) {
    const m = markOf(p.id);
    return `<button type="button" class="star-btn${big ? ' big' : ''}" data-id="${p.id}" data-mark="${m}" style="--c:${CAT_COLOR[p.cat]}" title="${STAR_TITLE[m]}" aria-label="${STAR_TITLE[m]}"><svg viewBox="0 0 24 24"><path d="${STAR_PATH}"/></svg></button>`;
  }

  // ---------- 地圖圖層 ----------
  const features = D.projects.filter(p => p.lat).map(p => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    properties: { id: p.id, name: shortName(p), cat: p.cat, catKey: CAT_KEY[p.cat],
      approx: p.geoMethod === 'approx', mark: markOf(p.id) },
  }));
  const geojson = { type: 'FeatureCollection', features };
  const catExpr = ['match', ['get', 'cat']].concat(Object.entries(CAT_COLOR).flat(), ['#888']);
  const textExpr = ['match', ['get', 'cat']].concat(Object.entries(CAT_TEXT).flat(), ['#555']);
  const catFilter = () => ['in', ['get', 'cat'], ['literal', [...catOn]]];
  const marked = ['!=', ['get', 'mark'], ''];
  const unmarked = ['==', ['get', 'mark'], ''];

  // 星號圖示：每種類別 × 空心／實心，用 canvas 畫（2 倍解析度）
  function starImage(color, filled) {
    const S = 64, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.translate(S / 2, S / 2 + 1);
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 11.5 : 25, a = -Math.PI / 2 + i * Math.PI / 5;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.lineJoin = 'round';
    g.shadowColor = 'rgba(40,30,60,0.25)';
    g.shadowBlur = 4;
    g.fillStyle = filled ? color : '#ffffff';
    g.fill();
    g.shadowBlur = 0;
    g.lineWidth = filled ? 3.5 : 5;
    g.strokeStyle = filled ? '#ffffff' : color;
    g.stroke();
    if (filled) { g.lineWidth = 1.2; g.strokeStyle = color; g.stroke(); }
    return g.getImageData(0, 0, S, S);
  }

  let pendingSelect = null;
  function addLayers() {
    Object.entries(CAT_KEY).forEach(([cat, key]) => {
      map.addImage(`star-fav-${key}`, starImage(CAT_COLOR[cat], false), { pixelRatio: 2 });
      map.addImage(`star-seen-${key}`, starImage(CAT_COLOR[cat], true), { pixelRatio: 2 });
    });
    map.addSource('projects', { type: 'geojson', data: geojson });
    const before = map.getLayer('district-label') ? 'district-label' : undefined;
    // 選取／滑過時的外圈
    map.addLayer({ id: 'proj-selected', type: 'circle', source: 'projects', filter: APP.NONE,
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 11, 15, 16], 'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': '#4a4257', 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.85 } }, before);
    map.addLayer({ id: 'proj-hl', type: 'circle', source: 'projects', filter: APP.NONE,
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 12, 15, 17], 'circle-color': APP.HL,
        'circle-opacity': 0.3, 'circle-blur': 0.4 } }, before);
    map.addLayer({ id: 'proj-dot', type: 'circle', source: 'projects', filter: ['all', catFilter(), unmarked],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2.8, 12, 4.2, 15, 6.5],
        'circle-color': catExpr, 'circle-stroke-color': '#ffffff',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 14, 1.8],
        'circle-opacity': ['case', ['get', 'approx'], 0.5, 0.92],
        'circle-stroke-opacity': 0.95,
      } }, before);
    map.addLayer({ id: 'proj-star', type: 'symbol', source: 'projects', filter: ['all', catFilter(), marked],
      layout: { 'icon-image': ['concat', 'star-', ['get', 'mark'], '-', ['get', 'catKey']],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.5, 12, 0.7, 15, 0.95],
        'icon-allow-overlap': true, 'icon-ignore-placement': true },
      paint: { 'icon-opacity': ['case', ['get', 'approx'], 0.6, 1] } }, before);
    const label = (id, minzoom, filter) => map.addLayer({ id, type: 'symbol', source: 'projects', minzoom, filter,
      layout: { 'text-field': ['get', 'name'], 'text-font': APP.FONT_BOLD, 'text-size': 11.5,
        'text-anchor': 'top', 'text-offset': [0, 0.95], 'text-optional': true, 'text-max-width': 8 },
      paint: Object.assign({ 'text-color': textExpr }, APP.HALO) }, before);
    // 有標記的建案早一點顯示名稱
    label('proj-label', 13.5, ['all', catFilter(), unmarked]);
    label('proj-label-marked', 11.5, ['all', catFilter(), marked]);

    APP.registerHighlight('project', ['proj-hl'], key => ['==', ['get', 'id'], key]);
    ['proj-dot', 'proj-star'].forEach(l => {
      map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; });
    });
    if (pendingSelect) { const [id, o] = pendingSelect; pendingSelect = null; setTimeout(() => select(id, o), 0); }
  }
  if (map.isStyleLoaded()) addLayers(); else map.on('load', addLayers);

  APP.clickHandlers.push(e => {
    if (!map.getLayer('proj-dot')) return false;
    const f = map.queryRenderedFeatures([[e.point.x - 7, e.point.y - 7], [e.point.x + 7, e.point.y + 7]], { layers: ['proj-star', 'proj-dot'] })[0];
    if (!f) return false;
    select(f.properties.id);
    return true;
  });

  // 點星號：無 → 有興趣 → 已看過 → 無；地圖、清單、資料卡同步更新
  function cycleMark(id) {
    const m = NEXT_MARK[markOf(id)];
    if (m) marks[id] = m; else delete marks[id];
    saveMarks();
    const f = features.find(x => x.properties.id === id);
    if (f) f.properties.mark = m;
    if (map.getSource('projects')) map.getSource('projects').setData(geojson);
    document.querySelectorAll(`.star-btn[data-id="${id}"]`).forEach(b => {
      b.dataset.mark = m;
      b.title = STAR_TITLE[m];
      b.setAttribute('aria-label', STAR_TITLE[m]);
    });
    const st = document.querySelector('#pcard .pc-markstate');
    if (st && selected === id) st.textContent = MARK_NAME[m] || '';
    renderMyMarks();
  }
  // 用捕捉階段攔截，避免同時觸發清單列的「移到該建案」
  document.addEventListener('click', e => {
    const b = e.target.closest('.star-btn');
    if (!b) return;
    e.stopPropagation();
    e.preventDefault();
    cycleMark(b.dataset.id);
  }, true);

  // ---------- 選取建案 ----------
  const card = document.getElementById('pcard');
  let selected = null;
  const isMobile = () => window.matchMedia('(max-width: 700px)').matches;
  // 手機：資料卡分「半開」（只看名稱與價格）和「全開」兩段
  const peekH = () => Math.min(card.offsetHeight, 190);
  function setPeek(on) {
    card.classList.toggle('peek', on);
    if (selected && P[selected].lat && !nbMode) {
      map.easeTo({ center: [P[selected].lon, P[selected].lat],
        padding: { left: 0, right: 0, top: 70, bottom: (on ? peekH() : card.offsetHeight) + 10 }, duration: 400 });
    }
  }

  function select(id, opts = {}) {
    const p = P[id];
    if (!p) return;
    if (!map.getLayer('proj-selected')) { pendingSelect = [id, opts]; return; }   // 建案圖層還沒建好，建好後再執行
    selected = id;
    map.setFilter('proj-selected', ['==', ['get', 'id'], id]);
    if (isMobile()) { APP.panel.classList.add('collapsed'); card.classList.add('peek'); }
    renderCard(p);
    if (p.lat && !nbMode) {   // 周邊設施開著時，改由 showNearby 決定視野
      // 讓建案落在「面板與資料卡之間」的可視區中央
      const narrow = isMobile();
      const left = narrow || APP.panel.classList.contains('collapsed') ? 20 : APP.panel.offsetWidth + 24;
      const right = narrow ? 20 : card.offsetWidth + 70;
      const bottom = narrow ? (card.classList.contains('peek') ? peekH() : card.offsetHeight) + 10 : 20;
      map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), opts.zoom || 15),
        padding: { left, right, top: 20, bottom }, duration: opts.duration == null ? 900 : opts.duration });
    }
    document.querySelectorAll('#cats-projects li.pinned').forEach(li => li.classList.remove('pinned'));
  }
  function deselect() {
    selected = null;
    card.hidden = true;
    clearNearby();
    map.setFilter('proj-selected', APP.NONE);
    map.easeTo({ padding: { left: 0, right: 0, top: 0, bottom: 0 }, duration: 300 });
  }

  function fact(label, value, cls) {
    if (value == null || value === '') return '';
    return `<div class="fact ${cls || ''}"><dt>${label}</dt><dd>${value}</dd></div>`;
  }
  const muted = s => `<span class="dim">${esc(s)}</span>`;
  const isPending = s => !s || /^待/.test(s);
  const val = s => isPending(s) ? muted(s || '待查') : esc(s);

  function renderCard(p) {
    const b = builderOf(p);
    const c = contractorOf(p);
    const ageText = p.ageNum != null ? (p.ageNum < 1 ? '1 年內' : `${p.ageNum} 年`) : esc(p.age);
    const floors = [p.floorsUp && `地上 ${esc(p.floorsUp)} 層`, p.floorsDown && !isPending(p.floorsDown) && `地下 ${esc(p.floorsDown)} 層`].filter(Boolean).join('・');
    const unitsText = p.units != null
      ? `${p.units} 戶` + (p.shops && p.shops !== '0' ? `<span class="sub">住家 ${esc(p.homes)}、店面 ${esc(p.shops)}</span>` : '')
      : val(p.homes);
    const price = (p.price != null
      ? `<button type="button" class="price-btn" title="看近 5 年成交走勢"><span class="price">${p.price}</span><span class="unit">萬／坪</span><span class="trend-hint">近 5 年走勢</span></button><span class="sub">${esc(p.priceText)}</span>`
      : `${val(p.priceText)}<button type="button" class="price-btn small"><span class="trend-hint">近 5 年區域走勢</span></button>`)
      + `<div class="trend" hidden></div>`;
    const school = [p.elem, p.junior].filter(s => s && !isPending(s)).map(esc).join('<br>') || muted('待查');
    const showCompletion = p.cat !== '成屋';
    const btn591 = p.onSale > 0 && p.market591
      ? `<a class="btn-591" href="${esc(p.market591)}" target="_blank" rel="noopener">591 在售 ${p.onSale} 間<span class="ext"></span></a>` : '';
    const contractorText = p.contractor === '待查'
      ? muted('待查') + (p.contractorGuess ? `<span class="sub">推測 ${esc(p.contractorGuess)}</span>` : '')
      : esc(p.contractor) + (c ? `<span class="sub">${esc(c.grade)}</span>` : '');

    card.innerHTML = `
      <button class="pc-handle" type="button" aria-label="展開或收合資料"></button>
      <button class="pc-close" type="button" aria-label="關閉">×</button>
      <div class="pc-head">
        <div class="pc-badges"><span class="badge" style="--c:${CAT_COLOR[p.cat]}">${esc(p.cat)}</span>
          ${b ? `<span class="badge tier">${esc(tierShort(b.tier))}</span>` : ''}</div>
        <div class="pc-title">${starBtn(p, true)}<h3>${esc(p.name)}</h3></div>
        <div class="pc-markstate">${MARK_NAME[markOf(p.id)] || ''}</div>
        <div class="pc-where">${esc(p.district)}・${esc(p.zone)}</div>
        <div class="pc-sum">${p.price != null ? `<b>${p.price}</b> 萬／坪` : '價格待查'}・${p.cat === '成屋' ? '屋齡 ' + ageText : (isPending(p.completion) ? p.cat : esc(p.completion) + ' 完工')}${p.rooms && !isPending(p.rooms) ? '・' + esc(p.rooms.split('、')[0]) : ''}</div>
      </div>
      <dl class="facts">
        ${fact('建商', esc(p.company) + (b ? `<span class="sub">${esc(b.tier)}</span>` : ''))}
        ${fact('營造', contractorText)}
        ${fact('屋齡', ageText)}
        ${showCompletion ? fact('預計完工', val(p.completion), 'hl') : fact('完工年', val(p.completion))}
        ${fact('每坪價位', price, 'wide')}
        ${fact('房型', val(p.rooms), 'wide')}
        ${fact('結構', val(p.structure))}
        ${fact('樓層', floors || muted('待查'))}
        ${fact('總戶數', unitsText)}
        ${fact('公設比', val(p.publicRatio))}
        ${fact('學區', school, 'wide')}
      </dl>
      <div class="pc-actions">${btn591}<button type="button" class="btn-compare ${cmp.includes(p.id) ? 'on' : ''}" data-id="${p.id}">${cmp.includes(p.id) ? '已加入比較' : '加入比較'}</button></div>
      <div class="nb">
        <div class="nb-head"><span>周邊設施</span>
          <div class="seg nb-seg">
            <button type="button" data-nb="" class="${nbMode ? '' : 'on'}">關閉</button>
            <button type="button" data-nb="walk" class="${nbMode === 'walk' ? 'on' : ''}">步行 500m</button>
            <button type="button" data-nb="drive" class="${nbMode === 'drive' ? 'on' : ''}">開車最近</button>
          </div>
        </div>
        <div class="nb-body"></div>
      </div>
      <details class="pc-more">
        <summary>更多資料</summary>
        <dl class="facts small">
          ${fact('地址', esc(p.address), 'wide')}
          ${fact('建築設計', val(p.architect))}
          ${fact('棟數', val(p.buildings))}
          ${fact('梯戶', val(p.layout), 'wide')}
          ${fact('基地', isPending(p.site) ? muted(p.site) : esc(p.site) + ' 坪')}
          ${fact('車位', val(p.parking), 'wide')}
          ${fact('銷售', val(p.sales), 'wide')}
          ${p.onSalePrice ? fact('在售總價', esc(p.onSalePrice) + ' 萬', 'wide') : ''}
          ${p.note ? fact('備註', esc(p.note), 'wide') : ''}
          ${fact('位置', esc(p.geoNote) + (p.geoMethod === 'approx' ? '（地圖上以半透明標示）' : ''), 'wide')}
          ${fact('資料來源', p.links.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(new URL(u).hostname.replace(/^www\./, ''))}</a>`).join(''), 'wide links')}
        </dl>
      </details>`;
    card.hidden = false;
    card.scrollTop = 0;
    card.querySelector('.pc-close').addEventListener('click', deselect);
    card.querySelector('.pc-handle').addEventListener('click', () => setPeek(!card.classList.contains('peek')));
    // 手機半開時，點卡片任一處就全開（星號、關閉鈕除外）
    card.onclick = e => {
      if (!isMobile() || !card.classList.contains('peek')) return;
      if (e.target.closest('.pc-close, .pc-handle, .star-btn')) return;
      setPeek(false);
    };
    card.querySelector('.btn-compare').addEventListener('click', () => toggleCompare(p.id));
    card.querySelectorAll('.nb-seg button').forEach(bt => bt.addEventListener('click', () => {
      nbMode = bt.dataset.nb;
      card.querySelectorAll('.nb-seg button').forEach(x => x.classList.toggle('on', x === bt));
      showNearby(p);
    }));
    showNearby(p, true);
    const tbtn = card.querySelector('.price-btn');
    if (tbtn) tbtn.addEventListener('click', () => {
      const box = card.querySelector('.trend');
      if (!box.hidden) { box.hidden = true; tbtn.classList.remove('open'); return; }
      box.innerHTML = trendChart(p);
      box.hidden = false;
      tbtn.classList.add('open');
    });
  }

  // ---------- 周邊設施 ----------
  const NB = window.TC.nearby || { data: {}, walkCats: {}, driveCats: {} };
  const NB_COLOR = {
    park: '#5f9a55', cvs: '#c98a3a', market: '#b86b4b', mrt: '#6aab2e', bus: '#5b8fb0',
    clinic: '#b0577a', food: '#b8963c', parking: '#7a7188',
    ic: '#a35a14', bigpark: '#5f9a55', mall: '#8e5ba8', area: '#c0607a', hospital: '#b5483d',
  };
  let nbMode = '';
  const fmtM = d => d >= 1000 ? (d / 1000).toFixed(1) + ' 公里' : d + ' 公尺';

  function circle(lon, lat, r) {
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const a = i / 64 * 2 * Math.PI;
      pts.push([lon + Math.cos(a) * r / 101600, lat + Math.sin(a) * r / 110600]);
    }
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] }, properties: {} };
  }
  function ensureNearbyLayers() {
    if (map.getSource('nearby')) return;
    const empty = { type: 'FeatureCollection', features: [] };
    map.addSource('nearby', { type: 'geojson', data: empty });
    map.addSource('nearby-area', { type: 'geojson', data: empty });
    const before = map.getLayer('proj-selected') ? 'proj-selected' : undefined;
    map.addLayer({ id: 'nb-area-fill', type: 'fill', source: 'nearby-area', paint: { 'fill-color': '#5b5270', 'fill-opacity': 0.05 } }, before);
    map.addLayer({ id: 'nb-area-line', type: 'line', source: 'nearby-area',
      paint: { 'line-color': '#5b5270', 'line-width': 1.5, 'line-opacity': 0.55, 'line-dasharray': [3, 2] } }, before);
    map.addLayer({ id: 'nb-link', type: 'line', source: 'nearby', filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': ['get', 'color'], 'line-width': 1.4, 'line-opacity': 0.6, 'line-dasharray': [2, 2] } }, before);
    map.addLayer({ id: 'nb-dot', type: 'circle', source: 'nearby', filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 4, 16, 6.5], 'circle-color': ['get', 'color'],
        'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5, 'circle-opacity': 0.9 } });
    map.addLayer({ id: 'nb-label', type: 'symbol', source: 'nearby', filter: ['==', ['geometry-type'], 'Point'],
      layout: { 'text-field': ['get', 'label'], 'text-font': APP.FONT, 'text-size': 11, 'text-anchor': 'left',
        'text-offset': [0.8, 0], 'text-optional': true, 'text-max-width': 9 },
      paint: Object.assign({ 'text-color': ['get', 'color'] }, APP.HALO) });
  }
  function clearNearby() {
    if (!map.getSource('nearby')) return;
    const empty = { type: 'FeatureCollection', features: [] };
    map.getSource('nearby').setData(empty);
    map.getSource('nearby-area').setData(empty);
  }
  function showNearby(p, keepView) {
    const body = card.querySelector('.nb-body');
    clearNearby();
    if (!nbMode || !p.lat) { body.innerHTML = ''; return; }
    const N = NB.data[p.id];
    if (!N) { body.innerHTML = '<p class="dim">尚未計算周邊設施</p>'; return; }
    ensureNearbyLayers();
    const feats = [];
    const pt = (q, cat, label) => feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [q.lon, q.lat] },
      properties: { color: NB_COLOR[cat], label } });
    if (nbMode === 'walk') {
      const rows = Object.entries(NB.walkCats).map(([c, name]) => {
        const w = N.walk[c];
        w.items.forEach(q => pt(q, c, `${q.name} ${q.d}m`));
        const list = w.items.length
          ? w.items.map(q => `<span class="nb-item">${esc(q.name)}<em>${q.d} 公尺</em></span>`).join('')
          : (w.nearest ? `<span class="nb-item none">500 公尺內沒有；最近 ${esc(w.nearest.name)}<em>${fmtM(w.nearest.d)}</em></span>` : '<span class="nb-item none">附近沒有資料</span>');
        return `<li><i style="background:${NB_COLOR[c]}"></i><b>${name}</b><span class="nb-count">${w.count ? w.count + (w.count >= 10 ? '+' : '') + ' 處' : '—'}</span><div class="nb-list">${list}</div></li>`;
      });
      body.innerHTML = `<ul class="nb-rows">${rows.join('')}</ul><p class="nb-note">直線距離 500 公尺內，約步行 6～8 分鐘；每類列最近 3 處。資料：OpenStreetMap，可能有缺漏。</p>`;
      map.getSource('nearby-area').setData({ type: 'FeatureCollection', features: [circle(p.lon, p.lat, 500)] });
      fitAround(p, [[p.lon - 0.0056, p.lat - 0.005], [p.lon + 0.0056, p.lat + 0.005]]);
    } else {
      const rows = Object.entries(NB.driveCats).map(([c, name]) => {
        const d = N.drive[c];
        if (!d) return '';
        pt(d, c, `${d.name}${d.min != null ? ' ' + d.min + '分' : ''}`);
        feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[p.lon, p.lat], [d.lon, d.lat]] }, properties: { color: NB_COLOR[c] } });
        const t = d.min != null ? `約 ${Math.max(1, d.min)} 分鐘<em>${d.km} 公里</em>` : `<em>直線 ${d.km} 公里（車程未取得）</em>`;
        return `<li><i style="background:${NB_COLOR[c]}"></i><b>${name}</b><span class="nb-drive">${esc(d.name)}</span><span class="nb-time">${t}</span></li>`;
      });
      body.innerHTML = `<ul class="nb-rows drive">${rows.join('')}</ul><p class="nb-note">開車時間為路網估算（不含塞車、停車時間），虛線只表示方向。商圈為常用商圈的代表點。</p>`;
      const xs = feats.filter(f => f.geometry.type === 'Point').map(f => f.geometry.coordinates).concat([[p.lon, p.lat]]);
      fitAround(p, [[Math.min(...xs.map(c => c[0])), Math.min(...xs.map(c => c[1]))], [Math.max(...xs.map(c => c[0])), Math.max(...xs.map(c => c[1]))]]);
    }
    map.getSource('nearby').setData({ type: 'FeatureCollection', features: feats });
  }
  function fitAround(p, bounds) {
    const narrow = isMobile();
    if (narrow) card.classList.remove('peek');   // 看周邊設施時卡片全開
    const left = narrow || APP.panel.classList.contains('collapsed') ? 30 : APP.panel.offsetWidth + 40;
    const right = narrow ? 30 : card.offsetWidth + 80;
    const bottom = narrow ? Math.round(window.innerHeight * 0.5) : 40;
    map.fitBounds(bounds, { padding: { left, right, top: 40, bottom }, maxZoom: 16, duration: 800 });
  }

  // ---------- 比較（最多 3 案） ----------
  const CMP_KEY = 'tc-compare-v1';
  let cmp = [];
  try { cmp = (JSON.parse(localStorage.getItem(CMP_KEY)) || []).filter(id => P[id]).slice(0, 3); } catch (e) { cmp = []; }
  const tray = document.getElementById('cmp-tray');
  const cmpWin = document.getElementById('compare');
  function saveCmp() { try { localStorage.setItem(CMP_KEY, JSON.stringify(cmp)); } catch (e) { /* 存不了只影響重開後 */ } }
  function toggleCompare(id) {
    if (cmp.includes(id)) cmp = cmp.filter(x => x !== id);
    else if (cmp.length >= 3) { flashTray('最多比較 3 個建案，請先移除一個'); return; }
    else cmp.push(id);
    saveCmp();
    renderTray();
    const b = card.querySelector(`.btn-compare[data-id="${id}"]`);
    if (b) { b.classList.toggle('on', cmp.includes(id)); b.textContent = cmp.includes(id) ? '已加入比較' : '加入比較'; }
    if (!cmpWin.hidden) renderCompare();
  }
  function flashTray(msg) {
    const m = tray.querySelector('.cmp-msg');
    if (!m) return;
    m.textContent = msg;
    tray.classList.add('warn');
    setTimeout(() => { tray.classList.remove('warn'); m.textContent = ''; }, 2200);
  }
  function renderTray() {
    tray.hidden = cmp.length === 0;
    tray.innerHTML = `<span class="cmp-title">比較</span><span class="cmp-n">${cmp.length} 案</span>
      ${cmp.map(id => `<span class="cmp-chip" style="--c:${CAT_COLOR[P[id].cat]}"><i></i>${esc(shortName(P[id]))}<button type="button" data-rm="${id}" aria-label="移除">×</button></span>`).join('')}
      ${cmp.length < 3 ? `<span class="cmp-slot">還可加入 ${3 - cmp.length} 案</span>` : ''}
      <span class="cmp-msg"></span>
      <button type="button" class="cmp-go" ${cmp.length < 2 ? 'disabled' : ''}>開始比較</button>`;
  }
  tray.addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { toggleCompare(rm.dataset.rm); return; }
    if (e.target.closest('.cmp-go')) openCompare();
  });

  function openCompare() {
    renderCompare();
    cmpWin.hidden = false;
    requestAnimationFrame(() => cmpWin.classList.add('show'));
  }
  function closeCompare() {
    cmpWin.classList.remove('show');
    setTimeout(() => { cmpWin.hidden = true; }, 250);
  }
  cmpWin.querySelector('.cmp-close').addEventListener('click', closeCompare);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !cmpWin.hidden) closeCompare(); });
  cmpWin.addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { toggleCompare(rm.dataset.rm); if (!cmp.length) closeCompare(); return; }
    const go = e.target.closest('[data-go]');
    if (go) { closeCompare(); setTimeout(() => select(go.dataset.go), 260); }
  });

  function renderCompare() {
    const ps = cmp.map(id => P[id]);
    const num = s => { const m = String(s || '').match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
    // 較佳值用淡色底標示：價格、公設比、屋齡、車程越低越好；步行設施數量越多越好
    const best = (vals, lower) => {
      const v = vals.map(x => (x == null || isNaN(x)) ? null : x);
      const ok = v.filter(x => x != null);
      if (ok.length < 2 || new Set(ok).size < 2) return v.map(() => false);
      const t = lower ? Math.min(...ok) : Math.max(...ok);
      return v.map(x => x === t);
    };
    const row = (label, cells, marks) => `<tr><th>${label}</th>${cells.map((c, i) => `<td class="${marks && marks[i] ? 'best' : ''}">${c}</td>`).join('')}</tr>`;
    const group = title => `<tr class="grp"><th colspan="${ps.length + 1}">${title}</th></tr>`;
    const age = p => p.ageNum != null ? (p.ageNum < 1 ? '1 年內' : p.ageNum + ' 年') : esc(p.age);
    const N = p => NB.data[p.id];
    const T = p => ((window.TC.trends || { data: {} }).data[p.id]) || { own: [], base: [] };

    let h = `<table class="cmp-table"><thead><tr><th></th>${ps.map(p => `<th>
        <div class="cmp-h">${starBtn(p)}<span class="badge" style="--c:${CAT_COLOR[p.cat]}">${esc(p.cat)}</span>
          <button type="button" class="cmp-rm" data-rm="${p.id}" aria-label="移出比較">×</button></div>
        <button type="button" class="cmp-name" data-go="${p.id}" title="在地圖上顯示">${esc(p.name)}</button>
        <div class="cmp-where">${esc(p.district)}・${esc(p.zone)}</div></th>`).join('')}</tr></thead><tbody>`;
    h += group('基本資料');
    h += row('建商', ps.map(p => { const b = builderOf(p); return esc(p.company) + (b ? `<small>${esc(tierShort(b.tier))}</small>` : ''); }));
    h += row('營造', ps.map(p => p.contractor === '待查' ? '<span class="dim">待查</span>' : esc(p.contractor)));
    h += row('屋齡', ps.map(age), best(ps.map(p => p.ageNum != null ? p.ageNum : (p.cat === '成屋' ? null : 0)), true));
    h += row('預計完工', ps.map(p => p.cat === '成屋' ? '<span class="dim">已完工</span>' : val(p.completion)));
    h += row('每坪價位', ps.map(p => p.price != null ? `<b class="big">${p.price}</b> 萬` : val(p.priceText)), best(ps.map(p => p.price), true));
    h += row('房型', ps.map(p => val(p.rooms)));
    h += row('結構', ps.map(p => val(p.structure)));
    h += row('樓層', ps.map(p => `地上 ${esc(p.floorsUp)}${p.floorsDown && !isPending(p.floorsDown) ? '／地下 ' + esc(p.floorsDown) : ''}`));
    h += row('總戶數', ps.map(p => p.units != null ? p.units + ' 戶' : val(p.homes)));
    h += row('公設比', ps.map(p => val(p.publicRatio)), best(ps.map(p => num(p.publicRatio)), true));
    h += row('梯戶', ps.map(p => val(p.layout)));
    h += row('車位', ps.map(p => val(p.parking)));
    h += row('學區', ps.map(p => [p.elem, p.junior].filter(x => x && !isPending(x)).map(esc).join('<br>') || '<span class="dim">待查</span>'));
    h += row('591 在售', ps.map(p => p.onSale > 0 && p.market591 ? `<a class="btn-591 sm" href="${esc(p.market591)}" target="_blank" rel="noopener">在售 ${p.onSale} 間<span class="ext"></span></a>` : '<span class="dim">—</span>'));

    h += group('近 5 年成交走勢');
    h += row('走向', ps.map(p => {
      const t = T(p);
      const s = t.own.length >= 2 ? t.own : t.base;
      const w = trendWord(s.filter(x => HALVES.includes(x.t)));
      if (!w) return '<span class="dim">資料不足</span>';
      return `<span class="${w.word} tw">${w.word} ${w.pct > 0 ? '+' : ''}${w.pct.toFixed(0)}%</span><small>${t.own.length >= 2 ? '本案' : '區域'} ${w.from.slice(0, 4)} ${w.a} → ${w.to.slice(0, 4)} ${w.b} 萬</small>`;
    }));
    h += row('走勢圖', ps.map(p => `<div class="cmp-chart">${trendChart(p)}</div>`));

    h += group('步行 500 公尺內');
    Object.entries(NB.walkCats).forEach(([c, name]) => {
      const counts = ps.map(p => N(p) ? N(p).walk[c].count : null);
      h += row(`<i class="cdot" style="background:${NB_COLOR[c]}"></i>${name}`, ps.map(p => {
        const w = N(p) && N(p).walk[c];
        if (!w) return '<span class="dim">—</span>';
        if (!w.items.length) return `<span class="dim">無${w.nearest ? `（最近 ${esc(w.nearest.name)} ${fmtM(w.nearest.d)}）` : ''}</span>`;
        return `<b>${w.count}${w.count >= 10 ? '+' : ''} 處</b><small>${esc(w.items[0].name)} ${w.items[0].d} 公尺</small>`;
      }), best(counts, false));
    });

    h += group('開車最近');
    Object.entries(NB.driveCats).forEach(([c, name]) => {
      const mins = ps.map(p => N(p) && N(p).drive[c] ? N(p).drive[c].min : null);
      h += row(`<i class="cdot" style="background:${NB_COLOR[c]}"></i>${name}`, ps.map(p => {
        const d = N(p) && N(p).drive[c];
        if (!d) return '<span class="dim">—</span>';
        return `<b>${d.min != null ? '約 ' + Math.max(1, d.min) + ' 分鐘' : '<span class="dim">車程未取得</span>'}</b><small>${esc(d.name)}・${d.km} 公里</small>`;
      }), best(mins, true));
    });
    h += '</tbody></table>';
    cmpWin.querySelector('.cmp-body').innerHTML = h;
    cmpWin.querySelector('.cmp-count').textContent = `${ps.length} 案`;
  }

  // ---------- 近 5 年成交走勢（SVG） ----------
  const HALVES = ['2021H2', '2022H1', '2022H2', '2023H1', '2023H2', '2024H1', '2024H2', '2025H1', '2025H2', '2026H1'];
  function trendWord(s) {
    if (s.length < 2) return null;
    const a = s[0].med, b = s[s.length - 1].med, pct = (b - a) / a * 100;
    const word = pct > 3 ? '上升' : pct < -3 ? '下降' : '持平';
    return { a, b, pct, word, from: s[0].t, to: s[s.length - 1].t };
  }
  function trendChart(p) {
    const T = (window.TC.trends || { data: {} }).data[p.id];
    if (!T) return '<p class="dim">沒有實價登錄資料</p>';
    const own = T.own.filter(x => HALVES.includes(x.t));
    const base = T.base.filter(x => HALVES.includes(x.t));
    const all = own.concat(base).map(x => x.med);
    if (!all.length) return '<p class="dim">近 5 年沒有可用的成交資料</p>';
    const W = 320, H = 150, L = 34, R = 10, TOP = 10, BOT = 22;
    let lo = Math.min(...all), hi = Math.max(...all);
    const pad = Math.max(2, (hi - lo) * 0.15);
    lo = Math.floor((lo - pad) / 5) * 5; hi = Math.ceil((hi + pad) / 5) * 5;
    const x = t => L + HALVES.indexOf(t) * (W - L - R) / (HALVES.length - 1);
    const y = v => TOP + (hi - v) / (hi - lo) * (H - TOP - BOT);
    const path = s => s.map((d, i) => `${i ? 'L' : 'M'}${x(d.t).toFixed(1)},${y(d.med).toFixed(1)}`).join('');
    const ticks = [lo, (lo + hi) / 2, hi];
    const color = CAT_COLOR[p.cat];
    const maxN = Math.max(1, ...own.map(d => d.n));
    const svg = `<svg viewBox="0 0 ${W} ${H}" class="trend-svg">
      ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 5}" y="${y(v) + 3.5}" class="yl">${Math.round(v)}</text>`).join('')}
      ${['2022H1', '2023H1', '2024H1', '2025H1', '2026H1'].map(t => `<text x="${x(t)}" y="${H - 6}" class="xl">${t.slice(0, 4)}</text>`).join('')}
      ${base.length ? `<path d="${path(base)}" class="base"/>${base.map(d => `<circle cx="${x(d.t)}" cy="${y(d.med)}" r="2" class="base-dot"><title>${d.t} ${d.med} 萬（${d.n} 筆）</title></circle>`).join('')}` : ''}
      ${own.length ? `<path d="${path(own)}" class="own" style="stroke:${color}"/>${own.map(d => `<circle cx="${x(d.t)}" cy="${y(d.med)}" r="${(2.5 + 3 * Math.sqrt(d.n / maxN)).toFixed(1)}" style="fill:${color}" class="own-dot"><title>${d.t} ${d.med} 萬（${d.n} 筆）</title></circle>`).join('')}` : ''}
    </svg>`;
    const line = (label, s, cls) => {
      const w = trendWord(s);
      if (!w) return '';
      const sign = w.pct > 0 ? '+' : '';
      return `<li class="${cls}"><i></i><b>${label}</b>${w.from.slice(0, 4)} ${w.a} → ${w.to.slice(0, 4)} ${w.b} 萬，<span class="${w.word}">${w.word} ${sign}${w.pct.toFixed(0)}%</span></li>`;
    };
    return `${svg}
      <ul class="trend-legend" style="--c:${color}">
        ${own.length ? line('本案', own, 'own') : `<li class="own none"><i></i><b>本案</b>${esc(T.ownNote)}</li>`}
        ${line(T.baseLabel, base, 'base')}
      </ul>
      <p class="trend-note">半年一點、取成交中位數，已扣除車位（車位價含在總價裡的成交，以同區同類車位的中位價估算扣除）；點越大代表筆數越多。${own.length ? esc(T.ownNote) + '。' : ''}資料：內政部實價登錄（2021 下半年～2026 上半年）。</p>`;
  }

  // ---------- 面板：建案清單 ----------
  const box = document.getElementById('cats-projects');
  function applyCats() {
    const f = { 'proj-dot': unmarked, 'proj-label': unmarked, 'proj-star': marked, 'proj-label-marked': marked };
    Object.entries(f).forEach(([id, m]) => map.getLayer(id) && map.setFilter(id, ['all', catFilter(), m]));
  }
  // 清單列：名稱前加星號按鈕
  const withStar = p => li => li.insertAdjacentHTML('afterbegin', starBtn(p));
  const byPrice = (a, b) => (b.price || 0) - (a.price || 0);
  CATS.forEach(cat => {
    const list = D.projects.filter(p => p.cat === cat).sort((a, b) => a.district.localeCompare(b.district) || byPrice(a, b));
    APP.renderCat(box, {
      id: 'proj:' + cat, name: cat, on: true,
      swatch: `<span class="swatch pin" style="--c:${CAT_COLOR[cat]}"></span>`,
      onToggle: on => { on ? catOn.add(cat) : catOn.delete(cat); applyCats(); },
      items: list.map(p => ({
        type: 'project', key: p.id, name: shortName(p),
        sub: `${p.brand}・${p.district.replace('區', '')}`,
        val: p.price ? p.price + ' 萬' : '', onClick: () => select(p.id), decorate: withStar(p),
      })),
    });
  });

  // 我的標記：有興趣、已看過兩組，標記變動時重畫
  const myBox = document.getElementById('my-marks');
  const openGroups = new Set();
  function renderMyMarks() {
    const groups = ['fav', 'seen'].map(m => [m, D.projects.filter(p => markOf(p.id) === m)]);
    const total = groups.reduce((n, [, l]) => n + l.length, 0);
    if (!total) {
      myBox.innerHTML = '<p class="my-empty">點建案名稱前的星號：一下＝有興趣（空心），兩下＝已看過（實心）。</p>';
      return;
    }
    myBox.innerHTML = groups.map(([m, list]) => `
      <div class="cat my-group ${openGroups.has(m) ? 'open' : ''}" data-m="${m}">
        <div class="cat-head">
          <span class="swatch mark ${m}"><svg viewBox="0 0 24 24"><path d="${STAR_PATH}"/></svg></span>
          <span class="cat-name">${MARK_NAME[m]}</span><span class="count">${list.length}</span><span class="cat-chev"></span>
        </div>
        <ul class="items" ${openGroups.has(m) ? '' : 'hidden'}></ul>
      </div>`).join('');
    myBox.querySelectorAll('.my-group').forEach(el => {
      const m = el.dataset.m;
      const list = groups.find(g => g[0] === m)[1];
      const ul = el.querySelector('.items');
      APP.buildItems(ul, list.map(p => ({
        type: 'project', key: p.id, name: shortName(p), sub: `${p.cat}・${p.district.replace('區', '')}`,
        val: p.price ? p.price + ' 萬' : '', onClick: () => select(p.id), decorate: withStar(p),
      })));
      el.querySelector('.cat-head').addEventListener('click', () => {
        ul.hidden = !ul.hidden;
        el.classList.toggle('open', !ul.hidden);
        if (ul.hidden) openGroups.delete(m); else openGroups.add(m);
      });
    });
  }
  renderMyMarks();

  // 搜尋：案名、建商、路名、重劃區
  const search = document.getElementById('proj-search');
  const results = document.getElementById('proj-results');
  search.addEventListener('input', () => {
    const q = search.value.trim();
    results.innerHTML = '';
    if (!q) { results.hidden = true; return; }
    const hits = D.projects.filter(p => [p.name, p.brand, p.company, p.address, p.zone, p.district].join(' ').includes(q)).slice(0, 30);
    results.hidden = false;
    if (!hits.length) { results.innerHTML = '<li class="empty">找不到符合的建案</li>'; return; }
    APP.buildItems(results, hits.map(p => ({
      type: 'project', key: p.id, name: shortName(p),
      sub: `${p.brand}・${p.district.replace('區', '')}`, val: p.price ? p.price + ' 萬' : '', onClick: () => select(p.id),
      decorate: withStar(p),
    })));
  });
  search.addEventListener('keydown', e => { if (e.key === 'Escape') { search.value = ''; search.dispatchEvent(new Event('input')); } });

  // ---------- 建商／營造商／看房建議頁 ----------
  const guide = document.getElementById('guide');
  const gBody = guide.querySelector('.g-body');
  const TIER_ORDER = ['T1', 'T2', 'T2~T3', 'T3', 'T3~T4', 'T4'];
  const tierClass = t => 'tier-' + tierShort(t).replace('~', '-');

  function projRow(id, guessed) {
    const p = P[id];
    const age = p.cat === '成屋' ? (p.ageNum != null ? (p.ageNum < 1 ? '1 年內' : p.ageNum + ' 年') : esc(p.age)) : esc(p.completion);
    return `<li data-id="${p.id}">
      <span class="badge" style="--c:${CAT_COLOR[p.cat]}">${esc(p.cat)}</span>
      <span class="nm">${starBtn(p)}${esc(p.name)}${guessed ? '<span class="guess">推測</span>' : ''}</span>
      <span class="where">${esc(p.district)}・${esc(p.zone)}</span>
      <span class="pr">${p.price ? p.price + ' 萬' : '—'}</span>
      <span class="age">${p.cat === '成屋' ? '屋齡 ' : '完工 '}${age || '—'}</span>
    </li>`;
  }
  function projList(ids, guessedIds) {
    const all = ids.map(id => projRow(id, false)).concat((guessedIds || []).map(id => projRow(id, true)));
    return all.length ? `<ul class="g-projects">${all.join('')}</ul>` : '';
  }
  function entityCard(o) {
    const n = o.projects.length + (o.guessed ? o.guessed.length : 0);
    return `<article class="g-card ${n ? '' : 'empty'}">
      <header>
        <h4>${esc(o.name)}</h4>
        ${o.badge ? `<span class="badge tier ${o.badgeClass || ''}">${esc(o.badge)}</span>` : ''}
        ${n ? `<button type="button" class="g-toggle">${n} 個建案<span class="chev"></span></button>` : `<span class="g-none">${esc(o.status || '本資料無建案')}</span>`}
      </header>
      ${o.lines.filter(l => l[1]).map(([k, v, cls]) => `<p class="${cls || ''}"><b>${k}</b>${esc(v)}</p>`).join('')}
      <div class="g-list" hidden>${projList(o.projects, o.guessed)}</div>
    </article>`;
  }

  const tabs = {
    builders() {
      const groups = {};
      D.builders.forEach(b => { (groups[b.tier] = groups[b.tier] || []).push(b); });
      return Object.entries(groups).map(([tier, list]) => `
        <section class="g-group"><h3><span class="badge tier ${tierClass(tier)}">${esc(tierShort(tier))}</span>${esc(tier.replace(tierShort(tier), '').trim())}</h3>
          <div class="g-grid">${list.map(b => entityCard({
            name: b.name, projects: b.projects, status: b.status,
            lines: [['定位', b.position], ['主要區域', b.areas], ['口碑', b.good, 'good'], ['需注意', b.watch, 'watch']],
          })).join('')}</div></section>`).join('');
    },
    contractors() {
      const groups = {};
      D.contractors.forEach(c => { (groups[c.grade] = groups[c.grade] || []).push(c); });
      return Object.entries(groups).map(([grade, list]) => `
        <section class="g-group"><h3>${esc(grade)}</h3>
          <div class="g-grid">${list.map(c => entityCard({
            name: c.name, projects: c.projects, guessed: c.guessed,
            lines: [['體系', c.group], ['評價', c.good, 'good'], ['需注意', c.watch, 'watch'], ['建議查核', c.check]],
          })).join('')}</div></section>`).join('');
    },
    advice() {
      const names = D.projects.map(p => ({ id: p.id, short: p.name.replace(/（.*?）|\(.*?\)/g, '').trim() }))
        .filter(x => x.short.length >= 3).sort((a, b) => b.short.length - a.short.length);
      // 文字裡出現的建案名稱直接變成可點的連結（名稱有空格時也比對無空格寫法）
      const linkify = text => {
        let t = esc(text || '');
        names.forEach(x => {
          [x.short, x.short.replace(/\s+/g, '')].forEach(k => {
            const ek = esc(k);
            if (ek.length >= 3 && t.includes(ek)) t = t.split(ek).join(`\u0001${x.id}\u0002`);
          });
        });
        return t.replace(/\u0001([^\u0002]+)\u0002/g, (m, id) =>
          `<button type="button" class="plink" data-id="${id}" style="--c:${CAT_COLOR[P[id].cat]}">${esc(shortName(P[id]))}</button>`);
      };
      const pre = D.advice.filter(a => a['類別'] === '前提');
      const rest = D.advice.filter(a => a['類別'] !== '前提');
      const groups = {};
      rest.forEach(a => { (groups[a['類別']] = groups[a['類別']] || []).push(a); });
      return pre.map(a => `<div class="g-callout"><h4>${esc(a['主題'])}</h4><p>${linkify(a['建議內容'])}</p>
          <p class="dim">${linkify(a['可選方案／具體標的'])}</p><p class="note">${esc(a['風險與注意'])}</p></div>`).join('') +
        Object.entries(groups).map(([g, list]) => `<section class="g-group"><h3>${esc(g)}</h3><div class="g-advice">
          ${list.map(a => `<article class="g-card advice"><h4>${esc(a['主題'])}</h4><p>${linkify(a['建議內容'])}</p>
            ${a['可選方案／具體標的'] ? `<p class="opt"><b>方案</b>${linkify(a['可選方案／具體標的'])}</p>` : ''}
            ${a['風險與注意'] ? `<p class="watch"><b>注意</b>${esc(a['風險與注意'])}</p>` : ''}</article>`).join('')}
        </div></section>`).join('');
    },
    market() { return table(D.market); },
    youth() { return table(D.youthLoan); },
    notes() { return table(D.notes); },
  };
  function table(list) {
    if (!list.length) return '';
    const cols = Object.keys(list[0]);
    return `<div class="g-table-wrap"><table class="g-table"><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${list.map(r => `<tr>${cols.map(c => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  let curTab = 'builders';
  function showTab(t) {
    curTab = t;
    guide.querySelectorAll('.g-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    gBody.innerHTML = tabs[t]();
    gBody.scrollTop = 0;
  }
  guide.querySelectorAll('.g-tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  function openGuide(tab) {
    showTab(tab || curTab);
    guide.hidden = false;
    requestAnimationFrame(() => guide.classList.add('show'));
  }
  function closeGuide(cb) {
    guide.classList.remove('show');
    setTimeout(() => { guide.hidden = true; if (cb) cb(); }, 320);
  }
  document.getElementById('open-guide').addEventListener('click', () => openGuide());
  guide.querySelector('.g-close').addEventListener('click', () => closeGuide());
  guide.addEventListener('click', e => { if (e.target === guide) closeGuide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !guide.hidden) closeGuide(); });

  // 頁面內：展開建案清單、點建案漸暗後回到地圖
  gBody.addEventListener('click', e => {
    // 點卡片標題列或「N 個建案」都可以展開清單
    const head = e.target.closest('.g-card header');
    const tg = e.target.closest('.g-toggle') || (head && head.querySelector('.g-toggle'));
    if (tg && !e.target.closest('[data-id]')) {
      const list = tg.closest('.g-card').querySelector('.g-list');
      list.hidden = !list.hidden;
      tg.classList.toggle('open', !list.hidden);
      return;
    }
    const row = e.target.closest('[data-id]');
    if (row) {
      row.classList.add('picked');
      closeGuide(() => select(row.dataset.id, { zoom: 15.5, duration: 1200 }));
    }
  });

  renderTray();
  if (isMobile()) {
    APP.panel.classList.add('collapsed');
    // 地圖資料來源說明預設收起（MapLibre 載入後會自動展開一次，所以在載入後再收）
    const fold = () => { const at = document.querySelector('.maplibregl-ctrl-attrib'); if (at) at.classList.remove('maplibregl-compact-show'); };
    map.once('load', fold);
    map.once('idle', fold);
  }
  window.TCProjects = { select, deselect, openGuide, get selected() { return selected; } };
})();
