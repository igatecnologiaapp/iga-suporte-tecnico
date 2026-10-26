import "../../src/styles.css";
import { hydrateRoot } from "react-dom/client";
import { Fixture } from "./creation-operations.fixture";

if (new URLSearchParams(window.location.search).get("theme") === "dark")
  document.documentElement.classList.add("dark");
hydrateRoot(document.getElementById("root")!, <Fixture />);
