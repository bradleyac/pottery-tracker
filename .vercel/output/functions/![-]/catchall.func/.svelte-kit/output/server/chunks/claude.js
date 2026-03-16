import Anthropic from "@anthropic-ai/sdk";
import { g as getSignedUrl } from "./storage.js";
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});
const MODEL = "claude-sonnet-4-6";
const MATCH_SYSTEM_PROMPT = `You are an expert pottery analyst helping potters track their ceramic pieces over time.
Your task is to determine whether a new photo shows an existing piece or a new one.

When analyzing pottery, focus on:
- Overall shape and form type (bowl, vase, mug, plate, etc.)
- Rim profile and foot ring details
- Surface texture and clay body characteristics
- Glaze color, finish, and distinctive drip patterns
- Any unique marks, stamps, handles, or decorative elements
- Size proportions relative to other objects if visible

IMPORTANT: Pottery changes appearance dramatically across stages:
- Greenware (raw clay): matte grey/brown, rough texture
- Bisqueware: lighter, chalky, still matte
- Glazed/fired: glassy, colorful, final form

A match across stages is valid if the underlying shape and distinctive features align.

CRITICAL: You must respond with ONLY valid JSON, no other text before or after.
Return this exact structure:
{
  "matchedPieceId": "<uuid string or null if no match>",
  "confidence": <number between 0 and 1>,
  "reasoning": "<brief explanation of your decision>",
  "suggestedName": "<suggested name if new piece, empty string if matched>",
  "updatedDescription": "<dense visual fingerprint for future matching: shape, form, texture, glaze, distinctive features>"
}

Rules:
- Set matchedPieceId to null when confidence < 0.60 (treat as new piece)
- Confidence 0.60-0.79: possible match, note uncertainty in reasoning
- Confidence 0.80+: confident match
- updatedDescription should be 2-4 sentences covering all visually distinctive features`;
async function matchImageToPieces(imageBuffer, mediaType, existingPieces) {
  const piecesText = existingPieces.length === 0 ? "No existing pieces yet." : existingPieces.map(
    (p, i) => `${i + 1}. ID: ${p.id}
   Name: ${p.name}
   Description: ${p.ai_description ?? "No description yet"}`
  ).join("\n\n");
  const referenceImages = [];
  const piecesWithCovers = existingPieces.filter((p) => p.cover_storage_path).slice(0, 3);
  for (const piece of piecesWithCovers) {
    try {
      const signedUrl = await getSignedUrl(piece.cover_storage_path);
      const response2 = await fetch(signedUrl);
      if (response2.ok) {
        const arrayBuffer = await response2.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const rawContentType = response2.headers.get("content-type") || "image/jpeg";
        const contentType = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(rawContentType) ? rawContentType : "image/jpeg";
        referenceImages.push({
          type: "image",
          source: {
            type: "base64",
            media_type: contentType,
            data: base64
          }
        });
      }
    } catch {
    }
  }
  const base64Image = imageBuffer.toString("base64");
  const userContent = [
    {
      type: "text",
      text: `Here is the new pottery photo to analyze:`
    },
    {
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: base64Image
      }
    }
  ];
  if (referenceImages.length > 0) {
    userContent.push({
      type: "text",
      text: `
Here are reference photos of existing pieces (in the same order as the list below):`
    });
    for (const img of referenceImages) {
      userContent.push(img);
    }
  }
  userContent.push({
    type: "text",
    text: `
Existing pieces:
${piecesText}

Does the new photo match any existing piece? Return only JSON.`
  });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: MATCH_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }]
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const result = parseClaudeJson(text);
  if (result.matchedPieceId) {
    const exists = existingPieces.some((p) => p.id === result.matchedPieceId);
    if (!exists) {
      result.matchedPieceId = null;
      result.confidence = 0;
    }
  }
  return result;
}
async function describeNewPiece(imageBuffer, mediaType) {
  const base64Image = imageBuffer.toString("base64");
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64Image }
          },
          {
            type: "text",
            text: `Describe this pottery piece in 2-4 sentences focusing on: form type, shape details, texture, glaze/surface treatment, color, and any distinctive markings. Be specific enough that future photos of the same piece (possibly at different stages: greenware, bisque, or glazed) could be matched to this description. Return only the description text.`
          }
        ]
      }
    ]
  });
  return response.content[0].type === "text" ? response.content[0].text : "";
}
function parseClaudeJson(text) {
  const cleaned = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      matchedPieceId: parsed.matchedPieceId ?? null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      reasoning: parsed.reasoning ?? "",
      suggestedName: parsed.suggestedName ?? "",
      updatedDescription: parsed.updatedDescription ?? ""
    };
  } catch {
    return {
      matchedPieceId: null,
      confidence: 0,
      reasoning: "Failed to parse Claude response",
      suggestedName: "New Piece",
      updatedDescription: ""
    };
  }
}
export {
  describeNewPiece as d,
  matchImageToPieces as m
};
