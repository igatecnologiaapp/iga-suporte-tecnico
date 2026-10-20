import { renderToString } from "react-dom/server";
import { Fixture } from "./creation-operations.fixture";

export function render() {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root">${renderToString(<Fixture />)}</div><script type="module" src="/creation-operations.client.tsx"></script></body></html>`;
}
