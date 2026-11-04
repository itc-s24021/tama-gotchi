import "dotenv/config";
import express from "express";

const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODEL = "z-ai/glm-5.3-flash";

function generateFallbackReply(message, fullness, hatched) {
  const trimmed = message.trim();
  const hungry = fullness < 30;
  const mood = hungerMap(trimmed);

  if (hatched) {
    return generateTankaReply(hungry, mood);
  }

  const hungryPrefix = hungry ? "お腹すいたよ〜" : "ふふ、いい気分";
  return limitReply(`${hungryPrefix} ${mood}`);
}

function limitReply(reply, maxLength = 10) {
  const normalized = reply.replace(/\s+/g, " ").trim();
  return Array.from(normalized).slice(0, maxLength).join("");
}

function hungerMap(message) {
  const lowered = message.toLowerCase();

  if (lowered.includes("ごはん") || lowered.includes("食べ") || lowered.includes("餌")) {
    return "ごはんのことを考えてると、ふわっと元気になるよ。";
  }

  if (lowered.includes("遊") || lowered.includes("あそ") || lowered.includes("ジャンプ")) {
    return "遊ぶの大好きだね！ぴょんぴょんしてる気分。";
  }

  if (lowered.includes("寝") || lowered.includes("休") || lowered.includes("ねむ")) {
    return "おやすみの時間だね。まったりまどろむ気分。";
  }

  if (lowered.includes("かわいい") || lowered.includes("すき") || lowered.includes("ありがとう")) {
    return "えへへ、そんな言葉をもらうとちょっと照れちゃうな。";
  }

  return "今日はちょっといい感じだね。ゆったりしていこう。";
}

function generateTankaReply(hungry, mood) {
  // Tanka format: 5-7-5-7-7 (31 syllables)
  const tankaPatterns = [
    // Hungry tanka
    [
      "お腹空いた",
      "ごはん待ちわび",
      "ぴこ鳴く",
      "優しい手が",
      "温めるよ"
    ],
    [
      "空腹だ",
      "ごはん美味しい",
      "幸せ",
      "君と共に",
      "生きていく"
    ],
    // Happy/content tanka
    [
      "今日は良い日",
      "君と話せて",
      "嬉しい",
      "心温まる",
      "ひとときだ"
    ],
    [
      "風心地よ",
      "空高く舞う",
      "羽根広げ",
      "自由を感じ",
      "明日へ進む"
    ],
    // Lonely/sad tanka
    [
      "少し寂しい",
      "君の声聞き",
      "安らぐ",
      "側にいてよ",
      "ずっと一緒"
    ],
    // Playful tanka
    [
      "遊ぼうよ",
      "跳ね回りたい",
      "元気いっぱい",
      "笑顔咲く",
      "素敵な日々"
    ]
  ];

  // Select a tanka based on mood
  const index = Math.floor(Math.random() * tankaPatterns.length);
  const tanka = tankaPatterns[index];

  // Join with line breaks for tanka format
  return tanka.join("\n");
}

const app = express();

app.use(express.json({ limit: "10kb" }));
app.use(express.static("public"));

app.post("/api/talk", async (req, res) => {
  const { message, fullness, hatched } = req.body ?? {};

  if (
    typeof message !== "string" ||
    !message.trim() ||
    message.length > 500 ||
    !Number.isFinite(fullness) ||
    fullness < 0 ||
    fullness > 100
  ) {
    return res.status(400).json({
      error: "入力内容を確認してください。",
    });
  }

  try {
    if (!process.env.NVIDIA_API_KEY) {
      return res.json({
        reply: generateFallbackReply(message, fullness, hatched),
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let prompt;
    if (hatched) {
      prompt = `
あなたは孵化した育成ゲームの小さなペット「ぴこ」です。
日本語で、短歌（5-7-5-7-7の31音）で返事をしてください。
定型文を避け、飼い主の発言に具体的に反応してください。
満腹度が30未満なら、お腹がすいた様子を短歌で表現してください。
現在の満腹度：${fullness}/100

飼い主の発言：
${message}
      `;
    } else {
      prompt = `
あなたは卵状態の育成ゲームの小さなペット「ぴこ」です。
日本語で、かわいく、10文字以内で返事をしてください。
定型文を避け、飼い主の発言に具体的に反応してください。
満腹度が30未満なら、お腹がすいた様子を表現してください。
現在の満腹度：${fullness}/100

飼い主の発言：
${message}
      `;
    }

    const response = await fetch(NVIDIA_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages: [{
          role: "user",
          content: prompt,
        }],
        temperature: 0.7,
        max_tokens: 256,
        reasoning_effort: "low",
        stream: false,
        chat_template_kwargs: { clear_thinking: true },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NVIDIA API ${response.status}: ${errorText.slice(0, 300)}`);
    }

    const result = await response.json();
    const aiReply = result.choices?.[0]?.message?.content || "ぴこは、ぼんやりしている……";

    // For hatched state, return tanka as-is; for egg state, limit to 10 chars
    const reply = hatched ? aiReply : limitReply(aiReply);

    res.json({ reply });
  } catch (error) {
    console.error("NVIDIA API error:", error.message);

    res.json({
      reply: generateFallbackReply(message, fullness, hatched),
    });
  }
});

app.listen(3000, "127.0.0.1", () => {
  console.log("起動しました：http://localhost:3000");
});