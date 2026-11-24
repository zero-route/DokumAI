
import { handleUpdate } from "../lib/handler.js";

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const receivedSecret =
    req.headers["x-telegram-bot-api-secret-token"];

  if (
    !expectedSecret ||
    receivedSecret !== expectedSecret
  ) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
    });
  }

  try {
    await handleUpdate(req.body);

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    console.error("Webhook error:", error);

    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}
