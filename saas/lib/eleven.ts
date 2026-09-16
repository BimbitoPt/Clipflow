export function elevenCost(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 1000);
}

export async function elevenTts(
  apiKey: string,
  voiceId: string,
  text: string,
): Promise<Buffer> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
    },
  );
  if (!res.ok) {
    throw new Error(`elevenlabs ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
