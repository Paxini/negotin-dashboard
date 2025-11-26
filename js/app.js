// ============================================
// IZBORNI ŠTAB NEGOTIN - DASHBOARD APP
// ============================================

// State
let map;
let geojsonLayer;
let markers = {};
let selectedBM = null;
let currentColorMode = 'priority';
let bmStatuses = {}; // Store statuses locally
let currentTheme = 'dark';
let tileLayer = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', init);

function init() {
    // Load saved theme
    loadTheme();
    
    // Load saved statuses from localStorage
    loadStatuses();
    
    // Update header stats
    document.getElementById('totalBM').textContent = STATS.totalBM;
    document.getElementById('totalVoters').textContent = STATS.totalVoters.toLocaleString();
    
    // Initialize map
    initMap();
    
    // Load GeoJSON
    loadGeoJSON();
    
    // Setup event listeners
    setupEventListeners();
    
    // Populate BM list
    populateBMList();
    
    // Update legend
    updateLegend();
}

function initMap() {
    // Center on Negotin
    map = L.map('map', {
        center: [44.23, 22.53],
        zoom: 11,
        zoomControl: true,
        attributionControl: false
    });
    
    // Add tile layer based on theme
    updateMapTiles();
    
    // Add attribution
    L.control.attribution({
        prefix: false,
        position: 'bottomright'
    }).addAttribution('© OpenStreetMap').addTo(map);
}

function updateMapTiles() {
    const darkTiles = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const lightTiles = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    
    if (tileLayer) {
        map.removeLayer(tileLayer);
    }
    
    tileLayer = L.tileLayer(currentTheme === 'dark' ? darkTiles : lightTiles, {
        maxZoom: 19
    }).addTo(map);
}

function loadTheme() {
    const savedTheme = localStorage.getItem('negotin_theme') || 'dark';
    currentTheme = savedTheme;
    document.documentElement.setAttribute('data-theme', savedTheme);
    console.log('Theme loaded:', savedTheme);
}

function setTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('negotin_theme', theme);
    console.log('Theme set to:', theme);
    
    // Update map tiles if map exists
    if (map) {
        updateMapTiles();
    }
}

function toggleTheme() {
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    console.log('Toggling theme from', currentTheme, 'to', newTheme);
    setTheme(newTheme);
}

function loadGeoJSON() {
    fetch('data/negotin.geojson')
        .then(response => response.json())
        .then(data => {
            geojsonLayer = L.geoJSON(data, {
                style: featureStyle,
                onEachFeature: onEachFeature
            }).addTo(map);
            
            // Fit bounds
            map.fitBounds(geojsonLayer.getBounds(), { padding: [20, 20] });
            
            // Add markers for each BM
            addMarkers();
        })
        .catch(err => {
            console.error('Error loading GeoJSON:', err);
            // Fallback: just show markers
            addMarkers();
        });
}

function addMarkers() {
    BM_DATA.forEach(bm => {
        if (bm.lat && bm.lon) {
            const marker = L.circleMarker([bm.lat, bm.lon], {
                radius: Math.max(5, Math.min(12, bm.voters / 150)),
                fillColor: getColorForBM(bm),
                color: '#ffffff',
                weight: 1,
                opacity: 0.8,
                fillOpacity: 0.8
            });
            
            marker.bmId = bm.id;
            marker.on('click', () => selectBM(bm.id));
            marker.bindTooltip(`BM ${bm.id}: ${bm.name}`, {
                permanent: false,
                direction: 'top'
            });
            
            marker.addTo(map);
            markers[bm.id] = marker;
        }
    });
}

function featureStyle(feature) {
    const title = feature.properties.title || '';
    const match = title.match(/BM (\d+)/);
    const bmId = match ? parseInt(match[1]) : null;
    const bm = bmId ? BM_DATA.find(b => b.id === bmId) : null;
    
    return {
        fillColor: bm ? getColorForBM(bm) : '#64748b',
        weight: 1,
        opacity: 0.8,
        color: '#ffffff',
        fillOpacity: 0.6
    };
}

function onEachFeature(feature, layer) {
    const title = feature.properties.title || '';
    const match = title.match(/BM (\d+)/);
    const bmId = match ? parseInt(match[1]) : null;
    
    if (bmId) {
        layer.bmId = bmId;
        layer.on('click', () => selectBM(bmId));
        
        const bm = BM_DATA.find(b => b.id === bmId);
        if (bm) {
            layer.bindTooltip(`BM ${bmId}: ${bm.name}`, {
                permanent: false,
                direction: 'center'
            });
        }
    }
}

function getColorForBM(bm) {
    const scheme = COLOR_SCHEMES[currentColorMode];
    const status = bmStatuses[bm.id] || bm.status || 'none';
    
    switch (currentColorMode) {
        case 'priority':
            return scheme.colors[bm.priority] || '#64748b';
        case 'control':
            return scheme.colors[bm.control] || '#64748b';
        case 'voters':
            return scheme.getColor(bm.voters);
        case 'status':
            return scheme.colors[status] || scheme.colors['none'];
        default:
            return '#64748b';
    }
}

function updateMapColors() {
    // Update GeoJSON layer
    if (geojsonLayer) {
        geojsonLayer.setStyle(featureStyle);
    }
    
    // Update markers
    BM_DATA.forEach(bm => {
        if (markers[bm.id]) {
            markers[bm.id].setStyle({
                fillColor: getColorForBM(bm)
            });
        }
    });
    
    // Update legend
    updateLegend();
    
    // Update list
    populateBMList();
}

function updateLegend() {
    const scheme = COLOR_SCHEMES[currentColorMode];
    const legend = document.getElementById('legend');
    
    let html = `<h4>${scheme.name}</h4>`;
    scheme.legend.forEach(item => {
        html += `
            <div class="legend-item">
                <span class="legend-color" style="background: ${item.color}"></span>
                <span>${item.label}</span>
            </div>
        `;
    });
    
    legend.innerHTML = html;
}

function selectBM(bmId) {
    const bm = BM_DATA.find(b => b.id === bmId);
    if (!bm) return;
    
    selectedBM = bmId;
    
    // Update info panel
    document.querySelector('.hint').classList.add('hidden');
    document.getElementById('bmDetails').classList.remove('hidden');
    
    document.getElementById('bmNumber').textContent = `BM ${bm.id}`;
    document.getElementById('bmName').textContent = bm.name;
    document.getElementById('bmLocation').textContent = bm.settlement || bm.location || 'Negotin';
    document.getElementById('bmAddress').textContent = bm.address || `${bm.settlement}, ${bm.name}`;
    document.getElementById('bmVoters').textContent = bm.voters.toLocaleString();
    document.getElementById('bmPriority').textContent = bm.priority;
    document.getElementById('bmControl').textContent = bm.control;
    
    // Show field notes if available
    const fieldNotesEl = document.getElementById('bmFieldNotes');
    if (bm.notes && bm.notes.trim()) {
        fieldNotesEl.textContent = bm.notes;
        fieldNotesEl.parentElement.classList.remove('hidden');
    } else {
        fieldNotesEl.parentElement.classList.add('hidden');
    }
    
    // Update status indicator
    const status = bmStatuses[bmId] || 'none';
    const statusEl = document.getElementById('bmStatus');
    statusEl.className = 'bm-status ' + status;
    statusEl.textContent = getStatusIcon(status);
    
    // Update status buttons
    document.querySelectorAll('.status-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.status === status) {
            btn.classList.add('active');
        }
    });
    
    // Load notes
    const savedNotes = localStorage.getItem(`bm_notes_${bmId}`) || '';
    document.getElementById('bmNotes').value = savedNotes;
    
    // Highlight in list
    document.querySelectorAll('.bm-list-item').forEach(item => {
        item.classList.remove('selected');
        if (parseInt(item.dataset.bmId) === bmId) {
            item.classList.add('selected');
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
    
    // Pan map to BM
    if (markers[bmId]) {
        map.panTo(markers[bmId].getLatLng());
    }
}

function getStatusIcon(status) {
    switch (status) {
        case 'ok': return '✓';
        case 'wait': return '⏳';
        case 'warn': return '⚠';
        case 'alert': return '🚨';
        default: return '●';
    }
}

function setStatus(bmId, status) {
    bmStatuses[bmId] = status;
    saveStatuses();
    
    // Update UI
    if (selectedBM === bmId) {
        const statusEl = document.getElementById('bmStatus');
        statusEl.className = 'bm-status ' + status;
        statusEl.textContent = getStatusIcon(status);
        
        document.querySelectorAll('.status-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.status === status) {
                btn.classList.add('active');
            }
        });
    }
    
    // Update map if in status mode
    if (currentColorMode === 'status') {
        updateMapColors();
    }
    
    // Update list item
    const listItem = document.querySelector(`.bm-list-item[data-bm-id="${bmId}"]`);
    if (listItem) {
        const indicator = listItem.querySelector('.bm-indicator');
        indicator.className = 'bm-indicator ' + status;
    }
}

function populateBMList() {
    const list = document.getElementById('bmList');
    const filter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
    
    let html = '';
    
    const sortedBM = [...BM_DATA].sort((a, b) => a.id - b.id);
    
    sortedBM.forEach(bm => {
        const status = bmStatuses[bm.id] || 'none';
        
        // Apply filter
        if (filter === 'alert' && status !== 'alert') return;
        if (filter === 'warn' && status !== 'warn' && status !== 'alert') return;
        
        const selected = selectedBM === bm.id ? 'selected' : '';
        
        html += `
            <div class="bm-list-item ${selected}" data-bm-id="${bm.id}">
                <span class="bm-num">BM ${bm.id}</span>
                <span class="bm-name" title="${bm.name}">${bm.name}</span>
                <span class="bm-voters">${bm.voters}</span>
                <span class="bm-indicator ${status}"></span>
            </div>
        `;
    });
    
    list.innerHTML = html || '<p style="padding: 16px; color: var(--text-muted);">Nema rezultata</p>';
    
    // Add click handlers
    list.querySelectorAll('.bm-list-item').forEach(item => {
        item.addEventListener('click', () => {
            selectBM(parseInt(item.dataset.bmId));
        });
    });
}

function setupEventListeners() {
    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', function(e) {
            e.preventDefault();
            toggleTheme();
        });
    }
    
    // Color mode selector
    document.getElementById('colorMode').addEventListener('change', (e) => {
        currentColorMode = e.target.value;
        updateMapColors();
    });
    
    // Search
    document.getElementById('searchBM').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        
        document.querySelectorAll('.bm-list-item').forEach(item => {
            const bmId = parseInt(item.dataset.bmId);
            const bm = BM_DATA.find(b => b.id === bmId);
            
            if (!query) {
                item.style.display = '';
                return;
            }
            
            const matches = 
                bmId.toString().includes(query) ||
                bm.name.toLowerCase().includes(query) ||
                (bm.location && bm.location.toLowerCase().includes(query));
            
            item.style.display = matches ? '' : 'none';
        });
    });
    
    // Status buttons
    document.querySelectorAll('.status-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (selectedBM) {
                setStatus(selectedBM, btn.dataset.status);
            }
        });
    });
    
    // Save notes
    document.getElementById('saveNotes').addEventListener('click', () => {
        if (selectedBM) {
            const notes = document.getElementById('bmNotes').value;
            localStorage.setItem(`bm_notes_${selectedBM}`, notes);
            
            // Visual feedback
            const btn = document.getElementById('saveNotes');
            btn.textContent = 'Sačuvano ✓';
            setTimeout(() => btn.textContent = 'Sačuvaj', 1500);
        }
    });
    
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            populateBMList();
        });
    });
}

function saveStatuses() {
    localStorage.setItem('negotin_bm_statuses', JSON.stringify(bmStatuses));
}

function loadStatuses() {
    const saved = localStorage.getItem('negotin_bm_statuses');
    if (saved) {
        bmStatuses = JSON.parse(saved);
    }
}

// Export data (for debugging/backup)
function exportData() {
    const data = {
        statuses: bmStatuses,
        notes: {}
    };
    
    BM_DATA.forEach(bm => {
        const notes = localStorage.getItem(`bm_notes_${bm.id}`);
        if (notes) {
            data.notes[bm.id] = notes;
        }
    });
    
    console.log('Export data:', JSON.stringify(data, null, 2));
    return data;
}

// Make exportData available globally for debugging
window.exportData = exportData;

