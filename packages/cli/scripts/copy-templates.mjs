import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const source = fileURLToPath(new URL("../../../templates/repository/", import.meta.url));
const destination = fileURLToPath(new URL("../dist/templates/repository/", import.meta.url));

mkdirSync(dirname(destination), { recursive: true });
cpSync(source, destination, { recursive: true });
