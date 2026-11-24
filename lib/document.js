
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

export async function extractDocument(buffer, filename) {
  const extension = filename.toLowerCase().split(".").pop();

  let text = "";

  if (extension === "pdf") {
    const result = await pdfParse(buffer);
    text = result.text;
  } else if (extension === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else {
    throw new Error("Format tidak didukung. Gunakan PDF atau DOCX.");
  }

  text = text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text) {
    throw new Error(
      "Tidak ditemukan teks. Jika PDF berupa hasil scan, OCR diperlukan."
    );
  }

  // Batas konteks awal untuk menjaga ukuran request AI.
  const maxCharacters = 100000;

  return {
    text: text.slice(0, maxCharacters),
    truncated: text.length > maxCharacters,
    originalCharacters: text.length,
  };
}
