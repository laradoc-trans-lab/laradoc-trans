import { Command, InvalidArgumentError } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import { _ } from './i18n';

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

export interface ValidateOptions {
  branch: string;
  regenerateProgress: boolean;
}

export interface CliArgs {
  command: 'init' | 'run' | 'validate';
  options: InitOptions | RunOptions | ValidateOptions;
}

const parseLimit = (value: string): number => {
  if (!/^[0-9]+$/.test(value)) {
    throw new InvalidArgumentError(_('The --limit option must be a number.'));
  }
  return parseInt(value, 10);
};

export async function parseCliArgs(argv: string[]): Promise<CliArgs> {
  const program = new Command();

  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
  const { version } = JSON.parse(packageJsonContent);

  program
    .name('laradoc-trans')
    .description('Translate and validate Laravel docs.')
    .version(version, '-v, --version', 'Output the current version.')
    .option('--debug', 'Enable debug mode, writing logs to workspace/logs/debug.log')
    .on('option:debug', () => {
      process.env.DEBUG_MODE = 'true';
    });

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
      parseLimit
    )
    .option('--all', 'Translate all remaining files.', false)
    .option('--env <path>', 'Path to the .env file.')
    .option('--prompt-file <path>', 'Path to the prompt file.')
    .action((options) => {
      program.cliArgs = { command: 'run', options };
    });

  // Validate Command
  program.command('validate')
    .description('Validate the translated files.')
    .requiredOption('--branch <branch>', 'The branch to validate against.')
    .option('--regenerate-progress', 'Regenerate the progress file from validation results to re-translate only the failed files.', false)
    .action((options) => {
      program.cliArgs = { command: 'validate', options };
    });

  program.addHelpText('afterAll', `
Examples:
  $ laradoc-trans init --workspace-path ./my-workspace
  $ laradoc-trans run --branch 10.x --limit 5
  $ laradoc-trans validate --branch 10.x
`);

  program.parse(argv);

  if (!program.cliArgs) {
    program.help();
  }

  return program.cliArgs as CliArgs;
}

declare module 'commander' {
  interface Command {
    cliArgs: CliArgs;
  }
}