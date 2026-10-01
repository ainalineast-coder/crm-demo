import { el, formatNumber } from './ui.js';

/** Приятные значения делений оси: 1, 2, 5 × 10ⁿ. */
function niceStep(max, ticks = 4) {
  const rough = Math.max(1, max / ticks);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  for (const factor of [1, 2, 5, 10]) {
    if (magnitude * factor >= rough) return magnitude * factor;
  }
  return magnitude * 10;
}

const svgEl = (tag, attrs = {}, children = []) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined && value !== false) node.setAttribute(key, value);
  }
  for (const child of [children].flat()) {
    if (child) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
};

/** Сегмент столбца: скруглён сверху только у верхнего, у основания — прямой. */
function segmentPath(x, y, width, height, roundTop) {
  const radius = roundTop ? Math.min(4, width / 2, height) : 0;
  if (!radius) return `M${x} ${y}h${width}v${height}h${-width}z`;
  return `M${x} ${y + radius}a${radius} ${radius} 0 0 1 ${radius} ${-radius}`
    + `h${width - radius * 2}a${radius} ${radius} 0 0 1 ${radius} ${radius}`
    + `v${height - radius}h${-width}z`;
}

/**
 * Столбчатая диаграмма с накоплением: день по оси X, заявки по оси Y,
 * цвет — рекламная кампания.
 *
 * days:   [{ date, label, values: { [seriesKey]: number }, total }]
 * series: [{ key, label, color }]
 */
export function stackedColumns({ days, series, emptyText = 'Нет данных за период' }) {
  const wrap = el('div', { class: 'chart-wrap' });
  if (!days.length || days.every((day) => day.total === 0)) {
    wrap.append(el('div', { class: 'empty', text: emptyText }));
    return wrap;
  }

  const padding = { top: 18, right: 12, bottom: 30, left: 46 };
  const plotWidth = Math.max(540, days.length * 26);
  const plotHeight = 230;
  const width = plotWidth + padding.left + padding.right;
  const height = plotHeight + padding.top + padding.bottom;

  const maxValue = Math.max(1, ...days.map((day) => day.total));
  const step = niceStep(maxValue);
  const top = Math.ceil(maxValue / step) * step;
  const scale = (value) => (value / top) * plotHeight;

  const band = plotWidth / days.length;
  const barWidth = Math.max(4, Math.min(24, band - 6));

  const svg = svgEl('svg', {
    class: 'chart', viewBox: `0 0 ${width} ${height}`, role: 'img',
    'aria-label': 'Заявки по дням в разрезе рекламных кампаний',
  });

  // Сетка и подписи оси значений
  for (let value = 0; value <= top; value += step) {
    const y = padding.top + plotHeight - scale(value);
    svg.append(
      svgEl('line', { class: value === 0 ? 'axis-line' : 'grid-line', x1: padding.left, x2: width - padding.right, y1: y, y2: y }),
      svgEl('text', { x: padding.left - 8, y: y + 3, 'text-anchor': 'end' }, formatNumber(value)),
    );
  }

  const tooltip = el('div', { class: 'chart-tooltip', style: 'display:none' });

  const peak = days.reduce((best, day) => (day.total > best.total ? day : best), days[0]);
  const labelEvery = Math.ceil(days.length / 12);

  days.forEach((day, index) => {
    const x = padding.left + index * band + (band - barWidth) / 2;
    let cursor = padding.top + plotHeight;

    const stack = series
      .map((item) => ({ item, value: day.values[item.key] ?? 0 }))
      .filter((entry) => entry.value > 0);

    stack.forEach((entry, entryIndex) => {
      const isTop = entryIndex === stack.length - 1;
      const full = scale(entry.value);
      // 2px зазор поверхностью между сегментами стопки
      const visible = Math.max(1, full - (isTop ? 0 : 2));
      cursor -= full;
      svg.append(svgEl('path', {
        d: segmentPath(x, cursor, barWidth, visible, isTop),
        fill: entry.item.color,
      }));
    });

    if (day === peak && day.total > 0) {
      svg.append(svgEl('text', {
        class: 'value-label', x: x + barWidth / 2,
        y: padding.top + plotHeight - scale(day.total) - 5, 'text-anchor': 'middle',
      }, formatNumber(day.total)));
    }

    if (index % labelEvery === 0 || index === days.length - 1) {
      svg.append(svgEl('text', {
        x: x + barWidth / 2, y: height - 10, 'text-anchor': 'middle',
      }, day.label));
    }

    // Прозрачная область наведения шире самого столбца
    const hit = svgEl('rect', {
      class: 'col-hit', x: padding.left + index * band, y: padding.top,
      width: band, height: plotHeight,
    });
    hit.addEventListener('mousemove', (event) => showTooltip(event, day, stack));
    hit.addEventListener('mouseleave', hideTooltip);
    svg.append(hit);
  });

  function showTooltip(event, day, stack) {
    const rows = [
      el('div', { class: 'head', text: `${day.fullLabel ?? day.label} — ${day.total} заявк${plural(day.total)}` }),
      ...(stack.length
        ? stack.slice().reverse().map((entry) => el('div', { class: 'row' }, [
            el('span', { class: 'name' }, [
              el('span', { class: 'swatch', style: `background:${entry.item.color}` }),
              entry.item.label,
            ]),
            el('strong', { text: formatNumber(entry.value) }),
          ]))
        : [el('div', { class: 'muted', text: 'Заявок нет' })]),
    ];

    if (day.won || day.lost) {
      rows.push(el('div', { class: 'row muted', style: 'margin-top:5px' }, [
        el('span', { text: 'успешно / не реализовано' }),
        el('strong', { text: `${day.won ?? 0} / ${day.lost ?? 0}` }),
      ]));
    }

    tooltip.replaceChildren(...rows);

    const bounds = wrap.getBoundingClientRect();
    const x = Math.min(event.clientX - bounds.left + 12, bounds.width - 180);
    tooltip.style.display = 'block';
    tooltip.style.left = `${Math.max(4, x)}px`;
    tooltip.style.top = `${Math.max(4, event.clientY - bounds.top - 10)}px`;
  }

  function hideTooltip() { tooltip.style.display = 'none'; }

  wrap.append(svg, tooltip);
  return wrap;
}

const plural = (count) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'а';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'и';
  return '';
};

/** Легенда: обязательна, когда серий две и больше. */
export const chartLegend = (series) => el('div', { class: 'legend' }, series.map((item) =>
  el('div', { class: 'item' }, [
    el('span', { class: 'swatch', style: `background:${item.color}` }),
    item.label,
  ])));
