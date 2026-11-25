
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";
import { OfficeParser } from "officeparser";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { createWorker } from "tesseract.js";

const MAX_CHARACTERS = 100000;
const MAX_ZIP_FILES = 25;
const MAX_ZIP_DEPTH = 2;

const SUPPORTED_EXTENSIONS = new Set([
  "pdf",
  "docx",
  "txt",
  "md",
  "rtf",
  "html",
  "htm",
  "csv",
  "xlsx",
  "xls",
  "pptx",
  "json",
  "xml",
  "odt",
  "ods",
  "odp",
  "epub",
  "zip",
  "jpg",
  "jpeg",
  "png",
  "webp"
]);

function getExtension(filename = "") {
  return filename.split(".").pop().toLowerCase();
}

function normalizeText(text = "") {
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(text = "") {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCodePoint(Number(n))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16))
    );
}

function htmlToText(html = "") {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

function xmlToText(xml = "") {
  return decodeEntities(
    xml
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  );
}

// ======================================================
// PDF
// ======================================================

async function extractPDF(buffer) {
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false
  });

  const pdf = await loadingTask.promise;
  const pages = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();

      const pageText = content.items
        .filter((item) => typeof item.str === "string")
        .map((item) => item.str)
        .join(" ");

      pages.push(
        `HALAMAN ${pageNumber}\n${pageText}`
      );

      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return pages.join("\n\n");
}

// ======================================================
// DOCX
// ======================================================

async function extractDOCX(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

// ======================================================
// EXCEL
// ======================================================

function extractSpreadsheet(buffer) {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    cellText: true
  });

  const output = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];

    const csv = XLSX.utils.sheet_to_csv(sheet, {
      blankrows: false,
      defval: ""
    });

    output.push(
      `SHEET: ${sheetName}\n${csv}`
    );
  }

  return output.join("\n\n");
}

// ======================================================
// OFFICE PARSER
// ======================================================

async function extractOffice(buffer, extension) {
  const ast = await OfficeParser.parseOffice(buffer, {
    fileType: extension
  });

  const result = await ast.to("text");

  return result?.value || "";
}

// ======================================================
// IMAGE OCR
// ======================================================

async function extractImage(buffer) {
  let worker;

  try {
    worker = await createWorker("eng+ind");

    const result = await worker.recognize(buffer);

    return result?.data?.text || "";
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}

// ======================================================
// ZIP
// ======================================================

async function extractZIP(buffer, depth = 0, counter = { count: 0 }) {
  if (depth > MAX_ZIP_DEPTH) {
    throw new Error("Arsip ZIP terlalu dalam.");
  }

  const zip = await JSZip.loadAsync(buffer);
  const output = [];

  const entries = Object.values(zip.files).filter(
    (entry) => !entry.dir
  );

  for (const entry of entries) {
    counter.count++;

    if (counter.count > MAX_ZIP_FILES) {
      output.push(
        "[Batas 25 file dalam arsip tercapai. Sebagian file tidak diproses.]"
      );
      break;
    }

    const extension = getExtension(entry.name);

    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      continue;
    }

    if (extension === "zip") {
      const nestedBuffer = await entry.async("nodebuffer");

      const nestedText = await extractZIP(
        nestedBuffer,
        depth + 1,
        counter
      );

      if (nestedText) {
        output.push(
          `FILE ARSIP: ${entry.name}\n${nestedText}`
        );
      }

      continue;
    }

    const fileBuffer = await entry.async("nodebuffer");

    const text = await extractByExtension(
      fileBuffer,
      extension,
      depth + 1,
      counter
    );

    if (text?.trim()) {
      output.push(
        `FILE: ${entry.name}\n${text}`
      );
    }
  }

  return output.join("\n\n");
}

// ======================================================
// FORMAT ROUTER
// ======================================================

async function extractByExtension(
  buffer,
  extension,
  depth = 0,
  counter = { count: 0 }
) {
  switch (extension) {
    case "pdf":
      return extractPDF(buffer);

    case "docx":
      return extractDOCX(buffer);

    case "xlsx":
    case "xls":
      return extractSpreadsheet(buffer);

    case "txt":
    case "md":
      return buffer.toString("utf8");

    case "json": {
      const parsed = JSON.parse(buffer.toString("utf8"));
      return JSON.stringify(parsed, null, 2);
    }

    case "xml":
      return xmlToText(buffer.toString("utf8"));

    case "html":
    case "htm":
      return htmlToText(buffer.toString("utf8"));

    case "jpg":
    case "jpeg":
    case "png":
    case "webp":
      return extractImage(buffer);

    case "zip":
      return extractZIP(buffer, depth, counter);

    case "doc":
      throw new Error(
        "Format DOC lama belum didukung. Simpan ulang sebagai DOCX."
      );

    case "ppt":
      throw new Error(
        "Format PPT lama belum didukung. Simpan ulang sebagai PPTX."
      );

    default:
      return extractOffice(buffer, extension);
  }
}

// ======================================================
// PUBLIC FUNCTION
// ======================================================

export async function extractDocument(buffer, filename) {
  if (!Buffer.isBuffer(buffer)) {
    buffer = Buffer.from(buffer);
  }

  const extension = getExtension(filename);

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error(
      `Format .${extension} belum didukung oleh DokumAI.`
    );
  }

  if (buffer.length === 0) {
    throw new Error("File kosong.");
  }

  const rawText = await extractByExtension(
    buffer,
    extension
  );

  const normalized = normalizeText(rawText);

  if (!normalized) {
    throw new Error(
      "Tidak ditemukan teks dalam dokumen. Jika ini PDF hasil scan, gunakan gambar atau PDF yang sudah memiliki teks OCR."
    );
  }

  const originalCharacters = normalized.length;

  const truncated = originalCharacters > MAX_CHARACTERS;

  const text = truncated
    ? normalized.slice(0, MAX_CHARACTERS)
    : normalized;

  return {
    text,
    truncated,
    originalCharacters
  };
}

export function isSupportedDocument(filename = "") {
  return SUPPORTED_EXTENSIONS.has(
    getExtension(filename)
  );
}
