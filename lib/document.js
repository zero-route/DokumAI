
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";
import XLSX from "xlsx";
import JSZip from "jszip";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_CHARACTERS = 100000;

const SUPPORTED_EXTENSIONS = [
  "pdf", "docx", "txt", "md", "markdown",
  "csv", "json", "xml", "html", "htm", "rtf",
  "xlsx", "xls", "pptx", "odt", "ods", "odp", "epub"
];

export function isSupportedDocument(filename = "") {
  if (typeof filename !== "string") return false;

  const extension = filename.toLowerCase().split(".").pop();
  return SUPPORTED_EXTENSIONS.includes(extension);
}

function cleanText(value = "") {
  return String(value)
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function decodeXml(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCodePoint(Number(n))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16))
    );
}

function stripHtml(html = "") {
  return decodeXml(
    String(html)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

function stripRtf(rtf = "") {
  return String(rtf)
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\tab/g, "\t")
    .replace(/\\'[0-9a-f]{2}/gi, "")
    .replace(/\\u-?\d+\??/g, "")
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, " ");
}

async function extractPDF(buffer) {
  let pdf;

  try {
    const task = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
      verbosity: 0
    });

    pdf = await task.promise;

    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();

      const pageText = content.items
        .filter(item => typeof item.str === "string")
        .map(item => item.str + (item.hasEOL ? "\n" : " "))
        .join("");

      pages.push(pageText);
      page.cleanup();
    }

    return pages.join("\n\n");
  } finally {
    if (pdf) {
      await pdf.destroy().catch(() => {});
    }
  }
}

async function extractDOCX(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

function extractSpreadsheet(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const output = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];

    output.push(`LEMBAR: ${sheetName}`);
    output.push(
      XLSX.utils.sheet_to_csv(sheet, {
        blankrows: false
      })
    );
  }

  return output.join("\n\n");
}

async function extractOfficeXml(buffer, extension) {
  const zip = await JSZip.loadAsync(buffer);
  const output = [];

  let files = [];

  if (extension === "pptx") {
    files = Object.keys(zip.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => {
        const na = Number(a.match(/slide(\d+)/i)?.[1] || 0);
        const nb = Number(b.match(/slide(\d+)/i)?.[1] || 0);
        return na - nb;
      });
  } else if (extension === "odt") {
    files = ["content.xml"].filter(name => zip.file(name));
  } else if (extension === "odp") {
    files = ["content.xml"].filter(name => zip.file(name));
  }

  for (const filename of files) {
    const xml = await zip.file(filename).async("string");

    const text = decodeXml(
      xml
        .replace(/<\/text:p>/gi, "\n")
        .replace(/<\/a:p>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
    );

    output.push(text);
  }

  return output.join("\n\n");
}

async function extractEPUB(buffer) {
  const zip = await JSZip.loadAsync(buffer);

  const files = Object.keys(zip.files)
    .filter(name => /\.(xhtml|html|htm)$/i.test(name))
    .sort();

  const output = [];

  for (const filename of files) {
    const html = await zip.file(filename).async("string");
    output.push(stripHtml(html));
  }

  return output.join("\n\n");
}

async function extractDocumentText(buffer, extension) {
  switch (extension) {
    case "pdf":
      return extractPDF(buffer);

    case "docx":
      return extractDOCX(buffer);

    case "txt":
    case "md":
    case "markdown":
    case "csv":
    case "json":
    case "xml":
      return buffer.toString("utf8");

    case "html":
    case "htm":
      return stripHtml(buffer.toString("utf8"));

    case "rtf":
      return stripRtf(buffer.toString("utf8"));

    case "xlsx":
    case "xls":
    case "ods":
      return extractSpreadsheet(buffer);

    case "pptx":
    case "odt":
    case "odp":
      return extractOfficeXml(buffer, extension);

    case "epub":
      return extractEPUB(buffer);

    default:
      throw new Error("Format dokumen tidak didukung.");
  }
}

export async function extractDocument(buffer, filename) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("File kosong atau tidak valid.");
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error("Ukuran file melebihi batas 20 MB.");
  }

  if (!filename || typeof filename !== "string") {
    throw new Error("Nama file tidak valid.");
  }

  const extension = filename.toLowerCase().split(".").pop();

  if (!isSupportedDocument(filename)) {
    throw new Error(
      "Format tidak didukung. Silakan kirim PDF, DOCX, TXT, MD, CSV, JSON, XML, HTML, RTF, XLSX, XLS, PPTX, ODT, ODS, ODP, atau EPUB."
    );
  }

  let extractedText;

  try {
    extractedText = await extractDocumentText(buffer, extension);
  } catch (error) {
    console.error("DOCUMENT EXTRACTION ERROR:", error);

    throw new Error(
      `Gagal membaca dokumen ${extension.toUpperCase()}: ${error.message || "File rusak atau tidak valid."}`
    );
  }

  const text = cleanText(extractedText);

  if (!text) {
    throw new Error(
      "Tidak ditemukan teks yang dapat dibaca di dalam dokumen."
    );
  }

  return {
    text: text.slice(0, MAX_CHARACTERS),
    truncated: text.length > MAX_CHARACTERS,
    originalCharacters: text.length
  };
}
