import { hydrateRoot } from "react-dom/client";
import { StrictMode } from "react";
import { Fixture } from "./password-reset-session.fixture";
hydrateRoot(
  document.getElementById("root")!,
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
