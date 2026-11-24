
const API = "https://api.telegram.org";

function getToken() {
  const value = process.env.TELEGRAM_BOT_TOKEN;

  if (!value) {
    throw new Error("TELEGRAM_BOT_TOKEN belum dikonfigurasi.");
  }

  return value;
}

export async function telegram(method, body = {}) {
  const response = await fetch(
    `${API}/bot${getToken()}/${method}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    }
  );

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error("Respons Telegram tidak valid.");
  }

  if (!response.ok || !result.ok) {
    throw new Error(
      result.description || `Telegram API error: ${response.status}`
    );
  }

  return result.result;
}

export async function sendMessage(chatId, text) {
  const message = String(text || "");

  if (!message.trim()) return;

  const characters = Array.from(message);
  const limit = 3900;

  for (let i = 0; i < characters.length; i += limit) {
    const chunk = characters.slice(i, i + limit).join("");

    await telegram("sendMessage", {
      chat_id: chatId,
      text: chunk
    });
  }
}

export async function downloadTelegramFile(fileId) {
  const file = await telegram("getFile", {
    file_id: fileId
  });

  if (!file.file_path) {
    throw new Error("Lokasi file Telegram tidak ditemukan.");
  }

  const response = await fetch(
    `${API}/file/bot${getToken()}/${file.file_path}`,
    {
      signal: AbortSignal.timeout(60000)
    }
  );

  if (!response.ok) {
    throw new Error("Gagal mengunduh dokumen dari Telegram.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (!buffer.length) {
    throw new Error("File yang diunduh kosong.");
  }

  if (buffer.length > 20 * 1024 * 1024) {
    throw new Error("Ukuran dokumen maksimal 20 MB.");
  }

  return buffer;
}
