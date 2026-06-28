'use strict';

const COLOR_RE = /^(#([0-9a-fA-F]{3,8})|hsl\(|oklch\(|rgba?\()/;

module.exports = {
  rules: {
    'no-color-literals': {
      meta: {
        type: 'problem',
        docs: { description: 'Disallow inline color literals; use tokens from src/theme.' },
        schema: [],
      },
      create(context) {
        return {
          Literal(node) {
            if (typeof node.value !== 'string') return;
            if (!COLOR_RE.test(node.value)) return;
            context.report({
              node,
              message: `Color literal "${node.value}" is not allowed. Use tokens from src/theme.`,
            });
          },
        };
      },
    },
  },
};
