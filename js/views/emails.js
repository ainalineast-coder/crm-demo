import { api } from '../api.js';
import { confirmDialog, el, formatDateTime, openForm, toast } from '../ui.js';

/** Почта: список писем и отправка нового. */
export async function renderEmails(root) {
  const state = { direction: '' };

  const tbody = el('tbody');
  const search = el('input', { class: 'search', placeholder: 'Поиск по письмам' });
  const statusBadge = el('span', { class: 'muted' });
  const filters = el('div', { class: 'presets' });

  const compose = (preset = {}) => openForm({
    title: 'Новое письмо',
    fields: [
      { name: 'to_addr', label: 'Кому', type: 'email', required: true, value: preset.to, width: 'full' },
      { name: 'subject', label: 'Тема', required: true, value: preset.subject, width: 'full' },
      { name: 'body', label: 'Текст письма', type: 'textarea', rows: 8, required: true, width: 'full' },
    ],
    submitLabel: 'Отправить',
    onSubmit: async (values) => {
      const { delivery } = await api.post('/api/emails', values);
      if (delivery.status === 'sent') toast('Письмо отправлено');
      else toast(delivery.error ?? 'Письмо сохранено, но не отправлено', 'error');
      await reload();
    },
  });

  const reload = async () => {
    const { items, total, mailbox } = await api.get('/api/emails', {
      q: search.value.trim() || undefined,
      direction: state.direction || undefined,
    });

    statusBadge.textContent = mailbox.ready
      ? `Почта подключена: ${mailbox.host} (${mailbox.from})`
      : `Почта не настроена: ${mailbox.missing.join(', ')}`;

    tbody.replaceChildren(...(items.length ? items.map((email) => el('tr', {}, [
      el('td', {}, el('span', {
        class: `badge ${email.direction === 'in' ? '' : 'prio-low'}`,
        text: email.direction === 'in' ? 'Входящее' : 'Исходящее',
      })),
      el('td', {}, [
        el('strong', { text: email.subject ?? '(без темы)' }),
        el('div', { class: 'muted', text: (email.body ?? '').slice(0, 120) }),
      ]),
      el('td', { class: 'muted', text: email.direction === 'in' ? email.from_addr : email.to_addr }),
      el('td', { class: 'muted', text: email.deal_title ?? email.contact_name ?? '—' }),
      el('td', {}, el('span', {
        class: email.status === 'failed' || email.status === 'pending' ? 'overdue' : 'muted',
        text: { sent: 'отправлено', received: 'получено', pending: 'не отправлено', failed: 'ошибка' }[email.status] ?? email.status,
        title: email.error ?? '',
      })),
      el('td', { class: 'muted', text: formatDateTime(email.created_at) }),
      el('td', { class: 'actions' }, [
        email.direction === 'in'
          ? el('button', { class: 'btn ghost', title: 'Ответить', onclick: () => compose({
              to: email.from_addr, subject: `Re: ${email.subject ?? ''}`,
            }) }, '↩')
          : null,
        el('button', { class: 'btn ghost', onclick: async () => {
          if (!await confirmDialog('Удалить письмо из истории?')) return;
          await api.delete(`/api/emails/${email.id}`);
          await reload();
        } }, '🗑'),
      ]),
    ])) : [el('tr', {}, [el('td', { colspan: '7' }, el('div', { class: 'empty', text: 'Писем нет' }))])]));
  };

  filters.append(...[
    { key: '', label: 'Все' },
    { key: 'in', label: 'Входящие' },
    { key: 'out', label: 'Исходящие' },
  ].map((item) => {
    const button = el('button', {
      class: `btn chip${state.direction === item.key ? ' on' : ''}`,
      onclick: () => {
        state.direction = item.key;
        for (const chip of filters.children) chip.classList.remove('on');
        button.classList.add('on');
        reload();
      },
    }, item.label);
    return button;
  }));

  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(reload, 250); });

  root.append(
    el('div', { class: 'topbar' }, [
      el('div', { style: 'display:flex;align-items:center;gap:12px;flex-wrap:wrap' }, [
        el('h1', { text: 'Почта' }), filters, statusBadge,
      ]),
      el('div', { class: 'toolbar' }, [
        search,
        el('button', { class: 'btn', onclick: () => compose() }, '+ НАПИСАТЬ'),
      ]),
    ]),
    el('div', { class: 'content' }, [el('div', { class: 'card' }, [
      el('div', { class: 'table-wrap' }, el('table', {}, [
        el('thead', {}, [el('tr', {}, ['', 'Тема', 'Адрес', 'Связано', 'Статус', 'Дата', ''].map((title) => el('th', { text: title })))]),
        tbody,
      ])),
    ])]),
  );

  await reload();
}
