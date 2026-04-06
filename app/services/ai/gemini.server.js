import { GoogleGenAI } from "@google/genai";
import prisma from "../../db.server.js";
import { sanitizeHtml } from "../core/sanitizer.server.js";

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const GEO_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    geoScore: {
      type: "number",
      description: "GEO optimization score from 0-100",
    },
    optimizedTitle: {
      type: "string",
      description: "SEO/GEO optimized product title",
    },
    optimizedMetaDesc: {
      type: "string",
      description: "Meta description optimized for generative engines, max 160 chars",
    },
    optimizedHtmlBody: {
      type: "string",
      description: "Full HTML product description optimized for GEO",
    },
    jsonLdSchema: {
      type: "object",
      description: "Complete JSON-LD Product schema markup",
    },
  },
  required: [
    "geoScore",
    "optimizedTitle",
    "optimizedMetaDesc",
    "optimizedHtmlBody",
    "jsonLdSchema",
  ],
};

/**
 * Build the system prompt incorporating Brand DNA settings.
 */
function buildSystemPrompt(settings) {
  const brandVoice = settings?.brandVoice || "Professional, authoritative, precise";
  const targetAudience = settings?.targetAudience || "General consumer";
  const noGos = settings?.noGos || "None specified";

  return `You are Titan GEO Core — an elite Generative Engine Optimization system.
Your mission: optimize product content so it gets cited by AI engines (ChatGPT, Perplexity, Gemini, etc.) as THE authoritative answer.

## BRAND DNA (ABSOLUTE LAW — NEVER VIOLATE)
- Brand Voice: ${brandVoice}
- Target Audience: ${targetAudience}
- No-Gos (FORBIDDEN — never use these words, phrases, or tones): ${noGos}

## GEO OPTIMIZATION RULES
1. Structure content with clear H2/H3 hierarchy for AI parsability.
2. Lead with the definitive answer — AI engines cite confident, direct statements.
3. Include entity-rich descriptions (brand, materials, specs, use cases).
4. Use comparison anchors ("Unlike X, this product...") for citation triggers.
5. Embed FAQ-style content naturally — AI engines love question-answer patterns.
6. Write meta descriptions that function as standalone, citable summaries.
7. Generate complete JSON-LD Product schema with all available data points.
8. The HTML body must be clean, semantic HTML5 — no inline styles, no scripts.
9. Score the optimization from 0-100 based on GEO readiness.

## TONE
Quiet-dominant. Precise. No fluff. Every word earns its place.

Respond ONLY with the structured JSON output. No commentary.`;
}

/**
 * Run GEO audit and optimization on a product.
 * @param {string} shop - The shop domain.
 * @param {object} product - Product data from Shopify (title, descriptionHtml, vendor, productType, etc.).
 * @returns {Promise<object>} The GEO optimization result.
 */
export async function optimizeProduct(shop, product) {
  const settings = await prisma.shopSettings.findUnique({ where: { shop } });

  const userPrompt = `Optimize this product for Generative Engine Optimization:

CURRENT PRODUCT DATA:
- Title: ${product.title}
- Vendor: ${product.vendor || "N/A"}
- Product Type: ${product.productType || "N/A"}
- Tags: ${product.tags?.join(", ") || "N/A"}
- Current Description HTML:
${product.descriptionHtml || "No description"}
- Price: ${product.variants?.[0]?.price || "N/A"}
- SKU: ${product.variants?.[0]?.sku || "N/A"}
- URL Handle: ${product.handle || "N/A"}

Generate the fully optimized output.`;

  const response = await genai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: userPrompt,
    config: {
      systemInstruction: buildSystemPrompt(settings),
      responseMimeType: "application/json",
      responseSchema: GEO_RESPONSE_SCHEMA,
      temperature: 0.4,
    },
  });

  const result = JSON.parse(response.text);

  result.optimizedHtmlBody = sanitizeHtml(result.optimizedHtmlBody);

  return result;
}

/**
 * Quick GEO score audit without full optimization.
 */
export async function auditProduct(shop, product) {
  const settings = await prisma.shopSettings.findUnique({ where: { shop } });

  const userPrompt = `Analyze this product's GEO readiness and return ONLY a score and brief assessment.

PRODUCT:
- Title: ${product.title}
- Description: ${product.descriptionHtml || "No description"}
- Vendor: ${product.vendor || "N/A"}
- Type: ${product.productType || "N/A"}

Return the geoScore (0-100), the current title as optimizedTitle, current meta as optimizedMetaDesc, current HTML as optimizedHtmlBody, and an empty jsonLdSchema object.`;

  const response = await genai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: userPrompt,
    config: {
      systemInstruction: buildSystemPrompt(settings),
      responseMimeType: "application/json",
      responseSchema: GEO_RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  });

  return JSON.parse(response.text);
}
