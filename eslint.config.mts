import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import checkFile from 'eslint-plugin-check-file';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactRefreshPlugin from 'eslint-plugin-react-refresh';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import sortKeysCustomOrder from 'eslint-plugin-sort-keys-custom-order';
import globals from 'globals';
import type { Linter } from 'eslint';

export default [
	js.configs.recommended,
	{
		files: ['**/*.{js,jsx,ts,tsx,mts}'],
		languageOptions: {
			globals: {
				...globals.browser
			},
			parser: tsParser,
			parserOptions: {
				ecmaFeatures: { jsx: true },
				ecmaVersion: 'latest',
				project: './tsconfig.json',
				sourceType: 'module'
			}
		},
		plugins: {
			'@typescript-eslint': tsPlugin,
			'check-file': checkFile,
			react: reactPlugin,
			'react-hooks': reactHooksPlugin,
			'react-refresh': reactRefreshPlugin,
			'simple-import-sort': simpleImportSort,
			'sort-keys-custom-order': sortKeysCustomOrder
		},
		rules: {
			...tsPlugin.configs.recommended.rules,
			...reactHooksPlugin.configs.recommended.rules,
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_[^_]*$',
					caughtErrorsIgnorePattern: '^_[^_]*$',
					destructuredArrayIgnorePattern: '^_[^_]*$',
					ignoreRestSiblings: true,
					varsIgnorePattern: '^_[^_]*$'
				}
			],
			'check-file/filename-naming-convention': [
				'error',
				{
					'**/!(*.d).ts': 'CAMEL_CASE',
					'**/*.tsx': 'PASCAL_CASE'
				},
				{
					caseSensitive: true, // Ensure exact case matching
					ignoreMiddleExtensions: true // Allow multiple extensions
				}
			],
			'cypress/no-unnecessary-waiting': 'off',
			'no-mixed-spaces-and-tabs': 'off',
			'no-restricted-imports': ['error', { patterns: ['@mui/*/*/*'] }],
			'no-tabs': 'off',
			'no-undef': 'off',
			'no-unused-vars': 'off',
			'react-hooks/exhaustive-deps': 'off',
			'react-hooks/set-state-in-effect': 'off',
			'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
			'react/jsx-sort-props': [
				'error',
				{
					callbacksLast: false,
					ignoreCase: false,
					multiline: 'last',
					noSortAlphabetically: false,
					shorthandFirst: false,
					shorthandLast: false
				}
			],
			'react/prop-types': 'off',
			semi: ['error', 'always'],
			'simple-import-sort/imports': [
				'error',
				{
					groups: [
						// React/NPM packages first
						['^react', '^next', '^@?\\w'],
						// Absolute/internal paths
						['^@/', '^~/'],
						// Parent imports
						['^\\.\\.(?!/?$)', '^\\.\\./?$'],
						// Sibling imports
						['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'],
						// Side-effect imports
						['^\\u0000'],
						// Style imports
						['^.+\\.(css|scss)$']
					]
				}
			],
			// For JavaScript/TypeScript objects
			'sort-keys-custom-order/object-keys': [
				'error',
				{
					orderedKeys: [],
					sorting: 'asc'
				}
			],
			// For TypeScript types/interfaces
			'sort-keys-custom-order/type-keys': [
				'error',
				{
					orderedKeys: [],
					sorting: 'asc'
				}
			]
		},
		settings: {
			react: {
				version: 'detect'
			}
		}
	},
	{
		ignores: [
			'dist/**',
			'.eslintrc.{js,cjs}',
			'vite.config.*',
			'*.config.*',
			'src/i18n/*.ts',
			'server.mjs',
			'lib/**',
			'scripts/**'
		]
	},
	prettierConfig
] as Linter.Config[];
