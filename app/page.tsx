"use client";
/* eslint-disable @next/next/no-img-element -- local IndexedDB blob previews cannot use Next Image */

import {
  AlertCircle, ArrowLeft, Bell, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight,
  Clock3, Database, Download, FileText, House, Image as ImageIcon, MapPin, Pencil,
  Plus, Repeat2, Smartphone, Trash2, Upload, UserRound, Video, WifiOff, X,
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  emptyPlan, findNextPlan, fromDateTimeLocal, Occurrence, occurrencesBetween, PlanItem,
  PlanMedia, PlanProperty, priorityLabels, repeatLabels, toDateTimeLocal, uuid,
} from "@/lib/plans";
import {
  exportBackup, getMediaBlob, importBackup, loadPlans, removeMedia, removePlan, saveMedia, savePlan,
} from "@/lib/storage";

type Tab = "home" | "calendar" | "data";
type CalendarMode = "month" | "week";

const dayNames = ["一", "二", "三", "四", "五", "六", "日"];
const cardTones = ["violet", "mint", "blue", "coral", "amber"];
const dateFormatter = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" });
const timeFormatter = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfWeek(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function addDays(date: Date, count: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + count);
  return result;
}

function monthCells(cursor: Date) {
  const start = startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function toneFor(id: string) {
  let sum = 0;
  for (const char of id) sum += char.charCodeAt(0);
  return cardTones[sum % cardTones.length];
}

function formatOccurrenceTime(occurrence: Occurrence) {
  const start = timeFormatter.format(occurrence.start);
  return occurrence.end ? `${start}–${timeFormatter.format(occurrence.end)}` : start;
}

function countdown(date: Date) {
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return "正在进行或等待完成";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} 分钟后`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时后`;
  return `${Math.floor(hours / 24)} 天后`;
}

function IconText({ icon: Icon, children }: { icon: typeof Clock3; children: React.ReactNode }) {
  return <span className="icon-text"><Icon size={15} strokeWidth={2.2} />{children}</span>;
}

function MediaTile({ media, onOpen, onDelete }: { media: PlanMedia; onOpen: (url: string) => void; onDelete?: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let objectUrl = "";
    getMediaBlob(media.id).then((blob) => {
      if (!blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [media.id]);
  return (
    <div className="media-tile">
      <button type="button" className="media-preview" onClick={() => url && onOpen(url)} aria-label={`查看${media.filename}`}>
        {url && media.kind === "image" ? <img src={url} alt={media.filename} /> : null}
        {url && media.kind === "video" ? <video src={url} muted playsInline /> : null}
        {!url ? <span className="media-loading">加载中</span> : null}
        {media.kind === "video" ? <span className="play-badge"><Video size={15} /> 视频</span> : null}
      </button>
      <div className="media-caption"><span>{media.filename}</span>{onDelete ? <button type="button" onClick={onDelete} aria-label="删除附件"><X size={15} /></button> : null}</div>
    </div>
  );
}

function NextHero({ occurrence, onOpen }: { occurrence: Occurrence | null; onOpen: () => void }) {
  if (!occurrence) {
    return <section className="next-hero empty-hero"><div className="eyebrow"><Check size={16} /> 接下来</div><h2>所有事情都完成了</h2><p>给自己留一点放松时间吧</p></section>;
  }
  const item = occurrence.source;
  return (
    <button className="next-hero" onClick={onOpen}>
      <span className="hero-orb" aria-hidden="true" />
      <div className="eyebrow"><BookOpen size={16} /> 下一项 · {countdown(occurrence.start)}</div>
      <h2>{item.title}</h2>
      <div className="hero-meta"><IconText icon={Clock3}>{dateFormatter.format(occurrence.start)} · {formatOccurrenceTime(occurrence)}</IconText>{item.location ? <IconText icon={MapPin}>{item.location}</IconText> : null}</div>
      <span className="hero-arrow"><ChevronRight size={18} /></span>
    </button>
  );
}

function UpcomingCard({ occurrence, onOpen, onComplete }: { occurrence: Occurrence; onOpen: () => void; onComplete: () => void }) {
  const item = occurrence.source;
  return (
    <article className={`plan-card tone-${toneFor(item.id)}`}>
      <button className="complete-button" onClick={onComplete} aria-label={`完成${item.title}`}><span /></button>
      <button className="plan-card-main" onClick={onOpen}>
        <div className="plan-card-top"><span className="plan-time">{dateFormatter.format(occurrence.start)} · {formatOccurrenceTime(occurrence)}</span>{item.priority !== "normal" ? <span className={`priority ${item.priority}`}>{priorityLabels[item.priority]}</span> : null}</div>
        <h3>{item.title}</h3>
        <div className="plan-meta">{item.location ? <IconText icon={MapPin}>{item.location}</IconText> : null}{item.teacher ? <IconText icon={UserRound}>{item.teacher}</IconText> : null}</div>
      </button>
    </article>
  );
}

function CompletedCard({ plan, onOpen, onRestore }: { plan: PlanItem; onOpen: () => void; onRestore: () => void }) {
  return (
    <article className="completed-card">
      <button className="completed-check" onClick={onRestore} aria-label={`恢复${plan.title}`}><Check size={15} /></button>
      <button className="completed-main" onClick={onOpen}>
        <h3>{plan.title}</h3>
        <span>{new Date(plan.dueDate).toLocaleDateString("zh-CN")} · {plan.location || "未设置地点"}</span>
      </button>
      <ChevronRight size={17} />
    </article>
  );
}

function PlanEditor({ initial, onClose, onSaved, onDeleted }: { initial: PlanItem; onClose: () => void; onSaved: (plan: PlanItem) => Promise<void>; onDeleted?: (plan: PlanItem) => Promise<void> }) {
  const [draft, setDraft] = useState<PlanItem>(() => structuredClone(initial));
  const [saving, setSaving] = useState(false);
  const isNew = !initial.title;
  const update = <K extends keyof PlanItem>(key: K, value: PlanItem[K]) => setDraft((current) => ({ ...current, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    setSaving(true);
    await onSaved({ ...draft, title: draft.title.trim(), endDate: draft.endDate || null, repeatEndDate: draft.repeatEndDate || null });
    setSaving(false);
  }
  return (
    <div className="modal-layer" role="presentation">
      <form className="sheet editor-sheet" onSubmit={submit}>
        <header className="sheet-header"><button type="button" className="icon-button" onClick={onClose}><X /></button><div><span className="sheet-kicker">PLAN</span><h2>{isNew ? "新建计划" : "编辑计划"}</h2></div><button className="text-action" disabled={saving}>{saving ? "保存中" : "保存"}</button></header>
        <div className="sheet-scroll form-stack">
          <section className="form-card title-card">
            <label className="sr-only" htmlFor="plan-title">计划名称</label><input id="plan-title" className="title-input" value={draft.title} onChange={(e) => update("title", e.target.value)} placeholder="计划名称" autoFocus />
            <div className="segment-row">{(["normal", "important", "urgent"] as const).map((value) => <button type="button" key={value} className={draft.priority === value ? "active" : ""} onClick={() => update("priority", value)}>{priorityLabels[value]}</button>)}</div>
          </section>
          <section className="form-card"><h3><Clock3 size={17} /> 时间</h3>
            <label>开始时间<input type="datetime-local" value={toDateTimeLocal(draft.dueDate)} onChange={(e) => update("dueDate", fromDateTimeLocal(e.target.value) ?? draft.dueDate)} required /></label>
            <label>结束时间 <span className="label-note">可选</span><input type="datetime-local" value={toDateTimeLocal(draft.endDate)} onChange={(e) => update("endDate", fromDateTimeLocal(e.target.value))} /></label>
            <label>课表说明 <span className="label-note">例如：周一 第1–3节</span><input value={draft.timeDescription} onChange={(e) => update("timeDescription", e.target.value)} placeholder="时间补充说明" /></label>
            <label className="switch-row"><span><b>时间已经确认</b><small>未确认时会显示提醒标记</small></span><input type="checkbox" checked={draft.isTimeConfirmed} onChange={(e) => update("isTimeConfirmed", e.target.checked)} /></label>
          </section>
          <section className="form-card"><h3><Repeat2 size={17} /> 重复与截止</h3>
            <label>重复<select value={draft.repeatRule} onChange={(e) => update("repeatRule", e.target.value as PlanItem["repeatRule"])}>{Object.entries(repeatLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {draft.repeatRule !== "never" ? <label>截止日期 <span className="label-note">留空表示永久</span><input type="date" value={draft.repeatEndDate ? toDateTimeLocal(draft.repeatEndDate).slice(0, 10) : ""} onChange={(e) => update("repeatEndDate", e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : null)} /></label> : null}
            <label>提前提醒（分钟）<input type="number" min="0" value={draft.reminderMinutesBefore ?? ""} onChange={(e) => update("reminderMinutesBefore", e.target.value === "" ? null : Number(e.target.value))} placeholder="不提醒" /></label>
          </section>
          <section className="form-card"><h3><MapPin size={17} /> 课程信息</h3>
            <label>地点<input value={draft.location} onChange={(e) => update("location", e.target.value)} placeholder="教室、会议室或地址" /></label>
            <label>老师 / 负责人<input value={draft.teacher} onChange={(e) => update("teacher", e.target.value)} placeholder="姓名" /></label>
            <label>备注<textarea value={draft.notes} onChange={(e) => update("notes", e.target.value)} placeholder="补充说明" rows={4} /></label>
          </section>
          {onDeleted ? <button type="button" className="danger-button" onClick={() => onDeleted(draft)}><Trash2 size={17} /> 删除这个计划</button> : null}
        </div>
      </form>
    </div>
  );
}

function PropertyEditor({ initial, onClose, onSave }: { initial?: PlanProperty; onClose: () => void; onSave: (property: PlanProperty, files: File[], removed: string[]) => Promise<void> }) {
  const [draft, setDraft] = useState<PlanProperty>(() => initial ? structuredClone(initial) : { id: uuid(), name: "", text: "", media: [] });
  const [files, setFiles] = useState<File[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  function chooseFiles(event: ChangeEvent<HTMLInputElement>) { setFiles((current) => [...current, ...Array.from(event.target.files ?? [])]); event.target.value = ""; }
  async function submit(event: FormEvent) { event.preventDefault(); if (!draft.name.trim()) return; setSaving(true); await onSave({ ...draft, name: draft.name.trim() }, files, removed); setSaving(false); }
  return (
    <div className="modal-layer nested" role="presentation"><form className="sheet property-sheet" onSubmit={submit}>
      <header className="sheet-header"><button type="button" className="icon-button" onClick={onClose}><X /></button><div><span className="sheet-kicker">NOTE CARD</span><h2>{initial ? "编辑注意事项" : "添加注意事项"}</h2></div><button className="text-action" disabled={saving}>{saving ? "保存中" : "保存"}</button></header>
      <div className="sheet-scroll form-stack">
        <section className="form-card title-card"><input className="title-input" value={draft.name} onChange={(e) => setDraft((value) => ({ ...value, name: e.target.value }))} placeholder="标题，例如：课前准备" autoFocus /></section>
        <section className="form-card"><label>文字内容<textarea rows={6} value={draft.text} onChange={(e) => setDraft((value) => ({ ...value, text: e.target.value }))} placeholder="可选，可与图片、视频组合" /></label></section>
        <section className="form-card"><h3><ImageIcon size={17} /> 图片与视频</h3>
          {draft.media.length ? <div className="media-grid">{draft.media.map((media) => <MediaTile key={media.id} media={media} onOpen={() => {}} onDelete={() => { setDraft((value) => ({ ...value, media: value.media.filter((entry) => entry.id !== media.id) })); setRemoved((value) => [...value, media.id]); }} />)}</div> : null}
          {files.length ? <div className="new-files">{files.map((file, index) => <span key={`${file.name}-${index}`}>{file.type.startsWith("video") ? <Video size={14} /> : <ImageIcon size={14} />}{file.name}<button type="button" onClick={() => setFiles((value) => value.filter((_, itemIndex) => itemIndex !== index))}><X size={13} /></button></span>)}</div> : null}
          <label className="upload-button"><Plus size={17} /> 选择图片或视频<input type="file" accept="image/*,video/*" multiple onChange={chooseFiles} /></label>
        </section>
      </div>
    </form></div>
  );
}

function PlanDetail({ plan, occurrence, onClose, onEdit, onChanged, onViewMedia }: { plan: PlanItem; occurrence?: Occurrence | null; onClose: () => void; onEdit: () => void; onChanged: () => Promise<void>; onViewMedia: (media: PlanMedia, url: string) => void }) {
  const [propertyEditor, setPropertyEditor] = useState<PlanProperty | "new" | null>(null);
  async function saveProperty(property: PlanProperty, files: File[], removed: string[]) {
    const additions: PlanMedia[] = [];
    for (const file of files) { const media: PlanMedia = { id: uuid(), kind: file.type.startsWith("video") ? "video" : "image", filename: file.name, mimeType: file.type, size: file.size, createdAt: new Date().toISOString() }; await saveMedia(media, file); additions.push(media); }
    const nextProperty = { ...property, media: [...property.media, ...additions] };
    const exists = plan.customProperties.some((item) => item.id === property.id);
    const customProperties = exists ? plan.customProperties.map((item) => item.id === property.id ? nextProperty : item) : [...plan.customProperties, nextProperty];
    for (const id of removed) await removeMedia(id);
    await savePlan({ ...plan, customProperties }); setPropertyEditor(null); await onChanged();
  }
  async function deleteProperty(property: PlanProperty) {
    if (!confirm(`删除“${property.name}”及其中的附件？`)) return;
    for (const media of property.media) await removeMedia(media.id);
    await savePlan({ ...plan, customProperties: plan.customProperties.filter((item) => item.id !== property.id) }); await onChanged();
  }
  const shownDate = occurrence?.start ?? new Date(plan.dueDate);
  const shownEnd = occurrence?.end ?? (plan.endDate ? new Date(plan.endDate) : null);
  return (
    <div className="modal-layer"><section className="sheet detail-sheet">
      <header className="sheet-header"><button className="icon-button" onClick={onClose}><ArrowLeft /></button><div><span className="sheet-kicker">PLAN DETAIL</span><h2>计划详情</h2></div><button className="icon-button accent-button" onClick={onEdit} aria-label="编辑计划"><Pencil size={18} /></button></header>
      <div className="sheet-scroll detail-content">
        <section className={`detail-hero tone-${toneFor(plan.id)}`}><span>{plan.isCompleted ? "已完成" : plan.priority !== "normal" ? priorityLabels[plan.priority] : "接下来"}</span><h1>{plan.title}</h1><p>{plan.isCompleted ? "已归档，可在首页恢复" : countdown(shownDate)}</p></section>
        <div className="info-card-grid">
          <article className="info-card purple"><Clock3 /><span>时间</span><b>{dateFormatter.format(shownDate)}</b><small>{timeFormatter.format(shownDate)}{shownEnd ? `–${timeFormatter.format(shownEnd)}` : ""}</small>{plan.timeDescription ? <em>{plan.timeDescription}</em> : null}</article>
          <article className="info-card mint"><MapPin /><span>地点</span><b>{plan.location || "未设置"}</b><small>{plan.teacher || "未设置老师 / 负责人"}</small></article>
          <article className="info-card blue"><Repeat2 /><span>重复</span><b>{repeatLabels[plan.repeatRule]}</b><small>{plan.repeatEndDate ? `${new Date(plan.repeatEndDate).toLocaleDateString("zh-CN")} 截止` : plan.repeatRule === "never" ? "一次性计划" : "永久重复"}</small></article>
          <article className="info-card coral"><Bell /><span>提醒</span><b>{plan.reminderMinutesBefore === null ? "不提醒" : `提前 ${plan.reminderMinutesBefore} 分钟`}</b><small>{plan.isTimeConfirmed ? "时间已确认" : "具体钟点待确认"}</small></article>
        </div>
        {plan.notes ? <section className="notes-card"><div className="card-title"><FileText size={18} /><h3>备注</h3></div><p>{plan.notes}</p></section> : null}
        <section className="properties-section"><div className="section-heading"><div><span>自定义内容</span><h2>注意事项</h2></div><button className="round-plus" onClick={() => setPropertyEditor("new")} aria-label="添加注意事项"><Plus /></button></div>
          {!plan.customProperties.length ? <div className="property-empty"><AlertCircle size={20} /><span>还没有注意事项</span><small>可添加文字、照片与视频</small></div> : null}
          {plan.customProperties.map((property) => <article className={`property-card tone-${toneFor(property.id)}`} key={property.id}><div className="property-header"><div><span>NOTE</span><h3>{property.name}</h3></div><div><button onClick={() => setPropertyEditor(property)} aria-label="编辑"><Pencil size={16} /></button><button onClick={() => deleteProperty(property)} aria-label="删除"><Trash2 size={16} /></button></div></div>{property.text ? <p>{property.text}</p> : null}{property.media.length ? <div className="media-grid">{property.media.map((media) => <MediaTile key={media.id} media={media} onOpen={(url) => onViewMedia(media, url)} />)}</div> : null}</article>)}
        </section>
      </div>
    </section>{propertyEditor ? <PropertyEditor initial={propertyEditor === "new" ? undefined : propertyEditor} onClose={() => setPropertyEditor(null)} onSave={saveProperty} /> : null}</div>
  );
}

function CalendarView({ plans, onOpen, onAdd }: { plans: PlanItem[]; onOpen: (occurrence: Occurrence) => void; onAdd: (date: Date) => void }) {
  const [mode, setMode] = useState<CalendarMode>("month");
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState(new Date());
  const days = useMemo(() => mode === "month" ? monthCells(cursor) : Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(cursor), index)), [mode, cursor]);
  const rangeStart = new Date(days[0].getFullYear(), days[0].getMonth(), days[0].getDate());
  const rangeEnd = addDays(days[days.length - 1], 1);
  const occurrences = occurrencesBetween(plans, rangeStart, rangeEnd);
  const selectedItems = occurrences.filter((item) => sameDay(item.start, selected));
  function move(direction: number) { const next = new Date(cursor); if (mode === "month") next.setMonth(next.getMonth() + direction); else next.setDate(next.getDate() + direction * 7); setCursor(next); setSelected(next); }
  return (
    <section className="page calendar-page">
      <header className="page-header"><div><span className="page-kicker">CALENDAR</span><h1>日历</h1></div><button className="round-plus" onClick={() => onAdd(selected)}><Plus /></button></header>
      <div className="calendar-toolbar"><div className="mode-switch"><button className={mode === "month" ? "active" : ""} onClick={() => setMode("month")}>月</button><button className={mode === "week" ? "active" : ""} onClick={() => setMode("week")}>周</button></div><div className="calendar-title"><button onClick={() => move(-1)}><ChevronLeft /></button><b>{cursor.getFullYear()}年 {cursor.getMonth() + 1}月</b><button onClick={() => move(1)}><ChevronRight /></button></div></div>
      <div className={`calendar-grid ${mode}`}>{dayNames.map((name) => <span className="weekday" key={name}>{name}</span>)}{days.map((day) => { const dayItems = occurrences.filter((item) => sameDay(item.start, day)); return <button key={day.toISOString()} className={`${sameDay(day, selected) ? "selected" : ""} ${day.getMonth() !== cursor.getMonth() && mode === "month" ? "outside" : ""}`} onClick={() => setSelected(day)}><span>{day.getDate()}</span>{sameDay(day, new Date()) ? <i /> : null}<div className="calendar-dots">{dayItems.slice(0, 3).map((item) => <em key={`${item.source.id}-${item.start.toISOString()}`} className={`tone-${toneFor(item.source.id)}`} />)}</div></button>; })}</div>
      <div className="day-agenda"><div className="section-heading"><div><span>{selected.toLocaleDateString("zh-CN", { weekday: "long" })}</span><h2>{selected.getMonth() + 1}月{selected.getDate()}日</h2></div><small>{selectedItems.length ? `${selectedItems.length} 项安排` : "空闲的一天"}</small></div><div className="agenda-list">{selectedItems.map((item) => <button key={`${item.source.id}-${item.start.toISOString()}`} className={`agenda-item tone-${toneFor(item.source.id)}`} onClick={() => onOpen(item)}><time>{timeFormatter.format(item.start)}</time><span><b>{item.source.title}</b><small>{item.source.location || "未设置地点"}</small></span><ChevronRight size={17} /></button>)}</div>{!selectedItems.length ? <button className="empty-day" onClick={() => onAdd(selected)}><Plus size={18} /> 给这一天添加计划</button> : null}</div>
    </section>
  );
}

function DataView({ onImported, onToast }: { onImported: () => Promise<void>; onToast: (message: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [installEvent, setInstallEvent] = useState<(Event & { prompt?: () => Promise<void> }) | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(() => typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  useEffect(() => { const handler = (event: Event) => { event.preventDefault(); setInstallEvent(event as Event & { prompt?: () => Promise<void> }); }; window.addEventListener("beforeinstallprompt", handler); return () => window.removeEventListener("beforeinstallprompt", handler); }, []);
  async function downloadBackup() { const raw = await exportBackup(); const url = URL.createObjectURL(new Blob([raw], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = `NextPlan-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); onToast("备份已导出"); }
  async function restore(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; if (!confirm("导入会替换当前设备上的所有计划，继续吗？")) { event.target.value = ""; return; } try { await importBackup(await file.text()); await onImported(); onToast("备份已恢复"); } catch (error) { alert(error instanceof Error ? error.message : "导入失败"); } event.target.value = ""; }
  async function enableNotifications() {
    if (typeof Notification === "undefined") { onToast("此浏览器不支持通知"); return; }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    onToast(permission === "granted" ? "已启用打开期间提醒" : "未获得通知权限");
  }
  return (
    <section className="page data-page"><header className="page-header"><div><span className="page-kicker">LOCAL FIRST</span><h1>本机数据</h1></div><span className="offline-pill"><WifiOff size={15} /> 无服务器</span></header>
      <section className="privacy-hero"><div className="privacy-icon"><Database /></div><span>只属于这台设备</span><h2>计划和附件都保存在浏览器中</h2><p>没有账号、没有云端数据库，也不会上传课程和照片。请定期导出备份。</p></section>
      <section className="settings-card"><button onClick={downloadBackup}><span className="setting-icon purple"><Download /></span><span><b>导出完整备份</b><small>包含计划、图片和视频</small></span><ChevronRight /></button><button onClick={() => inputRef.current?.click()}><span className="setting-icon mint"><Upload /></span><span><b>从备份恢复</b><small>会替换当前设备的数据</small></span><ChevronRight /></button><button onClick={enableNotifications}><span className="setting-icon coral"><Bell /></span><span><b>{notificationPermission === "granted" ? "提醒已启用" : "启用本地提醒"}</b><small>浏览器保持打开时按提前量提醒</small></span><ChevronRight /></button><input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={restore} /></section>
      <section className="install-card"><div className="card-title"><Smartphone /><h2>添加到主屏幕</h2></div><p>安装后可像 App 一样全屏打开，并在没有网络时继续使用。</p>{installEvent?.prompt ? <button className="primary-button" onClick={() => installEvent.prompt?.()}>立即安装</button> : <ol><li>在 Safari 中点底部“分享”</li><li>选择“添加到主屏幕”</li><li>确认名称为 NextPlan</li></ol>}</section>
      <p className="data-footnote">清除 Safari 网站数据或卸载浏览器可能删除本地内容，换手机前请先导出备份。</p>
    </section>
  );
}

export default function Home() {
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [tab, setTab] = useState<Tab>("home");
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<PlanItem | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOccurrence, setDetailOccurrence] = useState<Occurrence | null>(null);
  const [viewer, setViewer] = useState<{ media: PlanMedia; url: string } | null>(null);
  const [toast, setToast] = useState("");
  async function refresh() { setPlans(await loadPlans()); }
  useEffect(() => {
    let active = true;
    void loadPlans().then((items) => { if (active) setPlans(items); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
      void navigator.serviceWorker.getRegistrations().then((registrations) => registrations.forEach((registration) => { void registration.unregister(); }));
      return;
    }
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted" || !("serviceWorker" in navigator)) return;
    const timers: number[] = [];
    for (const plan of plans) {
      if (plan.reminderMinutesBefore === null) continue;
      const occurrence = findNextPlan([plan]);
      if (!occurrence) continue;
      const delay = occurrence.start.getTime() - Date.now() - plan.reminderMinutesBefore * 60000;
      if (delay <= 0 || delay > 7 * 24 * 60 * 60 * 1000) continue;
      timers.push(window.setTimeout(() => {
        void navigator.serviceWorker.ready.then((registration) => registration.showNotification(plan.title, { body: `${plan.location || "未设置地点"} · ${timeFormatter.format(occurrence.start)}`, tag: `nextplan-${plan.id}` }));
      }, delay));
    }
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [plans]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2200); return () => window.clearTimeout(timer); }, [toast]);
  const next = useMemo(() => findNextPlan(plans), [plans]);
  const upcoming = useMemo(() => plans.map((plan) => findNextPlan([plan])).filter((item): item is Occurrence => Boolean(item)).sort((a, b) => a.start.getTime() - b.start.getTime()), [plans]);
  const completed = useMemo(() => plans.filter((plan) => plan.isCompleted).sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()), [plans]);
  const detailPlan = plans.find((plan) => plan.id === detailId) ?? null;
  function openOccurrence(occurrence: Occurrence) { setDetailOccurrence(occurrence); setDetailId(occurrence.source.id); }
  function openPlan(plan: PlanItem) { setDetailOccurrence(null); setDetailId(plan.id); }
  async function persist(plan: PlanItem) { await savePlan(plan); await refresh(); setEditor(null); setDetailId(plan.id); setToast("计划已保存"); }
  async function destroy(plan: PlanItem) { if (!confirm(`永久删除“${plan.title}”？`)) return; await removePlan(plan); await refresh(); setEditor(null); setDetailId(null); setToast("计划已删除"); }
  async function toggleComplete(plan: PlanItem) { await savePlan({ ...plan, isCompleted: !plan.isCompleted }); await refresh(); setToast(plan.isCompleted ? "已恢复" : "已完成"); }

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool || loading) return;
    const lifecycle = new AbortController();
    const register = (tool: unknown) => Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
    void register({ name: "list_plans", title: "查看 NextPlan 计划", description: "读取设备上当前的计划、课程时间、老师和地点。", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => plans.map(({ customProperties, ...plan }) => ({ ...plan, propertyCount: customProperties.length })) });
    void register({ name: "create_plan", title: "创建 NextPlan 计划", description: "在本机创建一个新计划。dueDate 必须是 ISO 8601 时间。", inputSchema: { type: "object", properties: { title: { type: "string" }, dueDate: { type: "string" }, location: { type: "string" }, notes: { type: "string" } }, required: ["title", "dueDate"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => { const value = input as { title: string; dueDate: string; location?: string; notes?: string }; const plan = { ...emptyPlan(new Date(value.dueDate)), title: value.title, location: value.location ?? "", notes: value.notes ?? "" }; await savePlan(plan); await refresh(); return { id: plan.id, status: "created" }; } });
    void register({ name: "update_plan", title: "修改 NextPlan 计划", description: "按 id 修改计划名称、时间、地点、老师或备注。只修改提供的字段。", inputSchema: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, dueDate: { type: "string" }, location: { type: "string" }, teacher: { type: "string" }, notes: { type: "string" } }, required: ["id"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => { const value = input as { id: string; title?: string; dueDate?: string; location?: string; teacher?: string; notes?: string }; const plan = plans.find((item) => item.id === value.id); if (!plan) throw new Error("计划不存在"); const updated = { ...plan, ...(value.title !== undefined ? { title: value.title } : {}), ...(value.dueDate !== undefined ? { dueDate: new Date(value.dueDate).toISOString() } : {}), ...(value.location !== undefined ? { location: value.location } : {}), ...(value.teacher !== undefined ? { teacher: value.teacher } : {}), ...(value.notes !== undefined ? { notes: value.notes } : {}) }; await savePlan(updated); await refresh(); return { id: updated.id, status: "updated" }; } });
    void register({ name: "delete_plan", title: "删除 NextPlan 计划", description: "按计划 id 永久删除本机计划及附件。", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: unknown) => { const id = (input as { id: string }).id; const plan = plans.find((item) => item.id === id); if (!plan) throw new Error("计划不存在"); await removePlan(plan); await refresh(); return { id, status: "deleted" }; } });
    return () => lifecycle.abort();
  }, [plans, loading]);

  return (
    <main className="app-shell">
      {loading ? <div className="loading-screen"><span className="app-mark"><Check /></span><b>NextPlan</b><small>正在读取本机计划…</small></div> : null}
      {!loading && tab === "home" ? <section className="home-layout"><div className="home-pinned"><header className="home-header"><div><span className="page-kicker">NEXTPLAN</span><h1>下一项</h1></div><button className="round-plus" onClick={() => setEditor(emptyPlan())} aria-label="新建计划"><Plus /></button></header><NextHero occurrence={next} onOpen={() => next && openOccurrence(next)} /></div><div className="upcoming-scroll"><div className="section-heading"><div><span>按时间排序</span><h2>接下来的计划</h2></div></div><div className="plan-list">{upcoming.map((item) => <UpcomingCard key={item.source.id} occurrence={item} onOpen={() => openOccurrence(item)} onComplete={() => toggleComplete(item.source)} />)}</div>{!upcoming.length ? <div className="list-empty"><Check /><h3>暂无待办</h3><p>点击右上角添加下一件事</p></div> : null}{completed.length ? <details className="completed-section"><summary><span><Check size={15} /> 已完成</span><small>{completed.length} 项</small></summary><div className="completed-list">{completed.map((plan) => <CompletedCard key={plan.id} plan={plan} onOpen={() => openPlan(plan)} onRestore={() => toggleComplete(plan)} />)}</div></details> : null}</div></section> : null}
      {!loading && tab === "calendar" ? <CalendarView plans={plans} onOpen={openOccurrence} onAdd={(date) => { const plan = emptyPlan(new Date(date)); plan.dueDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9).toISOString(); setEditor(plan); }} /> : null}
      {!loading && tab === "data" ? <DataView onImported={refresh} onToast={setToast} /> : null}
      {!loading ? <nav className="bottom-nav" aria-label="主导航"><button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}><House /><span>首页</span></button><button className={tab === "calendar" ? "active" : ""} onClick={() => setTab("calendar")}><CalendarDays /><span>日历</span></button><button className={tab === "data" ? "active" : ""} onClick={() => setTab("data")}><Database /><span>数据</span></button></nav> : null}
      {detailPlan ? <PlanDetail plan={detailPlan} occurrence={detailOccurrence?.source.id === detailPlan.id ? detailOccurrence : findNextPlan([detailPlan])} onClose={() => setDetailId(null)} onEdit={() => setEditor(detailPlan)} onChanged={refresh} onViewMedia={(media, url) => setViewer({ media, url })} /> : null}
      {editor ? <PlanEditor initial={editor} onClose={() => setEditor(null)} onSaved={persist} onDeleted={plans.some((plan) => plan.id === editor.id) ? destroy : undefined} /> : null}
      {viewer ? <div className="viewer" onClick={() => setViewer(null)}><button aria-label="关闭"><X /></button>{viewer.media.kind === "image" ? <img src={viewer.url} alt={viewer.media.filename} /> : <video src={viewer.url} controls autoPlay playsInline />}</div> : null}
      {toast ? <div className="toast"><Check size={17} />{toast}</div> : null}
    </main>
  );
}
