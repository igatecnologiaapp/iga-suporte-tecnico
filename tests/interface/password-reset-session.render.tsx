import { renderToString } from "react-dom/server";
import { StrictMode } from "react";
import { Fixture } from "./password-reset-session.fixture";
export function render() {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root">${renderToString(
    <StrictMode>
      <Fixture />
    </StrictMode>,
  )}</div><script type="module" src="/password-reset-session.client.tsx"></script></body></html>`;
}
