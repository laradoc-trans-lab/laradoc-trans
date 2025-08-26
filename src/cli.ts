import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';

export interface CliOptions {
  branch: string;
  limit?: number;
  all?: boolean;
  env?: string;
  promptFile?: string;
}

export async function parseCliArgs(argv: string[]): Promise<CliOptions> {
  const program = new Command();

  // Read package.json at runtime to get the version
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
  const { version } = JSON.parse(packageJsonContent);

  program
    .name('laravel-docs-llm-translator')
    .description('Translate Laravel docs using Gemini CLI.')
    .version(version, '-v, --version', 'Output the current version.');

  program.addHelpText('afterAll', `
Examples:
  $ laradoc-trans --branch 10.x --limit 5
  $ laradoc-trans --branch 11.x --all --env .env.production
  $ laradoc-trans --version
  $ laradoc-trans --help
`);

  program
    .option('--branch <branch>', 'The branch to translate.')
    .option(
      '--limit <number>',
      'Limit the number of files to translate.',
      (value) => parseInt(value, 10)
    )
    .option('--all', 'Translate all remaining files.', false)
    .option('--env <path>', 'Path to the .env file.')
    .option('--prompt-file <path>', 'Path to the prompt file.');

  program.parse(argv);

  return program.opts() as CliOptions;
}
