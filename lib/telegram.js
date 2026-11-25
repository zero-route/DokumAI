
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function telegram(method, body = {}) {
  if (!BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN belum dikonfigurasi.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${API_URL}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(
        result.description || `Telegram API error: ${response.status}`
      );
    }

    return result.result;
  } finally {
    clearTimeout(timeout);
  }
}

// Membagi pesan agar tidak melebihi batas Telegram.
function splitMessage(text, limit = 3900) {
  const characters = Array.from(String(text ?? ""));
  const chunks = [];

  while (characters.length > 0) {
    if (characters.length <= limit) {
      chunks.push(characters.join(""));
      break;
    }

    let splitAt = limit;

    // Prioritaskan pemotongan pada baris baru.
    const newlineIndex = characters
      .slice(0, limit)
      .lastIndexOf("\n");

    if (newlineIndex > limit * 0.5) {
      splitAt = newlineIndex + 1;
    } else {
      // Jika tidak ada baris baru, potong pada spasi.
      const spaceIndex = characters
        .slice(0, limit)
        .lastIndexOf(" ");

      if (spaceIndex > limit * 0.5) {
        splitAt = spaceIndex + 1;
      }
    }

    chunks.push(characters.slice(0, splitAt).join(""));
    characters.splice(0, splitAt);
  }

  return chunks;
}

// Mengirim pesan teks, otomatis membagi pesan panjang.
export async function sendMessage(chatId, text, options = {}) {
  const chunks = splitMessage(text);

  for (const chunk of chunks) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
      ...options
    });
  }
}

// Mengunduh dokumen dari Telegram.
export async function downloadTelegramFile(fileId) {
  const file = await telegram("getFile", {
    file_id: fileId
  });

  if (!file.file_path) {
    throw new Error("Lokasi file Telegram tidak ditemukan.");
  }

  const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

  const response = await fetch(fileUrl);

  if (!response.ok) {
    throw new Error(
      `Gagal mengunduh file Telegram: HTTP ${response.status}`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (!buffer.length) {
    throw new Error("File yang diunduh kosong.");
  }

  const MAX_SIZE = 20 * 1024 * 1024;

  if (buffer.length > MAX_SIZE) {
    throw new Error("Ukuran dokumen melebihi batas 20 MB.");
  }

  return buffer;
}
