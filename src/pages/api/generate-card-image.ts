// Gemini API endpoint for card image generation (with style reference support)
import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  api: {
    bodyParser: { sizeLimit: '20mb' },
    responseLimit: '10mb',
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, cardId, cardName, styleReferenceBase64, styleReferenceMimeType } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  try {
    // Build the parts array (text + optional style reference image)
    const parts: any[] = [];

    // If style reference image provided, add it first
    if (styleReferenceBase64) {
      parts.push({
        inlineData: {
          mimeType: styleReferenceMimeType || 'image/png',
          data: styleReferenceBase64,
        },
      });

      parts.push({
        text: `Use the above image as a STYLE REFERENCE. Generate a NEW, DIFFERENT character in the EXACT SAME art style — same level of detail, same coloring technique, same shading style, same background effects, same overall aesthetic feel.

DO NOT copy the character from the reference. Create the following NEW character using that art style:

${prompt}

Requirements:
- Match the reference image's art style exactly (line work, coloring, shading, effects)
- Square format, centered composition
- The artwork MUST fill the ENTIRE canvas edge-to-edge with NO margins, NO borders, NO white edges, NO padding
- The background must extend all the way to every edge of the image
- NO text, NO letters, NO words, NO UI elements, NO frames, NO card borders
- The character should be unique and match the description above`,
      });
    } else {
      // No style reference — use text-only prompt
      parts.push({
        text: `Generate a single game card illustration.
Style requirements:
- High quality anime/TCG card game art style
- Dramatic lighting and vibrant colors
- Detailed character design with glowing effects
- Dark cosmic/energy background with sparkle effects
- Square format, centered composition
- The artwork MUST fill the ENTIRE canvas edge-to-edge with NO margins, NO borders, NO white edges, NO padding
- The background must extend all the way to every edge of the image
- NO text, NO letters, NO words, NO UI elements, NO frames, NO card borders

Character to draw: ${prompt}`,
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts,
            },
          ],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'Gemini API error',
        status: response.status,
        details: errorText.slice(0, 500),
      });
    }

    const data = await response.json();

    const candidates = data.candidates || [];
    if (candidates.length === 0) {
      return res.status(500).json({ error: 'No candidates returned from Gemini' });
    }

    const resParts = candidates[0].content?.parts || [];
    const imagePart = resParts.find((p: any) => p.inlineData);

    if (imagePart && imagePart.inlineData) {
      return res.status(200).json({
        success: true,
        image: imagePart.inlineData.data,
        mimeType: imagePart.inlineData.mimeType || 'image/png',
        cardId,
        cardName,
      });
    }

    const textPart = resParts.find((p: any) => p.text);
    return res.status(500).json({
      error: 'No image generated',
      text: textPart?.text || 'Unknown error',
      cardId,
    });
  } catch (error: any) {
    console.error('Generate card image error:', error);
    return res.status(500).json({ error: error.message || 'Unknown error' });
  }
}
