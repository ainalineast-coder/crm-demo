import { api } from '../api.js';
import { store } from '../store.js';
import { el, toast } from '../ui.js';

/** Настройки интеграций: WhatsApp, почта, AI-помощник и адреса вебхуков. */
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

  async function reload() {
    const [data, users] = await Promise.all([api.get('/api/settings'), store.users()]);
    const { settings, channels, webhooks } = data;

    content.replaceChildren(
      section('WhatsApp', 'Подключите номер WhatsApp Business: сообщения клиентов попадают в раздел imBox, ответы уходят через выбранный шлюз.',
        channels.whatsapp, [
          field('whatsapp_provider', 'Шлюз', settings.whatsapp_provider, {
            options: [
              { value: '', label: 'Не подключён' },
              { value: 'meta', label: 'WhatsApp Cloud API (Meta)' },
              { value: 'custom', label: 'Другой шлюз (HTTP)' },
            ],
          }),
          field('whatsapp_phone_id', 'Идентификатор номера (phone_number_id)', settings.whatsapp_phone_id),
          field('whatsapp_token', 'Токен доступа', settings.whatsapp_token, {
            type: 'password', secret: true, hint: 'Постоянный токен из личного кабинета Meta',
          }),
          field('whatsapp_api_url', 'Адрес API', settings.whatsapp_api_url, {
            hint: 'Для Meta можно не заполнять — используется graph.facebook.com/v21.0',
          }),
        ], save),

      section('Почта (SMTP)', 'Исходящие письма уходят с этого ящика; входящие принимает вебхук почтового сервиса.',
        channels.email, [
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
            'Укажите эти адреса в личном кабинете WhatsApp и почтового сервиса, чтобы входящие сообщения попадали в CRM.'),
          copyRow('Вебхук WhatsApp', webhooks.whatsapp),
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

      el('div', { class: 'card' }, [
        el('div', { class: 'card-head', text: 'Пользователи' }),
        el('div', { class: 'table-wrap' }, el('table', {}, [
          el('thead', {}, [el('tr', {}, ['Имя', 'Email', 'Роль', 'Статус'].map((title) => el('th', { text: title })))]),
          el('tbody', {}, users.map((user) => el('tr', {}, [
            el('td', {}, el('strong', { text: user.name })),
            el('td', { class: 'muted', text: user.email }),
            el('td', { text: user.role === 'admin' ? 'Администратор' : 'Менеджер' }),
            el('td', { text: user.active ? 'активен' : 'отключён' }),
          ]))),
        ])),
      ]),
    );
  }

  root.append(
    el('div', { class: 'topbar' }, [el('h1', { text: 'Настройки' })]),
    content,
  );

  await reload();
}
