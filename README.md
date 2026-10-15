# The-COW
The rebuilt Coach's Office Website

## Interactive process map

`site/index.html` turns an SVG process map into an interactive page (zoom, pan, click steps for details).
Serve it with `cd site && python3 -m http.server`, then open `http://localhost:8000/`.
Replace `site/process-map.svg` or use `?svg=your-file.svg`. Mark clickable steps with `class="step"`
(or an id starting with `step-`) and give them `data-title` / `data-description` attributes.
