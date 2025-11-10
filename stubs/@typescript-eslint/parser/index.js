export function parseForESLint() {
  return {
    ast: {
      type: 'Program',
      body: [],
      sourceType: 'module',
      range: [0, 0],
      loc: {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 0 }
      },
      tokens: [],
      comments: []
    },
    tokens: [],
    comments: []
  };
}

export default { parseForESLint };
