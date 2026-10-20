import { hydrateRoot } from "react-dom/client";
import { Fixture } from "./creation-operations.fixture";

hydrateRoot(document.getElementById("root")!, <Fixture />);
