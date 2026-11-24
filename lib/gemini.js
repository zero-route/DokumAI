
export async function askGemini({
  system,
  prompt,
}) {
  const workerUrl = process.env.CLOUDFLARE_WORKER_URL;
  const secret = process.env.CLOUDFLARE_PROXY_SECRET;

  if (!workerUrl || !secret) {
    throw new Error("Cloudflare configuration is missing");
  }

  const response = await fetch(workerUrl, {
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
    signal: AbortSignal.timeout(60000),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error || result.details || "Gemini request failed"
    );
  }

  const answer = result.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!answer) {
    throw new Error("Gemini returned an empty response");
  }

  return answer;
}
