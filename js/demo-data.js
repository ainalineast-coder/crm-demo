/**
 * Демо-данные для витрины: те же сущности, что и в боевой базе,
 * только живут в памяти браузера. Генерируются детерминированно,
 * чтобы у всех, кто открыл ссылку, картинка была одинаковой.
 */
import { DEFAULT_ROLES, normalizeRole } from './permissions.js';
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

// Города (филиалы): у каждого свои менеджеры, свой номер WhatsApp и свои заявки.
// Минск — возможно, позже: город добавляется в «Настройках».
const CITIES = [
  { id: 1, name: 'Караганда', whatsapp: '+7 721 250-30-40' },
  { id: 2, name: 'Алматы', whatsapp: '+7 701 191 6495' },
];

// Номер владельца: без города, переписку на нём видит только администратор.
const OWNER_WHATSAPP = { name: 'WhatsApp владельца', phone: '+7 708 641 9548' };

// Общий Instagram без города: заявки из него видит владелец и передаёт нужному городу.
const INSTAGRAM = { name: 'Instagram Beyosa', kind: 'instagram', phone: null };
const INSTAGRAM_LEADS = [
  { name: 'Мадина', chatId: 'madina.home', text: 'Здравствуйте! Есть доставка в Караганду? Интересует матрас 160×200' },
  { name: 'Арман', chatId: 'arman_k', text: 'Сколько стоит кровать с подъёмным механизмом?' },
];

// Как в Beyosa: 4 менеджера в Алматы, 2 в Караганде, общий доступ — у одного человека.
// Администратор видит всё; остальным права даёт роль (порядок как в DEFAULT_ROLES:
// 1 — менеджер «свои и свободные заявки», 4 — стажёр). leads — ведёт демо-заявки.
// demoLabel — подпись в переключателе «Смотреть как».
export const USERS = [
  { id: 1, name: 'Жанна', email: 'admin@crm.local', role: 'admin', city_id: null, role_id: null, active: 1,
    demoLabel: 'общий доступ: все города, Instagram, настройки' },
  { id: 2, name: 'Ольга Тихонова', email: 'olga@crm.local', role: 'manager', city_id: 1, role_id: 1, active: 1,
    leads: true, demoLabel: 'менеджер Караганды' },
  { id: 3, name: 'Тимур Нурпеисов', email: 'timur@crm.local', role: 'manager', city_id: 1, role_id: 1, active: 1,
    leads: true, demoLabel: 'менеджер Караганды' },
  { id: 4, name: 'Пётр Ковалёв', email: 'petr@crm.local', role: 'manager', city_id: 2, role_id: 1, active: 1,
    leads: true, demoLabel: 'менеджер Алматы' },
  { id: 5, name: 'Алия Сейткали', email: 'aliya@crm.local', role: 'manager', city_id: 2, role_id: 1, active: 1,
    leads: true, demoLabel: 'менеджер Алматы' },
  { id: 6, name: 'Дана Жумабаева', email: 'dana@crm.local', role: 'manager', city_id: 2, role_id: 1, active: 1,
    leads: true, demoLabel: 'менеджер Алматы' },
  { id: 7, name: 'Айгерим Нурланова', email: 'aigerim@crm.local', role: 'manager', city_id: 2, role_id: 4, active: 1,
    leads: true, demoLabel: 'стажёр Алматы: только свои' },
];

const TAGS = [
  { name: 'маркетинг', title: 'Общая рекламная кампания', color: '#2a78d6' },
  { name: 'instagram', title: 'Таргет в Instagram', color: '#eb6834' },
  { name: 'google_ads', title: 'Контекст Google Ads', color: '#1baf7a' },
  { name: 'авито', title: 'Объявления на Авито', color: '#eda100' },
  { name: 'сарафан', title: 'Рекомендации клиентов', color: '#e87ba4' },
];

// По компании на город — в том же порядке, что и менеджеры.
const COMPANIES = [
  { name: 'ТОО «Гостиница Сарыарка»', industry: 'Гостиницы', website: 'saryarka-hotel.kz', phone: '+7 7212 40-10-11', address: 'Караганда, пр. Бухар-Жырау 52' },
  { name: 'ТОО «Детский сад Балапан»', industry: 'Образование', website: 'balapan-kids.kz', phone: '+7 7212 22-33-44', address: 'Караганда, ул. Ерубаева 7' },
  { name: 'ТОО «Хостел Алатау»', industry: 'Гостиницы', website: 'alatau-hostel.kz', phone: '+7 727 355-66-77', address: 'Алматы, пр. Абая 5' },
];

const MALE_NAMES = ['Ерлан', 'Сергей', 'Даурен', 'Алексей', 'Асхат', 'Дмитрий', 'Нурлан', 'Арман'];
const FEMALE_NAMES = ['Айгуль', 'Мадина', 'Елена', 'Динара', 'Ольга', 'Асель', 'Наталья', 'Жанар'];
const LAST_NAMES = [
  ['Ахметов', 'Ахметова'], ['Ким', 'Ким'], ['Волков', 'Волкова'], ['Сарсенбаев', 'Сарсенбаева'],
  ['Жуматов', 'Жуматова'], ['Лебедев', 'Лебедева'], ['Искаков', 'Искакова'], ['Морозов', 'Морозова'],
  ['Абдрахманов', 'Абдрахманова'], ['Орлов', 'Орлова'], ['Касымов', 'Касымова'], ['Белов', 'Белова'],
  ['Нургалиев', 'Нургалиева'], ['Данилов', 'Данилова'], ['Есенов', 'Есенова'], ['Титов', 'Титова'],
];

const LEAD_TITLES = [
  'Заявка с сайта', 'Заявка из Instagram', 'Звонок по рекламе', 'Запрос цены',
  'Консультация по размеру', 'Заявка на доставку', 'Вопрос по рассрочке', 'Повторное обращение',
];

const PRODUCTS = [
  'Матрас 160×200', 'Матрас 90×200', 'Кровать с подъёмным механизмом',
  'Подушка ортопедическая', 'Топпер 160×200', 'Детский матрас 70×140',
];

// Насколько далеко заявка ушла по воронке: индекс рабочего этапа или закрытие.
const PROGRESS_POOL = [0, 0, 0, 1, 1, 1, 2, 2, 3, 'won', 'won', 'won', 'lost', 'lost'];

const TASKS = [
  { title: 'Связаться: принять заявку в работу', due: -1, priority: 'high' },
  { title: 'Отправить фото и цены', due: 0, priority: 'high' },
  { title: 'Уточнить размер кровати', due: 0, priority: 'normal' },
  { title: 'Выставить счёт', due: 1, priority: 'normal' },
  { title: 'Согласовать дату доставки', due: 1, priority: 'normal' },
  { title: 'Уточнить адрес доставки', due: 3, priority: 'low' },
  { title: 'Собрать отзыв после доставки', due: 5, priority: 'low', done: 1 },
];

const PRODUCTS_CATALOG = [
  { sku: 'MT-160', name: 'Матрас ортопедический 160×200', price: 189_000, unit: 'шт', stock: 24, group: 'Матрасы' },
  { sku: 'MT-090', name: 'Матрас ортопедический 90×200', price: 109_000, unit: 'шт', stock: 30, group: 'Матрасы' },
  { sku: 'MT-K70', name: 'Детский матрас 70×140', price: 49_000, unit: 'шт', stock: 18, group: 'Матрасы' },
  { sku: 'TP-160', name: 'Топпер 160×200', price: 45_000, unit: 'шт', stock: 40, group: 'Топперы' },
  { sku: 'PL-001', name: 'Подушка ортопедическая', price: 18_000, unit: 'шт', stock: 120, group: 'Подушки' },
  { sku: 'KR-160', name: 'Кровать с подъёмным механизмом 160×200', price: 245_000, unit: 'шт', stock: 8, group: 'Кровати' },
];

const CHATS = [
  {
    title: 'Динара',
    messages: [
      { in: true, text: 'Здравствуйте! Сколько стоит ортопедический матрас 160×200?' },
      { in: false, text: 'Добрый день! 189 000 ₸, есть в наличии. Доставка по городу бесплатно.' },
      { in: true, text: 'А рассрочка есть?' },
    ],
  },
  {
    title: 'Ерлан',
    messages: [
      { in: true, text: 'Добрый день, когда привезут кровать?' },
      { in: false, text: 'Здравствуйте! Доставка завтра с 10 до 14, водитель позвонит заранее.' },
    ],
  },
  {
    title: 'Асель',
    messages: [
      { in: true, text: 'Матрас привезли с порванной упаковкой, на углу пятно.' },
      { in: false, text: 'Извините! Оформляем рекламацию и заменим матрас в течение трёх дней.' },
      { in: true, text: 'Хорошо, жду.' },
    ],
  },
];

const EMAILS = [
  {
    direction: 'out', subject: 'Коммерческое предложение — матрасы для гостиницы',
    body: 'Добрый день! Направляем цены на матрасы и топперы для номеров. Готовы обсудить объём и сроки.',
    from: 'sales@company.kz', to: 'client1@mail.local',
  },
  {
    direction: 'in', subject: 'Re: Коммерческое предложение — матрасы для гостиницы',
    body: 'Спасибо, изучим и вернёмся с ответом на неделе.',
    from: 'client1@mail.local', to: 'sales@company.kz',
  },
  {
    direction: 'out', subject: 'Счёт на оплату №1042',
    body: 'Во вложении счёт на оплату. Доставка после поступления средств.',
    from: 'sales@company.kz', to: 'client2@mail.local',
  },
];

const NOTES = [
  { type: 'call', body: 'Клиент позвонил по рекламе, интересует цена и сроки доставки.' },
  { type: 'note', body: 'Просит перезвонить после 18:00.' },
  { type: 'meeting', body: 'Договорились, что клиент приедет в шоурум полежать на матрасах.' },
  { type: 'email', body: 'Отправили фото, цены и реквизиты.' },
  { type: 'note', body: 'Сравнивает с другим магазином, решение на следующей неделе.' },
];

export function buildDataset() {
  const rnd = random(20_260_930);
  const state = {
    pipelines: [],
    stages: [],
    cities: CITIES.map(({ id, name }, index) => ({ id, name, position: index, created_at: stamp(-90, 10) })),
    channels: [
      ...CITIES.map((city) => ({ id: city.id, name: `WhatsApp ${city.name}`, phone: city.whatsapp, city_id: city.id })),
      { id: CITIES.length + 1, ...OWNER_WHATSAPP, city_id: null },
      { id: CITIES.length + 2, ...INSTAGRAM, city_id: null },
    ].map((channel) => ({
      kind: 'whatsapp', ...channel, provider: 'none', phone_id: null, api_url: null, has_token: false, active: 1, created_at: stamp(-90, 10),
    })),
    roles: DEFAULT_ROLES.map((role, index) => ({
      id: index + 1, name: role.name, ...normalizeRole(role.permissions), created_at: stamp(-90, 10),
    })),
    users: USERS.map(({ leads, demoLabel, ...user }) => ({ ...user, created_at: stamp(-90, 10) })),
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
    // Журнал входов: несколько обычных входов сотрудников и одна неудачная попытка.
    authLog: [
      { id: 1, user_id: 1, email: 'admin@crm.local', ip: '95.56.10.4', success: 1, reason: null, created_at: stamp(-1, 9) },
      { id: 2, user_id: 4, email: 'petr@crm.local', ip: '95.56.12.7', success: 1, reason: null, created_at: stamp(-1, 10) },
      { id: 3, user_id: 2, email: 'olga@crm.local', ip: '2.134.5.18', success: 0, reason: 'неверный пароль', created_at: stamp(0, 9) },
      { id: 4, user_id: 2, email: 'olga@crm.local', ip: '2.134.5.18', success: 1, reason: null, created_at: stamp(0, 9) },
    ],
    settings: {},
    nextId: {
      company: 1, contact: 1, deal: 1, tag: TAGS.length + 1, task: 1, activity: 1,
      pipeline: 1, stage: 1, product: 1, item: 1, file: 1, call: 1, goal: 1,
      chat: 1, message: 1, email: 1, event: 1, city: CITIES.length + 1, channel: CITIES.length + 3,
      user: USERS.length + 1, role: DEFAULT_ROLES.length + 1,
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

  // Заявки ведут менеджеры городов; город заявки — город ответственного.
  const managers = state.users.filter((user) => USERS.find((item) => item.id === user.id)?.leads);
  const managerFor = (index) => managers[index % managers.length];
  const ownerFor = (index) => managerFor(index).id;
  const cityFor = (index) => managerFor(index).city_id;
  const digits = (count) => String(Math.floor(10 ** (count - 1) + rnd() * 9 * 10 ** (count - 1)));
  // Казахстанский мобильный: +7 701 123-45-67.
  const phoneIn = () => `+7 7${digits(2)} ${digits(3)}-${digits(2)}-${digits(2)}`;
  const dealCity = (dealId) => state.deals.find((deal) => deal.id === dealId)?.city_id ?? null;

  COMPANIES.forEach((company, index) => {
    state.companies.push({
      id: state.nextId.company++, ...company, notes: null,
      owner_id: ownerFor(index), city_id: cityFor(index), created_at: stamp(-45, 11), updated_at: stamp(-45, 11),
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
    const phone = phoneIn();

    const contact = {
      id: state.nextId.contact++, first_name: firstName, last_name: lastName, phone,
      email: `${firstName.toLowerCase()}.${index}@mail.local`, position: null,
      company_id: null, owner_id: ownerFor(index), city_id: cityFor(index), notes: null,
      created_at: createdAt, updated_at: createdAt,
    };
    state.contacts.push(contact);

    const progress = PROGRESS_POOL[Math.floor(rnd() * PROGRESS_POOL.length)];
    const open = openStages(pipeline.id);
    const stage = typeof progress === 'number'
      ? open[Math.min(progress, open.length - 1)]
      : closingStage(pipeline.id, progress);
    const product = PRODUCTS[Math.floor(rnd() * PRODUCTS.length)];
    // Часть новых заявок ещё никто не взял — они свободны для менеджеров города.
    const free = pipeline === state.pipelines[0] && stage === open[0] && index % 3 === 0;
    if (free) contact.owner_id = null;
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
      owner_id: free ? null : ownerFor(index),
      city_id: cityFor(index),
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
      title: `Заказ ${company.name} — ${(index + 2) * 10} матрасов`,
      amount: (index + 2) * 10 * 95_000,
      currency: 'KZT',
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      lead_type: 'company',
      company_id: company.id,
      contact_id: null,
      owner_id: company.owner_id,
      city_id: company.city_id,
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
    const quantity = 1 + Math.floor(rnd() * 3);
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
      user_id: deal.owner_id,
      deal_id: deal.id, contact_id: contact?.id ?? null, city_id: deal.city_id,
      created_at: stamp(-Math.floor(rnd() * 14), 9 + Math.floor(rnd() * 9)),
    });
  }

  // Переписки в WhatsApp: каждая — на номере своего города
  CHATS.forEach((chat, index) => {
    const deal = state.deals[index];
    const owner = state.users.find((user) => user.id === deal.owner_id);
    const contact = state.contacts.find((item) => item.id === deal.contact_id);
    const chatId = state.nextId.chat++;
    state.chats.push({
      id: chatId, channel: 'whatsapp', channel_id: deal.city_id, city_id: deal.city_id,
      external_id: `demo-${index}`, title: chat.title,
      phone: contact?.phone ?? null, contact_id: contact?.id ?? null, deal_id: deal.id,
      unread: chat.messages.filter((message) => message.in).length > 1 ? 1 : 0,
      last_message_at: stamp(-Math.floor(rnd() * 3), 12 + index),
      created_at: stamp(-5, 10),
    });
    // У свободной заявки ещё никто не отвечал — в переписке только сообщения клиента.
    chat.messages.filter((message) => owner || message.in).forEach((message, position) => {
      state.chatMessages.push({
        id: state.nextId.message++, chat_id: chatId,
        direction: message.in ? 'in' : 'out', body: message.text,
        author_name: message.in ? chat.title : owner?.name,
        user_id: message.in ? null : owner?.id ?? null,
        external_id: null, status: message.in ? 'received' : 'sent',
        created_at: stamp(-Math.floor(rnd() * 3), 12 + index, position),
      });
    });
  });

  // Заявки из общего Instagram: города ещё нет, их видит владелец и передаёт городу.
  const instagramTag = state.tags.find((tag) => tag.name === 'instagram');
  const instagramChannel = state.channels.find((channel) => channel.kind === 'instagram');
  INSTAGRAM_LEADS.forEach((lead, index) => {
    const at = stamp(-1, 10 + index);
    const contact = {
      id: state.nextId.contact++, first_name: lead.name, last_name: null, phone: null, email: null, position: null,
      company_id: null, owner_id: null, city_id: null, notes: null, created_at: at, updated_at: at,
    };
    state.contacts.push(contact);
    const pipeline = state.pipelines[0];
    const deal = {
      id: state.nextId.deal++, title: `Instagram: ${lead.name}`, amount: 0, currency: 'KZT',
      pipeline_id: pipeline.id, stage_id: openStages(pipeline.id)[0].id, lead_type: 'individual',
      company_id: null, contact_id: contact.id, owner_id: null, city_id: null,
      expected_close_date: null, closed_at: null, notes: null, created_at: at, updated_at: at,
    };
    state.deals.push(deal);
    state.dealTags.push({ deal_id: deal.id, tag_id: instagramTag.id });
    state.activities.push({
      id: state.nextId.activity++, type: 'system', body: `Заявка из Instagram (${INSTAGRAM.name})`,
      user_id: null, deal_id: deal.id, company_id: null, contact_id: null, created_at: at,
    });
    const chatId = state.nextId.chat++;
    state.chats.push({
      id: chatId, channel: 'instagram', channel_id: instagramChannel.id, city_id: null,
      external_id: lead.chatId, title: lead.name, phone: null, contact_id: contact.id, deal_id: deal.id,
      unread: 1, last_message_at: at, created_at: at,
    });
    state.chatMessages.push({
      id: state.nextId.message++, chat_id: chatId, direction: 'in', body: lead.text, author_name: lead.name,
      user_id: null, external_id: null, status: 'received', created_at: at,
    });
  });

  // Цели на текущий месяц
  const period = new Date().toISOString().slice(0, 7);
  managers.forEach((user, index) => {
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
      user_id: state.deals[index].owner_id, contact_id: null, deal_id: state.deals[index].id,
      city_id: state.deals[index].city_id, created_at: stamp(-index - 1, 11),
    });
  });

  // Несколько записей в журнале событий
  state.deals.slice(0, 6).forEach((deal, index) => {
    state.events.push({
      id: state.nextId.event++, entity_type: 'deal', entity_id: deal.id, entity_name: deal.title,
      action: 'create', field: 'Сделка создана',
      old_value: null, new_value: state.stages.find((stage) => stage.id === deal.stage_id)?.name ?? null,
      user_id: deal.owner_id, city_id: deal.city_id, created_at: deal.created_at,
    });
  });

  TASKS.forEach((task, index) => {
    const deal = state.deals[index % state.deals.length];
    state.tasks.push({
      id: state.nextId.task++, title: task.title, description: null,
      due_date: dateOnly(task.due), done: task.done ?? 0, priority: task.priority,
      assignee_id: deal.owner_id, company_id: null, contact_id: null,
      deal_id: deal.id, city_id: dealCity(deal.id),
      created_at: stamp(-3, 10), updated_at: stamp(-3, 10),
    });
  });

  return state;
}
