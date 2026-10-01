/**
 * Воронки и их этапы — теперь это данные, а не зашитый список:
 * воронок может быть несколько, этапы настраиваются.
 * Ниже — то, что создаётся на пустой базе (по рабочим воронкам заказчика).
 */
export const DEFAULT_PIPELINES = [
  {
    name: 'Первичные продажи',
    stages: ['Новая заявка', 'Принято в работу', 'Прайс отправлен', 'Заказ оформлен'],
  },
  {
    name: 'Повторные продажи',
    stages: ['Новая заявка', 'Принято в работу', 'Счет отправлен', 'Заказ оформлен'],
  },
  {
    name: 'Рекламации',
    stages: ['Обращение зарегистрировано', 'Принято в работу', 'Случай квалифицирован'],
  },
];

/** Закрывающие этапы есть у каждой воронки и удалить их нельзя. */
export const CLOSING_STAGES = [
  { name: 'Успешно реализовано', type: 'won', color: '#87b920' },
  { name: 'Закрыто и не реализовано', type: 'lost', color: '#d5d8db' },
];

export const STAGE_COLORS = ['#a8e05f', '#ffce5c', '#ffb84d', '#8fd2ff', '#c3a7ff', '#ff9f9f', '#9ee7d5'];
export const STAGE_TYPES = ['open', 'won', 'lost'];
export const LEAD_TYPES = ['individual', 'company'];
export const CURRENCIES = ['KZT', 'RUB', 'USD', 'EUR'];

/** Приводит хэштег к каноническому виду: без «#», в нижнем регистре, без пробелов. */
export function normalizeTag(value) {
  return String(value ?? '')
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '_')
    .toLowerCase();
}

/** Этапы воронки: рабочие по порядку, затем «успешно» и «закрыто». */
export function buildStages(names) {
  const stages = names.map((name, index) => ({
    name,
    type: 'open',
    color: STAGE_COLORS[index % STAGE_COLORS.length],
    position: index,
  }));
  CLOSING_STAGES.forEach((stage, index) => {
    stages.push({ ...stage, position: names.length + index });
  });
  return stages;
}
