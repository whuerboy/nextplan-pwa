import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

const [, , plistPath, mediaDirectory, outputPath] = process.argv;
if (!plistPath || !mediaDirectory || !outputPath) {
  console.error("Usage: node scripts/import-ios-snapshot.mjs <plist> <PlanMedia directory> <output.json>");
  process.exit(1);
}

const encoded = execFileSync("/usr/bin/plutil", [
  "-extract", "plan-items-v3", "raw", "-o", "-", plistPath,
], { encoding: "utf8" }).trim();
const sourcePlans = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
const appleEpochOffset = 978_307_200;
const priorityMap = ["normal", "important", "urgent"];

function appleDate(value) {
  if (value === null || value === undefined) return null;
  return new Date((Number(value) + appleEpochOffset) * 1000).toISOString();
}

function mimeType(filename) {
  const extension = extname(filename).toLowerCase();
  if ([".jpg", ".jpeg"].includes(extension)) return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".heic") return "image/heic";
  if ([".mov", ".qt"].includes(extension)) return "video/quicktime";
  if (extension === ".mp4") return "video/mp4";
  return "application/octet-stream";
}

const mediaPayloads = {};
const missingFiles = [];
const plans = sourcePlans.map((source) => ({
  id: source.id,
  title: source.title,
  teacher: source.teacher ?? "",
  location: source.location ?? "",
  notes: source.notes ?? "",
  dueDate: appleDate(source.dueDate),
  endDate: appleDate(source.endDate),
  timeDescription: source.timeDescription ?? "",
  isTimeConfirmed: source.isTimeConfirmed ?? true,
  isCompleted: source.isCompleted ?? false,
  priority: priorityMap[source.priority] ?? "normal",
  reminderMinutesBefore: source.reminderMinutesBefore ?? null,
  createdAt: appleDate(source.createdAt) ?? new Date().toISOString(),
  repeatRule: source.repeatRule ?? "never",
  repeatEndDate: appleDate(source.repeatEndDate),
  customProperties: (source.customProperties ?? []).map((property) => ({
    id: property.id,
    name: property.name ?? "",
    text: property.text ?? "",
    media: (property.media ?? []).map((entry) => {
      const path = join(mediaDirectory, entry.filename);
      const type = mimeType(entry.filename);
      const size = existsSync(path) ? statSync(path).size : 0;
      if (existsSync(path) && !mediaPayloads[entry.id]) {
        mediaPayloads[entry.id] = `data:${type};base64,${readFileSync(path).toString("base64")}`;
      } else if (!existsSync(path)) {
        missingFiles.push(entry.filename);
      }
      return {
        id: entry.id,
        kind: entry.kind,
        filename: basename(entry.filename),
        mimeType: type,
        size,
        createdAt: appleDate(entry.createdAt) ?? new Date().toISOString(),
      };
    }),
  })),
}));

if (missingFiles.length) {
  console.error(`Missing ${missingFiles.length} referenced media file(s):\n${missingFiles.join("\n")}`);
  process.exit(2);
}

const backup = {
  app: "NextPlan",
  version: 1,
  exportedAt: new Date().toISOString(),
  source: "iPhone local.nextplan / plan-items-v3",
  plans,
  media: mediaPayloads,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(backup, null, 2)}\n`);

const propertyCount = plans.reduce((sum, plan) => sum + plan.customProperties.length, 0);
const mediaReferences = plans.reduce(
  (sum, plan) => sum + plan.customProperties.reduce((inner, property) => inner + property.media.length, 0),
  0,
);
console.log(JSON.stringify({
  outputPath,
  plans: plans.length,
  completed: plans.filter((plan) => plan.isCompleted).length,
  customProperties: propertyCount,
  mediaReferences,
  uniqueMediaFiles: Object.keys(mediaPayloads).length,
}));
