import { checkoutOrCreateBranch } from '../src/git/operations';
import { CheckoutFailedError } from '../src/git';
import { executeGit } from '../src/git/executor';

jest.mock('../src/git/executor', () => ({
  executeGit: jest.fn(),
}));

type GitResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const mockedExecuteGit = jest.mocked(executeGit);

const ok = (stdout = '', stderr = ''): GitResult => ({
  stdout,
  stderr,
  exitCode: 0,
});

const fail = (stderr = 'failed', stdout = '', exitCode = 1): GitResult => ({
  stdout,
  stderr,
  exitCode,
});

describe('checkoutOrCreateBranch', () => {
  beforeEach(() => {
    mockedExecuteGit.mockReset();
  });

  test('checks out an existing branch without creating orphan branch', async () => {
    mockedExecuteGit.mockResolvedValueOnce(ok());

    await checkoutOrCreateBranch('/repo/target', '12.x');

    expect(mockedExecuteGit).toHaveBeenCalledTimes(1);
    expect(mockedExecuteGit).toHaveBeenNthCalledWith(1, ['checkout', '12.x'], '/repo/target');
  });

  test('creates an orphan branch and clears working tree when branch does not exist', async () => {
    mockedExecuteGit
      .mockResolvedValueOnce(fail('pathspec not found'))
      .mockResolvedValueOnce(fail('', '', 1))
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok());

    await checkoutOrCreateBranch('/repo/target', '13.x');

    expect(mockedExecuteGit).toHaveBeenCalledTimes(4);
    expect(mockedExecuteGit).toHaveBeenNthCalledWith(1, ['checkout', '13.x'], '/repo/target');
    expect(mockedExecuteGit).toHaveBeenNthCalledWith(
      2,
      ['show-ref', '--verify', '--quiet', 'refs/heads/13.x'],
      '/repo/target'
    );
    expect(mockedExecuteGit).toHaveBeenNthCalledWith(3, ['checkout', '--orphan', '13.x'], '/repo/target');
    expect(mockedExecuteGit).toHaveBeenNthCalledWith(4, ['reset', '--hard'], '/repo/target');
  });

  test('throws when checkout fails for an existing local branch', async () => {
    mockedExecuteGit
      .mockResolvedValueOnce(fail('local changes would be overwritten', '', 1))
      .mockResolvedValueOnce(ok());

    await expect(checkoutOrCreateBranch('/repo/target', '12.x')).rejects.toThrow(CheckoutFailedError);

    expect(mockedExecuteGit).toHaveBeenCalledTimes(2);
    expect(mockedExecuteGit).toHaveBeenNthCalledWith(1, ['checkout', '12.x'], '/repo/target');
    expect(mockedExecuteGit).toHaveBeenNthCalledWith(
      2,
      ['show-ref', '--verify', '--quiet', 'refs/heads/12.x'],
      '/repo/target'
    );
  });

  test('throws when creating orphan branch fails', async () => {
    mockedExecuteGit
      .mockResolvedValueOnce(fail('pathspec not found', '', 1))
      .mockResolvedValueOnce(fail('', '', 1))
      .mockResolvedValueOnce(fail('cannot create orphan', '', 1));

    await expect(checkoutOrCreateBranch('/repo/target', '13.x')).rejects.toThrow(CheckoutFailedError);
  });

  test('throws when reset fails after orphan checkout', async () => {
    mockedExecuteGit
      .mockResolvedValueOnce(fail('pathspec not found', '', 1))
      .mockResolvedValueOnce(fail('', '', 1))
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(fail('reset failed', '', 1));

    await expect(checkoutOrCreateBranch('/repo/target', '13.x')).rejects.toThrow(CheckoutFailedError);
  });
});
