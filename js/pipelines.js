import { api } from './api.js';

/** Воронки и их этапы приходят с сервера: набор настраивается в интерфейсе. */
let pipelines = [];
let currentId = null;

const STORAGE_KEY = 'crm_pipeline';

const remember = (id) => {
  try { localStorage.setItem(STORAGE_KEY, String(id)); } catch { /* приватный режим */ }
};
const remembered = () => {
  try { return Number(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; }
};

export async function loadPipelines() {
  pipelines = (await api.get('/api/pipelines')).items;
  const saved = currentId ?? remembered();
  currentId = pipelines.some((pipeline) => pipeline.id === saved) ? saved : pipelines[0]?.id ?? null;
  return pipelines;
}

export const pipelineList = () => pipelines;
export const currentPipeline = () => pipelines.find((pipeline) => pipeline.id === currentId) ?? pipelines[0] ?? null;

export function setCurrentPipeline(id) {
  currentId = Number(id);
  remember(currentId);
}

export const stagesOf = (pipelineId) =>
  pipelines.find((pipeline) => pipeline.id === Number(pipelineId))?.stages ?? [];

export const stageOptions = (pipelineId) =>
  stagesOf(pipelineId).map((stage) => ({ value: stage.id, label: stage.name }));

export const findStage = (stageId) => pipelines
  .flatMap((pipeline) => pipeline.stages)
  .find((stage) => stage.id === Number(stageId)) ?? null;

export const LEAD_TYPE_LABELS = { individual: 'Физическое лицо', company: 'Компания' };
