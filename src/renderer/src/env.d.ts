import type { DesktopApi } from "../../shared/types";

declare module "*.png" {
  const src: string;
  export default src;
}

declare global {
  interface Window {
    hermesDesktop: DesktopApi;
  }
}

export {};
