import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [...compat.extends("plugin:@typescript-eslint/recommended"), {
    languageOptions: {
        globals: {
            ...globals.worker,
        },

        parser: tsParser,
        ecmaVersion: 2020,
        sourceType: "module",

        parserOptions: {
            ecmaFeatures: {
                impliedStrict: true,
            },
        },
    },

    rules: {
        indent: ["error", 2, {
            SwitchCase: 1,
        }],

        semi: ["error", "always"],
        quotes: ["error", "single", "avoid-escape"],
        "no-trailing-spaces": ["error"],

        "no-unused-vars": ["error", {
            argsIgnorePattern: "^_",
        }],

        "prefer-const": ["error", {
            destructuring: "all",
        }],
    },
}];