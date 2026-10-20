/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** "1" = usa api/fixtures.ts em vez do servidor */
  readonly VITE_FIXTURES?: string;
}
