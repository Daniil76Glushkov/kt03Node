module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/env.js'],
  globalSetup: '<rootDir>/tests/setup.js',
};
