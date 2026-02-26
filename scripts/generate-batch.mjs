import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateRecipe } from './generate-recipes.mjs';
import { generateImage } from './generate-images.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const SCRIPTS_DIR = __dirname;
const RECIPES_DIR = join(PROJECT_ROOT, 'src', 'content', 'recipes');

const TOPICS_FILE = join(SCRIPTS_DIR, 'recipe-topics.json');
const LOG_FILE = join(SCRIPTS_DIR, 'generated-log.json');
const BATCH_SIZE = 5;

// All categories for rotation
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
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function pickTopics(topics, generatedLog, count) {
  // Build set of already-generated titles
  const generatedTitles = new Set(generatedLog.map((entry) => entry.title));

  // Group unused topics by category
  const unusedByCategory = {};
  for (const cat of CATEGORIES) {
    unusedByCategory[cat] = [];
  }
  for (const topic of topics) {
    if (!generatedTitles.has(topic.title)) {
      unusedByCategory[topic.category]?.push(topic);
    }
  }

  // Determine which category to start from (rotate based on how many we have generated)
  const startIdx = generatedLog.length % CATEGORIES.length;

  // Pick topics rotating through categories for variety
  const picked = [];
  let catIdx = startIdx;
  let attempts = 0;
  const maxAttempts = count * CATEGORIES.length;

  while (picked.length < count && attempts < maxAttempts) {
    const cat = CATEGORIES[catIdx % CATEGORIES.length];
    const available = unusedByCategory[cat];
    if (available && available.length > 0) {
      picked.push(available.shift());
    }
    catIdx++;
    attempts++;
  }

  return picked;
}

function recipeToFrontmatter(recipe) {
  // Build YAML frontmatter
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

  // Ingredients array
  lines.push('ingredients:');
  for (const ing of recipe.ingredients) {
    lines.push(`  - "${ing.replace(/"/g, '\\"')}"`);
  }

  // Instructions array
  lines.push('instructions:');
  for (const step of recipe.instructions) {
    lines.push(`  - "${step.replace(/"/g, '\\"')}"`);
  }

  // Tags array
  lines.push('tags:');
  for (const tag of recipe.tags) {
    lines.push(`  - "${tag.replace(/"/g, '\\"')}"`);
  }

  // Optional imagePrompt
  if (recipe.imagePrompt) {
    lines.push(`imagePrompt: "${recipe.imagePrompt.replace(/"/g, '\\"')}"`);
  }

  lines.push('---');

  // Add intro text as body
  const body = recipe.introText || '';
  if (body) {
    lines.push('');
    lines.push(body);
  }

  return lines.join('\n') + '\n';
}

async function main() {
  console.log('=== GLP-1 Recipes Batch Generator ===\n');

  // Ensure output directories exist
  mkdirSync(RECIPES_DIR, { recursive: true });

  // Load data
  const topics = loadJSON(TOPICS_FILE);
  const generatedLog = loadJSON(LOG_FILE);

  console.log(`Topics available: ${topics.length}`);
  console.log(`Already generated: ${generatedLog.length}`);
  console.log(`Remaining: ${topics.length - generatedLog.length}\n`);

  // Pick topics for this batch
  const batch = pickTopics(topics, generatedLog, BATCH_SIZE);

  if (batch.length === 0) {
    console.log('No unused topics remaining. All recipes have been generated!');
    return;
  }

  console.log(`Generating ${batch.length} recipes this batch:\n`);

  let successCount = 0;

  for (let i = 0; i < batch.length; i++) {
    const topic = batch[i];
    const num = i + 1;
    console.log(`[${num}/${batch.length}] ${topic.title} (${topic.category})`);

    try {
      // Step 1: Generate recipe content via Claude
      console.log('  [text] Generating recipe with Claude...');
      const recipe = await generateRecipe(topic);
      console.log(`  [text] Done - ${recipe.calories} cal, ${recipe.protein}g protein`);

      // Step 2: Generate food photo via Gemini
      console.log('  [image] Generating photo with Gemini...');
      try {
        await generateImage(recipe);
      } catch (imgErr) {
        console.warn(`  [image] WARNING: Image generation failed: ${imgErr.message}`);
        console.warn('  [image] Continuing without image...');
      }

      // Step 3: Write markdown file
      const slug = recipe.slug;
      const mdPath = join(RECIPES_DIR, `${slug}.md`);
      const mdContent = recipeToFrontmatter(recipe);
      writeFileSync(mdPath, mdContent, 'utf-8');
      console.log(`  [file] Written: src/content/recipes/${slug}.md`);

      // Step 4: Update generated log
      generatedLog.push({
        title: topic.title,
        category: topic.category,
        slug: slug,
        generatedAt: new Date().toISOString(),
      });
      saveJSON(LOG_FILE, generatedLog);

      successCount++;
      console.log(`  [done] Success!\n`);
    } catch (err) {
      console.error(`  [ERROR] Failed to generate "${topic.title}": ${err.message}`);
      console.error(`  Skipping and continuing...\n`);
    }
  }

  console.log(`=== Batch complete: ${successCount}/${batch.length} recipes generated ===`);
  console.log(`Total generated so far: ${generatedLog.length}/${topics.length}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
