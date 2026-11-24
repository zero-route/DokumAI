
export async function askGemini({ system, prompt }) {
  const workerUrl = process.env.CLOUDFLARE_WORKER_URL;
  const secret = process.env.CLOUDFLARE_PROXY_SECRET;

  if (!workerUrl || !secret) {
    throw new Error("Konfigurasi Cloudflare belum lengkap.");
  }

  const response = await fetch(workerUrl, {
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

  let result;

  try {
    result = await response.json();
  } catch {
    throw new Error("Cloudflare mengembalikan respons yang tidak valid.");
  }

  if (!response.ok) {
    console.error("Gemini API error:", response.status, result);

    throw new Error(
      result.error ||
      result.details ||
      `Gemini gagal memproses permintaan (${response.status}).`
    );
  }

  const answer = result.candidates?.[0]?.content?.parts
    ?.map(part => part.text || "")
    .join("")
    .trim();

  if (!answer) {
    throw new Error(
      "Gemini tidak menghasilkan jawaban. Coba ulangi permintaan."
    );
  }

  return answer;
}
