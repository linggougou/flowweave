export const STUDIO_CSP_PLACEHOLDER = "__FLOWWEAVE_STUDIO_CSP__";

const COMMON_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
];

export function createStudioContentSecurityPolicy(mode: "development" | "production"): string {
  const connectDirective =
    mode === "development"
      ? "connect-src 'self' http://127.0.0.1:3847 http://127.0.0.1:5173 ws://127.0.0.1:5173"
      : "connect-src 'none'";
  return [...COMMON_DIRECTIVES.slice(0, 4), connectDirective, ...COMMON_DIRECTIVES.slice(4)].join(
    "; ",
  );
}
