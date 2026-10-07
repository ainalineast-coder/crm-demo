import { api } from '../api.js';
import { allow, cityParam, cityTag, store } from '../store.js';
import { confirmDialog, el, formatDate, openForm, openPanel, toast } from '../ui.js';

const fields = (options, company = {}) => [
  { name: 'name', label: 'Название', required: true, value: company.name, width: 'full' },
  { name: 'industry', label: 'Отрасль', value: company.industry },
  { name: 'website', label: 'Сайт', value: company.website },
  { name: 'phone', label: 'Телефон', value: company.phone },
  { name: 'owner_id', label: 'Ответственный', type: 'select', value: company.owner_id, options: options.users },
  { name: 'address', label: 'Адрес', value: company.address, width: 'full' },
  { name: 'notes', label: 'Заметки', type: 'textarea', value: company.notes, width: 'full' },
];

async function openCompanyForm(company, onDone) {
  const options = await store.options();
  openForm({
    title: company ? 'Редактирование компании' : 'Новая компания',
    fields: fields(options, company ?? {}),
    onSubmit: async (values) => {
      if (company) await api.patch(`/api/companies/${company.id}`, values);
      else await api.post('/api/companies', values);
      store.invalidate('companies');
      toast(company ? 'Компания обновлена' : 'Компания создана');
      await onDone?.();
    },
  });
}

async function openCompanyDetails(id, onDone) {
  const company = await api.get(`/api/companies/${id}`);
  const list = (title, rows) => el('div', {}, [
    el('div', { style: 'font-weight:600;margin-bottom:6px', text: title }),
    rows.length ? el('div', { style: 'display:grid;gap:4px' }, rows) : el('div', { class: 'muted', text: 'Пусто' }),
  ]);

  const panel = openPanel({
    title: company.name,
    content: el('div', { style: 'display:grid;gap:14px' }, [
      el('div', { class: 'muted' }, [company.industry, company.phone, company.address].filter(Boolean).join(' · ') || '—'),
      company.website ? el('a', { href: `https://${company.website.replace(/^https?:\/\//, '')}`, target: '_blank', rel: 'noopener' }, company.website) : null,
      list('Контакты', company.contacts.map((contact) =>
        el('div', {}, `${[contact.last_name, contact.first_name].filter(Boolean).join(' ')} — ${contact.position ?? 'должность не указана'}${contact.phone ? `, ${contact.phone}` : ''}`))),
      list('Сделки', company.deals.map((deal) =>
        el('div', {}, [el('a', { href: `#/deals/${deal.id}`, onclick: () => panel.close(), text: deal.title }),
          el('span', { class: 'muted', text: ` · ${deal.stage_name}` })]))),
      company.notes ? el('div', { class: 'muted', text: company.notes }) : null,
    ]),
    actions: [
      allow('companies', 'full', el('button', { class: 'btn danger', onclick: async () => {
        if (!await confirmDialog('Удалить компанию? Контакты и сделки останутся без компании.')) return;
        await api.delete(`/api/companies/${company.id}`);
        store.invalidate('companies');
        toast('Компания удалена');
        panel.close();
        await onDone?.();
      } }, 'Удалить')),
      allow('companies', 'edit', el('button', { class: 'btn secondary', onclick: () => { panel.close(); openCompanyForm(company, onDone); } }, 'Редактировать')),
    ].filter(Boolean),
  });
}

export async function renderCompanies(root) {
  const tbody = el('tbody');
  const search = el('input', { class: 'search', placeholder: 'Поиск по названию, отрасли, телефону' });
  const counter = el('span', { class: 'muted' });

  const reload = async () => {
    const { items, total } = await api.get('/api/companies', { q: search.value.trim(), cityId: cityParam() });
    counter.textContent = `Всего: ${total}`;
    tbody.replaceChildren(...(items.length ? items.map((company) =>
      el('tr', {}, [
        el('td', {}, [el('a', { href: '#', onclick: (e) => { e.preventDefault(); openCompanyDetails(company.id, reload); }, text: company.name }),
          el('div', { class: 'muted', text: company.website ?? '' })]),
        el('td', { text: company.industry ?? '—' }),
        el('td', { text: company.phone ?? '—' }),
        el('td', { text: `${company.contacts_count} / ${company.deals_count}` }),
        el('td', {}, [company.owner_name ?? '—', cityTag(company)]),
        el('td', { class: 'muted', text: formatDate(company.created_at) }),
        el('td', { class: 'actions' }, [
          allow('companies', 'edit', el('button', { class: 'btn ghost', onclick: () => openCompanyForm(company, reload) }, '✎')),
        ]),
      ]))
      : [el('tr', {}, [el('td', { colspan: '7' }, el('div', { class: 'empty', text: 'Компаний не найдено' }))])]));
  };

  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(reload, 250); });

  root.append(
    el('div', { class: 'topbar' }, [
      el('h1', { text: 'Компании' }),
      el('div', { class: 'toolbar' }, [counter, search,
        allow('companies', 'edit', el('button', { class: 'btn', onclick: () => openCompanyForm(null, reload) }, '+ Компания'))]),
    ]),
    el('div', { class: 'content' }, [el('div', { class: 'card' }, [
      el('div', { class: 'table-wrap' }, el('table', {}, [
        el('thead', {}, [el('tr', {}, ['Название', 'Отрасль', 'Телефон', 'Контакты / сделки', 'Ответственный', 'Создана', ''].map((title) => el('th', { text: title })))]),
        tbody,
      ])),
    ])]),
  );

  await reload();
}
