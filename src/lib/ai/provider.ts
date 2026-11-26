import { getServerConfig } from "@/lib/config";

export interface LLMCompletionOptions {
  systemPrompt: string;
  userPrompt: string;
  jsonMode?: boolean;
  providerOverride?: "auto" | "gemini" | "openai" | "nvidia";
  apiKeyOverride?: string;
}

export interface LLMCompletionResult {
  text: string;
  engine: string;
}

/**
 * Strip potential prompt-injection directives embedded inside external transcripts.
 */
export function sanitizeUntrustedTranscript(raw: string): string {
  return (raw || "")
    .replace(/<\/?(system|assistant|developer|instruction)[^>]*>/gi, "")
    .replace(/ignore\s+(all\s+)?previous\s+instructions/gi, "[redacted-phrase]")
    .trim();
}

export function extractJsonFromLLM<T>(rawText: string): T {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
    }
    throw new Error("Model response did not contain valid JSON");
  }
}

export async function runLLMCompletion(
  opts: LLMCompletionOptions
): Promise<LLMCompletionResult | null> {
  const cfg = getServerConfig();
  const provider =
    opts.providerOverride ||
    (cfg.aiProvider as "auto" | "gemini" | "openai" | "nvidia");

  const nvidiaKey =
    (provider === "nvidia" && opts.apiKeyOverride) || cfg.nvidiaKey;
  const geminiKey =
    (provider === "gemini" && opts.apiKeyOverride) || cfg.geminiKey;
  const openaiKey =
    (provider === "openai" && opts.apiKeyOverride) || cfg.openaiKey;

  const shouldTryNvidia =
    Boolean(nvidiaKey) && (provider === "nvidia" || provider === "auto");
  const shouldTryGemini =
    Boolean(geminiKey) &&
    (provider === "gemini" || (provider === "auto" && !shouldTryNvidia));
  const shouldTryOpenAI =
    Boolean(openaiKey) &&
    (provider === "openai" ||
      (provider === "auto" && !shouldTryNvidia && !shouldTryGemini));

  if (shouldTryNvidia && nvidiaKey) {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${nvidiaKey}`,
      },
      body: JSON.stringify({
        model: cfg.nvidiaModel,
        max_tokens: 2048,
        temperature: 0.2,
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`NVIDIA NIM API ${res.status}: ${errBody.slice(0, 180)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content || "";
    if (text) return { text, engine: `NVIDIA NIM (${cfg.nvidiaModel})` };
  }

  if (shouldTryGemini && geminiKey) {
    const candidateModels = Array.from(
      new Set([cfg.geminiModel, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash"])
    );
    let lastError = "";

    for (const modelName of candidateModels) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        modelName
      )}:generateContent?key=${encodeURIComponent(geminiKey)}`;

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: opts.systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: opts.userPrompt }] }],
            generationConfig: opts.jsonMode
              ? { responseMimeType: "application/json" }
              : undefined,
          }),
          signal: AbortSignal.timeout(45000),
        });

        if (!res.ok) {
          const errBody = await res.text();
          lastError = `Gemini API ${res.status} (${modelName}): ${errBody.slice(0, 180)}`;
          if ([404, 429, 500, 503].includes(res.status)) continue;
          throw new Error(lastError);
        }

        const json = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (text) return { text, engine: `Gemini (${modelName})` };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        continue;
      }
    }

    if (lastError) throw new Error(lastError);
  }

  if (shouldTryOpenAI && openaiKey) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: cfg.openaiModel,
        response_format: opts.jsonMode ? { type: "json_object" } : undefined,
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenAI API ${res.status}: ${errBody.slice(0, 180)}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content || "";
    if (text) return { text, engine: `OpenAI (${cfg.openaiModel})` };
  }

  return null;
}
