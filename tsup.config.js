module.exports = {
  entry: ['src/index.js'],
  format: ['esm', 'cjs'],
  outExtension({ format }) {
    return format === 'cjs' ? { js: '.cjs' } : { js: '.mjs' };
  },
  exports: 'named',
  cjsInterop: true,
  dts: false,
  sourcemap: false,
  clean: true,
  minify: true,
  splitting: false,
  treeshake: true,
  target: 'es2018',
  external: ['react', 'rrweb', 'web-vitals', 'source-map']
};
