import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY_1 });

const SYSTEM_PROMPT = `You are a professional nutritionist and recipe developer specializing in GLP-1 friendly recipes.
Your recipes MUST follow these strict nutritional guidelines:
- Meals (breakfast, lunch, dinner, meal-prep): 300-500 calories, 20-40g protein
- Snacks: 100-200 calories, 8-15g protein
- Smoothies: 200-350 calories, 20-35g protein
- Soups: 250-450 calories, 20-35g protein
- Side dishes: 100-250 calories, 5-15g protein
- All recipes: high fiber (5g+ for meals, 3g+ for snacks/sides), easy to digest

Respond ONLY with valid JSON. No markdown, no code fences, no extra text.`;

function buildUserPrompt(topic) {
  const today = new Date().toISOString().split('T')[0];
  return `Create a detailed GLP-1 friendly recipe for: "${topic.title}"
Category: ${topic.category}
Keywords: ${topic.keywords}

Return a JSON object with exactly these fields:
{
  "title": "Recipe title",
  "description": "SEO-friendly description, 150-160 characters",
  "pubDate": "${today}",
  "imageAlt": "Descriptive alt text for the food photo",
  "category": "${topic.category}",
  "prepTime": "X mins",
  "cookTime": "X mins",
  "totalTime": "X mins",
  "servings": 4,
  "calories": 350,
  "protein": 30,
  "carbs": 25,
  "fat": 12,
  "fiber": 8,
  "ingredients": ["1 cup ingredient", "2 tbsp ingredient"],
  "instructions": ["Step 1 instruction.", "Step 2 instruction."],
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "imagePrompt": "Detailed description of what this dish looks like on a plate for AI image generation",
  "introText": "A short 2-3 sentence intro paragraph about this recipe and why it's great for GLP-1 support."
}

Important:
- All nutritional values must be per serving
- Ingredients should include precise measurements
- Instructions should be clear, numbered steps (provide as array)
- Tags should include cuisine type, dietary info, and key ingredients
- imagePrompt should vividly describe the plated dish appearance
- introText should mention GLP-1 benefits (satiety, protein content, etc.)`;
}

export async function generateRecipe(topic) {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: buildUserPrompt(topic),
      },
    ],
    system: SYSTEM_PROMPT,
  });

  const text = message.content[0].text.trim();

  // Parse JSON, stripping any accidental markdown fences
  const cleaned = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
  const recipe = JSON.parse(cleaned);

  // Generate slug from title
  const slug = recipe.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Set image path
  recipe.image = `images/recipes/${slug}.webp`;
  recipe.slug = slug;

  return recipe;
}
