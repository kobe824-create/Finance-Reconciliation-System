import { isValidIsoDate } from "@/lib/dates";

export type ParsedRow = { date: string; description: string; reference?: string; amount: number };
export type ParseResult = { rows: ParsedRow[]; warnings: string[] };

const firstKey = (keys: string[], patterns: RegExp[]) => keys.find((key) => patterns.some((pattern) => pattern.test(key)));

export function normalizeDate(value: unknown): string | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 20_000 && value < 80_000) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    return date.toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  if (/^\d{5}(?:\.\d+)?$/.test(text) && Number(text) > 20_000 && Number(text) < 80_000) return normalizeDate(Number(text));
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) {
    const normalized = `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    return isValidIsoDate(normalized) ? normalized : undefined;
  }
  const local = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (local) {
    const year = local[3].length === 2 ? `20${local[3]}` : local[3];
    const first = Number(local[1]);
    const second = Number(local[2]);
    // DDIN's Rwanda-facing imports default ambiguous slash dates to day-first.
    const month = second > 12 ? first : first > 12 ? second : second;
    const day = second > 12 ? second : first > 12 ? first : first;
    const date = new Date(Date.UTC(Number(year), month - 1, day));
    if (date.getUTCFullYear() === Number(year) && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return date.toISOString().slice(0, 10);
  }
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : undefined;
}

export function normalizeAmount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100) / 100;
  let text = String(value ?? "").trim();
  if (!text) return undefined;
  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  text = text.replace(/[()]/g, "").replace(/[^\d.,-]/g, "");
  if (text.includes(",") && text.includes(".")) {
    const comma = text.lastIndexOf(",");
    const dot = text.lastIndexOf(".");
    text = comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (text.includes(",")) {
    const decimalDigits = text.length - text.lastIndexOf(",") - 1;
    text = decimalDigits > 0 && decimalDigits <= 2 ? text.replace(",", ".") : text.replace(/,/g, "");
  }
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return undefined;
  const amount = Math.round(Math.abs(parsed) * 100) / 100;
  return negative ? -amount : amount;
}

function normalizeRecords(records: Record<string, unknown>[]): ParseResult {
  if (!records.length) return { rows: [], warnings: ["No non-empty transaction rows were found."] };
  const keys = Object.keys(records[0] ?? {});
  const dateKey = firstKey(keys, [/date/, /postedon/, /transactiondate/, /valuedate/]);
  const descriptionKey = firstKey(keys, [/description/, /details/, /narration/, /particular/, /memo/, /payee/, /transaction/]);
  const referenceKey = firstKey(keys, [/reference/, /refno/, /transactionid/, /chequeno/, /cheque/]);
  const amountKey = firstKey(keys, [/^amount$/, /transactionamount/, /debitcredit/, /value/]);
  const debitKey = firstKey(keys, [/^debit$/, /withdrawal/, /paidout/, /moneyout/]);
  const creditKey = firstKey(keys, [/^credit$/, /deposit/, /paidin/, /moneyin/]);
  if (!dateKey || !descriptionKey || (!amountKey && !debitKey && !creditKey)) {
    throw new Error("The file needs recognizable date, description, and amount columns. Rename the headers and import it again.");
  }

  const rows: ParsedRow[] = [];
  const warnings: string[] = [];
  records.forEach((record, index) => {
    const date = normalizeDate(record[dateKey]);
    const description = String(record[descriptionKey] ?? "").trim().slice(0, 500);
    let amount: number | undefined;
    if (amountKey) amount = normalizeAmount(record[amountKey]);
    else {
      const debit = normalizeAmount(record[debitKey!] ?? 0) ?? 0;
      const credit = normalizeAmount(record[creditKey!] ?? 0) ?? 0;
      amount = Math.round((credit - debit) * 100) / 100;
    }
    if (!date || !description || amount === undefined) {
      warnings.push(`Skipped row ${index + 2}: missing or invalid date, description, or amount.`);
      return;
    }
    const reference = referenceKey ? String(record[referenceKey] ?? "").trim().slice(0, 128) : "";
    rows.push({ date, description, reference: reference || undefined, amount });
  });
  return { rows, warnings: warnings.slice(0, 8) };
}

function pdfAmount(token: string): number | undefined {
  const negative = token.includes("(") || token.startsWith("-");
  const clean = token.replace(/[()]/g, "").replace(/,/g, "").replace(/[^\d.]/g, "");
  const value = Number(clean);
  if (!Number.isFinite(value)) return undefined;
  return (negative ? -1 : 1) * Math.round(value * 100) / 100;
}

async function parsePdf(file: File): Promise<ParseResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const byY = new Map<number, Array<{ x: number; text: string }>>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const line = byY.get(y) ?? [];
      line.push({ x: item.transform[4], text: item.str.trim() });
      byY.set(y, line);
    }
    lines.push(...[...byY.entries()].sort((a, b) => b[0] - a[0]).map(([, parts]) => parts.sort((a, b) => a.x - b.x).map((part) => part.text).join(" ")));
  }
  const rows: ParsedRow[] = [];
  for (const line of lines) {
    const dateMatch = line.match(/\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})\b/);
    const amountMatches = [...line.matchAll(/\(?-?\d[\d,]*(?:\.\d{1,2})?\)?/g)];
    if (!dateMatch || !amountMatches.length) continue;
    const date = normalizeDate(dateMatch[1]);
    const amountMatch = amountMatches.at(-1)!;
    const amount = pdfAmount(amountMatch[0]);
    const description = line.slice((dateMatch.index ?? 0) + dateMatch[0].length, amountMatch.index).replace(/\s+/g, " ").trim();
    if (date && description && amount !== undefined) rows.push({ date, description: description.slice(0, 500), amount });
  }
  if (!rows.length) throw new Error("This PDF did not contain readable transaction rows. Export it as CSV or Excel, or use a text-based statement PDF.");
  return { rows, warnings: ["PDF rows were extracted from selectable text. Check the preview before saving; scanned-image PDFs are not supported."] };
}

function assertSafeWorkbookSize(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lowerBound = Math.max(0, bytes.byteLength - 65_557);
  let endRecord = -1;
  for (let offset = bytes.byteLength - 22; offset >= lowerBound; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) { endRecord = offset; break; }
  }
  if (endRecord < 0) throw new Error("The Excel workbook is incomplete or invalid.");
  const entryCount = view.getUint16(endRecord + 10, true);
  const directorySize = view.getUint32(endRecord + 12, true);
  const directoryOffset = view.getUint32(endRecord + 16, true);
  if (entryCount > 256 || directoryOffset + directorySize > endRecord) throw new Error("This workbook contains too many files or an invalid directory.");
  let offset = directoryOffset;
  let expandedBytes = 0;
  for (let index = 0; index < entryCount; index++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("The Excel workbook contains an invalid archive entry.");
    const expanded = view.getUint32(offset + 24, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    if (expanded === 0xffffffff || expanded > 25 * 1024 * 1024) throw new Error("An Excel workbook entry is too large to process.");
    expandedBytes += expanded;
    if (expandedBytes > 50 * 1024 * 1024) throw new Error("The expanded workbook is larger than the 50 MB processing limit.");
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  if (offset > directoryOffset + directorySize) throw new Error("The Excel workbook directory is inconsistent.");
}

function xmlDocument(source: string) {
  const document = new DOMParser().parseFromString(source, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("The Excel workbook contains invalid XML.");
  return document;
}

function workbookPath(target: string) {
  const segments = target.startsWith("/") ? [] : ["xl"];
  for (const segment of target.replace(/^\//, "").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return segments.join("/");
}

async function parseXlsx(file: File): Promise<ParseResult> {
  const { unzipSync } = await import("fflate");
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  assertSafeWorkbookSize(fileBytes);
  const entries = unzipSync(fileBytes);
  const decoder = new TextDecoder();
  const readXml = (path: string) => entries[path] ? decoder.decode(entries[path]) : undefined;
  const workbookXml = readXml("xl/workbook.xml");
  if (!workbookXml) throw new Error("No workbook index was found in this Excel file.");
  const workbook = xmlDocument(workbookXml);
  const relationId = workbook.getElementsByTagNameNS("*", "sheet")[0]?.getAttribute("r:id") ?? "rId1";
  const relationsXml = readXml("xl/_rels/workbook.xml.rels");
  const relation = relationsXml ? xmlDocument(relationsXml).getElementsByTagNameNS("*", "Relationship") : [];
  const target = [...relation].find((item) => item.getAttribute("Id") === relationId)?.getAttribute("Target");
  const sheetPath = target ? workbookPath(target) : "xl/worksheets/sheet1.xml";
  const sheetXml = readXml(sheetPath);
  if (!sheetXml) throw new Error("The first worksheet is missing from this Excel file.");

  const sharedStringsXml = readXml("xl/sharedStrings.xml");
  const sharedStrings = sharedStringsXml
    ? [...xmlDocument(sharedStringsXml).getElementsByTagNameNS("*", "si")].map((item) => [...item.getElementsByTagNameNS("*", "t")].map((text) => text.textContent ?? "").join(""))
    : [];
  const sheet = xmlDocument(sheetXml);
  const matrix = [...sheet.getElementsByTagNameNS("*", "sheetData")].flatMap((data) => [...data.getElementsByTagNameNS("*", "row")]).map((row) => {
    const cells: unknown[] = [];
    for (const cell of [...row.getElementsByTagNameNS("*", "c")]) {
      const ref = cell.getAttribute("r") ?? "A1";
      const letters = ref.match(/^[A-Z]+/)?.[0] ?? "A";
      const column = [...letters].reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1;
      const type = cell.getAttribute("t");
      const value = cell.getElementsByTagNameNS("*", "v")[0]?.textContent ?? "";
      const inline = [...cell.getElementsByTagNameNS("*", "t")].map((text) => text.textContent ?? "").join("");
      cells[column] = type === "s" ? sharedStrings[Number(value)] ?? "" : type === "inlineStr" ? inline : type === "b" ? value === "1" : value;
    }
    return cells;
  });
  if (!matrix.length) throw new Error("The first worksheet has no transaction rows.");
  const headers = matrix[0].map((value, index) => String(value ?? "").trim() || `Column ${index + 1}`);
  const records = matrix.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
  return normalizeRecords(records);
}

export async function parseStatementFile(file: File): Promise<ParseResult> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (file.size > 2_621_440) throw new Error("Each statement file is limited to 2.5 MB.");
  if (extension === "pdf") return parsePdf(file);
  if (extension === "csv") {
    const Papa = (await import("papaparse")).default;
    const parsed = Papa.parse<Record<string, unknown>>(await file.text(), { header: true, skipEmptyLines: "greedy", dynamicTyping: false });
    if (parsed.errors.length) throw new Error(`Could not read the CSV: ${parsed.errors[0].message}`);
    return normalizeRecords(parsed.data);
  }
  if (extension === "xlsx") return parseXlsx(file);
  throw new Error("Choose a CSV, Excel workbook, or text-based PDF statement.");
}

export async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function sha256File(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
