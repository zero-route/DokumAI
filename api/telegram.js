
import { handleUpdate } from "../lib/handler.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method Not Allowed"
    });
  }

  try {
    const secret = req.headers[
      "x-telegram-bot-api-secret-token"
    ];

    if (
      !process.env.TELEGRAM_WEBHOOK_SECRET ||
      secret !== process.env.TELEGRAM_WEBHOOK_SECRET
    ) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized"
      });
    }

    await handleUpdate(req.body);

    return res.status(200).json({
      ok: true
    });

  } catch (error) {
    console.error("Telegram webhook error:", error);

    return res.status(500).json({
      ok: false,
      error: "Internal Server Error"
    });
  }
}
