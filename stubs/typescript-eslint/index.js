import parser from '@typescript-eslint/parser';

const configs = {
  recommended: [
    {
      languageOptions: {
        parser
      }
    }
  ]
};

function mergeLanguageOptions(base, override) {
  if (!base && !override) {
    return undefined;
  }
  return {
    ...(base || {}),
    ...(override || {})
  };
}

function config(...configsArgs) {
  return configsArgs.map((entry) => {
    if (entry && Array.isArray(entry.extends)) {
      const merged = entry.extends.reduce(
        (acc, item) => {
          if (item && typeof item === 'object') {
            return {
              ...acc,
              ...item,
              languageOptions: mergeLanguageOptions(acc.languageOptions, item.languageOptions)
            };
          }
          return acc;
        },
        {}
      );
      const { extends: _ignored, languageOptions, ...rest } = entry;
      return {
        ...merged,
        ...rest,
        languageOptions: mergeLanguageOptions(merged.languageOptions, languageOptions)
      };
    }
    return entry;
  });
}

export { configs, config };

export default {
  configs,
  config
};
