import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';

export interface InitOptions {
  workspacePath?: string;
  targetRepo?: string;
}

export interface RunOptions {
  branch: string;
  limit?: number;
  all?: boolean;
  env?: string;
  promptFile?: string;
}

export interface CliArgs {
  command: 'init' | 'run';
  options: InitOptions | RunOptions;
}

export async function parseCliArgs(argv: string[]): Promise<CliArgs> {
  const program = new Command();

  // Read package.json at runtime to get the version
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
  const { version } = JSON.parse(packageJsonContent);

  program
    .name('laradoc-trans')
    .description('Translate Laravel docs using Gemini CLI.')
    .version(version, '-v, --version', 'Output the current version.');

  // Init Command
  program.command('init')
    .description('Initialize the workspace for translation.')
    .option('--workspace-path <path>', 'Path to the workspace directory.')
    .option('--target-repo <url>', 'URL of the target translated documentation repository.')
    .action((options) => {
      program.cliArgs = { command: 'init', options };
    });

  // Run Command
  program.command('run')
    .description('Run a translation job.')
    .requiredOption('--branch <branch>', 'The branch to translate.')
    .option(
      '--limit <number>',
      'Limit the number of files to translate.',
      (value) => parseInt(value, 10)
    )
    .option('--all', 'Translate all remaining files.', false)
    .option('--env <path>', 'Path to the .env file.')
    .option('--prompt-file <path>', 'Path to the prompt file.')
    .action((options) => {
      program.cliArgs = { command: 'run', options };
    });

  program.addHelpText('afterAll', `
Examples:
  $ laradoc-trans init --workspace-path ./my-workspace --branch 10.x
  $ laradoc-trans run --branch 10.x --limit 5
  $ laradoc-trans run --branch 11.x --all --env .env.production
`);

  program.parse(argv);

  if (!program.cliArgs) {
    // If no command is specified, show help and exit
    program.help();
  }

  return program.cliArgs as CliArgs;
}

declare module 'commander' {
  interface Command {
    cliArgs: CliArgs;
  }
}
