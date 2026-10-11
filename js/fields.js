/**
 * Доступ к полям (Field Level Security в EspoCRM).
 *
 * Роль задаёт для групп полей: «видит и меняет», «только видит» или «скрыты».
 *  - amounts  — бюджеты сделок, суммы в отчётах, планы;
 *  - contacts — телефоны и email клиентов.
 * Скрытые суммы приходят как null, скрытые контакты — замаскированными
 * (+7 701 •••-••-95), чтобы было видно, что поле есть, но закрыто.
 * Если поле нельзя менять, его значение в запросах на правку отбрасывается;
 * при создании записи вписать его можно (менеджер заводит лид с телефоном).
 */
const AMOUNT_KEYS = new Set(['amount', 'open_amount', 'won_amount', 'wonAmount', 'target_amount']);
const CONTACT_KEYS = new Set(['phone', 'email', 'contact_phone', 'contact_email', 'from_addr', 'to_addr']);

// Здесь телефоны и email — сотрудников и номеров компании, а не клиентов.
const NOT_CLIENT_DATA = /^\/api\/(auth|users|roles|settings|channels|cities)(\/|$)/;

export function maskPhone(value) {
  const text = String(value);
  const digits = text.replace(/\D/g, '').length;
  let seen = 0;
  return text.replace(/\d/g, (digit) => {
    seen += 1;
    return seen <= 4 || seen > digits - 2 ? digit : '•';
  });
}

export function maskEmail(value) {
  const [name, domain] = String(value).split('@');
  return domain ? `${name.slice(0, 1)}•••@${domain}` : '•••';
}

const looksLikePhone = (value) => typeof value === 'string' && /^[+\d\s()-]{6,}$/.test(value) && /\d{5,}/.test(value.replace(/\D/g, ''));

export function maskBody(value, rules, key) {
  if (Array.isArray(value)) return value.map((item) => maskBody(item, rules, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([field, item]) => [field, maskBody(item, rules, field)]));
  }
  if (value === null || value === undefined) return value;
  if (rules.amounts && (AMOUNT_KEYS.has(key) || (rules.prices && key === 'price'))) return null;
  if (rules.contacts) {
    if (CONTACT_KEYS.has(key)) return String(value).includes('@') ? maskEmail(value) : maskPhone(value);
    // В переписке номер клиента бывает и в служебном ID, и в названии без имени.
    if ((key === 'external_id' || key === 'title') && looksLikePhone(value)) return maskPhone(value);
  }
  return value;
}

/** Правила маскировки ответа для пользователя и адреса; null — маскировать нечего. */
export function maskRules(user, path) {
  if (!user || user.role === 'admin') return null;
  const { amounts = 'edit', contacts = 'edit' } = user.options ?? {};
  const rules = {
    amounts: amounts === 'hidden',
    contacts: contacts === 'hidden' && !NOT_CLIENT_DATA.test(path),
    // Цены позиций сделки складываются в её бюджет — прячем вместе с ним.
    prices: /^\/api\/deals\/\d+\/items/.test(path),
  };
  return rules.amounts || rules.contacts ? rules : null;
}

/** Менять закрытое поле нельзя: отбрасываем его из правки. */
export function stripClosedFields(user, method, body) {
  if (!user || user.role === 'admin' || (method !== 'PATCH' && method !== 'PUT') || !body || typeof body !== 'object') return;
  const { amounts = 'edit', contacts = 'edit' } = user.options ?? {};
  if (amounts !== 'edit') {
    delete body.amount;
    delete body.target_amount;
  }
  if (contacts !== 'edit') {
    delete body.phone;
    delete body.email;
  }
}

export function fieldAccess(req, res, next) {
  stripClosedFields(req.user, req.method, req.body);
  const rules = maskRules(req.user, req.originalUrl.split('?')[0]);
  if (rules) {
    const json = res.json.bind(res);
    res.json = (body) => json(maskBody(body, rules));
  }
  next();
}

/** Флаги для CSV и других ответов не в JSON. */
export const hiddenFields = (user) => ({
  amounts: user?.role !== 'admin' && user?.options?.amounts === 'hidden',
  contacts: user?.role !== 'admin' && user?.options?.contacts === 'hidden',
});
