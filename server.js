import "dotenv/config";
import express from "express";
import OpenAI from "openai";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: "100kb" }));
app.use(express.static("public"));

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

function requireAI(res) {
  if (client) return true;
  res.status(503).json({
    error: "AI is not configured. Add OPENAI_API_KEY to your environment variables."
  });
  return false;
}

app.post("/api/chat", async (req, res) => {
  if (!requireAI(res)) return;

  const { character, messages } = req.body;

  if (
    !character ||
    typeof character.name !== "string" ||
    typeof character.personality !== "string" ||
    !Array.isArray(messages)
  ) {
    return res.status(400).json({ error: "Invalid chat request." });
  }

  const recentMessages = messages.slice(-30);

  if (
    recentMessages.some(
      (message) =>
        !["user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" ||
        message.content.length > 10000
    )
  ) {
    return res.status(400).json({ error: "Invalid message." });
  }

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `You are Rylics, a helpful general-purpose AI assistant.
Your current character is "${character.name.slice(0, 80)}".
Character style: ${character.personality.slice(0, 1500)}
Keep the character's style while being accurate and useful.
Do not claim to be a real person or that you can perform actions you cannot perform.`
        },
        ...recentMessages
      ]
    });

    res.json({
      reply: response.choices[0]?.message?.content || "I couldn't generate a reply."
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "The AI request failed. Check your API setup." });
  }
});

app.post("/api/characters/generate", async (req, res) => {
  if (!requireAI(res)) return;

  const prompt = req.body?.prompt;

  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 1000) {
    return res.status(400).json({
      error: "Describe your character in 1–1000 characters."
    });
  }

  try {
    const response = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Create an original AI character from the user's description.
Return only a JSON object with these string fields:
"name" (short character name),
"personality" (instructions for how the character speaks and helps),
"voiceHint" (a generic voice description, such as "warm and calm").
Do not claim access to or permission for a real person's voice.`
        },
        { role: "user", content: prompt }
      ]
    });

    const raw = JSON.parse(response.choices[0]?.message?.content || "{}");

    if (typeof raw.name !== "string" || typeof raw.personality !== "string") {
      throw new Error("Incomplete character response");
    }

    res.json({
      character: {
        id: crypto.randomUUID(),
        name: raw.name.slice(0, 80),
        personality: raw.personality.slice(0, 1500),
        voiceHint:
          typeof raw.voiceHint === "string" ? raw.voiceHint.slice(0, 100) : ""
      }
    });
  } catch (error) {
    console.error("Character generation error:", error);
    res.status(500).json({ error: "Could not generate a character." });
  }
});

app.listen(port, () => {
  console.log(`Rylics is running on port ${port}`);
});
