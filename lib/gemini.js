
export async function askGemini({ system, prompt }) {
  const workerUrl = process.env.CLOUDFLARE_WORKER_URL?.trim();
  const secret = process.env.CLOUDFLARE_PROXY_SECRET?.trim();

  const missing = [];

  if (!workerUrl) {
    missing.push("CLOUDFLARE_WORKER_URL");
  }

  if (!secret) {
    missing.push("CLOUDFLARE_PROXY_SECRET");
  }

  if (missing.length > 0) {
    console.error("Missing Cloudflare environment variables:", missing);

    throw new Error(
      `Konfigurasi Cloudflare belum lengkap. Variabel kosong: ${missing.join(", ")}`
    );
  }

  let response;

  try {
    response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${secret}`
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: system }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096
        }
      }),
      signal: AbortSignal.timeout(55000)
    });
  } catch (error) {
    console.error("Cloudflare connection error:", error);

    throw new Error(
      `Gagal menghubungi Cloudflare Worker: ${error.message}`
    );
  }

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error("Cloudflare mengembalikan respons tidak valid.");
  }

  if (!response.ok) {
  console.error("GEMINI REJECTION DEBUG:", {
    httpStatus: response.status,
    workerError: result.error,
    geminiStatus: result.status,
    details: result.details
  });

  throw new Error(
    `Gemini ditolak. HTTP: ${response.status}. ` +
    `Status Gemini: ${result.status || "Tidak diketahui"}. ` +
    `Detail: ${result.details || result.error || "Tidak tersedia"}`
  );
}

  const answer = result.candidates?.[0]?.content?.parts
    ?.map(part => part.text || "")
    .join("")
    .trim();

  if (!answer) {
    throw new Error("Gemini tidak menghasilkan jawaban.");
  }

  return answer;
}
