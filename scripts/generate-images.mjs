import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const IMAGES_DIR = join(PROJECT_ROOT, 'public', 'images', 'recipes');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';

function buildPrompt(imagePrompt) {
  return `Generate a professional overhead food photography image: ${imagePrompt}. Style: bright natural lighting, clean white ceramic plate, rustic wooden table, shallow depth of field, fresh herb garnish, editorial food magazine quality, appetizing vibrant colors, no text or watermarks.`;
}

export async function generateImage(recipe) {
  // Ensure output directory exists
  mkdirSync(IMAGES_DIR, { recursive: true });

  const slug = recipe.slug;
  const prompt = buildPrompt(recipe.imagePrompt);

  const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errText}`);
  }

  const data = await response.json();

  // Find the image part in the response
  const candidates = data.candidates || [];
  if (candidates.length === 0) {
    throw new Error('No candidates returned from Gemini API');
  }

  const parts = candidates[0].content?.parts || [];
  const imagePart = parts.find((p) => p.inlineData);

  if (!imagePart) {
    throw new Error('No image data found in Gemini response');
  }

  const base64Data = imagePart.inlineData.data;
  const imageBuffer = Buffer.from(base64Data, 'base64');

  // Create main image: 1200x800 WebP
  const mainPath = join(IMAGES_DIR, `${slug}.webp`);
  await sharp(imageBuffer)
    .resize(1200, 800, { fit: 'cover' })
    .webp({ quality: 80 })
    .toFile(mainPath);

  // Create thumbnail: 400x400 WebP
  const thumbPath = join(IMAGES_DIR, `${slug}-thumb.webp`);
  await sharp(imageBuffer)
    .resize(400, 400, { fit: 'cover' })
    .webp({ quality: 80 })
    .toFile(thumbPath);

  console.log(`  [image] Saved ${slug}.webp (1200x800) and ${slug}-thumb.webp (400x400)`);

  return { mainPath, thumbPath };
}
