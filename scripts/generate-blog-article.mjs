import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { generateImage } from './generate-images.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const SCRIPTS_DIR = __dirname;
const RECIPES_DIR = join(PROJECT_ROOT, 'src', 'content', 'recipes');
const TOPICS_FILE = join(SCRIPTS_DIR, 'recipe-topics.json');
const LOG_FILE = join(SCRIPTS_DIR, 'generated-log.json');

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY_1 });

const CATEGORIES = [
  'breakfast', 'lunch', 'dinner', 'snacks',
  'meal-prep', 'smoothies', 'soups', 'side-dishes',
];

function loadJSON(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function saveJSON(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function pickNextTopic(topics, generatedLog) {
  const generatedTitles = new Set(generatedLog.map((e) => e.title));
  const unusedByCategory = {};
  for (const cat of CATEGORIES) unusedByCategory[cat] = [];
  for (const topic of topics) {
    if (!generatedTitles.has(topic.title)) {
      unusedByCategory[topic.category]?.push(topic);
    }
  }
  const catIdx = generatedLog.length % CATEGORIES.length;
  const cat = CATEGORIES[catIdx];
  if (unusedByCategory[cat]?.length > 0) return unusedByCategory[cat][0];
  // Fallback: any unused topic
  for (const c of CATEGORIES) {
    if (unusedByCategory[c]?.length > 0) return unusedByCategory[c][0];
  }
  return null;
}

const SYSTEM_PROMPT = `You are a professional food blogger and nutritionist specializing in GLP-1 friendly recipes.
You write for a popular recipe blog. Your writing style is warm, authoritative, and helpful.

Your recipes MUST follow these strict nutritional guidelines:
- Meals (breakfast, lunch, dinner, meal-prep): 300-500 calories, 20-40g protein
- Snacks: 100-200 calories, 8-15g protein
- Smoothies: 200-350 calories, 20-35g protein
- Soups: 250-450 calories, 20-35g protein
- Side dishes: 100-250 calories, 5-15g protein
- All recipes: high fiber (5g+ for meals, 3g+ for snacks/sides), easy to digest

Respond ONLY with valid JSON. No markdown, no code fences, no extra text.`;

function buildPrompt(topic) {
  const today = new Date().toISOString().split('T')[0];
  return `Research and create a GLP-1 friendly version of a well-known, popular recipe for: "${topic.title}"
Category: ${topic.category}
Keywords: ${topic.keywords}

IMPORTANT INSTRUCTIONS:
1. Base this on a real, widely-loved version of this dish. Think about what makes the most popular versions of this recipe great -- the techniques, flavor combinations, and ingredients that home cooks love.
2. Adapt it to be GLP-1 friendly (high protein, high fiber, controlled calories) while keeping it delicious.
3. Write a blog-style introduction (the "introText" field) that follows Google's Helpful Content guidelines:
   - 300-500 words, written in first person
   - Start with a compelling hook that speaks to the reader's search intent
   - Share personal experience or insight about this dish (as a food blogger would)
   - Explain what makes THIS version special and why it works for people on GLP-1 medications
   - Include practical tips (e.g., what to look for when buying ingredients, common mistakes to avoid)
   - Mention the key nutritional benefits naturally within the text (protein, fiber, satiety)
   - Use short paragraphs (2-3 sentences max) for readability
   - End with a transition to the recipe itself
   - Do NOT use clickbait, fluff, or filler. Every sentence should add value.
   - Write as an expert who has actually made this recipe many times.

Return a JSON object with exactly these fields:
{
  "title": "Recipe title (specific, keyword-rich, not generic)",
  "description": "SEO meta description, 150-160 characters, includes primary keyword and benefit",
  "pubDate": "${today}",
  "imageAlt": "Descriptive alt text for the food photo, include dish name",
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
  "ingredients": ["1 cup ingredient -- with specific brand-agnostic details"],
  "instructions": ["Detailed step with temps, times, and visual cues for doneness"],
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "imagePrompt": "Detailed food photography description: overhead angle, natural light, specific plating, garnishes, background props",
  "introText": "The full 300-500 word blog introduction as described above. Use paragraph breaks (double newline) between paragraphs."
}

Important:
- All nutritional values must be per serving and realistic
- Ingredients should include precise measurements and useful notes (e.g., "1 lb boneless skinless chicken breast, cut into 1-inch cubes")
- Instructions should be detailed with temperatures, timing, and visual doneness cues
- The recipe should taste GREAT -- don't sacrifice flavor for nutrition`;
}

function recipeToMarkdown(recipe) {
  const lines = ['---'];
  lines.push(`title: "${recipe.title.replace(/"/g, '\\"')}"`);
  lines.push(`description: "${recipe.description.replace(/"/g, '\\"')}"`);
  lines.push(`pubDate: "${recipe.pubDate}"`);
  lines.push(`image: "${recipe.image}"`);
  lines.push(`imageAlt: "${recipe.imageAlt.replace(/"/g, '\\"')}"`);
  lines.push(`category: "${recipe.category}"`);
  lines.push(`prepTime: "${recipe.prepTime}"`);
  lines.push(`cookTime: "${recipe.cookTime}"`);
  lines.push(`totalTime: "${recipe.totalTime}"`);
  lines.push(`servings: ${recipe.servings}`);
  lines.push(`calories: ${recipe.calories}`);
  lines.push(`protein: ${recipe.protein}`);
  lines.push(`carbs: ${recipe.carbs}`);
  lines.push(`fat: ${recipe.fat}`);
  lines.push(`fiber: ${recipe.fiber}`);
  lines.push('ingredients:');
  for (const ing of recipe.ingredients) {
    lines.push(`  - "${ing.replace(/"/g, '\\"')}"`);
  }
  lines.push('instructions:');
  for (const step of recipe.instructions) {
    lines.push(`  - "${step.replace(/"/g, '\\"')}"`);
  }
  lines.push('tags:');
  for (const tag of recipe.tags) {
    lines.push(`  - "${tag.replace(/"/g, '\\"')}"`);
  }
  if (recipe.imagePrompt) {
    lines.push(`imagePrompt: "${recipe.imagePrompt.replace(/"/g, '\\"')}"`);
  }
  lines.push('---');
  lines.push('');
  lines.push(recipe.introText || '');
  return lines.join('\n') + '\n';
}

async function generateOne() {
  mkdirSync(RECIPES_DIR, { recursive: true });
  const topics = loadJSON(TOPICS_FILE);
  const generatedLog = loadJSON(LOG_FILE);

  console.log(`[${new Date().toLocaleTimeString()}] Generated so far: ${generatedLog.length}/${topics.length}`);

  const topic = pickNextTopic(topics, generatedLog);
  if (!topic) {
    console.log('All topics exhausted!');
    return false;
  }

  console.log(`[recipe] ${topic.title} (${topic.category})`);

  // Generate recipe with Claude
  console.log('  Generating recipe content...');
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{ role: 'user', content: buildPrompt(topic) }],
    system: SYSTEM_PROMPT,
  });

  const text = message.content[0].text.trim();
  const cleaned = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
  const recipe = JSON.parse(cleaned);

  const slug = slugify(recipe.title);
  recipe.image = `images/recipes/${slug}.webp`;
  recipe.slug = slug;

  console.log(`  ${recipe.calories} cal | ${recipe.protein}g protein | ${recipe.fiber}g fiber`);
  console.log(`  Intro: ${recipe.introText.split('\n\n').length} paragraphs, ${recipe.introText.split(/\s+/).length} words`);

  // Generate image with retries
  console.log('  Generating image...');
  let imageOk = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await generateImage(recipe);
      const imgPath = join(PROJECT_ROOT, 'public', recipe.image);
      if (existsSync(imgPath)) {
        imageOk = true;
        console.log('  Image done.');
        break;
      }
      console.warn(`  Attempt ${attempt}: image file not found after generation.`);
    } catch (err) {
      console.warn(`  Attempt ${attempt}/3 failed: ${err.message}`);
    }
    if (attempt < 3) {
      console.log(`  Retrying in 10 seconds...`);
      await new Promise(r => setTimeout(r, 10000));
    }
  }
  if (!imageOk) {
    console.warn('  All image attempts failed -- using placeholder.');
    recipe.image = 'images/recipes/placeholder.webp';
    recipe.imageAlt = `${recipe.title} - image coming soon`;
  }

  // Write markdown
  const mdPath = join(RECIPES_DIR, `${slug}.md`);
  writeFileSync(mdPath, recipeToMarkdown(recipe), 'utf-8');
  console.log(`  Written: ${slug}.md`);

  // Update log
  generatedLog.push({
    title: topic.title,
    category: topic.category,
    slug,
    generatedAt: new Date().toISOString(),
  });
  saveJSON(LOG_FILE, generatedLog);

  // Git commit and push
  console.log('  Committing and pushing...');
  try {
    const gitOpts = { cwd: PROJECT_ROOT, stdio: 'pipe' };
    // Add files that exist (images may have failed)
    execSync(`git add "src/content/recipes/${slug}.md" "scripts/generated-log.json"`, gitOpts);
    try { execSync(`git add "public/images/recipes/${slug}.webp" "public/images/recipes/${slug}-thumb.webp"`, gitOpts); } catch {}
    execSync(`git commit -m "Add recipe: ${recipe.title}"`, gitOpts);
    execSync('git push', gitOpts);
    console.log('  Pushed to GitHub -- deploy will start automatically.');
  } catch (gitErr) {
    console.warn(`  Git push failed: ${gitErr.message} -- will retry next round`);
  }

  console.log(`  Done!\n`);
  return true;
}

// Main: generate one article, or run as scheduler
const mode = process.argv[2];

if (mode === '--schedule') {
  const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
  const TOTAL = parseInt(process.argv[3]) || 8;

  console.log(`=== Blog Article Scheduler ===`);
  console.log(`Generating ${TOTAL} articles, one every 15 minutes`);
  console.log(`Started: ${new Date().toLocaleString()}\n`);

  let count = 0;

  async function tick() {
    count++;
    console.log(`\n--- Article ${count}/${TOTAL} ---`);
    try {
      const ok = await generateOne();
      if (!ok) {
        console.log('No more topics. Stopping.');
        return;
      }
    } catch (err) {
      console.error(`Error generating article: ${err.message}`);
    }

    if (count < TOTAL) {
      const next = new Date(Date.now() + INTERVAL_MS);
      console.log(`Next article at: ${next.toLocaleTimeString()}`);
      setTimeout(tick, INTERVAL_MS);
    } else {
      console.log(`\n=== All ${TOTAL} articles generated! ===`);
    }
  }

  tick();
} else {
  // Single article mode
  generateOne().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
