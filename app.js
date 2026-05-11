// ── MAP INIT ──────────────────────────────────────────────────────────────────
const map = L.map('map').setView([21.0285, 105.8542], 12);

L.tileLayer('https://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}', {
    attribution: '© Google Maps',
    maxZoom: 20
}).addTo(map);

setTimeout(() => map.invalidateSize(), 300);

// ── STATE ─────────────────────────────────────────────────────────────────────
let rawData   = [];
let heatLayer = null;
const polygons = {};
let polygonIdCounter = 0;

const ZONE_COLORS = [
    '#3388ff','#28a745','#dc3545','#ffc107',
    '#17a2b8','#6610f2','#e83e8c','#fd7e14'
];

// ── DOM REFS ──────────────────────────────────────────────────────────────────
const fileInput     = document.getElementById('csvFileInput');
const serviceFilter = document.getElementById('serviceFilter');
const startDate     = document.getElementById('startDate');
const endDate       = document.getElementById('endDate');
const minHour       = document.getElementById('minHour');
const maxHour       = document.getElementById('maxHour');
const dataStatus    = document.getElementById('dataStatus');
const heatStatus    = document.getElementById('heatStatus');
const fillOpacityEl = document.getElementById('fillOpacity');
const opacityLabel  = document.getElementById('opacityLabel');

// ── OPACITY SLIDER ────────────────────────────────────────────────────────────
fillOpacityEl.addEventListener('input', () => {
    const val = parseFloat(fillOpacityEl.value);
    opacityLabel.textContent = val.toFixed(2) + (Object.keys(polygons).length ? ' — applied to all zones' : '');
    Object.values(polygons).forEach(p => p.setStyle({ fillOpacity: val }));
});

// ── CSV LOAD ──────────────────────────────────────────────────────────────────
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) parseCSV(file);
});

function parseCSV(source) {
    Papa.parse(source, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: ({ data }) => {
            rawData = data;
            initFilters();
            updateHeatmap();
            setStatus(dataStatus, `${rawData.length.toLocaleString()} rows loaded`, 'ok');
        },
        error: (err) => {
            setStatus(dataStatus, `Parse error: ${err.message}`, 'error');
        }
    });
}

// ── FILTERS ───────────────────────────────────────────────────────────────────
function initFilters() {
    const services = new Set();
    const dates    = new Set();

    rawData.forEach(row => {
        if (row.Services) services.add(row.Services);
        if (row.period)   dates.add(row.period);
    });

    // Services
    serviceFilter.innerHTML = '';
    [...services].sort().forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = s;
        opt.selected = true;
        serviceFilter.appendChild(opt);
    });

    // Dates
    const sorted = [...dates].sort((a, b) => new Date(a) - new Date(b));
    [startDate, endDate].forEach(sel => (sel.innerHTML = ''));
    sorted.forEach((d, i) => {
        [startDate, endDate].forEach(sel => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            sel.appendChild(opt);
        });
        if (i === 0)              startDate.lastChild.selected = true;
        if (i === sorted.length - 1) endDate.lastChild.selected = true;
    });

    // Re-center map
    const first = rawData.find(r => r.p_lat && r.p_lng);
    if (first) map.setView([first.p_lat, first.p_lng], 12);
}

document.getElementById('applyFilters').addEventListener('click', updateHeatmap);

function updateHeatmap() {
    if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
    if (!rawData.length) return;

    const selectedServices = new Set(
        Array.from(serviceFilter.selectedOptions).map(o => o.value)
    );
    const minH   = parseInt(minHour.value) || 0;
    const maxH   = parseInt(maxHour.value) || 23;
    const startD = new Date(startDate.value);
    const endD   = new Date(endDate.value);

    const heatData = [];

    rawData.forEach(row => {
        if (!row.p_lat || !row.p_lng) return;
        const rowDate = new Date(row.period);
        const rowHour = row.Order_hour;

        if (
            selectedServices.has(row.Services) &&
            rowHour >= minH && rowHour <= maxH &&
            rowDate >= startD && rowDate <= endD
        ) {
            heatData.push([row.p_lat, row.p_lng, 1]);
        }
    });

    if (!heatData.length) {
        setStatus(heatStatus, 'No data points match these filters.', 'error');
        return;
    }

    const dynamicMax = Math.max(heatData.length / 1000, 1.0);

    heatLayer = L.heatLayer(heatData, {
        radius: 20,
        blur: 25,
        maxZoom: 15,
        max: dynamicMax,
        minOpacity: 0.4,
        gradient: { 0.1: '#00ff00', 0.4: '#ffff00', 1.0: '#ff0000' }
    }).addTo(map);

    setStatus(heatStatus, `${heatData.length.toLocaleString()} points rendered`, 'ok');
}

// ── ZONE CREATION ─────────────────────────────────────────────────────────────

function _validateLngLat(lng, lat, pointIndex) {
    if (isNaN(lng) || isNaN(lat))
        throw new Error(`Point ${pointIndex}: non-numeric value.`);
    if (lat < -90 || lat > 90)
        throw new Error(`Point ${pointIndex}: latitude ${lat} out of range [-90, 90]. Make sure order is lng,lat.`);
    if (lng < -180 || lng > 180)
        throw new Error(`Point ${pointIndex}: longitude ${lng} out of range [-180, 180].`);
}

/**
 * Accepts three formats (auto-detected):
 *
 * 1. Devtools / indexed array dump:
 *      [
 *      0:[
 *      0:105.90305
 *      1:20.98148
 *      ]
 *      ...
 *      ]
 *
 * 2. Standard JSON array of [lng, lat] pairs:
 *      [[105.90305,20.98148],[105.90117,20.99141],...]
 *
 * 3. Plain text — one "lng,lat" per line:
 *      105.90305,20.98148
 *      105.90117,20.99141
 *
 * Always returns Leaflet-order [lat, lng] pairs.
 */
function parseCoords(text) {
    const trimmed = text.trim();

    // ── Format 1: devtools indexed dump  (contains "0:[" or "1:[" pattern) ──
    if (/\d+:\[/.test(trimmed)) {
        // Extract only "index:number" lines, ignore "index:[" and bare "]"
        const matches = [...trimmed.matchAll(/^\s*\d+:([\d.]+)\s*$/gm)];
        if (matches.length < 4 || matches.length % 2 !== 0)
            throw new Error(`Devtools format detected but extracted ${matches.length} numbers — expected even count ≥ 4.`);

        return matches.reduce((acc, m, i, arr) => {
            if (i % 2 !== 0) return acc; // process in pairs
            const lng = parseFloat(arr[i][1]);
            const lat = parseFloat(arr[i + 1][1]);
            _validateLngLat(lng, lat, acc.length + 1);
            acc.push([lat, lng]);
            return acc;
        }, []);
    }

    // ── Format 2: JSON array [[lng, lat], ...] ──
    if (trimmed.startsWith('[')) {
        let parsed;
        try { parsed = JSON.parse(trimmed); } catch (e) {
            throw new Error(`Looks like JSON but failed to parse: ${e.message}`);
        }
        if (!Array.isArray(parsed) || !Array.isArray(parsed[0]))
            throw new Error('Expected a JSON array of [lng, lat] pairs.');
        return parsed.map((pt, i) => {
            const lng = parseFloat(pt[0]), lat = parseFloat(pt[1]);
            _validateLngLat(lng, lat, i + 1);
            return [lat, lng];
        });
    }

    // ── Format 3: plain "lng,lat" per line ──
    const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
    return lines.map((line, i) => {
        const parts = line.includes(',') ? line.split(',') : line.split(/\s+/);
        if (parts.length < 2)
            throw new Error(`Line ${i + 1}: expected "lng,lat" but got "${line}"`);
        const lng = parseFloat(parts[0]), lat = parseFloat(parts[1]);
        _validateLngLat(lng, lat, i + 1);
        return [lat, lng];
    });
}

document.getElementById('createZoneBtn').addEventListener('click', () => {
    const rawText      = document.getElementById('coordsInput').value;
    const zoneNameInput = document.getElementById('zoneName').value.trim();
    const zoneName     = zoneNameInput || `Zone ${polygonIdCounter + 1}`;
    const opacity      = parseFloat(fillOpacityEl.value);

    let coords;
    try {
        coords = parseCoords(rawText);
    } catch (err) {
        alert(`Coordinate error:\n${err.message}\n\nSupported formats:\n• Devtools array dump (0:[ 0:lng 1:lat ])\n• JSON array [[lng,lat],...]\n• Plain text lng,lat per line`);
        return;
    }

    if (coords.length < 3) {
        alert('Need at least 3 points to form a polygon.');
        return;
    }

    const color   = ZONE_COLORS[polygonIdCounter % ZONE_COLORS.length];
    const polygon = L.polygon(coords, {
        color,
        fillColor: color,
        fillOpacity: opacity,
        weight: 2
    }).addTo(map);

    polygon.bindPopup(`<b>${zoneName}</b><br>${coords.length} vertices`);
    map.fitBounds(polygon.getBounds());

    const id = polygonIdCounter++;
    polygons[id] = polygon;

    // Add to list
    const li = document.createElement('li');
    li.dataset.id = id;
    li.innerHTML = `
        <span class="zone-label">
            <span class="zone-dot" style="background:${color}"></span>
            <strong>${escapeHtml(zoneName)}</strong>
            <span class="zone-meta">${coords.length} pts</span>
        </span>
        <div class="zone-actions">
            <button class="btn-sm btn-info" onclick="focusZone(${id})">Focus</button>
            <button class="btn-sm btn-danger" onclick="deleteZone(${id}, this)">Del</button>
        </div>
    `;
    document.getElementById('zoneList').appendChild(li);

    // Clear inputs
    document.getElementById('coordsInput').value = '';
    document.getElementById('zoneName').value = '';
});

window.deleteZone = function(id, btn) {
    if (polygons[id]) {
        map.removeLayer(polygons[id]);
        delete polygons[id];
        btn.closest('li').remove();
    }
};

window.focusZone = function(id) {
    if (polygons[id]) map.fitBounds(polygons[id].getBounds());
};

// ── HELPERS ───────────────────────────────────────────────────────────────────
function setStatus(el, msg, type) {
    el.textContent = msg;
    el.className = `status-badge status-${type}`;
}

function escapeHtml(str) {
    return str.replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
}
