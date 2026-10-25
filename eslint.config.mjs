import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'src/generated/prisma/**',
      'coverage/**',
      // Generated Playwright HTML reports and test artifacts are vendor output,
      // not application source. ESLint must not analyze their minified JS.
      'playwright-api-report/**',
      'playwright-swagger-report/**',
      'test-results-api/**',
      'test-results-swagger/**',
      'playwright-report/**',
      'test-results/**',
      'node_modules/**',
      'jest.config.cjs',
      'jest.e2e.config.cjs',
      'eslint.config.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Node runtime globals for API test tooling (without disabling no-undef globally).
  {
    files: [
      'playwright.api.config.mjs',
      'playwright.swagger.config.mjs',
      'scripts/**/*.cjs',
    ],
    languageOptions: {
      globals: {
        process: 'readonly',
        URL: 'readonly',
      },
    },
  },
  // CommonJS is intentional for the node-powered API test launcher.
  {
    files: ['scripts/**/*.cjs'],
    languageOptions: {
      globals: {
        require: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: [
      'src/**/*.ts',
      'test/**/*.ts',
      'api-tests/**/*.ts',
      'swagger-ui-tests/**/*.ts',
    ],
    rules: {
      'no-undef': 'off', // TypeScript performs identifier checking.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
)
