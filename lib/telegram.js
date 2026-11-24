
const API = "https://api.telegram.org";

function token() {
  const value = process.env.TELEGRAM_BOT_TOKEN;
  if (!value) throw new Error("TELEGRAM_BOT_TOKEN is missing");
  return value;
}

export async function telegram(method, body = {}) {
  const response = await fetch(
    `${API}/bot${token()}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.description || "Telegram API error");
  }

  return result.result;
}

export async function sendMessage(chatId, text) {
  const limit = 4000;
  const chunks = [];

  for (let i = 0; i < text.length; i += limit) {
    chunks.push(text.slice(i, i + limit));
  }

  for (const chunk of chunks) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: chunk,
    });
  }
}

export async function downloadTelegramFile(fileId) {
  const file = await telegram("getFile", {
    file_id: fileId,
  });

  if (!file.file_path) {
    throw new Error("Telegram file path unavailable");
  }

  const response = await fetch(
    `${API}/file/bot${token()}/${file.file_path}`
  );

  if (!response.ok) {
    throw new Error("Failed to download Telegram document");
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length > 20 * 1024 * 1024) {
    throw new Error("Dokumen melebihi batas 20 MB");
  }

  return buffer;
}
