import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { react },
    settings: { react: { version: "18.3" } },
    rules: {
      // conteúdo do log não é confiável: nunca injetar HTML
      "react/no-danger": "error",
      "react/jsx-key": "error",
    },
  },
);
