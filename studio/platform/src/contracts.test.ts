/**
 * Les contrats publiés dans contracts/ sont générés à partir de la validation de l'API.
 * WRITE_CONTRACTS=1 (npm run contracts) les régénère ; sinon le test échoue s'ils sont périmés.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { contractFiles } from "@/lib/contracts-export";
import { BusinessModelSchema } from "@/lib/migration/business-model";

const ROOT = path.resolve(import.meta.dirname, "../..");

describe("Contrats publiés (contracts/)", () => {
  const files = contractFiles(ROOT);
  it.each(Object.keys(files))("%s est à jour", (name) => {
    const file = path.join(ROOT, "contracts", name);
    const content = JSON.stringify(files[name], null, 2) + "\n";
    if (process.env.WRITE_CONTRACTS) fs.writeFileSync(file, content);
    expect(fs.existsSync(file), `${name} absent : npm run contracts`).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toBe(content);
  });

  it("l'exemple de modèle métier respecte son contrat", () => {
    expect(BusinessModelSchema.safeParse(files["business_model.example.json"]).success).toBe(true);
  });
});
