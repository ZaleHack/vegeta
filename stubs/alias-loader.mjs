const aliasMap = new Map([
  ['mysql2/promise', new URL('./mysql2/promise.js', import.meta.url).href],
  ['dotenv', new URL('./dotenv/index.js', import.meta.url).href],
  ['@elastic/elasticsearch', new URL('./@elastic/elasticsearch/index.js', import.meta.url).href],
  ['eslint-plugin-react-hooks', new URL('./eslint-plugin-react-hooks/index.js', import.meta.url).href],
  ['eslint-plugin-react-refresh', new URL('./eslint-plugin-react-refresh/index.js', import.meta.url).href],
  ['typescript-eslint', new URL('./typescript-eslint/index.js', import.meta.url).href],
  ['@typescript-eslint/parser', new URL('./@typescript-eslint/parser/index.js', import.meta.url).href]
]);

export async function resolve(specifier, context, defaultResolve) {
  if (aliasMap.has(specifier)) {
    return {
      url: aliasMap.get(specifier),
      shortCircuit: true
    };
  }
  return defaultResolve(specifier, context, defaultResolve);
}
