import { api } from '../api.js';
import { el, formatDateTime, initials, openForm, toast } from '../ui.js';

/** imBox: переписки с клиентами в WhatsApp. */
export async function renderChats(root, params = {}) {
  const state = { chatId: params.id ? Number(params.id) : null, channel: null };

  const list = el('div', { class: 'chat-list' });
  const pane = el('div', { class: 'chat-pane' });
  const search = el('input', { class: 'search', placeholder: 'Поиск по перепискам' });
  const channelBadge = el('span', { class: 'muted' });

  const renderList = (items) => {
    list.replaceChildren(...(items.length
      ? items.map((chat) => el('div', {
          class: `chat-item${chat.id === state.chatId ? ' active' : ''}`,
          onclick: () => openChat(chat.id),
        }, [
          el('div', { class: 'avatar', text: initials(chat.title ?? chat.phone) }),
          el('div', { style: 'flex:1;min-width:0' }, [
            el('div', { class: 'row' }, [
              el('strong', { text: chat.title ?? chat.phone ?? 'Без имени' }),
              chat.unread ? el('span', { class: 'badge unread', text: String(chat.unread) }) : null,
            ]),
            el('div', { class: 'muted preview', text: chat.last_message ?? 'Нет сообщений' }),
            chat.deal_title ? el('div', { class: 'muted preview', text: `Сделка: ${chat.deal_title}` }) : null,
          ]),
        ]))
      : [el('div', { class: 'empty', text: 'Переписок пока нет' })]));
  };

  const openChat = async (id) => {
    state.chatId = id;
    const chat = await api.get(`/api/chats/${id}`);

    const input = el('textarea', { rows: 2, placeholder: 'Сообщение клиенту…' });
    const send = async () => {
      const body = input.value.trim();
      if (!body) return;
      try {
        const { delivery } = await api.post(`/api/chats/${id}/messages`, { body });
        input.value = '';
        if (delivery.status !== 'sent') toast(delivery.error ?? 'Сообщение сохранено, но не отправлено', 'error');
        await openChat(id);
        await reload();
      } catch (error) {
        toast(error.message, 'error');
      }
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) send();
    });

    const draft = async () => {
      try {
        const { text } = await api.post(`/api/ai/chats/${id}/reply`, {});
        input.value = text;
        toast('Черновик готов — проверьте и отправьте');
      } catch (error) {
        toast(error.message, 'error');
      }
    };

    pane.replaceChildren(
      el('div', { class: 'chat-head' }, [
        el('div', {}, [
          el('strong', { text: chat.title ?? chat.phone }),
          el('div', { class: 'muted', text: [chat.phone, chat.deal_title].filter(Boolean).join(' · ') }),
        ]),
        chat.deal_id ? el('a', { href: `#/deals/${chat.deal_id}`, text: 'Открыть сделку' }) : null,
      ]),
      el('div', { class: 'chat-body' }, chat.messages.length
        ? chat.messages.map((message) => el('div', { class: `bubble ${message.direction}` }, [
            el('div', { text: message.body }),
            el('div', { class: 'meta' }, [
              `${message.author_name ?? ''} · ${formatDateTime(message.created_at)}`,
              message.status === 'pending' ? el('span', { class: 'muted', text: ' · не отправлено' }) : null,
            ]),
          ]))
        : [el('div', { class: 'empty', text: 'Сообщений нет' })]),
      el('div', { class: 'chat-form' }, [
        input,
        el('div', { style: 'display:grid;gap:6px' }, [
          el('button', { class: 'btn', onclick: send }, 'Отправить'),
          el('button', { class: 'btn secondary', onclick: draft, title: 'Черновик ответа от AI-помощника' }, 'AI-ответ'),
        ]),
      ]),
    );

    // Прокручиваем переписку к последнему сообщению.
    const body = pane.querySelector('.chat-body');
    if (body) body.scrollTop = body.scrollHeight;
  };

  const reload = async () => {
    const data = await api.get('/api/chats', { q: search.value.trim() || undefined });
    state.channel = data.channel;
    channelBadge.textContent = data.channel.ready
      ? `WhatsApp подключён (${data.channel.provider})`
      : `WhatsApp не подключён: ${data.channel.missing.join(', ')}`;
    renderList(data.items);
    if (!state.chatId && data.items.length) await openChat(data.items[0].id);
    else if (state.chatId) renderList(data.items);
  };

  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(reload, 250); });

  const newChat = () => openForm({
    title: 'Новая переписка',
    fields: [
      { name: 'phone', label: 'Номер телефона клиента', required: true, width: 'full' },
      { name: 'title', label: 'Как подписать', width: 'full' },
    ],
    submitLabel: 'Начать',
    onSubmit: async (values) => {
      const chat = await api.post('/api/chats', values);
      await reload();
      await openChat(chat.id);
    },
  });

  root.append(
    el('div', { class: 'topbar' }, [
      el('div', { style: 'display:flex;align-items:center;gap:12px;flex-wrap:wrap' }, [
        el('h1', { text: 'imBox' }), channelBadge,
      ]),
      el('div', { class: 'toolbar' }, [
        search,
        el('button', { class: 'btn secondary', onclick: () => { location.hash = '#/settings'; } }, 'Настроить канал'),
        el('button', { class: 'btn', onclick: newChat }, '+ ПЕРЕПИСКА'),
      ]),
    ]),
    el('div', { class: 'content' }, [el('div', { class: 'chat-layout' }, [list, pane])]),
  );

  await reload();
  if (params.id) await openChat(Number(params.id));
}
