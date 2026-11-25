
export async function askGemini({ system, prompt }) {
  const workerUrl = process.env.CLOUDFLARE_WORKER_URL?.trim();
  const secret = process.env.CLOUDFLARE_PROXY_SECRET?.trim();

  // Validate environment variables
  const missing = [];

  if (!workerUrl) missing.push("CLOUDFLARE_WORKER_URL");
  if (!secret) missing.push("CLOUDFLARE_PROXY_SECRET");

  if (missing.length > 0) {
    console.error("Missing Cloudflare environment variables:", missing);

    throw new Error(
      `Konfigurasi Cloudflare belum lengkap: ${missing.join(", ")}`
    );
  }

  let response;

  // Send request to Cloudflare Worker
  try {
    response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${secret}`,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: system }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      }),
      signal: AbortSignal.timeout(55000),
    });
  } catch (error) {
    console.error("CLOUDFLARE CONNECTION ERROR:", {
      name: error?.name,
      message: error?.message,
    });

    throw new Error(
      error?.name === "TimeoutError"
        ? "Cloudflare Worker mengalami timeout."
        : `Gagal menghubungi Cloudflare Worker: ${error?.message || "Unknown error"}`
    );
  }

  // Read response safely
  const responseText = await response.text();

  let result;

  try {
    result = JSON.parse(responseText);
  } catch {
    console.error("INVALID WORKER RESPONSE:", {
      status: response.status,
      body: responseText.slice(0, 2000),
    });

    throw new Error(
      `Cloudflare mengembalikan respons tidak valid. HTTP ${response.status}.`
    );
  }

  // Handle upstream errors
  if (!response.ok) {
    console.error("GEMINI WORKER ERROR:", {
      httpStatus: response.status,
      errorType: result.errorType,
      workerError: result.error,
      geminiStatus: result.status,
      model: result.model,
      details: result.details,
    });

    const status = result.status || response.status;
    const details =
      result.details ||
      result.error ||
      "Tidak ada detail error dari Worker.";

    throw new Error(
      `Gemini gagal. HTTP: ${response.status}. ` +
      `Status Gemini: ${status}. ` +
      `Model: ${result.model || "Tidak diketahui"}. ` +
      `Detail: ${details}`
    );
  }

  // Extract generated text
  const answer = result.candidates?.[0]?.content?.parts
    ?.map((part) => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();

  if (!answer) {
    console.error("EMPTY GEMINI RESPONSE:", {
      model: result.model,
      finishReason: result.candidates?.[0]?.finishReason,
      promptFeedback: result.promptFeedback,
      responseKeys: Object.keys(result),
    });

    throw new Error(
      "Gemini berhasil dihubungi tetapi tidak menghasilkan teks rangkuman."
    );
  }

  return answer;
}
