import { hydrateRoot } from "react-dom/client";
import { Fixture } from "./auth-security.fixture";

hydrateRoot(document.getElementById("root")!, <Fixture />);
