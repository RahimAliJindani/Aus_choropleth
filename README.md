# Aus choropleth

Open `index.html` in a modern browser and keep `localities.js` beside it. The map uses bundled [Leaflet 1.9.4](https://github.com/Leaflet/Leaflet/tree/v1.9.4). Both files can be served from a static host such as GitHub Pages.

## Explore Australia

- **Cities and towns** shows 1,809 bundled ABS Urban Centres and Localities. This view works offline. Select a town or city for its simulated monthly transaction count, or select a state for the total across its mapped urban areas.
- **Suburbs and localities** shows the nationwide ABS Suburbs and Localities (SAL) layer. Search by name or five-digit 2021 ABS SAL code, or zoom into a metro or regional area to reveal its polygons. Search results include their state or territory. Selecting a polygon shows its ABS code and monthly value.
- Suburb polygons load from the ABS public service over the internet, with greater geometric detail at higher zoom levels. This layer needs an internet connection and uses no API key.

## Map your own suburb data

In **Suburbs and localities**, choose a CSV with the following columns:

```csv
sal_code,month,transactions
20000,2026-10,1250
20000,2026-11,1390
```

Replace the illustrative code with a valid five-digit ABS 2021 SAL code, which appears when you select a suburb. Use `YYYY-MM` and a non-negative whole-number count. Provide one row per suburb per month. The month menu adapts to the CSV. Suburbs without values display in grey. The browser reads the CSV locally and keeps it in memory until you reload or choose **Use demo data**. The CSV is never sent to ABS. ABS receives map extents and place searches for boundary lookup.

Demo values for May through October 2026 are simulated. Each boundary layer has its own demo series. Colour thresholds are fixed across months and data sources.

## Boundary sources

Australian Bureau of Statistics, ASGS Edition 3 (2021), States and Territories, Urban Centres and Localities, and Suburbs and Localities. © Commonwealth of Australia, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). These are statistical boundaries. SAL polygons approximate officially recognised suburbs and localities. Bundled geometry has been simplified for browser display. [ABS digital boundary files](https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-3-july-2021-june-2026/access-and-downloads/digital-boundary-files) · [ABS SAL service](https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/SAL/MapServer/0)
