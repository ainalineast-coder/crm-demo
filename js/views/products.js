import { api } from '../api.js';
import { confirmDialog, el, formatMoney, formatNumber, openForm, toast } from '../ui.js';

const fields = (product = {}) => [
  { name: 'name', label: 'Название', required: true, value: product.name, width: 'full' },
  { name: 'sku', label: 'Артикул', value: product.sku },
  { name: 'group_name', label: 'Группа', value: product.group_name },
  { name: 'price', label: 'Цена', type: 'number', step: '0.01', value: product.price ?? 0 },
  { name: 'unit', label: 'Единица', value: product.unit ?? 'шт' },
  { name: 'stock', label: 'Остаток', type: 'number', step: '0.01', value: product.stock ?? 0 },
  { name: 'description', label: 'Описание', type: 'textarea', value: product.description, width: 'full' },
];

async function openProductForm(product, onDone) {
  openForm({
    title: product ? 'Редактирование товара' : 'Новый товар',
    fields: fields(product ?? {}),
    onSubmit: async (values) => {
      if (product) await api.patch(`/api/products/${product.id}`, values);
      else await api.post('/api/products', values);
      toast(product ? 'Товар обновлён' : 'Товар добавлен');
      await onDone?.();
    },
  });
}

/** Каталог товаров: цены, остатки и группы. */
export async function renderProducts(root) {
  const tbody = el('tbody');
  const search = el('input', { class: 'search', placeholder: 'Поиск по названию и артикулу' });
  const groupSelect = el('select', { style: 'width:180px' });
  const counter = el('span', { class: 'muted' });

  const reload = async () => {
    const { items, total, groups } = await api.get('/api/products', {
      q: search.value.trim() || undefined,
      group: groupSelect.value || undefined,
    });
    counter.textContent = `${total} позиций`;

    const current = groupSelect.value;
    groupSelect.replaceChildren(
      el('option', { value: '' }, 'Все группы'),
      ...groups.map((group) => el('option', { value: group, selected: group === current }, group)),
    );

    tbody.replaceChildren(...(items.length ? items.map((product) => el('tr', {}, [
      el('td', { class: 'muted', text: product.sku ?? '—' }),
      el('td', {}, [
        el('strong', { text: product.name }),
        product.description ? el('div', { class: 'muted', text: product.description }) : null,
      ]),
      el('td', { text: product.group_name ?? '—' }),
      el('td', { class: 'num', text: formatMoney(product.price, product.currency) }),
      el('td', { class: 'num', text: `${formatNumber(product.stock)} ${product.unit ?? ''}` }),
      el('td', { class: 'actions' }, [
        el('button', { class: 'btn ghost', onclick: () => openProductForm(product, reload) }, '✎'),
        el('button', { class: 'btn ghost', onclick: async () => {
          if (!await confirmDialog(`Удалить товар «${product.name}»?`)) return;
          await api.delete(`/api/products/${product.id}`);
          toast('Товар удалён');
          await reload();
        } }, '🗑'),
      ]),
    ])) : [el('tr', {}, [el('td', { colspan: '6' }, el('div', { class: 'empty', text: 'Товаров не найдено' }))])]));
  };

  groupSelect.addEventListener('change', reload);
  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(reload, 250); });

  root.append(
    el('div', { class: 'topbar' }, [
      el('div', { style: 'display:flex;align-items:center;gap:12px' }, [el('h1', { text: 'Товары' }), counter]),
      el('div', { class: 'toolbar' }, [
        search, groupSelect,
        el('button', { class: 'btn', onclick: () => openProductForm(null, reload) }, '+ ДОБАВИТЬ ТОВАР'),
      ]),
    ]),
    el('div', { class: 'content' }, [el('div', { class: 'card' }, [
      el('div', { class: 'table-wrap' }, el('table', {}, [
        el('thead', {}, [el('tr', {}, ['Артикул', 'Название', 'Группа', 'Цена', 'Остаток', ''].map((title, index) =>
          el('th', { class: index === 3 || index === 4 ? 'num' : '', text: title })))]),
        tbody,
      ])),
    ])]),
  );

  await reload();
}
