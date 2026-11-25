'use strict';

const localityEndpoint = 'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/SAL/MapServer/0/query';
const localityFields = 'sal_code_2021,sal_name_2021,state_code_2021';
const localZoom = 8;
const pageSize = 200;

async function queryLocalities(params, signal) {
  const query = new URLSearchParams({where: '1=1', outFields: localityFields, ...params});
  const response = await fetch(localityEndpoint + '?' + query, {signal});
  if (!response.ok) throw new Error('ABS request failed');
  const data = await response.json();
  if (data.error || !Array.isArray(data.features)) throw new Error('ABS returned an invalid response');
  return data;
}

function readLocalityCsv(text) {
  const [header, ...rows] = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (header.trim().toLowerCase() !== 'sal_code,month,transactions') {
    throw new Error('Use the header sal_code,month,transactions.');
  }
  const values = new Map();
  for (const [index, line] of rows.entries()) {
    if (!line.trim()) continue;
    const fields = line.split(',').map(value => value.trim().replace(/^"([^"]*)"$/, '$1'));
    const [code, month, value] = fields;
    if (fields.length !== 3 || !/^[1-9]\d{4}$/.test(code)
        || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !/^\d+$/.test(value)
        || !Number.isSafeInteger(Number(value))) {
      throw new Error('Invalid suburb code, month or transaction count on row ' + (index + 2) + '.');
    }
    if (!values.has(month)) values.set(month, new Map());
    if (values.get(month).has(code)) throw new Error('Duplicate suburb and month on row ' + (index + 2) + '.');
    values.get(month).set(code, Number(value));
  }
  if (!values.size) throw new Error('Add at least one row of suburb data.');
  return values;
}

window.initLocalities = function ({map, month, search, places, urban, filter, refresh, volume, colors, limits, format, states}) {
  const element = id => document.getElementById(id);
  const boundary = element('boundary');
  const status = element('boundary-status');
  const details = element('selection');
  const csv = element('local-csv');
  const csvStatus = element('csv-status');
  const demoButton = element('demo-data');
  const legend = element('legend');
  const noDataKey = document.createElement('li');
  const noDataSwatch = document.createElement('i');
  noDataSwatch.style.backgroundColor = '#c5ced3';
  noDataKey.append(noDataSwatch, 'No data');
  const stateNames = new Map(states.features.map(({properties}) => [properties.code, properties.name]));
  const demoMonths = Array.from(month.options, option => [option.text, option.value]);
  const demoDescription = 'Select a suburb boundary or search by suburb name or ABS code.';
  let uploaded;
  let csvRead = 0;
  let selected;
  let viewportRequest;
  let searchRequest;
  let selectionRequest;
  let viewportTimer;
  let searchTimer;
  const localMode = () => boundary.value === 'local';
  const codeOf = feature => feature.properties.sal_code_2021;
  const localityName = properties => properties.sal_name_2021 + ' · ' + stateNames.get(properties.state_code_2021);
  const currentValue = code => uploaded ? uploaded.get(month.value)?.get(code) : volume(code, +month.value);
  const displayedValue = code => {
    const value = currentValue(code);
    return value === undefined ? 'No data for the selected month'
      : format.format(value) + (uploaded ? ' transactions' : ' simulated transactions');
  };

  function paint(feature) {
    const value = currentValue(codeOf(feature));
    return {
      color: '#334952', weight: 0.8, fillOpacity: 0.8,
      fillColor: value === undefined ? '#c5ced3' : colors[limits.filter(limit => value > limit).length]
    };
  }

  const local = L.geoJSON(null, {
    style: paint,
    onEachFeature(feature, layer) {
      const tooltip = document.createElement('span');
      layer.bindTooltip(tooltip).on('tooltipopen', () => {
        tooltip.textContent = localityName(feature.properties) + ' · ' + displayedValue(codeOf(feature));
      });
      layer.on('click', () => {
        selectionRequest?.abort();
        select(feature);
      });
    }
  });
  const highlight = L.geoJSON(null, {
    interactive: false,
    style: {color: '#a24b09', weight: 3, fill: false}
  });

  function renderSelection() {
    if (!selected) {
      details.textContent = demoDescription;
      return;
    }
    const code = codeOf(selected);
    const title = document.createElement('strong');
    const description = document.createElement('p');
    title.textContent = localityName(selected.properties);
    description.textContent = 'ABS ' + code + ' · ' + displayedValue(code);
    details.replaceChildren(title, description);
  }

  function select(feature, zoom = false) {
    selected = feature;
    highlight.clearLayers().addData(feature).bringToFront();
    places.value = codeOf(feature);
    renderSelection();
    if (zoom) map.fitBounds(highlight.getBounds(), {padding: [30, 30], maxZoom: 15});
  }

  function geometryQuery(tolerance) {
    return {f: 'geojson', outSR: '4326', maxAllowableOffset: tolerance};
  }

  async function loadViewport() {
    if (!localMode()) return;
    if (map.getZoom() < localZoom) {
      local.clearLayers();
      status.textContent = 'Zoom in or search to show suburb and locality boundaries.';
      return;
    }
    const request = viewportRequest = new AbortController();
    const bounds = map.getBounds().pad(0.05);
    const tolerance = Math.min(0.001, 0.001 / 2 ** (map.getZoom() - localZoom));
    const params = {
      ...geometryQuery(tolerance),
      geometryType: 'esriGeometryEnvelope',
      geometry: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(','),
      inSR: '4326',
      orderByFields: 'objectid',
      resultRecordCount: pageSize
    };
    status.textContent = 'Loading suburb and locality boundaries…';
    try {
      const features = [];
      for (let offset = 0; ; offset += pageSize) {
        const page = await queryLocalities({...params, resultOffset: offset}, request.signal);
        features.push(...page.features.filter(feature => feature.geometry));
        if (page.features.length < pageSize && !page.exceededTransferLimit) break;
        if (!page.features.length) throw new Error('ABS pagination failed');
      }
      if (request.signal.aborted) return;
      local.clearLayers().addData(features);
      highlight.bringToFront();
      status.textContent = features.length
        ? format.format(features.length) + ' suburb and locality boundaries in view · ABS 2021'
        : 'No suburb or locality boundaries in view.';
    } catch (error) {
      if (!request.signal.aborted) status.textContent = 'ABS boundaries could not load. Move the map to retry.';
    }
  }

  function scheduleViewport() {
    viewportRequest?.abort();
    clearTimeout(viewportTimer);
    if (localMode()) viewportTimer = setTimeout(loadViewport, 180);
  }

  function scheduleSearch() {
    searchRequest?.abort();
    selectionRequest?.abort();
    clearTimeout(searchTimer);
    places.replaceChildren(new Option('Type at least two characters', ''));
    const term = search.value.trim().slice(0, 60);
    if (term.length < 2) return;
    if (!/^[\p{L}\p{M}\p{N} .’'()/-]+$/u.test(term)) {
      places.options[0].text = 'Enter a suburb name or ABS code';
      return;
    }
    places.options[0].text = 'Searching…';
    const request = searchRequest = new AbortController();
    searchTimer = setTimeout(async () => {
      const name = term.toUpperCase().replaceAll("'", "''");
      const where = /^\d{5}$/.test(term) ? "sal_code_2021 = '" + term + "'"
        : "UPPER(sal_name_2021) LIKE '%" + name + "%'";
      try {
        const data = await queryLocalities({
          where, f: 'json', returnGeometry: 'false',
          orderByFields: 'sal_name_2021,state_code_2021,sal_code_2021', resultRecordCount: 75
        }, request.signal);
        if (request.signal.aborted) return;
        const exact = item => item.attributes.sal_name_2021.toUpperCase() === name;
        data.features.sort((a, b) => Number(exact(b)) - Number(exact(a)));
        places.replaceChildren(new Option(data.features.length ? 'Choose a suburb or locality' : 'No matches', ''));
        for (const {attributes} of data.features) {
          places.add(new Option(localityName(attributes), attributes.sal_code_2021));
        }
      } catch (error) {
        if (!request.signal.aborted) places.options[0].text = 'ABS search unavailable. Try again.';
      }
    }, 230);
  }

  async function chooseLocality(code) {
    if (!/^\d{5}$/.test(code)) return;
    selectionRequest?.abort();
    const request = selectionRequest = new AbortController();
    details.textContent = 'Loading selected boundary…';
    try {
      const data = await queryLocalities({
        ...geometryQuery(0.00002), where: "sal_code_2021 = '" + code + "'"
      }, request.signal);
      if (request.signal.aborted) return;
      const feature = data.features.find(item => item.geometry);
      if (feature) select(feature, true);
      else details.textContent = 'No mapped boundary for this locality.';
    } catch (error) {
      if (!request.signal.aborted) details.textContent = 'Boundary unavailable. Choose the suburb again to retry.';
    }
  }

  function updateMonth() {
    map.closeTooltip();
    local.setStyle(paint);
    renderSelection();
  }

  function setMonths() {
    const previous = month.value;
    const months = uploaded && localMode()
      ? [...uploaded.keys()].sort().map(value => [value, value])
      : demoMonths;
    month.replaceChildren(...months.map(([label, value]) => new Option(label, value)));
    if (months.some(([, value]) => value === previous)) month.value = previous;
  }

  csv.addEventListener('change', async () => {
    const file = csv.files[0];
    if (!file) return;
    const read = ++csvRead;
    try {
      const values = readLocalityCsv(await file.text());
      if (read !== csvRead) return;
      uploaded = values;
      demoButton.hidden = false;
      if (localMode()) legend.append(noDataKey);
      csvStatus.textContent = 'Showing ' + file.name;
      if (localMode()) {
        setMonths();
        updateMonth();
      }
    } catch (error) {
      if (read === csvRead) csvStatus.textContent = error.message;
    } finally {
      if (read === csvRead) csv.value = '';
    }
  });

  demoButton.addEventListener('click', () => {
    csvRead++;
    uploaded = undefined;
    demoButton.hidden = true;
    noDataKey.remove();
    csvStatus.textContent = '';
    setMonths();
    updateMonth();
  });

  map.on('moveend', scheduleViewport);
  search.addEventListener('input', () => { if (localMode()) scheduleSearch(); });
  search.addEventListener('keydown', event => {
    if (localMode() && event.key === 'Enter' && places.options[1]) chooseLocality(places.options[1].value);
  });
  places.addEventListener('change', () => { if (localMode()) chooseLocality(places.value); });
  month.addEventListener('change', () => { if (localMode()) updateMonth(); });
  element('reset').addEventListener('click', () => {
    if (!localMode()) return;
    selected = undefined;
    highlight.clearLayers();
    places.value = '';
    renderSelection();
  });

  boundary.addEventListener('change', () => {
    map.closeTooltip();
    search.value = '';
    status.hidden = !localMode();
    element('local-data').hidden = !localMode();
    setMonths();
    if (localMode()) {
      urban.remove();
      local.addTo(map);
      highlight.addTo(map);
      if (uploaded) legend.append(noDataKey);
      search.placeholder = 'e.g. Parramatta or ABS code';
      scheduleSearch();
      renderSelection();
      scheduleViewport();
    } else {
      searchRequest?.abort();
      selectionRequest?.abort();
      scheduleViewport();
      local.clearLayers().remove();
      highlight.clearLayers().remove();
      noDataKey.remove();
      selected = undefined;
      urban.addTo(map);
      search.placeholder = 'e.g. Melbourne';
      details.textContent = 'Select a state for a summary, or search for a city.';
      filter();
      refresh();
    }
  });
};
