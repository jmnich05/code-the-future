// Lucide icon helper — renders <i data-lucide> and lets a global pass hydrate it.
// lucide.createIcons() is called from App after each render.
function Icon({ name, size = 20, color = 'currentColor', stroke = 2, style }) {
  return (
    <i
      data-lucide={name}
      style={{ width: size, height: size, color, display: 'inline-flex', ...style }}
      data-stroke={stroke}
    />
  );
}

function hydrateIcons() {
  if (window.lucide && window.lucide.createIcons) {
    window.lucide.createIcons({ attrs: { 'stroke-width': 2 } });
  }
}

window.CTFIcon = Icon;
window.hydrateIcons = hydrateIcons;
