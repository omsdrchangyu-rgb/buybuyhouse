/* 台中看房地圖：底圖 + 行政區／重劃區 + 道路 + 鐵道捷運
 * 資料由 tools/build_data.py 產生，放在 window.TC
 */
(function () {
  const TC = window.TC;

  // 捷運路線顏色（依臺中捷運路線色，稍微加深讓淡色底圖上看得清楚）
  const LINE_COLOR = {
    green: '#6aab2e', green_dakeng: '#6aab2e', green_changhua: '#6aab2e',
    blue: '#2f6db5', blue_taiping: '#2f6db5',
    orange: '#ec8a1c',
    purple: '#8e5ba8',
  };
  const lineColorExpr = ['match', ['get', 'line']].concat(Object.entries(LINE_COLOR).flat(), ['#888']);

  const ZONE_STYLE = {
    '公辦市地重劃': { c: '#1f8a7a', fill: 'rgba(31,138,122,0.14)', on: true },
    '自辦市地重劃': { c: '#c8553d', fill: 'rgba(200,85,61,0.12)', on: true },
    '區段徵收':     { c: '#8a5a2b', fill: 'rgba(138,90,43,0.14)', on: true },
    '農地重劃':     { c: '#7d9a4b', fill: 'rgba(125,154,75,0.12)', on: false },
    '農村社區':     { c: '#8d8d8d', fill: 'rgba(141,141,141,0.12)', on: false },
  };
  const zoneExpr = key => ['match', ['get', 'cat']].concat(
    Object.entries(ZONE_STYLE).flatMap(([k, v]) => [k, v[key]]), ['#999']);

  const ROAD_STYLE = {
    freeway:    { name: '國道',         fill: '#f0a04b', casing: '#c9772a', min: 0,
                  w: [[9, 1.6], [12, 3], [15, 7], [18, 16]] },
    expressway: { name: '快速公路',     fill: '#f7c35f', casing: '#cf9a36', min: 0,
                  w: [[9, 1.2], [12, 2.6], [15, 6], [18, 14]] },
    primary:    { name: '省道・主要道路', fill: '#fde39a', casing: '#d8bb6a', min: 10,
                  w: [[10, 0.6], [12, 1.8], [15, 5], [18, 12]] },
    arterial:   { name: '市區重要幹道', fill: '#ffe6c4', casing: '#dcae72', min: 10.5,
                  w: [[10.5, 0.5], [12, 1.4], [15, 4.6], [18, 11]] },
    secondary:  { name: '次要道路',     fill: '#ffffff', casing: '#c7c2cf', min: 11.5,
                  w: [[11.5, 0.6], [13, 1.6], [15, 4], [18, 10]] },
  };

  const HL = '#ff5a36'; // 清單滑過時的標示色
  const NONE = ['==', ['get', 'name'], '\u0000'];

  const FONT = ['Noto Sans Regular'];
  const FONT_BOLD = ['Noto Sans Bold'];
  const HALO = { 'text-halo-color': '#ffffff', 'text-halo-width': 1.6, 'text-halo-blur': 0.3 };

  const style = {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      // 淡色底圖：OpenFreeMap 向量圖磚（免金鑰），只取水域、綠地、建物、小路，主要道路用自己的資料
      omt: {
        type: 'vector', url: 'https://tiles.openfreemap.org/planet',
        attribution: '底圖 <a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
      // 詳細：國土測繪中心通用版電子地圖（中文標示最完整）；航照：國土測繪中心正射影像
      'base-osm': {
        type: 'raster', tileSize: 256, maxzoom: 19,
        tiles: ['https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}'],
        attribution: '電子地圖 © <a href="https://maps.nlsc.gov.tw/">內政部國土測繪中心</a>',
      },
      'base-sat': {
        type: 'raster', tileSize: 256, maxzoom: 19,
        tiles: ['https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}'],
        attribution: '正射影像 © <a href="https://maps.nlsc.gov.tw/">內政部國土測繪中心</a>',
      },
      mask: { type: 'geojson', data: TC.districts.mask },
      districts: { type: 'geojson', data: TC.districts.polygons, generateId: true },
      'district-labels': { type: 'geojson', data: TC.districts.labels },
      zones: { type: 'geojson', data: TC.zones.polygons, attribution: '重劃區 © 臺中市政府地政局' },
      'zone-labels': { type: 'geojson', data: TC.zones.labels },
      roads: { type: 'geojson', data: { type: 'FeatureCollection', features: TC.roads.features },
        attribution: '道路・鐵道 © OpenStreetMap；行政區界 © 內政部國土測繪中心' },
      rail: { type: 'geojson', data: TC.transit.rail },
      metro: { type: 'geojson', data: TC.transit.metro },
      stations: { type: 'geojson', data: TC.transit.stations },
      'future-stations': { type: 'geojson', data: TC.transit.futureStations },
    },
    layers: [],
  };

  const L = style.layers;
  const group = {}; // 圖層分組，給面板開關用
  function add(g, layer) { L.push(layer); (group[g] = group[g] || []).push(layer.id); }

  // ---------- 底圖 ----------
  const light = [
    { id: 'bg', type: 'background', paint: { 'background-color': '#f6f5f2' } },
    { id: 'landcover', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass', 'farmland']]],
      paint: { 'fill-color': ['match', ['get', 'class'], 'farmland', '#eef0e2', '#e4eddb'], 'fill-opacity': 0.8 } },
    { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': '#d9ead0' } },
    { id: 'landuse', type: 'fill', source: 'omt', 'source-layer': 'landuse', minzoom: 12,
      filter: ['in', ['get', 'class'], ['literal', ['school', 'university', 'college', 'hospital', 'cemetery', 'pitch', 'stadium']]],
      paint: { 'fill-color': ['match', ['get', 'class'], 'hospital', '#f5e3e3', 'cemetery', '#e3e8dc', ['school', 'university', 'college'], '#f1ead6', '#e0eed6'] } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#c4dcee' } },
    { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway',
      paint: { 'line-color': '#c4dcee', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 16, 3] } },
    { id: 'aeroway', type: 'line', source: 'omt', 'source-layer': 'aeroway', minzoom: 11,
      filter: ['==', ['get', 'class'], 'runway'],
      paint: { 'line-color': '#dcd9e2', 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 11, 3, 16, 30] } },
    { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14,
      paint: { 'fill-color': '#e7e4ea', 'fill-outline-color': '#d9d5de' } },
    { id: 'minor-road-casing', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 13,
      filter: ['in', ['get', 'class'], ['literal', ['tertiary', 'minor', 'service']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#dedae3', 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 13, 1.5, 16, 6, 18, 14] } },
    { id: 'minor-road', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 12,
      filter: ['in', ['get', 'class'], ['literal', ['tertiary', 'minor', 'service']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['step', ['zoom'], '#e4e0e8', 13, '#ffffff'],
        'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 12, 0.5, 13, 0.8, 16, 4.5, 18, 11] } },
  ];
  light.forEach(l => add('base-light', l));
  add('base-osm', { id: 'base-osm', type: 'raster', source: 'base-osm', layout: { visibility: 'none' } });
  add('base-sat', { id: 'base-sat', type: 'raster', source: 'base-sat', layout: { visibility: 'none' } });

  // ---------- 市界外淡化 ----------
  add('mask', { id: 'mask', type: 'fill', source: 'mask', paint: { 'fill-color': '#f4f3f6', 'fill-opacity': 0.6 } });

  // ---------- 行政區面（點擊、滑過用） ----------
  add('districts', { id: 'district-fill', type: 'fill', source: 'districts',
    paint: { 'fill-color': '#5b5270', 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.06, 0] } });

  // ---------- 重劃區 ----------
  const zoneOn = () => Object.keys(ZONE_STYLE).filter(k => ZONE_STYLE[k].on);
  const zoneFilter = () => ['in', ['get', 'cat'], ['literal', zoneOn()]];
  add('zones', { id: 'zone-fill', type: 'fill', source: 'zones', filter: zoneFilter(),
    layout: { visibility: 'none' }, paint: { 'fill-color': zoneExpr('fill') } });
  add('zones', { id: 'zone-line', type: 'line', source: 'zones', filter: zoneFilter(),
    layout: { visibility: 'none', 'line-join': 'round' },
    paint: { 'line-color': zoneExpr('c'), 'line-opacity': 0.85,
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 13, 1.4, 16, 2.2] } });

  // ---------- 標示用（清單滑過時） ----------
  const hlFill = { 'fill-color': HL, 'fill-opacity': 0.16 };
  const hlLine = { 'line-color': HL, 'line-opacity': 0.9, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2, 14, 3.5] };
  L.push({ id: 'hl-district-fill', type: 'fill', source: 'districts', filter: NONE, paint: hlFill });
  L.push({ id: 'hl-zone-fill', type: 'fill', source: 'zones', filter: NONE, paint: hlFill });
  const glow = { 'line-color': HL, 'line-opacity': 0.5, 'line-blur': 1,
    'line-width': ['interpolate', ['linear'], ['zoom'], 9, 7, 13, 11, 16, 18, 18, 28] };
  L.push({ id: 'hl-road', type: 'line', source: 'roads', filter: NONE,
    layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: glow });

  // ---------- 道路 ----------
  const widthExpr = (stops, extra = 0) => ['interpolate', ['exponential', 1.5], ['zoom']]
    .concat(stops.flatMap(([z, w]) => [z, w + extra * (z >= 15 ? 2 : z <= 10 ? 0.8 : 0.8 + (z - 10) * 0.24)]));
  const roadOrder = ['secondary', 'arterial', 'primary', 'expressway', 'freeway'];
  roadOrder.forEach(cls => {
    const s = ROAD_STYLE[cls];
    add('road:' + cls, { id: `road-${cls}-casing`, type: 'line', source: 'roads', minzoom: s.min,
      filter: ['==', ['get', 'cls'], cls], layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': s.casing, 'line-width': widthExpr(s.w, 1) } });
  });
  roadOrder.forEach(cls => {
    const s = ROAD_STYLE[cls];
    add('road:' + cls, { id: `road-${cls}`, type: 'line', source: 'roads', minzoom: s.min,
      filter: ['==', ['get', 'cls'], cls], layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': s.fill, 'line-width': widthExpr(s.w) } });
  });

  // 標示道路本身（蓋在道路上，細實線）
  L.push({ id: 'hl-road-top', type: 'line', source: 'roads', filter: NONE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': HL, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2, 14, 3.5, 18, 6] } });

  // 區塊標示外框蓋在道路上（重劃區界多半沿著道路）
  L.push({ id: 'hl-district-line', type: 'line', source: 'districts', filter: NONE, paint: hlLine });
  L.push({ id: 'hl-zone-line', type: 'line', source: 'zones', filter: NONE, paint: hlLine });

  // ---------- 臺鐵・高鐵 ----------
  L.push({ id: 'hl-rail', type: 'line', source: 'rail', filter: NONE, paint: glow });
  add('rail', { id: 'rail-hsr', type: 'line', source: 'rail', filter: ['==', ['get', 'kind'], 'hsr'],
    paint: { 'line-color': '#b5835a', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.2, 14, 3] } });
  add('rail', { id: 'rail-tra-base', type: 'line', source: 'rail', filter: ['==', ['get', 'kind'], 'tra'],
    paint: { 'line-color': '#777080', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.4, 14, 3.5] } });
  add('rail', { id: 'rail-tra-dash', type: 'line', source: 'rail', minzoom: 11, filter: ['==', ['get', 'kind'], 'tra'],
    paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 14, 1.6], 'line-dasharray': [3, 3] } });

  // ---------- 行政區界線 ----------
  add('districts', { id: 'district-line', type: 'line', source: 'districts',
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': '#7b6f99',
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 12, 1.4, 16, 2.4],
      'line-dasharray': [3, 2],
      'line-opacity': 0.85,
    } });

  // ---------- 捷運 ----------
  const METRO_CATS = {
    'metro-open':  { name: '捷運・營運中', status: ['open'] },
    'metro-build': { name: '捷運・施工中', status: ['build'] },
    'metro-plan':  { name: '捷運・規劃中', status: ['plan', 'study', 'study_ok'] },
  };
  const metroOn = new Set(TC.transit.metro.features.map(f => f.properties.line));
  const inLines = () => ['in', ['get', 'line'], ['literal', [...metroOn]]];
  const metroStops = [[9, 2], [12, 3.5], [15, 6], [18, 9]];
  const metroW = ['interpolate', ['linear'], ['zoom']].concat(metroStops.flat());
  const metroCasingW = ['interpolate', ['linear'], ['zoom']].concat(metroStops.flatMap(([z, w]) => [z, w + 2]));
  const metroBase = {
    'metro-future-plan': ['in', ['get', 'status'], ['literal', ['plan', 'study', 'study_ok']]],
    'metro-future-build': ['==', ['get', 'status'], 'build'],
    'metro-open-casing': ['==', ['get', 'status'], 'open'],
    'metro-open': ['==', ['get', 'status'], 'open'],
    'metro-line-label': ['!=', ['get', 'status'], 'open'],
  };
  L.push({ id: 'hl-metro', type: 'line', source: 'metro', filter: NONE, paint: glow });
  L.push({ id: 'metro-future-plan', type: 'line', source: 'metro', filter: metroBase['metro-future-plan'],
    layout: { 'line-join': 'round' },
    paint: { 'line-color': lineColorExpr, 'line-width': metroW, 'line-dasharray': [1.2, 1],
      'line-opacity': ['case', ['get', 'precise'], 0.9, 0.7] } });
  L.push({ id: 'metro-future-build', type: 'line', source: 'metro', filter: metroBase['metro-future-build'],
    layout: { 'line-join': 'round' },
    paint: { 'line-color': lineColorExpr, 'line-width': metroW, 'line-dasharray': [3, 1.2] } });
  L.push({ id: 'metro-open-casing', type: 'line', source: 'metro', filter: metroBase['metro-open-casing'],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': metroCasingW } });
  L.push({ id: 'metro-open', type: 'line', source: 'metro', filter: metroBase['metro-open'],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': lineColorExpr, 'line-width': metroW } });

  // ---------- 車站點 ----------
  const stR = ['interpolate', ['linear'], ['zoom'], 10, 2.5, 13, 4.5, 16, 7];
  L.push({ id: 'future-station-dot', type: 'circle', source: 'future-stations', minzoom: 12,
    paint: { 'circle-radius': stR, 'circle-color': '#ffffff', 'circle-stroke-color': lineColorExpr,
      'circle-stroke-width': 2, 'circle-stroke-opacity': 0.8 } });
  add('rail', { id: 'rail-station-dot', type: 'circle', source: 'stations', minzoom: 10,
    filter: ['in', ['get', 'kind'], ['literal', ['tra', 'hsr']]],
    paint: { 'circle-radius': stR, 'circle-color': '#ffffff',
      'circle-stroke-color': ['match', ['get', 'kind'], 'hsr', '#b5835a', '#5f586a'], 'circle-stroke-width': 2 } });
  L.push({ id: 'metro-station-dot', type: 'circle', source: 'stations', minzoom: 10,
    filter: ['==', ['get', 'kind'], 'metro'],
    paint: { 'circle-radius': stR, 'circle-color': '#ffffff', 'circle-stroke-color': LINE_COLOR.green, 'circle-stroke-width': 2.2 } });

  // ---------- 文字：小路、河川（底圖資料） ----------
  add('base-light', { id: 'minor-road-label', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 15.5,
    filter: ['in', ['get', 'class'], ['literal', ['tertiary', 'minor']]],
    layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:zh-Hant'], ['get', 'name']],
      'text-font': FONT, 'text-size': 11, 'symbol-spacing': 250, 'text-max-angle': 30 },
    paint: Object.assign({ 'text-color': '#857f8e' }, HALO) });
  add('base-light', { id: 'waterway-label', type: 'symbol', source: 'omt', 'source-layer': 'waterway', minzoom: 12.5,
    filter: ['in', ['get', 'class'], ['literal', ['river', 'canal', 'stream']]],
    layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:zh-Hant'], ['get', 'name']],
      'text-font': FONT, 'text-size': 11.5, 'symbol-spacing': 400, 'text-letter-spacing': 0.2 },
    paint: Object.assign({ 'text-color': '#4f7fa6' }, HALO) });

  // ---------- 文字：重劃區名 ----------
  add('zones', { id: 'zone-label', type: 'symbol', source: 'zone-labels', minzoom: 11, filter: zoneFilter(),
    layout: { visibility: 'none', 'text-field': ['get', 'name'], 'text-font': FONT,
      'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10.5, 15, 13], 'text-max-width': 7,
      'symbol-sort-key': ['-', 0, ['get', 'area']], 'text-padding': 3 },
    paint: Object.assign({ 'text-color': zoneExpr('c') }, HALO) });

  // ---------- 文字：道路 ----------
  const roadText = (cls, min, size, color, font) => add('road:' + cls, {
    id: `road-label-${cls}`, type: 'symbol', source: 'roads', minzoom: min, filter: ['==', ['get', 'cls'], cls],
    layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': font || FONT,
      'text-size': size, 'symbol-spacing': 320, 'text-max-angle': 30, 'text-padding': 4 },
    paint: Object.assign({ 'text-color': color }, HALO) });
  roadText('secondary', 14.5, ['interpolate', ['linear'], ['zoom'], 14.5, 11, 18, 13], '#6b6478');
  roadText('arterial', 13, ['interpolate', ['linear'], ['zoom'], 13, 11, 16, 13], '#6e5431');
  roadText('primary', 12.5, ['interpolate', ['linear'], ['zoom'], 12.5, 11, 16, 13.5], '#5c5446');
  roadText('expressway', 10, ['interpolate', ['linear'], ['zoom'], 10, 11, 15, 13], '#a35a14', FONT_BOLD);
  roadText('freeway', 10, ['interpolate', ['linear'], ['zoom'], 10, 11, 15, 13], '#a35a14', FONT_BOLD);

  // ---------- 文字：捷運路線名（中低縮放時沿線標示） ----------
  L.push({ id: 'metro-line-label', type: 'symbol', source: 'metro', minzoom: 10, maxzoom: 13.5,
    filter: metroBase['metro-line-label'],
    layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-font': FONT_BOLD,
      'text-size': 12, 'symbol-spacing': 600, 'text-max-angle': 25 },
    paint: Object.assign({ 'text-color': lineColorExpr }, HALO) });

  // ---------- 文字：車站 ----------
  L.push({ id: 'future-station-label', type: 'symbol', source: 'future-stations', minzoom: 13,
    layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 11,
      'text-anchor': 'left', 'text-offset': [0.8, 0], 'text-optional': true },
    paint: Object.assign({ 'text-color': lineColorExpr }, HALO) });
  add('rail', { id: 'rail-station-label', type: 'symbol', source: 'stations', minzoom: 11.5,
    filter: ['in', ['get', 'kind'], ['literal', ['tra', 'hsr']]],
    layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': ['interpolate', ['linear'], ['zoom'], 11.5, 11, 16, 13],
      'text-anchor': 'right', 'text-offset': [-0.8, 0], 'text-optional': true },
    paint: Object.assign({ 'text-color': '#4a4452' }, HALO) });
  L.push({ id: 'metro-station-label', type: 'symbol', source: 'stations', minzoom: 11.5,
    filter: ['==', ['get', 'kind'], 'metro'],
    layout: { 'text-field': ['get', 'name'], 'text-font': FONT_BOLD, 'text-size': ['interpolate', ['linear'], ['zoom'], 11.5, 11, 16, 13.5],
      'text-anchor': 'left', 'text-offset': [0.8, 0], 'text-optional': true },
    paint: Object.assign({ 'text-color': '#3f7a17' }, HALO) });

  // ---------- 文字：行政區名（最上層） ----------
  add('districts', { id: 'district-label', type: 'symbol', source: 'district-labels',
    layout: {
      'text-field': ['get', 'name'], 'text-font': FONT_BOLD,
      'text-size': ['interpolate', ['linear'], ['zoom'], 9, 11, 11, 14, 13, 18, 16, 22],
      'text-letter-spacing': 0.15, 'text-padding': 2,
    },
    paint: Object.assign({ 'text-color': '#5b5270',
      'text-opacity': ['interpolate', ['linear'], ['zoom'], 15, 1, 17, 0.5] }, HALO, { 'text-halo-width': 2 }) });

  // ---------- 建立地圖 ----------
  const map = new maplibregl.Map({
    container: 'map', style,
    center: [120.665, 24.155], zoom: 11.3,
    minZoom: 8.5, maxZoom: 18.5,
    maxBounds: [[119.9, 23.6], [121.9, 24.75]],
    hash: true,
    localIdeographFontFamily: "'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', sans-serif",
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
  map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), 'top-right');
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();

  function setVisible(ids, on) {
    ids.forEach(id => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'));
  }

  // ---------- 標示（清單滑過／點選） ----------
  const HL_LAYERS = {
    district: ['hl-district-fill', 'hl-district-line'],
    zone: ['hl-zone-fill', 'hl-zone-line'],
    road: ['hl-road', 'hl-road-top'], metro: ['hl-metro'], rail: ['hl-rail'],
  };
  const HL_FILTERS = {
    district: key => ['==', ['get', 'name'], key],
    zone: key => ['==', ['get', 'id'], key],
    road: key => ['all', ['==', ['get', 'cls'], key.cls], ['==', ['get', 'name'], key.name]],
    metro: key => ['==', ['get', 'line'], key],
    rail: key => ['==', ['get', 'kind'], key],
  };
  const hlFilter = (type, key) => HL_FILTERS[type](key);
  let pinned = null; // {type, key, li}
  function highlight(type, key) {
    Object.entries(HL_LAYERS).forEach(([t, ids]) => ids.forEach(id =>
      map.setFilter(id, t === type ? hlFilter(type, key) : NONE)));
  }
  function clearHighlight() {
    if (pinned) highlight(pinned.type, pinned.key);
    else Object.values(HL_LAYERS).flat().forEach(id => map.setFilter(id, NONE));
  }
  function unpin() {
    if (pinned && pinned.li) pinned.li.classList.remove('pinned');
    pinned = null;
    clearHighlight();
  }
  const panel = document.getElementById('panel');
  function flyTo(bbox) {
    const left = panel.classList.contains('collapsed') || window.innerWidth < 600 ? 40 : panel.offsetWidth + 40;
    map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: { left, right: 60, top: 40, bottom: 40 }, maxZoom: 15.5, duration: 700 });
  }

  // ---------- 面板：類別列 ----------
  // cat: { id, name, swatch (html), count, on (bool|null), onToggle, items: [{ type, key, name, sub, val, dot, bbox }] }
  function renderCat(container, cat) {
    const el = document.createElement('div');
    el.className = 'cat' + (cat.on === false ? ' off' : '');
    el.dataset.cat = cat.id;
    const hasSwitch = cat.on !== null && cat.on !== undefined;
    el.innerHTML = `<div class="cat-head">
        ${hasSwitch ? `<span class="switch"><input type="checkbox" ${cat.on ? 'checked' : ''} aria-label="顯示${cat.name}"><span></span></span>` : ''}
        ${cat.swatch}
        <span class="cat-name">${cat.name}</span>
        <span class="count">${cat.items.length}</span>
        <span class="cat-chev"></span>
      </div>
      <ul class="items" hidden></ul>`;
    const head = el.querySelector('.cat-head');
    const ul = el.querySelector('.items');
    const cb = el.querySelector('input');
    if (cb) {
      cb.addEventListener('click', e => e.stopPropagation());
      cb.addEventListener('change', () => { el.classList.toggle('off', !cb.checked); cat.onToggle(cb.checked); });
    }
    let built = false;
    head.addEventListener('click', () => {
      if (!built) { buildItems(ul, cat.items); built = true; }
      ul.hidden = !ul.hidden;
      el.classList.toggle('open', !ul.hidden);
    });
    container.appendChild(el);
    return el;
  }

  function buildItems(ul, items) {
    items.forEach(it => {
      const li = document.createElement('li');
      li.innerHTML = (it.dot ? `<span class="dot" style="background:${it.dot}"></span>` : '') +
        `<span class="nm">${it.name}</span><span class="sub">${it.sub || ''}</span><span class="val">${it.val || ''}</span>`;
      if (it.sub) li.title = it.name + '　' + it.sub;
      if (it.decorate) it.decorate(li);   // 讓其他模組在名稱前加按鈕（例如建案的星號）
      li.addEventListener('mouseenter', () => highlight(it.type, it.key));
      li.addEventListener('mouseleave', clearHighlight);
      li.addEventListener('click', () => {
        if (it.onClick) { it.onClick(); return; }
        if (pinned && pinned.li) pinned.li.classList.remove('pinned');
        pinned = { type: it.type, key: it.key, li };
        li.classList.add('pinned');
        highlight(it.type, it.key);
        if (it.bbox) flyTo(it.bbox);
      });
      ul.appendChild(li);
    });
  }

  const shortTowns = ts => ts.length > 4 ? ts.slice(0, 4).join('・') + '…' : ts.join('・');
  const bboxOf = coordsList => {
    const b = [180, 90, -180, -90];
    coordsList.forEach(([x, y]) => { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); });
    return b;
  };
  const flatCoords = g => g.type === 'LineString' ? g.coordinates : g.coordinates.flat();

  // 分區：行政區
  const areaBox = document.getElementById('cats-area');
  const districtCat = renderCat(areaBox, {
    id: 'districts', name: '行政區', on: null,
    swatch: '<span class="swatch area dashed" style="--c:#7b6f99;--fill:rgba(123,111,153,0.08)"></span>',
    items: TC.districts.polygons.features.slice()
      .sort((a, b) => a.properties.code.localeCompare(b.properties.code))
      .map(f => ({ type: 'district', key: f.properties.name, name: f.properties.name,
        val: f.properties.area + ' km²', bbox: f.properties.bbox })),
  });
  // 分區：重劃區各類
  const zoneCats = Object.entries(ZONE_STYLE).map(([cat, s]) => renderCat(areaBox, {
    id: 'zone:' + cat, name: cat, on: s.on,
    swatch: `<span class="swatch area" style="--c:${s.c};--fill:${s.fill}"></span>`,
    onToggle: on => { s.on = on; ['zone-fill', 'zone-line', 'zone-label'].forEach(id => map.setFilter(id, zoneFilter())); },
    items: TC.zones.polygons.features.filter(f => f.properties.cat === cat).map(f => ({
      type: 'zone', key: f.properties.id, name: f.properties.name, sub: f.properties.towns.join('・'),
      val: f.properties.area + ' 公頃', bbox: f.properties.bbox })),
  }));

  let areaMode = 'districts';
  function setAreaMode(mode) {
    areaMode = mode;
    document.querySelectorAll('#area-mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
    const showD = mode !== 'zones', showZ = mode !== 'districts';
    setVisible(group.districts, showD);
    setVisible(group.zones, showZ);
    districtCat.hidden = !showD;
    zoneCats.forEach(el => { el.hidden = !showZ; });
  }
  document.querySelectorAll('#area-mode button').forEach(b => b.addEventListener('click', () => setAreaMode(b.dataset.mode)));
  setAreaMode(areaMode);
  map.on('load', () => setAreaMode(areaMode));

  // 道路
  const roadBox = document.getElementById('cats-roads');
  ['freeway', 'expressway', 'primary', 'arterial', 'secondary'].forEach(cls => {
    const s = ROAD_STYLE[cls];
    renderCat(roadBox, {
      id: 'road:' + cls, name: s.name, on: true,
      swatch: `<span class="swatch road" style="--fill:${s.fill};--casing:${s.casing}"></span>`,
      onToggle: on => setVisible(group['road:' + cls], on),
      items: TC.roads.index.filter(r => r.cls === cls).map(r => ({
        type: 'road', key: { cls, name: r.name }, name: r.name, sub: shortTowns(r.towns),
        val: r.km + ' km', bbox: r.bbox })),
    });
  });

  // 軌道：捷運三類 + 臺鐵高鐵
  const railBox = document.getElementById('cats-rail');
  function applyMetro() {
    Object.entries(metroBase).forEach(([id, base]) => map.setFilter(id, ['all', base, inLines()]));
    setVisible(['metro-station-dot', 'metro-station-label'], metroOn.has('green'));
    const codes = TC.transit.futureStations.features
      .filter(f => f.properties.lines.split(',').some(l => metroOn.has(l)))
      .map(f => f.properties.code);
    ['future-station-dot', 'future-station-label'].forEach(id => map.setFilter(id, ['in', ['get', 'code'], ['literal', codes]]));
  }
  const dashClass = { open: '', build: 'dash-long', plan: 'dash-short', study: 'dash-short', study_ok: 'dash-short' };
  Object.entries(METRO_CATS).forEach(([id, mc]) => {
    const feats = TC.transit.metro.features.filter(f => mc.status.includes(f.properties.status));
    const colors = [...new Set(feats.map(f => LINE_COLOR[f.properties.line]))];
    const swatchStyle = colors.length > 1
      ? `--c:${colors[0]};--grad:linear-gradient(90deg,${colors.join(',')})` : `--c:${colors[0]}`;
    renderCat(railBox, {
      id, name: mc.name, on: true,
      swatch: `<span class="swatch line ${dashClass[mc.status[0]]} ${colors.length > 1 ? 'multi' : ''}" style="${swatchStyle}"></span>`,
      onToggle: on => { feats.forEach(f => on ? metroOn.add(f.properties.line) : metroOn.delete(f.properties.line)); applyMetro(); },
      items: feats.map(f => ({ type: 'metro', key: f.properties.line, name: f.properties.name,
        sub: f.properties.statusText, val: f.properties.km ? f.properties.km + ' km' : '',
        dot: LINE_COLOR[f.properties.line], bbox: bboxOf(flatCoords(f.geometry)) })),
    });
  });
  renderCat(railBox, {
    id: 'rail', name: '臺鐵・高鐵', on: true,
    swatch: '<span class="swatch rail"></span>',
    onToggle: on => setVisible(group.rail, on),
    items: [['tra', '臺鐵', '山線・海線・成追線', '#777080'], ['hsr', '台灣高鐵', '', '#b5835a']].map(([k, n, sub, dot]) => ({
      type: 'rail', key: k, name: n, sub, dot,
      bbox: bboxOf(TC.transit.rail.features.filter(f => f.properties.kind === k).flatMap(f => flatCoords(f.geometry))) })),
  });

  // 底圖
  document.querySelectorAll('#basemap button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#basemap button').forEach(b => b.classList.toggle('on', b === btn));
      ['light', 'osm', 'sat'].forEach(k => setVisible(group['base-' + k], k === btn.dataset.base));
      // 詳細／航照底圖本身已有道路，道路填色改淡一點避免太搶
      const dim = btn.dataset.base !== 'light';
      Object.keys(ROAD_STYLE).forEach(c => {
        map.setPaintProperty(`road-${c}`, 'line-opacity', dim ? 0.55 : 1);
        map.setPaintProperty(`road-${c}-casing`, 'line-opacity', dim ? 0.4 : 1);
      });
    });
  });
  document.getElementById('mask-toggle').addEventListener('change', e => setVisible(group.mask, e.target.checked));
  document.getElementById('panel-toggle').addEventListener('click', () => panel.classList.toggle('collapsed'));

  // ---------- 狀態列 ----------
  const zoomEl = document.getElementById('zoom');
  const coordEl = document.getElementById('coord');
  const showZoom = () => { zoomEl.textContent = '縮放 ' + map.getZoom().toFixed(1); };
  map.on('zoom', showZoom);
  map.on('load', showZoom);
  map.on('mousemove', e => { coordEl.textContent = e.lngLat.lat.toFixed(5) + ', ' + e.lngLat.lng.toFixed(5); });

  // ---------- 點擊資訊 ----------
  const clickable = ['metro-open', 'metro-future-build', 'metro-future-plan', 'metro-station-dot',
    'rail-station-dot', 'future-station-dot'].concat(Object.keys(ROAD_STYLE).map(c => 'road-' + c));
  const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' });
  const LINE_NAME = { blue: '藍線', blue_taiping: '藍線延伸太平', orange: '橘線', purple: '屯區環狀線' };

  function describe(f) {
    const p = f.properties;
    switch (f.layer.id) {
      case 'metro-open':
      case 'metro-future-build':
      case 'metro-future-plan':
        return `<h3 style="color:${LINE_COLOR[p.line]}">${p.name}</h3><div>${p.statusText}</div>
          <div class="muted">${p.detail}</div>` +
          (p.precise === false ? '<div class="muted">線形依市府說明會簡報路線圖沿道路繪製，非定案位置。</div>' : '');
      case 'metro-station-dot':
        return `<h3>捷運${p.name}站</h3><div class="muted">綠線</div>`;
      case 'rail-station-dot':
        return `<h3>${p.label}</h3><div class="muted">${p.kind === 'hsr' ? '台灣高鐵' : '臺鐵'}</div>`;
      case 'future-station-dot': {
        const lines = p.lines.split(',').map(l => LINE_NAME[l] || l).join('、');
        return `<h3 style="color:${LINE_COLOR[p.line]}">${p.code}${p.name ? ' ' + p.name : ''}</h3>
          <div>${lines}${p.interchange ? '（轉乘站）' : ''}</div>
          <div class="muted">站名未定案以代號表示；位置依官方里程或說明會簡報的地標推估，可能有一兩百公尺誤差。</div>`;
      }
      default:
        if (f.layer.id.startsWith('road-')) {
          return `<h3>${p.full || '（未命名道路）'}</h3><div class="muted">${ROAD_STYLE[p.cls].name}</div>`;
        }
    }
    return '';
  }

  const clickHandlers = []; // 其他模組（建案）先處理點擊，回傳 true 表示已處理
  map.on('click', e => {
    unpin();
    if (clickHandlers.some(h => h(e))) return;
    const visible = id => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none';
    const pad = 6;
    const hits = map.queryRenderedFeatures([[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]],
      { layers: clickable.filter(visible) });
    // 優先順序：車站 > 捷運線 > 道路 > 重劃區 > 行政區
    const rank = id => id.includes('station') ? 0 : id.startsWith('metro') ? 1 : 2;
    hits.sort((a, b) => rank(a.layer.id) - rank(b.layer.id));
    let html = hits.length ? describe(hits[0]) : '';
    if (!html && visible('zone-fill')) {
      const z = map.queryRenderedFeatures(e.point, { layers: ['zone-fill'] })[0];
      if (z) {
        const p = z.properties;
        html = `<h3 style="color:${ZONE_STYLE[p.cat].c}">${p.name}</h3><div>${p.cat}</div>
          <div class="muted">${JSON.parse(p.towns).join('、')}・${p.area} 公頃</div>`;
      }
    }
    if (!html && visible('district-fill')) {
      const d = map.queryRenderedFeatures(e.point, { layers: ['district-fill'] })[0];
      if (d) html = `<h3>${d.properties.name}</h3><div class="muted">面積 ${d.properties.area} 平方公里</div>`;
    }
    if (html) popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
  });

  // 滑到可點的東西上變手指；行政區加一點底色
  let hoverId = null;
  map.on('mousemove', e => {
    const layers = clickable.filter(id => map.getLayer(id));
    const onFeature = map.queryRenderedFeatures([[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]], { layers }).length > 0;
    map.getCanvas().style.cursor = onFeature ? 'pointer' : '';
    const d = areaMode !== 'zones' ? map.queryRenderedFeatures(e.point, { layers: ['district-fill'] })[0] : null;
    const id = d ? d.id : null;
    if (id !== hoverId) {
      if (hoverId !== null) map.setFeatureState({ source: 'districts', id: hoverId }, { hover: false });
      if (id !== null && id !== undefined) map.setFeatureState({ source: 'districts', id }, { hover: true });
      hoverId = id;
    }
  });

  window.map = map; // 方便除錯
  // 給其他模組（js/projects.js）使用
  window.TCApp = {
    map, panel, renderCat, buildItems, setVisible, highlight, clearHighlight, unpin, clickHandlers,
    NONE, HL, FONT, FONT_BOLD, HALO,
    registerHighlight(type, layerIds, filterFn) { HL_LAYERS[type] = layerIds; HL_FILTERS[type] = filterFn; },
  };
})();
