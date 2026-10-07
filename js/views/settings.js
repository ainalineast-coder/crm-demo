import { api } from '../api.js';
import { store } from '../store.js';
import { confirmDialog, el, openForm, toast } from '../ui.js';

/** Настройки (только администратор): города, сотрудники, номера WhatsApp, почта, AI. */
export async function renderSettings(root) {
  const content = el('div', { class: 'content stack' });

  const field = (name, label, value, { type = 'text', hint = '', options = null, secret = false } = {}) => {
    const input = options
      ? el('select', { name }, options.map((option) => el('option', {
          value: option.value, selected: String(option.value) === String(value ?? ''),
        }, option.label)))
      : el('input', {
          name, type,
          value: secret ? '' : (value ?? ''),
          placeholder: secret && value ? '•••••••• (сохранён)' : '',
        });

    return el('div', { class: 'field' }, [
      el('label', { text: label }),
      input,
      hint ? el('div', { class: 'muted', style: 'font-size:11px;margin-top:3px', text: hint }) : null,
    ]);
  };

  const section = (title, subtitle, status, fields, onSave) => {
    const form = el('div', { class: 'fields-row' }, fields);
    return el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        title,
        status
          ? el('span', {
              class: status.ready ? 'badge' : 'badge prio-high',
              style: 'font-weight:400',
              text: status.ready ? 'подключено' : `не настроено: ${status.missing.join(', ')}`,
            })
          : null,
      ]),
      el('div', { class: 'card-body', style: 'display:grid;gap:12px' }, [
        subtitle ? el('div', { class: 'muted', text: subtitle }) : null,
        form,
        el('div', {}, el('button', {
          class: 'btn',
          onclick: async () => {
            const values = {};
            for (const input of form.querySelectorAll('input, select')) {
              if (input.type === 'password' && input.value === '') continue;
              values[input.name] = input.value;
            }
            try {
              await onSave(values);
              toast('Настройки сохранены');
              await reload();
            } catch (error) {
              toast(error.message, 'error');
            }
          },
        }, 'Сохранить')),
      ]),
    ]);
  };

  const copyRow = (label, value) => {
    const input = el('input', { value, readonly: 'readonly' });
    return el('div', { class: 'field' }, [
      el('label', { text: label }),
      el('div', { style: 'display:flex;gap:6px' }, [
        input,
        el('button', {
          class: 'btn secondary',
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(value);
              toast('Адрес скопирован');
            } catch {
              input.select();
              toast('Скопируйте адрес вручную');
            }
          },
        }, 'Копировать'),
      ]),
    ]);
  };

  const save = (values) => api.patch('/api/settings', values);

  const ROLE_LABELS = { admin: 'Администратор — все города', manager: 'Менеджер своего города' };
  const PROVIDERS = [
    { value: 'none', label: 'Не подключён' },
    { value: 'meta', label: 'WhatsApp Cloud API (Meta)' },
    { value: 'custom', label: 'Другой шлюз (HTTP)' },
  ];

  const statusBadge = (status) => el('span', {
    class: status.ready ? 'badge' : 'badge prio-high',
    text: status.ready ? 'подключено' : `не настроено: ${status.missing.join(', ')}`,
  });

  const cityOptions = (cities, emptyLabel) => [{ value: '', label: emptyLabel }]
    .concat(cities.map((city) => ({ value: city.id, label: city.name })));

  const run = async (action, message) => {
    try {
      await action();
      if (message) toast(message);
      store.invalidate('users', 'cities');
      await reload();
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  /** Города: менеджер города видит только его заявки и переписку. */
  const citiesCard = (cities) => {
    const newCity = el('input', { placeholder: 'Название города', style: 'max-width:240px' });
    const add = () => {
      const name = newCity.value.trim();
      if (name) run(() => api.post('/api/cities', { name }), `Город «${name}» добавлен`);
    };
    newCity.addEventListener('keydown', (event) => { if (event.key === 'Enter') add(); });

    return el('div', { class: 'card' }, [
      el('div', { class: 'card-head', text: 'Города' }),
      el('div', { class: 'card-body', style: 'display:grid;gap:12px' }, [
        el('div', { class: 'muted', text: 'Менеджер видит заявки, клиентов и переписку только своего города. Администратор видит все города.' }),
        el('div', { class: 'table-wrap' }, el('table', {}, [
          el('thead', {}, [el('tr', {}, ['Город', 'Сотрудников', 'Сделок', 'Номеров WhatsApp', '']
            .map((title, index) => el('th', { class: index && index < 4 ? 'num' : '', text: title })))]),
          el('tbody', {}, cities.length ? cities.map((city) => {
            const input = el('input', { value: city.name, style: 'max-width:220px' });
            input.addEventListener('change', () => run(
              () => api.patch(`/api/cities/${city.id}`, { name: input.value.trim() }), 'Город переименован',
            ));
            return el('tr', {}, [
              el('td', {}, input),
              el('td', { class: 'num', text: String(city.users_count) }),
              el('td', { class: 'num', text: String(city.deals_count) }),
              el('td', { class: 'num', text: String(city.channels_count) }),
              el('td', { class: 'actions' }, el('button', {
                class: 'btn ghost', title: 'Удалить город',
                onclick: async () => {
                  if (!await confirmDialog(`Удалить город «${city.name}»?`)) return;
                  run(() => api.delete(`/api/cities/${city.id}`), 'Город удалён');
                },
              }, '🗑')),
            ]);
          }) : [el('tr', {}, [el('td', { colspan: '5' }, el('div', { class: 'empty', text: 'Городов пока нет' }))])]),
        ])),
        el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
          newCity,
          el('button', { class: 'btn', onclick: add }, '+ Город'),
        ]),
      ]),
    ]);
  };

  /** Сотрудники: роль и город определяют, что человек видит. */
  const userForm = (user, cities) => openForm({
    title: user ? `Сотрудник — ${user.name}` : 'Новый сотрудник',
    fields: [
      { name: 'name', label: 'Имя', required: true, value: user?.name },
      { name: 'email', label: 'Email для входа', required: true, value: user?.email },
      { name: 'role', label: 'Роль', type: 'select', value: user?.role ?? 'manager',
        options: Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })) },
      { name: 'city_id', label: 'Город', type: 'select', value: user?.city_id ?? '',
        options: cityOptions(cities, '— не выбран —') },
      { name: 'password', label: user ? 'Новый пароль (если меняете)' : 'Пароль', type: 'password', required: !user },
      user ? { name: 'active', label: 'Доступ открыт', type: 'checkbox', value: Boolean(user.active) } : null,
    ].filter(Boolean),
    onSubmit: async (values) => {
      if (values.role === 'manager' && !values.city_id) {
        const error = new Error('Укажите город: менеджер видит заявки только своего города');
        error.details = { city_id: 'Выберите город' };
        throw error;
      }
      const payload = { ...values };
      if (!payload.password) delete payload.password;
      if (user) await api.patch(`/api/users/${user.id}`, payload);
      else await api.post('/api/users', payload);
      toast(user ? 'Сотрудник сохранён' : 'Сотрудник добавлен');
      store.invalidate('users', 'cities');
      await reload();
    },
  });

  const usersCard = (users, cities) => el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      'Сотрудники и доступ',
      el('button', { class: 'btn', onclick: () => userForm(null, cities) }, '+ Сотрудник'),
    ]),
    el('div', { class: 'table-wrap' }, el('table', {}, [
      el('thead', {}, [el('tr', {}, ['Имя', 'Email', 'Роль', 'Город', 'Статус', '']
        .map((title) => el('th', { text: title })))]),
      el('tbody', {}, users.map((user) => el('tr', {}, [
        el('td', {}, el('strong', { text: user.name })),
        el('td', { class: 'muted', text: user.email }),
        el('td', { text: ROLE_LABELS[user.role] ?? user.role }),
        el('td', { text: user.role === 'admin' ? 'все города' : (user.city_name ?? '— не выбран —') }),
        el('td', { text: user.active ? 'активен' : 'отключён' }),
        el('td', { class: 'actions' }, el('button', { class: 'btn ghost', onclick: () => userForm(user, cities) }, '✎')),
      ]))),
    ])),
  ]);

  /** Номера WhatsApp: у каждого города свой номер и свой шлюз. */
  const channelForm = (channel, cities) => openForm({
    title: channel ? `Номер — ${channel.name}` : 'Новый номер WhatsApp',
    fields: [
      { name: 'name', label: 'Название', required: true, value: channel?.name ?? '', width: 'full' },
      { name: 'phone', label: 'Номер телефона', value: channel?.phone },
      { name: 'city_id', label: 'Город', type: 'select', value: channel?.city_id ?? '',
        options: cityOptions(cities, '— общий, только администратору —') },
      { name: 'provider', label: 'Шлюз', type: 'select', value: channel?.provider ?? 'none', options: PROVIDERS },
      { name: 'phone_id', label: 'Идентификатор номера (phone_number_id)', value: channel?.phone_id },
      { name: 'token', label: channel?.has_token ? 'Токен доступа (сохранён — введите новый, чтобы заменить)' : 'Токен доступа',
        type: 'password' },
      { name: 'api_url', label: 'Адрес API', value: channel?.api_url, width: 'full' },
      channel ? { name: 'active', label: 'Номер включён', type: 'checkbox', value: Boolean(channel.active) } : null,
    ].filter(Boolean),
    onSubmit: async (values) => {
      const payload = { ...values };
      if (!payload.token) delete payload.token;
      if (channel) await api.patch(`/api/channels/${channel.id}`, payload);
      else await api.post('/api/channels', payload);
      toast(channel ? 'Номер сохранён' : 'Номер добавлен');
      store.invalidate('cities');
      await reload();
    },
  });

  const channelsCard = (channels, cities) => el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      'Номера WhatsApp',
      el('button', { class: 'btn', onclick: () => channelForm(null, cities) }, '+ Номер'),
    ]),
    el('div', { class: 'card-body', style: 'display:grid;gap:14px' }, [
      el('div', { class: 'muted', text: 'Сообщения, пришедшие на номер, попадают в imBox его города. Ответ клиенту уходит с того же номера. Для каждого номера укажите у провайдера свой адрес вебхука.' }),
      ...(channels.length ? channels.map((channel) => el('div', { class: 'channel-row' }, [
        el('div', { style: 'display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center' }, [
          el('div', {}, [
            el('strong', { text: channel.name }),
            el('span', { class: 'muted', text: ` · ${channel.phone ?? 'номер не указан'} · ${channel.city_name ?? 'общий номер'}` }),
          ]),
          el('div', { style: 'display:flex;gap:6px;align-items:center' }, [
            statusBadge(channel.status),
            el('button', { class: 'btn ghost', title: 'Изменить', onclick: () => channelForm(channel, cities) }, '✎'),
            el('button', { class: 'btn ghost', title: 'Удалить номер', onclick: async () => {
              if (!await confirmDialog(`Удалить номер «${channel.name}»? Переписки останутся.`)) return;
              run(() => api.delete(`/api/channels/${channel.id}`), 'Номер удалён');
            } }, '🗑'),
          ]),
        ]),
        copyRow('Вебхук этого номера', channel.webhook_url),
      ])) : [el('div', { class: 'empty', text: 'Номера не добавлены' })]),
    ]),
  ]);

  async function reload() {
    const [data, users, cities, channels] = await Promise.all([
      api.get('/api/settings'), store.users(), store.cities(true), api.get('/api/channels'),
    ]);
    const { settings, channels: status, webhooks } = data;

    content.replaceChildren(
      citiesCard(cities),
      usersCard(users, cities),
      channelsCard(channels.items, cities),

      section('Почта (SMTP)', 'Исходящие письма уходят с этого ящика; входящие принимает вебхук почтового сервиса.',
        status.email, [
          field('smtp_host', 'Сервер', settings.smtp_host, { hint: 'например, smtp.yandex.ru' }),
          field('smtp_port', 'Порт', settings.smtp_port, { hint: '587 — обычный, 465 — SSL' }),
          field('smtp_secure', 'Шифрование SSL', settings.smtp_secure, {
            options: [{ value: 'false', label: 'STARTTLS (587)' }, { value: 'true', label: 'SSL (465)' }],
          }),
          field('smtp_user', 'Логин', settings.smtp_user),
          field('smtp_password', 'Пароль', settings.smtp_password, { type: 'password', secret: true }),
          field('smtp_from', 'Отправитель', settings.smtp_from, { hint: 'Адрес в поле «От кого»' }),
        ], save),

      section('AI-помощник', 'Готовит сводку по сделке и черновик ответа клиенту. Нужен ключ API — он хранится только в вашей базе.',
        { ready: settings.ai_api_key, missing: ['ключ API'] }, [
          field('ai_api_key', 'Ключ API', settings.ai_api_key, { type: 'password', secret: true }),
          field('ai_model', 'Модель', settings.ai_model, { hint: 'по умолчанию claude-opus-5-5' }),
        ], save),

      el('div', { class: 'card' }, [
        el('div', { class: 'card-head', text: 'Адреса для интеграций' }),
        el('div', { class: 'card-body', style: 'display:grid;gap:12px' }, [
          el('div', { class: 'muted' },
            'Адрес вебхука почты укажите в почтовом сервисе. Адреса WhatsApp — у каждого номера в разделе «Номера WhatsApp».'),
          copyRow('Вебхук почты', webhooks.email),
          el('div', { class: 'fields-row' }, [
            field('webhook_secret', 'Секрет вебхука', settings.webhook_secret, {
              type: 'password', secret: true,
              hint: 'Передаётся в заголовке X-Webhook-Secret; для Meta — это verify token',
            }),
          ]),
          el('div', {}, el('button', {
            class: 'btn',
            onclick: async (event) => {
              const input = event.target.closest('.card-body').querySelector('input[name=webhook_secret]');
              if (!input.value) return toast('Введите секрет', 'error');
              await save({ webhook_secret: input.value });
              toast('Секрет сохранён');
              await reload();
            },
          }, 'Сохранить секрет')),
        ]),
      ]),
    );
  }

  root.append(
    el('div', { class: 'topbar' }, [el('h1', { text: 'Настройки' })]),
    content,
  );

  await reload();
}
