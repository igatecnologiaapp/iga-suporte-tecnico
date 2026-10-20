import { hydrateRoot } from "react-dom/client";
import { Fixture } from "./new-password-security.fixture";

hydrateRoot(document.getElementById("root")!, <Fixture />);
