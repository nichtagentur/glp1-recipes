import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const recipes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/recipes' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.string(),
    image: z.string(),
    imageAlt: z.string(),
    category: z.enum([
      'breakfast', 'lunch', 'dinner', 'snacks',
      'meal-prep', 'smoothies', 'soups', 'side-dishes'
    ]),
    prepTime: z.string(),
    cookTime: z.string(),
    totalTime: z.string(),
    servings: z.number(),
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fat: z.number(),
    fiber: z.number(),
    ingredients: z.array(z.string()),
    instructions: z.array(z.string()),
    tags: z.array(z.string()),
    relatedRecipes: z.array(z.string()).optional(),
    imagePrompt: z.string().optional(),
  }),
});

export const collections = { recipes };
