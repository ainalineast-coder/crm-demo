/**
 * Демо-данные для витрины: те же сущности, что и в боевой базе,
 * только живут в памяти браузера. Генерируются детерминированно,
 * чтобы у всех, кто открыл ссылку, картинка была одинаковой.
 */
import { DEFAULT_PIPELINES, buildStages } from './stage-constants.js';

const DAY = 86_400_000;

const pad = (value) => String(value).padStart(2, '0');
export const dateOnly = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const stamp = (offsetDays, hour) => {
  const date = new Date(Date.now() + offsetDays * DAY);
  return `${date.toISOString().slice(0, 10)} ${pad(hour)}:${pad((offsetDays * 7 + 60) % 60)}:00`;
};

function random(seed) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

const USERS = [
  { id: 1, name: 'Жанна', email: 'admin@crm.local', role: 'admin', active: 1 },
  { id: 2, name: 'Пётр Ковалёв', email: 'petr@crm.local', role: 'manager', active: 1 },
  { id: 3, name: 'Ольга Тихонова', email: 'olga@crm.local', role: 'manager', active: 1 },
];

const TAGS = [
  { name: 'маркетинг', title: 'Общая рекламная кампания', color: '#2a78d6' },
  { name: 'instagram', title: 'Таргет в Instagram', color: '#eb6834' },
  { name: 'google_ads', title: 'Контекст Google Ads', color: '#1baf7a' },
  { name: 'авито', title: 'Объявления на Авито', color: '#eda100' },
  { name: 'сарафан', title: 'Рекомендации клиентов', color: '#e87ba4' },
];

const COMPANIES = [
  { name: 'ООО «Северный Ветер»', industry: 'Логистика', website: 'sever-veter.ru', phone: '+7 812 400-10-11', address: 'Санкт-Петербург, Невский пр. 12' },
  { name: 'АО «ТехноПром»', industry: 'Производство', website: 'technoprom.ru', phone: '+7 495 220-33-44', address: 'Москва, ул. Тверская 7' },
  { name: 'ООО «МедТех Сервис»', industry: 'Медицина', website: 'medteh.ru', phone: '+7 343 555-66-77', address: 'Екатеринбург, ул. Ленина 5' },
];

const MALE_NAMES = ['Иван', 'Сергей', 'Дмитрий', 'Артём', 'Алексей', 'Павел', 'Михаил', 'Роман'];
const FEMALE_NAMES = ['Мария', 'Ольга', 'Елена', 'Наталья', 'Ирина', 'Юлия', 'Анастасия', 'Татьяна'];
const LAST_NAMES = [
  ['Волков', 'Волкова'], ['Зайцев', 'Зайцева'], ['Ким', 'Ким'], ['Лебедев', 'Лебедева'],
  ['Новиков', 'Новикова'], ['Соколов', 'Соколова'], ['Морозов', 'Морозова'], ['Фомин', 'Фомина'],
  ['Гусев', 'Гусева'], ['Орлов', 'Орлова'], ['Белов', 'Белова'], ['Крылов', 'Крылова'],
  ['Сафин', 'Сафина'], ['Данилов', 'Данилова'], ['Егоров', 'Егорова'], ['Титов', 'Титова'],
];

const LEAD_TITLES = ['Заявка с сайта с оптовой формы', 'Заявка из директа', 'Звонок по рекламе',
  'Запрос расчёта', 'Консультация по услуге', 'Заявка на прайс', 'Вопрос по цене', 'Повторное обращение'];

const PRODUCTS = ['Переплетный картон', 'Коробки малого размера', 'Гофрокартон',
  'Стрейч-плёнка', 'Скотч упаковочный', 'Бумага офсетная'];

// Насколько далеко заявка ушла по воронке: индекс рабочего этапа или закрытие.
const PROGRESS_POOL = [0, 0, 0, 1, 1, 1, 2, 2, 3, 'won', 'won', 'won', 'lost', 'lost'];

const TASKS = [
  { title: 'Связаться: принять заявку в работу', due: -1, priority: 'high' },
  { title: 'Отправить прайс', due: 0, priority: 'high' },
  { title: 'Перезвонить по остатку на складе', due: 0, priority: 'normal' },
  { title: 'Выставить счёт', due: 1, priority: 'normal' },
  { title: 'Согласовать дату отгрузки', due: 1, priority: 'normal' },
  { title: 'Уточнить реквизиты', due: 3, priority: 'low' },
  { title: 'Собрать обратную связь по заказу', due: 5, priority: 'low', done: 1 },
];

const PRODUCTS_CATALOG = [
  { sku: 'PK-001', name: 'Переплетный картон 2.0 мм', price: 1_200, unit: 'лист', stock: 420, group: 'Картон' },
  { sku: 'PK-002', name: 'Гофрокартон Т-23', price: 850, unit: 'м²', stock: 1_150, group: 'Картон' },
  { sku: 'KR-010', name: 'Коробка малого размера', price: 320, unit: 'шт', stock: 2_400, group: 'Упаковка' },
  { sku: 'KR-020', name: 'Коробка большого размера', price: 540, unit: 'шт', stock: 860, group: 'Упаковка' },
  { sku: 'SP-100', name: 'Стрейч-плёнка 17 мкм', price: 2_800, unit: 'рулон', stock: 130, group: 'Плёнка' },
  { sku: 'SK-050', name: 'Скотч упаковочный 48 мм', price: 450, unit: 'шт', stock: 980, group: 'Расходники' },
];

const CHATS = [
  {
    title: 'Алексей',
    messages: [
      { in: true, text: 'Здравствуйте! Интересует переплетный картон, есть в наличии?' },
      { in: false, text: 'Добрый день! Да, 2 мм есть на складе. Какой объём нужен?' },
      { in: true, text: 'Примерно 500 листов. Пришлите прайс, пожалуйста.' },
    ],
  },
  {
    title: 'Евгений',
    messages: [
      { in: true, text: 'Добрый день, когда будет отгрузка по прошлому заказу?' },
      { in: false, text: 'Здравствуйте! Отгрузим завтра до обеда, водитель позвонит.' },
    ],
  },
  {
    title: 'Дмитрий',
    messages: [
      { in: true, text: 'Пришла партия с браком, 3 коробки мятые.' },
      { in: false, text: 'Извините за ситуацию. Оформляем рекламацию, заменим в ближайшей поставке.' },
      { in: true, text: 'Хорошо, жду.' },
    ],
  },
];

const EMAILS = [
  {
    direction: 'out', subject: 'Коммерческое предложение — упаковка',
    body: 'Добрый день! Направляем прайс на картон и упаковку. Готовы обсудить объёмы.',
    from: 'sales@company.kz', to: 'client1@mail.local',
  },
  {
    direction: 'in', subject: 'Re: Коммерческое предложение — упаковка',
    body: 'Спасибо, изучим и вернёмся с ответом на неделе.',
    from: 'client1@mail.local', to: 'sales@company.kz',
  },
  {
    direction: 'out', subject: 'Счёт на оплату №1042',
    body: 'Во вложении счёт на оплату. Отгрузка после поступления средств.',
    from: 'sales@company.kz', to: 'client2@mail.local',
  },
];

const NOTES = [
  { type: 'call', body: 'Клиент позвонил по рекламе, интересует стоимость и сроки.' },
  { type: 'note', body: 'Просит перезвонить после 18:00.' },
  { type: 'meeting', body: 'Договорились о встрече в офисе.' },
  { type: 'email', body: 'Отправили расчёт и реквизиты.' },
  { type: 'note', body: 'Сравнивает с конкурентом, решение на следующей неделе.' },
];

export function buildDataset() {
  const rnd = random(20_260_930);
  const state = {
    pipelines: [],
    stages: [],
    users: USERS.map((user) => ({ ...user, created_at: stamp(-90, 10) })),
    tags: TAGS.map((tag, index) => ({
      id: index + 1, ...tag, active: 1, created_at: stamp(-60, 10),
    })),
    companies: [],
    contacts: [],
    deals: [],
    dealTags: [],
    tasks: [],
    activities: [],
    products: [],
    dealItems: [],
    files: [],
    calls: [],
    goals: [],
    chats: [],
    chatMessages: [],
    emails: [],
    events: [],
    settings: {},
    nextId: {
      company: 1, contact: 1, deal: 1, tag: TAGS.length + 1, task: 1, activity: 1,
      pipeline: 1, stage: 1, product: 1, item: 1, file: 1, call: 1, goal: 1,
      chat: 1, message: 1, email: 1, event: 1,
    },
  };

  // Воронки и их этапы — те же, что создаются на пустой базе.
  for (const [index, pipeline] of DEFAULT_PIPELINES.entries()) {
    const id = state.nextId.pipeline++;
    state.pipelines.push({ id, name: pipeline.name, position: index, created_at: stamp(-60, 10) });
    for (const stage of buildStages(pipeline.stages)) {
      state.stages.push({
        id: state.nextId.stage++, pipeline_id: id, name: stage.name,
        color: stage.color, position: stage.position, type: stage.type, created_at: stamp(-60, 10),
      });
    }
  }

  const openStages = (pipelineId) =>
    state.stages.filter((stage) => stage.pipeline_id === pipelineId && stage.type === 'open');
  const closingStage = (pipelineId, type) =>
    state.stages.find((stage) => stage.pipeline_id === pipelineId && stage.type === type);

  const ownerFor = (index) => state.users[index % state.users.length].id;

  COMPANIES.forEach((company, index) => {
    state.companies.push({
      id: state.nextId.company++, ...company, notes: null,
      owner_id: ownerFor(index), created_at: stamp(-45, 11), updated_at: stamp(-45, 11),
    });
  });

  for (let index = 0; index < 64; index += 1) {
    const roll = rnd();
    const pipeline = roll > 0.35 ? state.pipelines[0] : roll > 0.12 ? state.pipelines[1] : state.pipelines[2];
    const dayOffset = -Math.floor(rnd() * 30);
    const createdAt = stamp(dayOffset, 9 + Math.floor(rnd() * 9));
    const female = rnd() > 0.5;
    const names = female ? FEMALE_NAMES : MALE_NAMES;
    const firstName = names[Math.floor(rnd() * names.length)];
    const lastName = LAST_NAMES[Math.floor(rnd() * LAST_NAMES.length)][female ? 1 : 0];
    const phone = `+7 9${10 + Math.floor(rnd() * 89)} ${100 + Math.floor(rnd() * 899)}-${10 + Math.floor(rnd() * 89)}-${10 + Math.floor(rnd() * 89)}`;

    const contact = {
      id: state.nextId.contact++, first_name: firstName, last_name: lastName, phone,
      email: `${firstName.toLowerCase()}.${index}@mail.local`, position: null,
      company_id: null, owner_id: ownerFor(index), notes: null,
      created_at: createdAt, updated_at: createdAt,
    };
    state.contacts.push(contact);

    const progress = PROGRESS_POOL[Math.floor(rnd() * PROGRESS_POOL.length)];
    const open = openStages(pipeline.id);
    const stage = typeof progress === 'number'
      ? open[Math.min(progress, open.length - 1)]
      : closingStage(pipeline.id, progress);
    const product = PRODUCTS[Math.floor(rnd() * PRODUCTS.length)];
    const deal = {
      id: state.nextId.deal++,
      title: pipeline.name === 'Рекламации'
        ? `Рекламация — ${product}`
        : `${LEAD_TITLES[Math.floor(rnd() * LEAD_TITLES.length)]} — ${product}`,
      amount: (2 + Math.floor(rnd() * 60)) * 5_000,
      currency: 'KZT',
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      lead_type: 'individual',
      company_id: null,
      contact_id: contact.id,
      owner_id: ownerFor(index),
      expected_close_date: dateOnly(dayOffset + 5 + Math.floor(rnd() * 20)),
      closed_at: stage.type === 'open' ? null : createdAt,
      notes: null,
      created_at: createdAt,
      updated_at: createdAt,
    };
    state.deals.push(deal);

    if (rnd() > 0.12) {
      const tag = state.tags[Math.floor(rnd() * state.tags.length)];
      state.dealTags.push({ deal_id: deal.id, tag_id: tag.id });
      if (rnd() > 0.85) {
        const extra = state.tags[Math.floor(rnd() * state.tags.length)];
        if (extra.id !== tag.id) state.dealTags.push({ deal_id: deal.id, tag_id: extra.id });
      }
    }

    state.activities.push({
      id: state.nextId.activity++, type: 'system', body: 'Заявка поступила с рекламы',
      user_id: deal.owner_id, deal_id: deal.id, company_id: null, contact_id: null, created_at: createdAt,
    });
    if (rnd() > 0.5) {
      const note = NOTES[Math.floor(rnd() * NOTES.length)];
      state.activities.push({
        id: state.nextId.activity++, ...note, user_id: deal.owner_id, deal_id: deal.id,
        company_id: null, contact_id: null, created_at: createdAt,
      });
    }
  }

  // Оптовые заказы юрлиц идут по первой воронке.
  state.companies.forEach((company, index) => {
    const pipeline = state.pipelines[0];
    const open = openStages(pipeline.id);
    const stage = open[(index + 1) % open.length];
    const deal = {
      id: state.nextId.deal++,
      title: `Заказ ${company.name} — ${(index + 2) * 20} коробок`,
      amount: (index + 3) * 120_000,
      currency: 'KZT',
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      lead_type: 'company',
      company_id: company.id,
      contact_id: null,
      owner_id: company.owner_id,
      expected_close_date: dateOnly(14 + index),
      closed_at: null,
      notes: null,
      created_at: stamp(-20 + index, 12),
      updated_at: stamp(-20 + index, 12),
    };
    state.deals.push(deal);
    state.dealTags.push({ deal_id: deal.id, tag_id: state.tags[0].id });
  });

  // Каталог товаров и позиции в первых сделках
  for (const product of PRODUCTS_CATALOG) {
    state.products.push({
      id: state.nextId.product++, ...product, currency: 'KZT', description: null,
      active: 1, created_at: stamp(-40, 10), updated_at: stamp(-40, 10),
    });
  }

  state.deals.slice(0, 12).forEach((deal, index) => {
    const product = state.products[index % state.products.length];
    const quantity = 5 + Math.floor(rnd() * 40);
    state.dealItems.push({
      id: state.nextId.item++, deal_id: deal.id, product_id: product.id,
      name: product.name, price: product.price, quantity, created_at: deal.created_at,
    });
    deal.amount = product.price * quantity;
  });

  // Звонки
  for (let index = 0; index < 24; index += 1) {
    const deal = state.deals[Math.floor(rnd() * state.deals.length)];
    const contact = state.contacts.find((item) => item.id === deal.contact_id);
    const missed = rnd() > 0.75;
    state.calls.push({
      id: state.nextId.call++,
      direction: rnd() > 0.45 ? 'in' : 'out',
      phone: contact?.phone ?? '+7 700 000-00-00',
      duration: missed ? 0 : 30 + Math.floor(rnd() * 400),
      result: missed ? 'missed' : 'answered',
      recording_url: null, note: null,
      user_id: state.users[index % state.users.length].id,
      deal_id: deal.id, contact_id: contact?.id ?? null,
      created_at: stamp(-Math.floor(rnd() * 14), 9 + Math.floor(rnd() * 9)),
    });
  }

  // Переписки в WhatsApp
  CHATS.forEach((chat, index) => {
    const deal = state.deals[index];
    const contact = state.contacts.find((item) => item.id === deal.contact_id);
    const chatId = state.nextId.chat++;
    state.chats.push({
      id: chatId, channel: 'whatsapp', external_id: `demo-${index}`, title: chat.title,
      phone: contact?.phone ?? null, contact_id: contact?.id ?? null, deal_id: deal.id,
      unread: chat.messages.filter((message) => message.in).length > 1 ? 1 : 0,
      last_message_at: stamp(-Math.floor(rnd() * 3), 12 + index),
      created_at: stamp(-5, 10),
    });
    chat.messages.forEach((message, position) => {
      state.chatMessages.push({
        id: state.nextId.message++, chat_id: chatId,
        direction: message.in ? 'in' : 'out', body: message.text,
        author_name: message.in ? chat.title : USERS[0].name,
        user_id: message.in ? null : USERS[0].id,
        external_id: null, status: message.in ? 'received' : 'sent',
        created_at: stamp(-Math.floor(rnd() * 3), 12 + index, position),
      });
    });
  });

  // Цели на текущий месяц
  const period = new Date().toISOString().slice(0, 7);
  state.users.forEach((user, index) => {
    state.goals.push({
      id: state.nextId.goal++, user_id: user.id, period,
      target_amount: (index + 3) * 500_000, target_count: (index + 2) * 4, created_at: stamp(-10, 9),
    });
  });

  // Письма
  EMAILS.forEach((email, index) => {
    state.emails.push({
      id: state.nextId.email++, direction: email.direction, subject: email.subject, body: email.body,
      from_addr: email.from, to_addr: email.to,
      status: email.direction === 'in' ? 'received' : 'sent', error: null,
      user_id: USERS[0].id, contact_id: null, deal_id: state.deals[index].id,
      created_at: stamp(-index - 1, 11),
    });
  });

  // Несколько записей в журнале событий
  state.deals.slice(0, 6).forEach((deal, index) => {
    state.events.push({
      id: state.nextId.event++, entity_type: 'deal', entity_id: deal.id, entity_name: deal.title,
      action: 'create', field: 'Сделка создана',
      old_value: null, new_value: state.stages.find((stage) => stage.id === deal.stage_id)?.name ?? null,
      user_id: state.users[index % state.users.length].id, created_at: deal.created_at,
    });
  });

  TASKS.forEach((task, index) => {
    state.tasks.push({
      id: state.nextId.task++, title: task.title, description: null,
      due_date: dateOnly(task.due), done: task.done ?? 0, priority: task.priority,
      assignee_id: ownerFor(index), company_id: null, contact_id: null,
      deal_id: state.deals[index % state.deals.length].id,
      created_at: stamp(-3, 10), updated_at: stamp(-3, 10),
    });
  });

  return state;
}
