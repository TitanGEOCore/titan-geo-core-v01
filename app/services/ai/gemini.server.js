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

  // Build deep context section if available
  const deepContextSection = product.deepContext
    ? `\n\nDEEP CONTEXT (Metafields & Custom Data):\n${product.deepContext}`
    : "";
  const collectionsSection = product.collections?.length
    ? `\n- Collections: ${product.collections.join(", ")}`
    : "";
  const variantDetails = product.variants?.length > 1
    ? `\n- Variants: ${product.variants.map(v => `${v.title || ""} (${v.price || "N/A"})`).join(", ")}`
    : "";
  const variantOptions = product.variants?.[0]?.selectedOptions?.length
    ? `\n- Options: ${product.variants[0].selectedOptions.map(o => `${o.name}: ${o.value}`).join(", ")}`
    : "";

  // Manual context from Product Context Builder quiz
  const manualSection = product.manualContext ? `

MERCHANT-PROVIDED CONTEXT (HIGH PRIORITY — use this as primary source):
- Product Description: ${product.manualContext.description || "N/A"}
- USP & Features: ${product.manualContext.usp || "N/A"}
- Target Audience: ${product.manualContext.audience || "N/A"}
- Brand Vibe: ${product.manualContext.vibe || "N/A"}
- Keywords: ${product.manualContext.keywords || "N/A"}` : "";

  // Scraped live page context
  const scrapedSection = product.scrapedContext
    ? `\n\nLIVE PAGE CONTENT (scraped from the store's product page — use for additional context):\n${product.scrapedContext.substring(0, 2000)}`
    : "";

  const userPrompt = `Optimize this product for Generative Engine Optimization:

CURRENT PRODUCT DATA:
- Title: ${product.title}
- Vendor: ${product.vendor || "N/A"}
- Product Type: ${product.productType || "N/A"}
- Tags: ${product.tags?.join(", ") || "N/A"}${collectionsSection}
- Current Description HTML:
${product.descriptionHtml || "No description"}
- Price: ${product.variants?.[0]?.price || "N/A"}
- SKU: ${product.variants?.[0]?.sku || "N/A"}
- URL Handle: ${product.handle || "N/A"}${variantDetails}${variantOptions}${deepContextSection}${manualSection}${scrapedSection}

CRITICAL: The optimizedMetaDesc MUST be under 160 characters. The optimizedTitle SHOULD be under 70 characters.

Generate the fully optimized output.`;

  let response;
  try {
    response = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: buildSystemPrompt(settings),
        responseMimeType: "application/json",
        responseSchema: GEO_RESPONSE_SCHEMA,
        temperature: 0.4,
      },
    });
  } catch (apiError) {
    console.error("Gemini API error:", apiError.message);
    return {
      geoScore: 0,
      optimizedTitle: product.title || "Product",
      optimizedMetaDesc: "Optimized product description",
      optimizedHtmlBody: sanitizeHtml(product.descriptionHtml || "<p>Product description</p>"),
      jsonLdSchema: {},
      _apiError: true,
    };
  }

  let result;
  try {
    let responseText = (response.text || "").trim();
    // Strip markdown code fences if Gemini wraps the JSON
    if (responseText.startsWith("```")) {
      responseText = responseText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?\s*```$/, "");
    }
    result = JSON.parse(responseText);
  } catch (parseError) {
    console.error("Gemini JSON parse error:", parseError.message);
    console.error("Raw response:", response.text?.substring(0, 500));
    return {
      geoScore: 0,
      optimizedTitle: product.title || "Product",
      optimizedMetaDesc: "Optimized product description",
      optimizedHtmlBody: sanitizeHtml(product.descriptionHtml || "<p>Product description</p>"),
      jsonLdSchema: {},
      _parseError: true,
    };
  }

  result.optimizedHtmlBody = sanitizeHtml(result.optimizedHtmlBody);

  // Enforce meta character limits
  if (result.optimizedTitle && result.optimizedTitle.length > 70) {
    result.optimizedTitle = result.optimizedTitle.substring(0, 67).replace(/\s+\S*$/, "") + "...";
  }
  if (result.optimizedMetaDesc && result.optimizedMetaDesc.length > 160) {
    result.optimizedMetaDesc = result.optimizedMetaDesc.substring(0, 157).replace(/\s+\S*$/, "") + "...";
  }

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

  let response;
  try {
    response = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: buildSystemPrompt(settings),
        responseMimeType: "application/json",
        responseSchema: GEO_RESPONSE_SCHEMA,
        temperature: 0.2,
      },
    });
  } catch (apiError) {
    console.error("Gemini API error in audit:", apiError.message);
    return {
      geoScore: 0,
      optimizedTitle: product.title || "Product",
      optimizedMetaDesc: "Product meta description",
      optimizedHtmlBody: sanitizeHtml(product.descriptionHtml || "<p>Product description</p>"),
      jsonLdSchema: {},
      _apiError: true,
    };
  }

  let auditResult;
  try {
    let responseText = (response.text || "").trim();
    if (responseText.startsWith("```")) {
      responseText = responseText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?\s*```$/, "");
    }
    auditResult = JSON.parse(responseText);
  } catch (parseError) {
    console.error("Gemini JSON parse error in audit:", parseError.message);
    console.error("Raw response:", response.text?.substring(0, 500));
    return {
      geoScore: 0,
      optimizedTitle: product.title || "Product",
      optimizedMetaDesc: "Product meta description",
      optimizedHtmlBody: sanitizeHtml(product.descriptionHtml || "<p>Product description</p>"),
      jsonLdSchema: {},
      _parseError: true,
    };
  }

  // Sanitize HTML output consistently
  if (auditResult.optimizedHtmlBody) {
    auditResult.optimizedHtmlBody = sanitizeHtml(auditResult.optimizedHtmlBody);
  }

  return auditResult;
}
