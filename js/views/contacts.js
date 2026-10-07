import { api } from '../api.js';
import { allow, cityParam, cityTag, store } from '../store.js';
import { confirmDialog, contactName, el, openForm, toast } from '../ui.js';

const fields = (options, contact = {}) => [
  { name: 'last_name', label: 'Фамилия', value: contact.last_name },
  { name: 'first_name', label: 'Имя', required: true, value: contact.first_name },
  { name: 'position', label: 'Должность', value: contact.position },
  { name: 'company_id', label: 'Компания', type: 'select', value: contact.company_id, options: options.companies },
  { name: 'email', label: 'Email', type: 'email', value: contact.email },
  { name: 'phone', label: 'Телефон', value: contact.phone },
  { name: 'owner_id', label: 'Ответственный', type: 'select', value: contact.owner_id, options: options.users },
  { name: 'notes', label: 'Заметки', type: 'textarea', value: contact.notes, width: 'full' },
];

async function openContactForm(contact, onDone) {
  const options = await store.options();
  openForm({
    title: contact ? 'Редактирование контакта' : 'Новый контакт',
    fields: fields(options, contact ?? {}),
    onSubmit: async (values) => {
      if (contact) await api.patch(`/api/contacts/${contact.id}`, values);
      else await api.post('/api/contacts', values);
      store.invalidate('contacts');
      toast(contact ? 'Контакт обновлён' : 'Контакт создан');
      await onDone?.();
    },
  });
}

export async function renderContacts(root) {
  const tbody = el('tbody');
  const search = el('input', { class: 'search', placeholder: 'Поиск по имени, email, телефону' });
  const companyFilter = el('select', { style: 'width:200px' });
  const counter = el('span', { class: 'muted' });

  const reload = async () => {
    const { items, total } = await api.get('/api/contacts', {
      q: search.value.trim(),
      companyId: companyFilter.value || undefined,
      cityId: cityParam(),
    });
    counter.textContent = `Всего: ${total}`;
    tbody.replaceChildren(...(items.length ? items.map((contact) =>
      el('tr', {}, [
        el('td', {}, [el('strong', { text: contactName(contact) }),
          el('div', { class: 'muted', text: contact.position ?? '' })]),
        el('td', { text: contact.company_name ?? '—' }),
        el('td', {}, contact.email ? el('a', { href: `mailto:${contact.email}` }, contact.email) : '—'),
        el('td', {}, contact.phone ? el('a', { href: `tel:${contact.phone.replace(/\s/g, '')}` }, contact.phone) : '—'),
        el('td', {}, [contact.owner_name ?? '—', cityTag(contact)]),
        el('td', { class: 'actions' }, [
          allow('contacts', 'edit', el('button', { class: 'btn ghost', onclick: () => openContactForm(contact, reload) }, '✎')),
          allow('contacts', 'full', el('button', { class: 'btn ghost', onclick: async () => {
            if (!await confirmDialog(`Удалить контакт «${contactName(contact)}»?`)) return;
            await api.delete(`/api/contacts/${contact.id}`);
            store.invalidate('contacts');
            toast('Контакт удалён');
            await reload();
          } }, '🗑')),
        ]),
      ]))
      : [el('tr', {}, [el('td', { colspan: '6' }, el('div', { class: 'empty', text: 'Контактов не найдено' }))])]));
  };

  const companies = await store.companies();
  companyFilter.append(el('option', { value: '' }, 'Все компании'),
    ...companies.map((company) => el('option', { value: company.id }, company.name)));
  companyFilter.addEventListener('change', reload);

  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(reload, 250); });

  root.append(
    el('div', { class: 'topbar' }, [
      el('h1', { text: 'Контакты' }),
      el('div', { class: 'toolbar' }, [counter, companyFilter, search,
        allow('contacts', 'edit', el('button', { class: 'btn', onclick: () => openContactForm(null, reload) }, '+ Контакт'))]),
    ]),
    el('div', { class: 'content' }, [el('div', { class: 'card' }, [
      el('div', { class: 'table-wrap' }, el('table', {}, [
        el('thead', {}, [el('tr', {}, ['Контакт', 'Компания', 'Email', 'Телефон', 'Ответственный', ''].map((title) => el('th', { text: title })))]),
        tbody,
      ])),
    ])]),
  );

  await reload();
}
