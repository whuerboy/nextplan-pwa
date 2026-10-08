export type PlanPriority = "normal" | "important" | "urgent";
export type PlanRepeat = "never" | "hourly" | "daily" | "biweekly" | "weekly" | "monthly";
export type MediaKind = "image" | "video";

export interface PlanMedia {
  id: string;
  kind: MediaKind;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface PlanProperty {
  id: string;
  name: string;
  text: string;
  media: PlanMedia[];
}

export interface PlanItem {
  id: string;
  title: string;
  teacher: string;
  location: string;
  notes: string;
  dueDate: string;
  endDate: string | null;
  timeDescription: string;
  isTimeConfirmed: boolean;
  isCompleted: boolean;
  priority: PlanPriority;
  reminderMinutesBefore: number | null;
  createdAt: string;
  repeatRule: PlanRepeat;
  repeatEndDate: string | null;
  customProperties: PlanProperty[];
}

export interface Occurrence {
  source: PlanItem;
  start: Date;
  end: Date | null;
}

export const priorityLabels: Record<PlanPriority, string> = {
  normal: "普通",
  important: "重要",
  urgent: "紧急",
};

export const repeatLabels: Record<PlanRepeat, string> = {
  never: "不重复",
  hourly: "每小时",
  daily: "每天",
  biweekly: "每两周",
  weekly: "每周",
  monthly: "每月",
};

export function uuid() {
  return crypto.randomUUID();
}

function atLocalDate(date: Date, hour: number, minute = 0) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
}

function nextWeekday(weekday: number, hour: number, notBefore?: Date) {
  const now = new Date();
  const base = notBefore && notBefore > now ? notBefore : now;
  const candidate = atLocalDate(base, hour);
  const delta = (weekday - candidate.getDay() + 7) % 7;
  candidate.setDate(candidate.getDate() + delta);
  if (candidate < base) candidate.setDate(candidate.getDate() + 7);
  return candidate;
}

interface CourseSeed {
  title: string;
  weekday: number;
  hour: number;
  endHour?: number;
  timeDescription: string;
  location: string;
  teacher: string;
  notes?: string;
  repeatRule?: PlanRepeat;
  confirmed?: boolean;
  notBefore?: Date;
}

export function createBuiltInSchedule(): PlanItem[] {
  const currentYear = new Date().getFullYear();
  const pending = "原课表只提供节次，没有提供节次对应的具体钟点；可在编辑页面补充准确时间。";
  const seeds: CourseSeed[] = [
    { title: "操作系统与虚拟化安全", weekday: 1, hour: 8, timeDescription: "周一 第1–3节", location: "3201", teacher: "沈晴霓" },
    { title: "开源软件开发基础及实践", weekday: 2, hour: 8, timeDescription: "周二 第1–3节", location: "3202", teacher: "荆琦" },
    { title: "大语言模型与应用实践", weekday: 3, hour: 8, timeDescription: "周三 第1–3节", location: "3201", teacher: "俞敬松" },
    { title: "JAVA编程技能训练", weekday: 5, hour: 8, timeDescription: "周五 第1–3节", location: "1202", teacher: "褚伟杰" },
    { title: "素质教育与前沿技术", weekday: 6, hour: 8, timeDescription: "周六 第1–3节", location: "3204、报告厅", teacher: "素质教育教研室" },
    { title: "云计算技术及应用", weekday: 1, hour: 13, timeDescription: "周一 第5–7节", location: "3204", teacher: "莫同" },
    {
      title: "自然辩证法概论",
      weekday: 2,
      hour: 13,
      endHour: 17,
      timeDescription: "周二 13:00–17:00（第5–8节）",
      location: "报告厅",
      teacher: "朱效民",
      notes: "每周上课；9月15日开课；关键软件、人工智能、软件工程新兴交叉学科方向选课；1班授课时间为13:00–17:00。",
      confirmed: true,
      notBefore: new Date(currentYear, 8, 15, 13),
    },
    {
      title: "Python",
      weekday: 3,
      hour: 13,
      timeDescription: "周三 第5–7节（双周）",
      location: "3204 或 3202（班级待确认）",
      teacher: "夏敏 或 方跃坚（班级待确认）",
      notes: "双周上课；01班教室3204，02班教室3202，请按实际班级确认。",
      repeatRule: "biweekly",
    },
    {
      title: "算法分析与设计",
      weekday: 4,
      hour: 13,
      timeDescription: "周四 第5–7节",
      location: "3204 或 3201（班级待确认）",
      teacher: "孙圣力 或 李聪（班级待确认）",
      notes: "每周上课；面向技术类方向；02班教室3204，03班教室3201，请按实际班级确认。",
    },
    { title: "网络空间安全导论", weekday: 5, hour: 13, timeDescription: "周五 第6–8节", location: "3201", teacher: "沈晴霓、文伟平、方跃坚、李聪、孙惠平" },
  ];

  return seeds.map((seed) => {
    const start = nextWeekday(seed.weekday, seed.hour, seed.notBefore);
    const confirmed = seed.confirmed ?? false;
    const notes = seed.notes ?? "每周上课";
    return {
      id: uuid(),
      title: seed.title,
      teacher: seed.teacher,
      location: seed.location,
      notes: confirmed ? notes : `${notes}\n${pending}`,
      dueDate: start.toISOString(),
      endDate: seed.endHour ? atLocalDate(start, seed.endHour).toISOString() : null,
      timeDescription: seed.timeDescription,
      isTimeConfirmed: confirmed,
      isCompleted: false,
      priority: "normal",
      reminderMinutesBefore: confirmed ? 10 : null,
      createdAt: new Date().toISOString(),
      repeatRule: seed.repeatRule ?? "weekly",
      repeatEndDate: null,
      customProperties: [],
    };
  });
}

export function addRepeat(date: Date, rule: PlanRepeat) {
  const next = new Date(date);
  if (rule === "hourly") next.setHours(next.getHours() + 1);
  if (rule === "daily") next.setDate(next.getDate() + 1);
  if (rule === "weekly") next.setDate(next.getDate() + 7);
  if (rule === "biweekly") next.setDate(next.getDate() + 14);
  if (rule === "monthly") next.setMonth(next.getMonth() + 1);
  return next;
}

function afterRepeatEnd(date: Date, item: PlanItem) {
  if (!item.repeatEndDate) return false;
  const end = new Date(item.repeatEndDate);
  const dayAfter = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  return date >= dayAfter;
}

function occurrence(item: PlanItem, start: Date): Occurrence {
  const original = new Date(item.dueDate);
  const duration = item.endDate ? new Date(item.endDate).getTime() - original.getTime() : null;
  return { source: item, start, end: duration === null ? null : new Date(start.getTime() + duration) };
}

export function nextOccurrenceFor(item: PlanItem, now = new Date()): Occurrence | null {
  if (item.isCompleted) return null;
  const first = new Date(item.dueDate);
  if (item.repeatRule === "never") return occurrence(item, first);
  if (afterRepeatEnd(first, item)) return null;
  if (first > now) return occurrence(item, first);

  let latest = first;
  let future: Date | null = null;
  for (let i = 0; i < 10000; i += 1) {
    const candidate = addRepeat(latest, item.repeatRule);
    if (afterRepeatEnd(candidate, item)) break;
    if (candidate > now) {
      future = candidate;
      break;
    }
    latest = candidate;
  }

  const current = occurrence(item, latest);
  const endOfDay = new Date(latest.getFullYear(), latest.getMonth(), latest.getDate(), 23, 59, 59, 999);
  if ((current.end && now <= current.end) || (!current.end && now <= endOfDay)) return current;
  return future ? occurrence(item, future) : null;
}

export function findNextPlan(items: PlanItem[], now = new Date()) {
  return items
    .map((item) => nextOccurrenceFor(item, now))
    .filter((value): value is Occurrence => Boolean(value))
    .sort((a, b) => {
      const time = a.start.getTime() - b.start.getTime();
      if (time !== 0) return time;
      const rank = { normal: 0, important: 1, urgent: 2 };
      return rank[b.source.priority] - rank[a.source.priority];
    })[0] ?? null;
}

export function occurrencesBetween(items: PlanItem[], rangeStart: Date, rangeEnd: Date) {
  const result: Occurrence[] = [];
  for (const item of items) {
    if (item.isCompleted) continue;
    let start = new Date(item.dueDate);
    if (item.repeatRule === "never") {
      if (start < rangeEnd && (new Date(item.endDate ?? item.dueDate) >= rangeStart)) result.push(occurrence(item, start));
      continue;
    }
    for (let i = 0; i < 10000 && start < rangeEnd; i += 1) {
      if (!afterRepeatEnd(start, item) && start >= rangeStart) result.push(occurrence(item, start));
      const next = addRepeat(start, item.repeatRule);
      if (next <= start || afterRepeatEnd(next, item)) break;
      start = next;
    }
  }
  return result.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function emptyPlan(date = new Date()): PlanItem {
  const due = new Date(date);
  due.setSeconds(0, 0);
  return {
    id: uuid(), title: "", teacher: "", location: "", notes: "", dueDate: due.toISOString(), endDate: null,
    timeDescription: "", isTimeConfirmed: true, isCompleted: false, priority: "normal", reminderMinutesBefore: 10,
    createdAt: new Date().toISOString(), repeatRule: "never", repeatEndDate: null, customProperties: [],
  };
}

export function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : null;
}
