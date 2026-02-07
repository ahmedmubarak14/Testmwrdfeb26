declare module '@playwright/test' {
  export const test: any;
  export const expect: any;
  export const defineConfig: (...args: any[]) => any;
  export const devices: Record<string, any>;
  export type Page = any;
  const playwright: any;
  export default playwright;
}
