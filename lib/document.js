
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_CHARACTERS = 100000;

function cleanText(text) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function extractPDF(buffer) {
  let pdf;

  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
      verbosity: 0
    });

    pdf = await loadingTask.promise;

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

  } catch (error) {
    console.error("PDF extraction error:", error);

    throw new Error(
      "PDF tidak dapat dibaca. Coba ekspor ulang dokumen sebagai PDF standar. " +
      "Jika PDF berupa hasil scan, diperlukan OCR."
    );

  } finally {
    if (pdf) {
      await pdf.destroy().catch(() => {});
    }
  }
}

async function extractDOCX(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });

    return result.value || "";

  } catch (error) {
    console.error("DOCX extraction error:", error);
    throw new Error(
      "Dokumen DOCX tidak dapat dibaca. Pastikan file tidak rusak."
    );
  }
}

export async function extractDocument(buffer, filename) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("File kosong atau tidak valid.");
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error("Ukuran dokumen maksimal 20 MB.");
  }

  if (!filename || typeof filename !== "string") {
    throw new Error("Nama file tidak valid.");
  }

  const extension = filename.toLowerCase().split(".").pop();

  let extractedText = "";

  if (extension === "pdf") {
    extractedText = await extractPDF(buffer);
  } else if (extension === "docx") {
    extractedText = await extractDOCX(buffer);
  } else {
    throw new Error("Format tidak didukung. Gunakan PDF atau DOCX.");
  }

  const text = cleanText(extractedText);

  if (!text) {
    throw new Error(
      "Tidak ditemukan teks dalam dokumen. Jika PDF berupa hasil scan, OCR diperlukan."
    );
  }

  return {
    text: text.slice(0, MAX_CHARACTERS),
    truncated: text.length > MAX_CHARACTERS,
    originalCharacters: text.length
  };
}
