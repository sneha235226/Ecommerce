const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Generate description + shortDescription for a product.
 * Returns { description, shortDescription } — never throws (returns null on failure).
 */
async function generateProductDescription({ title, brand, category, subcategory, attributes, specifications }) {
    const lines = [`Product Title: ${title}`];
    if (brand) lines.push(`Brand: ${brand}`);
    if (category) lines.push(`Category: ${category}`);
    if (subcategory) lines.push(`Subcategory: ${subcategory}`);

    if (attributes && attributes.length) {
        lines.push("\nAttributes:");
        for (const attr of attributes) {
            lines.push(`- ${attr.name || attr.key}: ${attr.value}`);
        }
    }

    if (specifications && specifications.length) {
        lines.push("\nSpecifications:");
        for (const spec of specifications) {
            lines.push(`- ${spec.name || spec.key}: ${spec.value}`);
        }
    }

    const prompt = `${lines.join("\n")}

Generate a professional ecommerce product description.
Rules:
- description: 2-3 sentences max, engaging and SEO-friendly.
- shortDescription: 1 sentence max, under 20 words.

Return ONLY valid JSON in this exact format, no extra text:
{
  "description": "...",
  "shortDescription": "..."
}`;

    try {
        const response = await client.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1024,
            messages: [{ role: "user", content: prompt }]
        });

        const text = response.content[0].text.trim();
        // Strip markdown code fences if present
        const jsonText = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
        const parsed = JSON.parse(jsonText);

        return {
            description: parsed.description || "",
            shortDescription: parsed.shortDescription || ""
        };
    } catch (err) {
        console.error("AI description generation failed:", err.message);
        return null;
    }
}

module.exports = { generateProductDescription };
