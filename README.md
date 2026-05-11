# Demand Heatmap Tool

A lightweight, zero-backend web app for visualising on-demand delivery heatmaps and drawing custom zone overlays on a Google Maps base layer.

**Live demo** — open `index.html` directly in any modern browser (Chrome / Edge / Firefox). No build step. No server required.

---

## Features

| Feature | Details |
|---|---|
| **CSV heatmap** | Load any CSV with `p_lat`, `p_lng`, `Services`, `Order_hour`, `period` columns |
| **Multi-filter** | Filter by service type, hour range, and date range simultaneously |
| **Zone overlay** | Draw polygons using **`lng,lat`** coordinate input (GeoJSON / WGS-84 order) |
| **Focus & delete** | Each zone has Focus (fly-to) and Delete controls |
| **Fill opacity** | Adjustable fill opacity slider per zone |

---

## Quick Start

```bash
git clone https://github.com/<your-username>/demand-heatmap-tool.git
cd demand-heatmap-tool
# Open index.html in your browser
```

No npm, no bundler, no server needed.

---

## CSV Format

| Column | Type | Description |
|---|---|---|
| `p_lat` | float | Pickup latitude (e.g. `21.0285`) |
| `p_lng` | float | Pickup longitude (e.g. `105.8542`) |
| `Services` | string | Service type label (e.g. `Instant`, `Eco`) |
| `Order_hour` | int | Hour of order (0–23) |
| `period` | date | Date string parseable by JS `Date` (e.g. `2026-04-01`) |

A `sample_data.csv` is included for testing.

---

## Zone Coordinate Format

Paste coordinates into the **Zone Overlay** panel — **one point per line** in `lng,lat` order:

```
105.8542,21.0285
105.8700,21.0285
105.8700,21.0450
105.8542,21.0450
```

> **Why `lng,lat`?** This matches the GeoJSON / WGS-84 standard used by BigQuery geography functions, QGIS exports, and most mapping APIs. The original MapApp used `[lat, lng]` (Leaflet order); this version flips it for easier copy-paste from data pipelines.

---

## Project Structure

```
.
├── index.html        # UI shell
├── app.js            # Map logic, CSV parser, zone builder
├── style.css         # Sidebar + map layout
├── sample_data.csv   # 20-row test dataset (Hanoi)
└── README.md
```

---

## Dependencies (CDN — no install)

| Library | Version | Purpose |
|---|---|---|
| [Leaflet](https://leafletjs.com) | 1.9.4 | Base map |
| [leaflet.heat](https://github.com/Leaflet/Leaflet.heat) | latest | Heatmap layer |
| [PapaParse](https://www.papaparse.com) | 5.4.1 | CSV parsing |

---

## License

MIT — use freely, attribution appreciated.
