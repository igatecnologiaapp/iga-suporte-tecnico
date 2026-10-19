import { renderToString } from "react-dom/server";
import { Fixture } from "./auth-security.fixture";

export function render() {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root">${renderToString(<Fixture />)}</div><script type="module" src="/auth-security.client.tsx"></script></body></html>`;
}
