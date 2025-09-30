import fs from 'fs';
import path from 'path';
import nunjucks from 'nunjucks';

// Define the shape of the context object for the prompt template.
export interface PromptContext {
  full_context: string;
  section_to_translate: string;
  preamble_context?: string;
  errors?: string[];
}

// Cache for the prompt template to avoid reading the file every time.
let promptTemplate: string | null = null;

/**
 * Loads the prompt template from the file system.
 * @param promptFile - Optional path to the prompt file.
 * @returns The content of the prompt template.
 */
function loadPromptTemplate(promptFile?: string): string {
  if (promptTemplate && !promptFile) { // Only use cache if not a custom file
    return promptTemplate;
  }

  const filePath = promptFile
    ? path.resolve(promptFile)
    : path.resolve(__dirname, '..', '..', 'resources', 'TRANSLATE_PROMPT.md');

  try {
    const template = fs.readFileSync(filePath, 'utf-8');
    if (!promptFile) {
      promptTemplate = template; // Cache the default template
    }
    return template;
  } catch (error) {
    console.error(`Error reading prompt file at ${filePath}`, error);
    throw error;
  }
}

/**
 * Builds the translation prompt using a Nunjucks template.
 *
 * @param context - The context object containing data for the template.
 * @param promptFile - Optional path to a custom prompt template file.
 * @returns The rendered prompt string.
 */
export function buildPrompt(context: PromptContext, promptFile?: string): string {
  const template = loadPromptTemplate(promptFile);
  return nunjucks.renderString(template, context);
}