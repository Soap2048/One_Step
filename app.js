import {
  buildDaySummary,
  calculateActionStreak,
  calculateWeekCompletionRate,
  cycleDayLabel,
  getCycleDates,
  getCycleDayNumber,
  dateLabel,
  getLastNDays,
} from "./src/homeStats.js";

const STORAGE_KEY = "kaoyan-loop-recorder-v1";

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const todayISO = () => formatDate(new Date());

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const parseDate = (value) => new Date(`${value}T00:00:00`);
const daysBetween = (from, to) => Math.round((parseDate(to) - parseDate(from)) / 86400000);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const AI_PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-5.5", "gpt-5.5-mini", "gpt-5.4-mini", "gpt-5.4-nano"],
    compatible: true,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    models: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"],
    compatible: true,
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    baseUrl: "https://api.anthropic.com",
    models: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"],
    compatible: false,
  },
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: ["gemini-3-pro", "gemini-3-flash", "gemini-2.5-flash"],
    compatible: false,
  },
  {
    id: "moonshot",
    label: "Moonshot / Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    models: ["kimi-k2", "kimi-latest", "moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
    compatible: true,
  },
  {
    id: "qwen",
    label: "阿里云通义千问 Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-plus", "qwen-turbo", "qwen-max", "qwen-long"],
    compatible: true,
  },
  {
    id: "glm",
    label: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4.5", "glm-4.5-air", "glm-4-flash"],
    compatible: true,
  },
  {
    id: "doubao",
    label: "火山方舟 Doubao",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    models: ["doubao-seed-1-6", "doubao-seed-1-6-flash", "doubao-1-5-pro-32k"],
    compatible: true,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    models: ["openai/gpt-5.5-mini", "anthropic/claude-sonnet-4-6", "google/gemini-3-pro", "deepseek/deepseek-chat", "qwen/qwen-plus"],
    compatible: true,
  },
  {
    id: "custom",
    label: "自定义",
    baseUrl: "",
    models: [],
    compatible: true,
  },
];

const AI_PROVIDER_IDS = AI_PROVIDERS.map((provider) => provider.id);

const createState = () => ({
  settings: {
    examDate: "",
    startDate: todayISO(),
    subjects: ["政治", "英语", "数学", "专业课"],
    stages: [{ name: "当前阶段", startDate: todayISO() }],
    customTags: [],
    aiApi: normalizeAiApi(),
    reviewCycle: "7",
  },
  tasksByDate: {},
  dailyRecords: {},
  aiReviews: [],
});

let state = loadState();
let selectedDate = todayISO();
let reviewCalendarMonth = selectedDate.slice(0, 7);
let currentView = "dashboard";
let toastTimer = 0;
let busyTimer = 0;
let busyToken = 0;
let toastSeq = 0;
let uiState = {
  loading: Object.create(null),
  toasts: [],
  confirm: null,
  showAiKey: false,
  editingTaskId: null,
  expandedTaskId: null,
  taskMenuId: null,
  showEffectiveRecord: false,
};
let longPressTimer = 0;
let suppressTaskClickId = null;

const RATING_OPTIONS = [
  { value: "A", label: "全部或超额完成" },
  { value: "B", label: "基本完成" },
  { value: "C", label: "完成较少" },
  { value: "D", label: "没有明显推进" },
];

const NAV_ITEMS = [
  { id: "dashboard", label: "首页" },
  { id: "today", label: "今日任务" },
  { id: "review", label: "复盘" },
  { id: "settings", label: "设置" },
];

const REVIEW_CYCLE_OPTIONS = [
  { value: "3", label: "3 天" },
  { value: "5", label: "5 天" },
  { value: "7", label: "7 天" },
  { value: "30", label: "30 天" },
  { value: "90", label: "90 天" },
  { value: "all", label: "全部" },
];

const ACTION_QUOTES = [
  "努力会在恰当时机发挥作用。",
  "行动本身就是反馈，先推进一点，再判断方向。",
  "长期主义不是忍耐空白，而是持续制造可被复盘的证据。",
  "今天的小完成，会降低明天开始的阻力。",
  "努力不会总是立即兑现，但它会增加你抓住机会的概率。",
  "记录不是为了证明完美，而是为了看见真实的推进。",
  "把注意力放在下一步，结果会慢慢有据可查。",
];

function normalizeReviewCycle(value) {
  const text = String(value || "7");
  if (["3", "5", "7", "30", "90", "all"].includes(text)) return text;
  const numeric = Number(text);
  if (numeric <= 3) return "3";
  if (numeric <= 5) return "5";
  if (numeric <= 7) return "7";
  if (numeric <= 30) return "30";
  return "90";
}

function reviewCycleLabel(value = state.settings.reviewCycle) {
  return REVIEW_CYCLE_OPTIONS.find((option) => option.value === value)?.label || "7 天";
}

function aiProviderConfig(provider) {
  return AI_PROVIDERS.find((item) => item.id === provider) || AI_PROVIDERS[0];
}

function normalizeAiProvider(value) {
  const provider = String(value || "openai");
  return AI_PROVIDER_IDS.includes(provider) ? provider : "openai";
}

function aiDefaultBaseUrl(provider) {
  return aiProviderConfig(normalizeAiProvider(provider)).baseUrl;
}

function aiDefaultModel(provider) {
  return aiProviderConfig(normalizeAiProvider(provider)).models[0] || "";
}

function normalizeAiApi(value = {}) {
  const provider = normalizeAiProvider(value.provider);
  const baseUrl = String(value.baseUrl || value.endpoint || aiDefaultBaseUrl(provider) || "").trim();
  const model = String(value.model || aiDefaultModel(provider) || "").trim();
  return {
    provider,
    providerName: String(value.providerName || "").trim(),
    baseUrl,
    model,
    apiKey: String(value.apiKey || "").trim(),
  };
}

function isAiProviderCompatible(provider) {
  return aiProviderConfig(normalizeAiProvider(provider)).compatible;
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return stored ? normalizeState(stored) : createState();
  } catch {
    return createState();
  }
}

function normalizeState(next) {
  const base = createState();
  return {
    ...base,
    ...next,
    settings: {
      ...base.settings,
      ...(next.settings || {}),
      subjects: Array.isArray(next.settings?.subjects) ? next.settings.subjects : base.settings.subjects,
      stages: Array.isArray(next.settings?.stages) ? next.settings.stages : base.settings.stages,
      customTags: Array.isArray(next.settings?.customTags) ? next.settings.customTags : [],
      reviewCycle: normalizeReviewCycle(next.settings?.reviewCycle ?? next.settings?.reviewCycleDays),
      aiApi: normalizeAiApi(next.settings?.aiApi && typeof next.settings.aiApi === "object" ? next.settings.aiApi : base.settings.aiApi),
    },
    tasksByDate: next.tasksByDate && typeof next.tasksByDate === "object" ? next.tasksByDate : {},
    dailyRecords: next.dailyRecords && typeof next.dailyRecords === "object" ? next.dailyRecords : {},
    aiReviews: Array.isArray(next.aiReviews) ? next.aiReviews : [],
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setLoading(action, value) {
  if (value) uiState.loading[action] = true;
  else delete uiState.loading[action];
}

async function runBusy(action, fn, options = {}) {
  const { minMs = 180 } = options;
  if (uiState.loading[action]) return;
  setLoading(action, true);
  render();
  const started = Date.now();
  try {
    return await fn();
  } finally {
    const wait = Math.max(0, minMs - (Date.now() - started));
    const token = ++busyToken;
    clearTimeout(busyTimer);
    busyTimer = window.setTimeout(() => {
      if (token !== busyToken) return;
      setLoading(action, false);
      render();
    }, wait);
  }
}

function pushToast(message, type = "success") {
  const id = ++toastSeq;
  uiState.toasts = [...uiState.toasts, { id, message, type }];
  render();
  window.setTimeout(() => {
    uiState.toasts = uiState.toasts.filter((toast) => toast.id !== id);
    render();
  }, 2600);
}

function openConfirm(config) {
  uiState.confirm = config;
  render();
}

function closeConfirm() {
  uiState.confirm = null;
  render();
}

function tasksFor(date) {
  return state.tasksByDate[date] || [];
}

function setTasks(date, tasks) {
  state.tasksByDate[date] = tasks;
  saveState();
  render();
}

function dayRecord(date) {
  return state.dailyRecords?.[date] || {};
}

function setDayRecord(date, patch, shouldRender = true) {
  state.dailyRecords = state.dailyRecords || {};
  state.dailyRecords[date] = {
    ...(state.dailyRecords[date] || {}),
    ...patch,
    date,
    updatedAt: new Date().toISOString(),
  };
  saveState();
  if (shouldRender) render();
}

function isValidRating(value) {
  return RATING_OPTIONS.some((option) => option.value === value);
}

function explicitDayRating(date) {
  const rating = dayRecord(date).rating;
  return isValidRating(rating) ? rating : "";
}

function reviewRatingText(date) {
  return explicitDayRating(date) || "未评级";
}

function isCompleteLoop(task) {
  const loop = task.loop || {};
  return ["input", "output", "check", "fix", "tomorrow"].every((key) => String(loop[key] || "").trim());
}

function dayMetrics(date) {
  const tasks = tasksFor(date);
  const done = tasks.filter((task) => task.done).length;
  const loops = tasks.filter(isCompleteLoop).length;
  const rate = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const savedRating = dayRecord(date).rating;
  let rating = isValidRating(savedRating) ? savedRating : "D";
  if (!isValidRating(savedRating)) {
    if (loops >= 2) rating = "A";
    else if (loops === 1) rating = "B";
    else if (done > 0) rating = "C";
  }
  return { total: tasks.length, done, loops, rate, rating };
}

function hasDayRecord(date) {
  const record = dayRecord(date);
  return Boolean(
    tasksFor(date).length ||
      isValidRating(record.rating) ||
      String(record.todaySentence || "").trim() ||
      String(record.effectiveRecord || "").trim(),
  );
}

function daySummary(date) {
  return buildDaySummary({
    tasks: tasksFor(date),
    record: dayRecord(date),
    computedRating: dayMetrics(date).rating,
  });
}

function daySummariesFor(dates) {
  return Object.fromEntries(dates.map((date) => [date, daySummary(date)]));
}

function knownDatesUntil(date) {
  const dates = new Set([date]);
  Object.keys(state.tasksByDate || {}).forEach((day) => {
    if (day <= date) dates.add(day);
  });
  Object.keys(state.dailyRecords || {}).forEach((day) => {
    if (day <= date) dates.add(day);
  });
  return [...dates].sort();
}

function goalName(date) {
  const stage = currentStage(date);
  if (stage && stage !== "未设置") return stage;
  return state.settings.examDate ? "长期目标" : "目标未设置";
}

function friendlyDate(date) {
  const parsed = parseDate(date);
  const month = parsed.getMonth() + 1;
  const day = parsed.getDate();
  const weekday = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][parsed.getDay()];
  return `${month} 月 ${day} 日，${weekday}`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function dailyActionQuote(date) {
  const index = Math.abs(daysBetween("2020-01-01", date)) % ACTION_QUOTES.length;
  return ACTION_QUOTES[index];
}

function todayActionState(date) {
  const tasks = tasksFor(date);
  const unfinished = tasks.find((task) => !task.done);
  const hasSavedRating = isValidRating(dayRecord(date).rating);
  if (!tasks.length) return { type: "add-task", label: "添加今日任务", disabled: false };
  if (unfinished) return { type: "continue-task", label: "继续今日任务", disabled: false, taskId: unfinished.id };
  if (!hasSavedRating) return { type: "complete-review", label: "完成今日评价", disabled: false };
  return { type: "done", label: "今日已完成", disabled: true };
}

function currentStage(date) {
  const stages = [...state.settings.stages]
    .filter((stage) => stage.name && stage.startDate)
    .sort((a, b) => parseDate(a.startDate) - parseDate(b.startDate));
  let active = stages[0]?.name || "未设置";
  for (const stage of stages) {
    if (parseDate(stage.startDate) <= parseDate(date)) active = stage.name;
  }
  return active;
}

function streakUntil(date) {
  let streak = 0;
  const cursor = parseDate(date);
  while (true) {
    const iso = formatDate(cursor);
    const metrics = dayMetrics(iso);
    if (metrics.rating === "D") break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function dLabel(date) {
  if (!state.settings.startDate) return date.slice(5);
  return cycleDayLabel(date, state.settings.startDate);
}

function addMonths(month, delta) {
  const date = new Date(`${month}-01T00:00:00`);
  date.setMonth(date.getMonth() + delta);
  return formatDate(date).slice(0, 7);
}

function monthLabel(month) {
  const [year, monthNumber] = month.split("-");
  return `${year} 年 ${Number(monthNumber)} 月`;
}

function monthCalendarDays(month) {
  const first = parseDate(`${month}-01`);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const leading = (first.getDay() + 6) % 7;
  const days = [];
  for (let i = 0; i < leading; i += 1) days.push(null);
  for (let day = 1; day <= last.getDate(); day += 1) {
    days.push(formatDate(new Date(first.getFullYear(), first.getMonth(), day)));
  }
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function ratingClass(rating, hasRecord) {
  if (!hasRecord || !isValidRating(rating)) return "none";
  return rating;
}

function cycleReview(date) {
  const today = todayISO();
  const endDate = state.settings.reviewCycle === "all" ? today : date;
  const end = parseDate(endDate);
  const days = [];
  const cycle = normalizeReviewCycle(state.settings.reviewCycle);
  const cycleStartDate = state.settings.startDate || endDate;
  const cycleSpan = getCycleDayNumber(today, cycleStartDate);
  const cycleDays = cycle === "all" ? cycleSpan || 1 : Number(cycle);
  days.push(...getCycleDates({ endDate, cycleStartDate, count: cycleDays }));

  const ratingCounts = { A: 0, B: 0, C: 0, D: 0 };
  let totalTasks = 0;
  let doneTasks = 0;
  let recordedDays = 0;
  let sentenceCount = 0;
  let effectiveRecordCount = 0;
  let unratedDays = 0;
  const unfinished = [];

  const calendarDays = days.map((day) => {
    const metrics = dayMetrics(day);
    const hasRecord = hasDayRecord(day);
    const record = dayRecord(day);
    const rating = explicitDayRating(day);
    if (rating) ratingCounts[rating] += 1;
    else if (hasRecord) unratedDays += 1;
    totalTasks += metrics.total;
    doneTasks += metrics.done;
    if (hasRecord) recordedDays += 1;
    if (String(record.todaySentence || "").trim()) sentenceCount += 1;
    if (String(record.effectiveRecord || "").trim()) effectiveRecordCount += 1;
    for (const task of tasksFor(day)) {
      if (!task.done) unfinished.push(`${day} · ${task.name || "未命名任务"}`);
    }
    return { date: day, label: dLabel(day), dayNumber: getCycleDayNumber(day, cycleStartDate), metrics, hasRecord, rating };
  });

  const rate = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  return {
    days,
    calendarDays,
    cycleDays,
    cycle,
    cycleLabel: reviewCycleLabel(cycle),
    rate,
    totalTasks,
    doneTasks,
    recordedDays,
    sentenceCount,
    effectiveRecordCount,
    unratedDays,
    ratingCounts,
    unfinished,
  };
}

function recentWeekReviewData(cutoffDate = selectedDate) {
  const end = parseDate(cutoffDate || todayISO());
  const days = [];
  const unfinishedTasks = [];
  let totalTasks = 0;
  let doneTasks = 0;

  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const date = formatDate(d);
    const tasks = tasksFor(date);
    const metrics = dayMetrics(date);
    const record = dayRecord(date);
    const taskSummaries = [];

    for (const task of tasks) {
      const summary = {
        name: String(task.name || "未命名任务"),
        done: Boolean(task.done),
        completion: String(task.completion || "").trim(),
        note: String(task.note || "").trim(),
      };
      taskSummaries.push(summary);
      if (!task.done) unfinishedTasks.push({ date, name: summary.name });
    }

    totalTasks += metrics.total;
    doneTasks += metrics.done;
    days.push({
      date,
      dDay: dLabel(date),
      rating: reviewRatingText(date),
      completionRate: metrics.rate,
      taskCount: metrics.total,
      doneCount: metrics.done,
      tasks: taskSummaries,
      todaySentence: record.todaySentence || "",
      effectiveRecord: record.effectiveRecord || "",
    });
  }

  return {
    range: { start: days[0].date, end: days[days.length - 1].date },
    summary: {
      completionRate: totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0,
      totalTasks,
      doneTasks,
      unfinishedTasks,
    },
    days,
  };
}

function buildWeeklyReviewPrompt(data) {
  return `你是一个考研学习有效性分析助手。请只基于用户已有记录做分析，不要泛泛鼓励，不要替用户制定完整长期计划，不要编造记录外的信息。

请输出以下 7 个部分，标题保持一致：
1. 本周有效进展
2. 本周主要问题
3. 任务完成模式
4. 下周建议保留什么
5. 下周建议删掉什么
6. 下周最小可执行计划
7. 一句直接但不过度鸡血的提醒

要求：
- 具体、直接、可执行。
- 不要空话，不要鸡汤。
- 如果数据不足，请明确指出数据不足，并给出最小记录建议。
- “最小可执行计划”最多 3 条，每条必须能在一天内执行。

结构化学习数据如下：
${JSON.stringify(data, null, 2)}`;
}

function aiBaseUrl(config) {
  const normalized = normalizeAiApi(config);
  return String(normalized.baseUrl || aiDefaultBaseUrl(normalized.provider) || "").replace(/\/$/, "");
}

function aiModel(config) {
  const normalized = normalizeAiApi(config);
  return normalized.model || aiDefaultModel(normalized.provider);
}

function aiProviderLabel(config) {
  const normalized = normalizeAiApi(config);
  if (normalized.provider === "custom") return normalized.providerName || "自定义";
  return aiProviderConfig(normalized.provider).label;
}

function readAiApiFromForm(form) {
  const data = new FormData(form);
  return normalizeAiApi({
    provider: data.get("aiProvider"),
    providerName: data.get("aiProviderName"),
    baseUrl: data.get("aiBaseUrl"),
    model: data.get("aiModel"),
    apiKey: data.get("aiApiKey"),
  });
}

async function requestOpenAiCompatible(config, messages, options = {}) {
  const normalized = normalizeAiApi(config);
  if (!isAiProviderCompatible(normalized.provider)) {
    throw new Error("该模型厂商暂未完全适配，请先选择 OpenAI-compatible 厂商。");
  }
  const baseUrl = aiBaseUrl(normalized);
  const model = aiModel(normalized);
  const apiKey = String(normalized.apiKey || "").trim();
  if (!apiKey) throw new Error("请先填写 AI API Key");
  if (!baseUrl) throw new Error("请先填写 Base URL");
  if (!model) throw new Error("请先选择模型");
  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens,
    }),
  });
}

async function testAiConnection(config) {
  await runBusy("testAiConnection", async () => {
    try {
      if (!String(config.apiKey || "").trim()) {
        pushToast("请先填写 API Key，未填写无法测试连接", "error");
        return;
      }
      const response = await requestOpenAiCompatible(
        config,
        [
          { role: "system", content: "你是连接测试助手。" },
          { role: "user", content: "请只回复 OK" },
        ],
        { temperature: 0, maxTokens: 8 }
      );
      if (!response.ok) throw new Error(await response.text());
      pushToast("连接成功", "success");
    } catch {
      pushToast("连接失败，请检查 API Key / Base URL / 模型", "error");
    }
  });
}

async function generateWeeklyAiReview() {
  const config = normalizeAiApi(state.settings.aiApi || {});
  const baseUrl = aiBaseUrl(config);
  const model = aiModel(config);
  const apiKey = String(config.apiKey || "").trim();
  if (!isAiProviderCompatible(config.provider)) {
    pushToast("该模型厂商暂未完全适配，请先选择 OpenAI-compatible 厂商。", "error");
    return;
  }
  if (!apiKey) {
    pushToast("请先在 Settings 填写 AI API Key", "error");
    return;
  }
  if (!baseUrl) {
    pushToast("请先填写 Base URL", "error");
    return;
  }

  await runBusy("generateAiReview", async () => {
    try {
      const data = recentWeekReviewData(selectedDate);
      const response = await requestOpenAiCompatible(config, [
        { role: "system", content: "你是严谨、具体的考研学习复盘分析助手。" },
        { role: "user", content: buildWeeklyReviewPrompt(data) },
      ], { temperature: 0.3 });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }
      const result = await response.json();
      const content = result?.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("模型没有返回内容");
      state.aiReviews = [
        {
          id: uid(),
          createdAt: new Date().toISOString(),
          range: data.range,
          provider: aiProviderLabel(config),
          model,
          content,
        },
        ...state.aiReviews,
      ];
      saveState();
      pushToast("AI 周复盘已生成", "success");
    } catch (error) {
      pushToast(`AI 调用失败：${error.message || "请检查配置"}`, "error");
    }
  });
}

function updateSettings(form) {
  const data = new FormData(form);
  const nextExamDate = data.has("examDate") ? data.get("examDate") || "" : state.settings.examDate;
  const nextStartDate = data.has("startDate") ? data.get("startDate") || todayISO() : state.settings.startDate;
  const nextSubjects = data.has("subjects")
    ? String(data.get("subjects") || "")
        .split(/[，,\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : state.settings.subjects;
  const nextStages = form.querySelector("[data-stage-row]")
    ? Array.from(form.querySelectorAll("[data-stage-row]"))
        .map((row) => ({
          name: row.querySelector("[data-stage-name]").value.trim(),
          startDate: row.querySelector("[data-stage-date]").value,
        }))
        .filter((stage) => stage.name && stage.startDate)
    : state.settings.stages;
  const nextAiApi = {
    provider: data.has("aiProvider") ? String(data.get("aiProvider") || "openai") : state.settings.aiApi.provider,
    providerName: data.has("aiProviderName") ? String(data.get("aiProviderName") || "").trim() : state.settings.aiApi.providerName,
    baseUrl: data.has("aiBaseUrl") ? String(data.get("aiBaseUrl") || "").trim() : state.settings.aiApi.baseUrl,
    model: data.has("aiModel") ? String(data.get("aiModel") || "").trim() : state.settings.aiApi.model,
    apiKey: data.has("aiApiKey") ? String(data.get("aiApiKey") || "").trim() : state.settings.aiApi.apiKey,
  };
  const nextReviewCycle = data.has("reviewCycle")
    ? normalizeReviewCycle(data.get("reviewCycle"))
    : state.settings.reviewCycle;

  if (data.has("subjects") && !nextSubjects.length) {
    pushToast("请至少填写一个科目", "error");
    return false;
  }
  if (form.querySelector("[data-stage-row]") && !nextStages.length) {
    pushToast("请至少保留一个阶段", "error");
    return false;
  }

  state.settings.examDate = nextExamDate;
  state.settings.startDate = nextStartDate;
  if (data.has("subjects")) {
    state.settings.subjects = nextSubjects;
  }
  if (form.querySelector("[data-stage-row]")) {
    state.settings.stages = nextStages;
  }
  if (data.has("aiProvider") || data.has("aiProviderName") || data.has("aiBaseUrl") || data.has("aiModel") || data.has("aiApiKey")) {
    state.settings.aiApi = normalizeAiApi(nextAiApi);
  }
  if (data.has("reviewCycle")) {
    state.settings.reviewCycle = nextReviewCycle;
  }
  saveState();
  pushToast("已保存", "success");
  render();
  return true;
}

function addTask(form, date = todayISO()) {
  const data = new FormData(form);
  const taskName = String(data.get("name") || "").trim();
  if (!taskName) {
    pushToast("请填写任务名", "error");
    const input = form.querySelector("[name='name']");
    input?.focus();
    return false;
  }
  const task = {
    id: uid(),
    subject: data.get("subject") || "",
    name: taskName,
    note: String(data.get("note") || "").trim(),
    done: false,
    loop: { input: "", output: "", check: "", fix: "", tomorrow: "" },
    errorTags: [],
    createdAt: new Date().toISOString(),
  };
  setTasks(date, [...tasksFor(date), task]);
  pushToast("任务已添加", "success");
  return true;
}

function saveTodayRecord(form, date = todayISO()) {
  const data = new FormData(form);
  const rating = String(data.get("rating") || dayRecord(date).rating || "").trim();
  setDayRecord(date, {
    rating: isValidRating(rating) ? rating : "",
    todaySentence: String(data.get("todaySentence") || "").trim(),
    effectiveRecord: String(data.get("effectiveRecord") || "").trim(),
  });
  pushToast("今日记录已完成", "success");
  return true;
}

function patchTask(taskId, patch, date = selectedDate) {
  const tasks = tasksFor(date).map((task) => (task.id === taskId ? { ...task, ...patch } : task));
  setTasks(date, tasks);
}

function renameTask(taskId, name, date = selectedDate) {
  const nextName = String(name || "").trim();
  if (!nextName) {
    pushToast("任务名称不能为空", "error");
    return false;
  }
  patchTask(taskId, { name: nextName }, date);
  uiState.editingTaskId = null;
  uiState.taskMenuId = null;
  pushToast("任务已更新", "success");
  return true;
}

function completeTask(taskId, completion, date = selectedDate) {
  const completedAt = new Date().toISOString();
  patchTask(taskId, {
    done: true,
    completion: String(completion || "").trim(),
    completedAt,
  }, date);
  uiState.expandedTaskId = null;
  uiState.taskMenuId = null;
  pushToast("任务已完成", "success");
  return true;
}

function deleteTask(taskId, date = selectedDate) {
  setTasks(
    date,
    tasksFor(date).filter((task) => task.id !== taskId),
  );
  pushToast("已删除任务", "success");
}

function addCustomTag(value) {
  const tag = value.trim();
  if (!tag) return;
  state.settings.customTags = [...new Set([...state.settings.customTags, tag])];
  saveState();
  pushToast("已添加自定义标签", "success");
  render();
}

function updateReviewCycle(form) {
  const data = new FormData(form);
  state.settings.reviewCycle = normalizeReviewCycle(data.get("reviewCycle"));
  saveState();
  pushToast("复盘周期已保存", "success");
  render();
}

function render() {
  const app = document.querySelector("#app");
  const today = todayISO();
  const metrics = dayMetrics(today);

  app.innerHTML = `
    <main class="app shell">
      <header class="topbar">
        <div class="brand">
          <h1>ONE STEP</h1>
          <p>今天 ${today} · 评级 <span class="rating">${metrics.rating}</span></p>
        </div>
      </header>

      <nav class="nav" aria-label="主导航">
        ${renderNav()}
      </nav>

      <section class="view">
        <div class="view-frame">
          ${renderCurrentView()}
        </div>
      </section>
      <div class="toast-stack" aria-live="polite" aria-atomic="true">
        ${renderToasts()}
      </div>
      ${renderConfirm()}
    </main>
  `;

  bindEvents();
}

function renderNav() {
  return NAV_ITEMS.map(
    (item) => `
      <button class="nav-item ${currentView === item.id ? "active" : ""}" type="button" data-view="${item.id}">
        ${escapeHTML(item.label)}
      </button>
    `,
  ).join("");
}

function isLoading(action) {
  return Boolean(uiState.loading[action]);
}

function buttonDisabled(action) {
  return isLoading(action) ? "disabled aria-disabled=\"true\"" : "";
}

function buttonText(action, label, loadingLabel) {
  return isLoading(action) ? loadingLabel : label;
}

function renderCurrentView() {
  if (currentView === "today") return renderTodayView();
  if (currentView === "review") return renderReviewView();
  if (currentView === "settings") return renderSettingsView();
  return renderDashboardView();
}

function renderDashboardView() {
  const today = todayISO();
  const weekDays = getLastNDays(today, 7);
  const summaries = daySummariesFor([...new Set([...knownDatesUntil(today), ...weekDays])]);
  const weekRate = calculateWeekCompletionRate(summaries, today);
  const action = todayActionState(today);

  return `
    <section class="panel dashboard-home">
      <div class="dashboard-head">
        <div>
          <p class="eyebrow">${greeting()}</p>
          <h2>${friendlyDate(today)}</h2>
        </div>
      </div>
      ${renderTodayOverview(today, action)}
      ${renderSevenDayStrip(weekDays, today)}
      <section class="home-metrics" aria-label="轻量统计">
        ${stat("连续行动天数", `${calculateActionStreak(summaries, today)} 天`)}
        ${stat("本周完成率", weekRate.total ? `${weekRate.rate}%` : "暂无任务")}
      </section>
      <p class="action-quote">${escapeHTML(dailyActionQuote(today))}</p>
    </section>
  `;
}

function renderTodayOverview(today, action) {
  const metrics = dayMetrics(today);
  const progress = clamp(metrics.rate, 0, 100);
  const leftDays = state.settings.examDate ? Math.max(0, daysBetween(today, state.settings.examDate)) : null;
  const leftText = leftDays === null ? "未设置目标日期" : `${leftDays} 天`;
  const progressLabel = metrics.total ? `今日完成 ${metrics.done} / ${metrics.total}` : "今天还没有任务";
  return `
    <section class="today-card" aria-label="今日状态">
      <div class="today-card-main">
        <p class="meta goal-label">当前目标</p>
        <h3>${escapeHTML(goalName(today))}</h3>
        <div class="today-card-facts">
          <span>距离目标 ${escapeHTML(leftText)}</span>
          <span>${escapeHTML(progressLabel)}</span>
        </div>
        <div class="progress-track" aria-label="${escapeAttr(progressLabel)}">
          <span style="width: ${progress}%"></span>
        </div>
      </div>
      <button
        class="primary today-action"
        type="button"
        data-action="home-next"
        data-next-action="${escapeAttr(action.type)}"
        ${action.taskId ? `data-task-id="${escapeAttr(action.taskId)}"` : ""}
        ${action.disabled ? "disabled aria-disabled=\"true\"" : ""}
      >
        ${escapeHTML(action.label)}
      </button>
    </section>
  `;
}

function renderSevenDayStrip(days, today) {
  return `
    <section class="week-strip" aria-label="最近七天行动记录">
      ${days
        .map((date) => {
          const metrics = dayMetrics(date);
          const hasRecord = hasDayRecord(date);
          const rating = ratingClass(metrics.rating, hasRecord);
          const selected = date === selectedDate;
          const isToday = date === today;
          return `
            <button
              type="button"
              class="week-day rating-${rating} ${isToday ? "is-today" : ""} ${selected ? "is-selected" : ""}"
              data-home-review-date="${escapeAttr(date)}"
              title="${escapeAttr(`${date} · ${hasRecord ? metrics.rating : "无记录"}`)}"
            >
              <span>${escapeHTML(dateLabel(date, today))}</span>
              <strong>${hasRecord ? escapeHTML(metrics.rating) : "未"}</strong>
              <small>${Number(date.slice(5, 7))}/${Number(date.slice(8))}</small>
            </button>
          `;
        })
        .join("")}
    </section>
  `;
}

function renderTodayView() {
  const today = todayISO();
  const metrics = dayMetrics(today);
  const record = dayRecord(today);
  const effectiveRecord = String(record.effectiveRecord || "");
  const showEffectiveRecord = uiState.showEffectiveRecord || Boolean(effectiveRecord.trim());

  return `
    <section class="panel today-list">
      <div class="today-overview">
        <div>
          <h2>每日记录</h2>
          <p class="meta">${today}</p>
        </div>
        <section class="today-stats" aria-label="今日概览">
          ${stat("已完成", `${metrics.done}/${metrics.total}`)}
          ${stat("完成等级", metrics.rating)}
        </section>
      </div>
      <form data-task-form class="quick-add">
        <input name="name" placeholder="添加今日任务，例如：有机化学醛酮习题 20 道" required />
        <button class="primary" type="submit" ${buttonDisabled("addTask")} data-loading="${isLoading("addTask")}">${buttonText("addTask", "添加", "添加中…")}</button>
      </form>
      <div class="list today-task-list" data-task-list>${renderTasks(today)}</div>
      <form data-today-record-form class="today-record-form">
        <section class="today-section">
          <h3>今日完成评价</h3>
          <div class="rating-picker" role="radiogroup" aria-label="今日完成评价">
            ${renderRatingPicker(record.rating || metrics.rating)}
          </div>
        </section>
        <section class="today-section">
          <label>今日一句
            <textarea name="todaySentence" data-day-field="todaySentence" placeholder="今天最值得记录的是什么？">${escapeHTML(record.todaySentence || "")}</textarea>
          </label>
        </section>
        <section class="today-section effective-record ${showEffectiveRecord ? "is-open" : ""}">
          <button type="button" class="fold-toggle" data-action="toggle-effective-record" aria-expanded="${showEffectiveRecord}">
            努力生效记录
          </button>
          <p class="meta">记录一次过去的努力在今天发挥作用的时刻。</p>
          <div class="effective-record-body">
            <textarea name="effectiveRecord" data-day-field="effectiveRecord" placeholder="今天学的____，在____时用上了 / 看懂了 / 想起来了。">${escapeHTML(effectiveRecord)}</textarea>
            <p class="meta">例如：昨天背的 establish，今天阅读时认出来了。</p>
          </div>
        </section>
        <button class="primary wide today-save" type="submit" ${buttonDisabled("saveTodayRecord")} data-loading="${isLoading("saveTodayRecord")}">${buttonText("saveTodayRecord", "完成今日记录", "保存中…")}</button>
      </form>
    </section>
  `;
}

function renderReviewView() {
  const review = cycleReview(selectedDate);
  return `
    <section class="panel">
      <div class="view-head">
        <div>
          <h2>周期复盘</h2>
          <p class="meta">当前复盘周期：${review.cycleLabel}</p>
        </div>
      </div>
      ${renderMonthCalendar()}
      <form data-review-cycle-form class="review-controls">
        <label>复盘截止日期
          <input type="date" value="${selectedDate}" data-selected-date />
        </label>
        <label>复盘周期
          <select name="reviewCycle" data-review-cycle-select>
            ${renderReviewCycleOptions()}
          </select>
        </label>
        <button type="submit" class="primary" ${buttonDisabled("saveReviewCycle")} data-loading="${isLoading("saveReviewCycle")}">${buttonText("saveReviewCycle", "保存周期", "保存中…")}</button>
      </form>
      <div class="rating-legend">
        ${renderRatingLegend()}
      </div>
      ${renderRatingCalendar(review)}
      ${renderDayDetail(selectedDate)}
      ${renderReview(review)}
    </section>
  `;
}

function renderSettingsView() {
  const aiApi = normalizeAiApi(state.settings.aiApi);
  const customProviderStyle = aiApi.provider === "custom" ? "" : " hidden";
  const providerHint = isAiProviderCompatible(aiApi.provider)
    ? "OpenAI-compatible 厂商会用于 AI 周期复盘。"
    : "该厂商暂未完全适配 AI 周期复盘调用。";
  return `
    <section class="panel">
      <h2>设置</h2>
      <form data-settings-form class="form-grid">
        <label>起始日期
          <input type="date" name="startDate" value="${escapeAttr(state.settings.startDate)}" required />
        </label>
        <label>考试日期
          <input type="date" name="examDate" value="${escapeAttr(state.settings.examDate)}" required />
        </label>
        <label class="wide">科目
          <textarea name="subjects">${escapeHTML(state.settings.subjects.join("，"))}</textarea>
        </label>
        <div class="settings-basic-actions wide">
          <button class="primary" type="submit" ${buttonDisabled("saveSettings")} data-loading="${isLoading("saveSettings")}">${buttonText("saveSettings", "确认基础设置", "保存中…")}</button>
        </div>
        <label>复盘周期
          <select name="reviewCycle" data-review-cycle-select>
            ${renderReviewCycleOptions()}
          </select>
        </label>
        <div class="wide">
          <h3>阶段管理</h3>
          <div class="list" data-stage-list>
            ${renderStages()}
          </div>
          <button type="button" data-action="add-stage">添加阶段</button>
        </div>
        <div class="wide">
          <h3>错因标签管理</h3>
          <div class="chips custom-tags">
            ${state.settings.customTags.length ? state.settings.customTags.map((tag) => `<span class="chip">${escapeHTML(tag)}</span>`).join("") : `<span class="empty-inline">暂无自定义标签</span>`}
          </div>
          <div class="tag-row settings-row">
            <input data-custom-tag placeholder="添加自定义错因标签" />
            <button type="button" data-action="add-tag">添加</button>
          </div>
        </div>
        <div class="wide">
          <h3>AI API 设置</h3>
          <div class="form-grid">
            <label>选择模型厂商
              <select name="aiProvider" data-ai-provider-select>
                ${renderAiProviderOptions()}
              </select>
            </label>
            <label class="ai-provider-name${customProviderStyle}">Provider Name
              <input name="aiProviderName" value="${escapeAttr(aiApi.providerName)}" placeholder="例如：本地兼容接口" />
            </label>
            <label>Base URL
              <input name="aiBaseUrl" data-ai-base-url value="${escapeAttr(aiApi.baseUrl)}" placeholder="例如：https://api.example.com/v1" />
            </label>
            <label>常用模型
              <select name="aiModel" data-ai-model-preset>
                ${renderAiModelOptions()}
              </select>
            </label>
            <label class="wide">API Key
              <span class="secret-row">
                <input name="aiApiKey" type="${uiState.showAiKey ? "text" : "password"}" value="${escapeAttr(aiApi.apiKey)}" placeholder="本地保存，不会上传" autocomplete="off" />
                <button type="button" data-action="toggle-ai-key">${uiState.showAiKey ? "隐藏" : "显示"}</button>
              </span>
            </label>
            <p class="form-help wide">${escapeHTML(providerHint)}</p>
            <div class="settings-actions wide">
              <button type="button" data-action="test-ai-connection" ${buttonDisabled("testAiConnection")} data-loading="${isLoading("testAiConnection")}">${buttonText("testAiConnection", "测试连接", "测试中…")}</button>
              <button class="primary" type="submit" ${buttonDisabled("saveSettings")} data-loading="${isLoading("saveSettings")}">${buttonText("saveSettings", "保存全部设置", "保存中…")}</button>
            </div>
          </div>
        </div>
      </form>
    </section>
  `;
}

function stat(label, value) {
  return `<div class="stat"><span>${label}</span><strong>${escapeHTML(String(value))}</strong></div>`;
}

function renderStages() {
  const stages = state.settings.stages.length ? state.settings.stages : [{ name: "", startDate: todayISO() }];
  return stages
    .map(
      (stage, index) => `
      <div class="stage-row" data-stage-row>
        <input data-stage-name value="${escapeAttr(stage.name)}" placeholder="阶段名" />
        <input data-stage-date type="date" value="${escapeAttr(stage.startDate)}" />
        <button type="button" data-action="remove-stage" data-index="${index}">删除</button>
      </div>
    `,
    )
    .join("");
}

function renderReviewCycleOptions() {
  const current = normalizeReviewCycle(state.settings.reviewCycle);
  return REVIEW_CYCLE_OPTIONS.map(
    (option) => `<option value="${option.value}" ${current === option.value ? "selected" : ""}>${option.label}</option>`,
  ).join("");
}

function renderAiProviderOptions() {
  const current = normalizeAiProvider(state.settings.aiApi.provider);
  return AI_PROVIDERS.map(
    (provider) => `<option value="${provider.id}" ${current === provider.id ? "selected" : ""}>${escapeHTML(provider.label)}</option>`,
  ).join("");
}

function renderAiModelOptions() {
  const config = normalizeAiApi(state.settings.aiApi);
  const models = aiProviderConfig(config.provider).models;
  const options = [`<option value="">选择常用模型</option>`];
  models.forEach((model) => {
    options.push(`<option value="${escapeAttr(model)}" ${model === config.model ? "selected" : ""}>${escapeHTML(model)}</option>`);
  });
  if (config.model && !models.includes(config.model)) {
    options.push(`<option value="${escapeAttr(config.model)}" selected>${escapeHTML(config.model)}</option>`);
  }
  return options.join("");
}

function renderRatingLegend() {
  return [
    ...RATING_OPTIONS.map((option) => [option.value, option.label]),
    ["none", "无记录"],
  ]
    .map(
      ([rating, text]) => `
        <span class="legend-item">
          <span class="rating-swatch rating-${rating}"></span>
          ${rating === "none" ? "无记录" : `${rating} ${text}`}
        </span>
      `,
    )
    .join("");
}

function renderMonthCalendar() {
  const weekDays = ["一", "二", "三", "四", "五", "六", "日"];
  const days = monthCalendarDays(reviewCalendarMonth);
  return `
    <section class="month-calendar-card">
      <div class="month-calendar-head">
        <button type="button" data-calendar-month="prev" aria-label="上个月">‹</button>
        <strong>${monthLabel(reviewCalendarMonth)}</strong>
        <button type="button" data-calendar-month="next" aria-label="下个月">›</button>
      </div>
      <div class="month-weekdays">
        ${weekDays.map((day) => `<span>${day}</span>`).join("")}
      </div>
      <div class="month-calendar" aria-label="普通日历">
        ${days
          .map((date) => {
            if (!date) return `<span class="month-day is-empty"></span>`;
            const metrics = dayMetrics(date);
            const hasRecord = hasDayRecord(date);
            const rating = ratingClass(explicitDayRating(date), hasRecord);
            const selected = date === selectedDate;
            const isToday = date === todayISO();
            return `
              <button
                type="button"
                class="month-day rating-${rating} ${selected ? "is-selected" : ""} ${isToday ? "is-today" : ""}"
                data-review-date="${escapeAttr(date)}"
                title="${escapeAttr(`${date} · ${dLabel(date)} · ${hasRecord ? reviewRatingText(date) : "无记录"}`)}"
              >
                <span>${Number(date.slice(8))}</span>
              </button>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderRatingCalendar(review) {
  if (!review.calendarDays.length) {
    return `<div class="empty review-empty">复盘截止日期早于起始日期，暂无周期日期。</div>`;
  }
  return `
    <div class="rating-calendar-wrap" aria-label="评级日历">
      <div class="rating-calendar">
        ${review.calendarDays
          .map((day) => {
            const rating = ratingClass(day.rating, day.hasRecord);
            const isToday = day.date === todayISO();
            const selected = day.date === selectedDate;
            return `
              <button
                type="button"
                class="calendar-day rating-${rating} ${isToday ? "is-today" : ""} ${selected ? "is-selected" : ""}"
                data-review-date="${escapeAttr(day.date)}"
                title="${escapeAttr(`${day.date} · ${day.label} · ${day.hasRecord ? reviewRatingText(day.date) : "无记录"}`)}"
              >
                <span>${escapeHTML(day.label)}</span>
              </button>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderDayDetail(date) {
  const tasks = tasksFor(date);
  const metrics = dayMetrics(date);
  const record = dayRecord(date);
  const hasRating = Boolean(explicitDayRating(date));
  const noteItems = [
    ["今日一句", record.todaySentence],
    ["努力生效记录", record.effectiveRecord],
  ].filter(([, value]) => String(value || "").trim());
  return `
    <section class="day-detail">
      <div class="view-head">
        <div>
          <h3>${date} · ${dLabel(date)}</h3>
          <p class="meta">评级：${hasRating ? explicitDayRating(date) : "未评级"} · 完成率：${metrics.rate}% · ${metrics.done}/${metrics.total} 已完成</p>
        </div>
      </div>
      ${
        noteItems.length
          ? `<div class="review-note-list">${noteItems.map(([label, value]) => `<div class="review-note"><strong>${label}</strong><p>${escapeHTML(value)}</p></div>`).join("")}</div>`
          : ""
      }
      <h3 class="review-task-title">今日任务</h3>
      ${
        tasks.length
          ? `<div class="day-task-list">${tasks.map(renderDayTaskDetail).join("")}</div>`
          : `<div class="empty">当天没有任务记录</div>`
      }
    </section>
  `;
}

function renderDayTaskDetail(task) {
  const done = Boolean(task.done);
  const name = String(task.name || "未命名任务");
  const completion = String(task.completion || "").trim();
  const note = String(task.note || "").trim();
  return `
    <article class="day-task ${done ? "is-done" : ""}">
      <span class="review-task-dot ${done ? "is-done" : ""}" aria-hidden="true"></span>
      <div class="review-task-main">
        <strong>${escapeHTML(name)}</strong>
        ${completion ? `<span class="meta">${escapeHTML(completion)}</span>` : note ? `<span class="meta">${escapeHTML(note)}</span>` : ""}
      </div>
      <span class="review-task-status ${done ? "done" : "open"}">${done ? "已完成" : "未完成"}</span>
    </article>
  `;
}

function renderTasks(date) {
  const tasks = tasksFor(date);
  if (!tasks.length) return `<p class="empty">今天还没有任务。</p>`;
  return tasks.map((task) => renderTask(task, date)).join("");
}

function renderTask(task, date) {
  const isEditing = uiState.editingTaskId === task.id;
  const isExpanded = uiState.expandedTaskId === task.id;
  const isMenuOpen = uiState.taskMenuId === task.id;
  return `
    <article class="task ${task.done ? "done" : ""} ${isExpanded ? "expanded" : ""}" data-task-id="${task.id}" data-task-date="${escapeAttr(date)}">
      <div class="task-head">
        <span class="task-dot ${task.done ? "is-done" : ""}" aria-hidden="true"></span>
        <div class="task-title ${isEditing ? "is-editing" : ""}">
          ${
            isEditing
              ? `<input data-task-name-edit value="${escapeAttr(task.name || "")}" aria-label="任务名称" />`
              : `<strong>${escapeHTML(task.name || "未命名任务")}</strong>`
          }
          ${task.note ? `<span class="meta">${escapeHTML(task.note)}</span>` : ""}
          ${task.done ? `<span class="meta">${task.completion ? escapeHTML(task.completion) : "已完成"}</span>` : ""}
        </div>
        <div class="task-actions">
          ${
            isEditing
              ? `
                <button type="button" data-action="save-task-name">保存</button>
                <button type="button" data-action="cancel-task-edit">取消</button>
              `
              : isMenuOpen
                ? `
                  <button type="button" data-action="edit-task">编辑</button>
                  <button class="danger" type="button" data-action="delete-task">删除</button>
                `
                : ""
          }
        </div>
      </div>
      ${
        isExpanded
          ? `
            <div class="task-completion">
              <label>完成情况
                <textarea data-task-completion placeholder="写一句完成情况，例如：完成 20 道，错 4 道，已标记。">${escapeHTML(task.completion || "")}</textarea>
              </label>
              <div class="task-completion-actions">
                <button class="primary" type="button" data-action="complete-task">${task.done ? "更新完成情况" : "完成任务"}</button>
              </div>
            </div>
          `
          : ""
      }
    </article>
  `;
}

function renderRatingPicker(currentRating) {
  return RATING_OPTIONS.map(
    (option) => `
      <label class="rating-card rating-${option.value} ${currentRating === option.value ? "active" : ""}">
        <input type="radio" name="rating" value="${option.value}" ${currentRating === option.value ? "checked" : ""} data-action="set-rating" />
        <strong>${option.value}</strong>
        <span>${escapeHTML(option.label)}</span>
      </label>
    `,
  ).join("");
}

function renderReview(review) {
  const hasData = review.recordedDays > 0 || review.totalTasks > 0 || review.unfinished.length > 0;
  const rangeLabel = review.days.length
    ? `${review.days[0]} 至 ${review.days[review.days.length - 1]} · ${review.days.length} 天`
    : "暂无周期日期";
  return `
    <div class="review">
      <div class="review-row"><strong>当前周期</strong><span>${rangeLabel}</span></div>
      <div class="review-row"><strong>周期完成率</strong><span>${review.rate}%</span></div>
      <div class="review-row"><strong>任务完成</strong><span>${review.doneTasks}/${review.totalTasks}</span></div>
      <div class="review-row"><strong>记录天数</strong><span>${review.recordedDays}</span></div>
      <div class="review-row"><strong>轻量记录</strong><span>今日一句 ${review.sentenceCount} · 努力生效 ${review.effectiveRecordCount}</span></div>
      <div class="review-row"><strong>A/B/C/D</strong><span>A ${review.ratingCounts.A} · B ${review.ratingCounts.B} · C ${review.ratingCounts.C} · D ${review.ratingCounts.D} · 未评级 ${review.unratedDays}</span></div>
      <div class="review-row"><strong>未完成任务</strong><span>${review.unfinished.length ? review.unfinished.slice(0, 8).map(escapeHTML).join("<br>") : "无"}</span></div>
    </div>
    <section class="ai-review">
      <div class="view-head">
        <div>
          <h3>AI 周复盘</h3>
          <p class="meta">读取最近 7 天记录，分析学习有效性。</p>
        </div>
        <button type="button" data-action="generate-ai-review" ${buttonDisabled("generateAiReview")} data-loading="${isLoading("generateAiReview")}">${buttonText("generateAiReview", "AI 生成周复盘", "生成中…")}</button>
      </div>
      ${renderAiReviewRecords()}
    </section>
    <section class="review-notes">
      <h3>复盘记录</h3>
      <div class="empty">当前还没有手动复盘记录。</div>
    </section>
    ${hasData ? "" : `<div class="empty review-empty">当前复盘周期还没有复盘数据，先完成一个任务或今日记录，系统会自动开始记录。</div>`}
  `;
}

function renderAiReviewRecords() {
  if (!state.aiReviews.length) return `<div class="empty">暂未生成 AI 周复盘。</div>`;
  return `
    <div class="ai-review-list">
      ${state.aiReviews
        .map(
          (review) => `
            <article class="ai-review-record">
              <div class="meta">${escapeHTML(review.range.start)} 至 ${escapeHTML(review.range.end)} · ${escapeHTML(review.provider)} · ${escapeHTML(review.model)} · ${escapeHTML(new Date(review.createdAt).toLocaleString())}</div>
              <pre>${escapeHTML(review.content)}</pre>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderToasts() {
  if (!uiState.toasts.length) return "";
  return uiState.toasts
    .map(
      (toast) => `
        <div class="toast toast-${toast.type}">
          <span class="toast-dot"></span>
          <span>${escapeHTML(toast.message)}</span>
        </div>
      `,
    )
    .join("");
}

function renderConfirm() {
  if (!uiState.confirm) return "";
  const confirm = uiState.confirm;
  return `
    <div class="modal-backdrop" role="presentation">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h3 id="confirm-title">${escapeHTML(confirm.title)}</h3>
        <p>${escapeHTML(confirm.message)}</p>
        <div class="modal-actions">
          <button type="button" data-action="cancel-confirm">取消</button>
          <button type="button" class="${confirm.danger ? "danger" : "primary"}" data-action="confirm-action">${escapeHTML(confirm.confirmText || "确认")}</button>
        </div>
      </div>
    </div>
  `;
}

function focusAfterRender(selector, options = {}) {
  window.requestAnimationFrame(() => {
    const element = document.querySelector(selector);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    if (options.expandTaskId) {
      uiState.expandedTaskId = options.expandTaskId;
    }
    if (options.focusSelector) {
      element.querySelector(options.focusSelector)?.focus();
    }
  });
}

function runHomeNextAction(button) {
  const action = button.dataset.nextAction;
  const taskId = button.dataset.taskId;
  if (action === "done") return;
  currentView = "today";
  if (action === "continue-task" && taskId) {
    uiState.expandedTaskId = taskId;
    render();
    focusAfterRender(`[data-task-id="${CSS.escape(taskId)}"]`);
    return;
  }
  render();
  if (action === "complete-review") {
    focusAfterRender("[data-today-record-form]");
    return;
  }
  focusAfterRender("[data-task-form]", { focusSelector: "[name='name']" });
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      currentView = button.dataset.view;
      render();
    });
  });

  document.querySelectorAll("[data-action='home-next']").forEach((button) => {
    button.addEventListener("click", () => runHomeNextAction(button));
  });

  document.querySelectorAll("[data-home-review-date]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDate = button.dataset.homeReviewDate || selectedDate;
      reviewCalendarMonth = selectedDate.slice(0, 7);
      currentView = "review";
      render();
    });
  });

  document.querySelectorAll("[data-settings-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const action = "saveSettings";
      if (!event.currentTarget.checkValidity()) {
        event.currentTarget.reportValidity();
        pushToast("请补全必填项", "error");
        return;
      }
      runBusy(action, async () => {
        const ok = updateSettings(event.currentTarget);
        if (!ok) throw new Error("validation");
      });
    });
  });

  document.querySelectorAll("[data-task-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!event.currentTarget.checkValidity()) {
        event.currentTarget.reportValidity();
        pushToast("请补全必填项", "error");
        return;
      }
      runBusy("addTask", async () => {
        const ok = addTask(event.currentTarget, todayISO());
        if (!ok) throw new Error("validation");
        render();
      });
    });
  });

  document.querySelectorAll("[data-today-record-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      runBusy("saveTodayRecord", async () => {
        saveTodayRecord(event.currentTarget, todayISO());
      });
    });
  });

  document.querySelectorAll("[data-action='set-rating']").forEach((field) => {
    field.addEventListener("change", (event) => {
      setDayRecord(todayISO(), { rating: event.target.value }, true);
    });
  });

  document.querySelectorAll("[data-day-field]").forEach((field) => {
    field.addEventListener("input", (event) => {
      setDayRecord(todayISO(), { [field.dataset.dayField]: event.target.value }, false);
    });
  });

  document.querySelectorAll("[data-action='toggle-effective-record']").forEach((button) => {
    button.addEventListener("click", () => {
      uiState.showEffectiveRecord = !uiState.showEffectiveRecord;
      render();
    });
  });

  document.querySelectorAll("[data-selected-date]").forEach((input) => {
    input.addEventListener("change", (event) => {
      selectedDate = event.target.value || todayISO();
      reviewCalendarMonth = selectedDate.slice(0, 7);
      render();
    });
  });

  document.querySelectorAll("[data-review-cycle-select]").forEach((select) => {
    select.addEventListener("change", (event) => {
      const form = event.target.closest("form");
      if (!form) return;
      updateReviewCycle(form);
    });
  });

  document.querySelectorAll("[data-ai-provider-select]").forEach((select) => {
    select.addEventListener("change", (event) => {
      const provider = normalizeAiProvider(event.target.value);
      const form = event.target.closest("form");
      if (!form) return;
      const providerConfig = aiProviderConfig(provider);
      const baseUrlInput = form.querySelector("[data-ai-base-url]");
      if (baseUrlInput) baseUrlInput.value = providerConfig.baseUrl;
      state.settings.aiApi = normalizeAiApi({
        ...readAiApiFromForm(form),
        provider,
        baseUrl: providerConfig.baseUrl,
        model: providerConfig.models[0] || "",
      });
      if (!providerConfig.compatible) {
        pushToast("该厂商暂未完全适配 AI 周期复盘调用", "error");
      }
      render();
    });
  });

  document.querySelectorAll("[data-ai-model-preset]").forEach((select) => {
    select.addEventListener("change", (event) => {
      state.settings.aiApi = normalizeAiApi({ ...state.settings.aiApi, model: event.target.value });
    });
  });

  document.querySelectorAll("[data-action='toggle-ai-key']").forEach((button) => {
    button.addEventListener("click", () => {
      const form = button.closest("form");
      if (form) state.settings.aiApi = readAiApiFromForm(form);
      uiState.showAiKey = !uiState.showAiKey;
      render();
    });
  });

  document.querySelectorAll("[data-action='test-ai-connection']").forEach((button) => {
    button.addEventListener("click", () => {
      const form = button.closest("form");
      if (!form) return;
      testAiConnection(readAiApiFromForm(form));
    });
  });

  document.querySelectorAll("[data-review-cycle-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      setLoading("saveReviewCycle", true);
      updateReviewCycle(event.currentTarget);
      window.setTimeout(() => {
        setLoading("saveReviewCycle", false);
        render();
      }, 180);
    });
  });

  document.querySelectorAll("[data-calendar-month]").forEach((button) => {
    button.addEventListener("click", () => {
      reviewCalendarMonth = addMonths(reviewCalendarMonth, button.dataset.calendarMonth === "next" ? 1 : -1);
      render();
    });
  });

  document.querySelectorAll(".rating-calendar, .month-calendar").forEach((calendar) => {
    calendar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-review-date]");
      if (!button) return;
      selectedDate = button.dataset.reviewDate || selectedDate;
      reviewCalendarMonth = selectedDate.slice(0, 7);
      render();
    });
  });

  document.querySelectorAll("[data-action='generate-ai-review']").forEach((button) => {
    button.addEventListener("click", () => {
      generateWeeklyAiReview();
    });
  });

  document.querySelectorAll("[data-action='add-stage']").forEach((button) => {
    button.addEventListener("click", () => {
      state.settings.stages.push({ name: "", startDate: todayISO() });
      render();
    });
  });

  document.querySelectorAll("[data-action='remove-stage']").forEach((button) => {
    button.addEventListener("click", () => {
      state.settings.stages.splice(Number(button.dataset.index), 1);
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-action='add-tag']").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.querySelector("[data-custom-tag]");
      addCustomTag(input.value);
    });
  });

  document.querySelectorAll("[data-task-id]").forEach((card) => {
    const taskId = card.dataset.taskId;
    const taskDate = card.dataset.taskDate || todayISO();
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, input, textarea")) return;
      if (suppressTaskClickId === taskId) {
        suppressTaskClickId = null;
        return;
      }
      if (uiState.taskMenuId) {
        uiState.taskMenuId = null;
        render();
        return;
      }
      uiState.expandedTaskId = uiState.expandedTaskId === taskId ? null : taskId;
      uiState.editingTaskId = null;
      render();
    });
    card.addEventListener("contextmenu", (event) => {
      if (event.target.closest("input, textarea")) return;
      event.preventDefault();
      uiState.taskMenuId = taskId;
      uiState.expandedTaskId = uiState.expandedTaskId === taskId ? uiState.expandedTaskId : null;
      render();
    });
    card.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" || event.target.closest("button, input, textarea")) return;
      clearTimeout(longPressTimer);
      longPressTimer = window.setTimeout(() => {
        suppressTaskClickId = taskId;
        uiState.taskMenuId = taskId;
        uiState.expandedTaskId = uiState.expandedTaskId === taskId ? uiState.expandedTaskId : null;
        render();
      }, 520);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
      card.addEventListener(eventName, () => {
        clearTimeout(longPressTimer);
      });
    });
    card.querySelector("[data-action='edit-task']")?.addEventListener("click", () => {
      uiState.editingTaskId = taskId;
      uiState.expandedTaskId = taskId;
      uiState.taskMenuId = null;
      render();
      document.querySelector(`[data-task-id="${CSS.escape(taskId)}"] [data-task-name-edit]`)?.focus();
    });
    card.querySelector("[data-action='cancel-task-edit']")?.addEventListener("click", () => {
      uiState.editingTaskId = null;
      uiState.taskMenuId = null;
      render();
    });
    card.querySelector("[data-action='save-task-name']")?.addEventListener("click", () => {
      renameTask(taskId, card.querySelector("[data-task-name-edit]")?.value, taskDate);
    });
    card.querySelector("[data-task-name-edit]")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        renameTask(taskId, event.currentTarget.value, taskDate);
      }
      if (event.key === "Escape") {
        uiState.editingTaskId = null;
        render();
      }
    });
    card.querySelector("[data-action='delete-task']")?.addEventListener("click", () => {
      uiState.taskMenuId = null;
      openConfirm({
        title: "删除任务",
        message: "确定删除这个任务吗？此操作无法撤销。",
        confirmText: "确认删除",
        danger: true,
        onConfirm: () => runBusy("deleteTask", async () => deleteTask(taskId, taskDate)),
      });
    });
    card.querySelector("[data-action='complete-task']")?.addEventListener("click", () => {
      completeTask(taskId, card.querySelector("[data-task-completion]")?.value, taskDate);
    });
  });

  document.querySelectorAll("[data-action='cancel-confirm']").forEach((button) => {
    button.addEventListener("click", () => {
      closeConfirm();
    });
  });

  document.querySelectorAll("[data-action='confirm-action']").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirm = uiState.confirm;
      if (!confirm) return;
      closeConfirm();
      await confirm.onConfirm?.();
    });
  });
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHTML(value);
}

render();
