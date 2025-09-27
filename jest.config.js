module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  transformIgnorePatterns: [],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': 'babel-jest'
  },
};
