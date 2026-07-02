// Jest transformer that compiles TypeScript via esbuild — the same bundler used to
// build the Worker (see the "build" script in package.json). This keeps test-time
// transpilation identical to production and avoids ts-jest/babel, which don't yet
// resolve cleanly against this repo's eslint 10 / jest 30 peer dependencies.
const { transformSync } = require('esbuild');

module.exports = {
  process(source, filename) {
    const { code, map } = transformSync(source, {
      loader: filename.endsWith('.ts') ? 'ts' : 'js',
      format: 'cjs',
      target: 'es2020',
      sourcemap: true,
      sourcefile: filename,
    });
    return { code, map };
  },
};
