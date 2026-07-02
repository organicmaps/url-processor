/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.[jt]s$': '<rootDir>/test/esbuild-transform.cjs',
  },
};
