import { z } from "zod";
import { MigrationMappingSchema, MAPPING_CONTRACT_VERSION } from "@/lib/migration/mapping";
import { ExtractionPlanSchema, EXTRACTION_CONTRACT_VERSION } from "@/lib/migration/connectors";
import { handler, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Contrats de migration en JSON Schema : plan d'extraction (Mouss) et correspondances (Alan). */
export const GET = handler(async () =>
  json({
    extraction_plan: { version: EXTRACTION_CONTRACT_VERSION, schema: z.toJSONSchema(ExtractionPlanSchema, { io: "input", unrepresentable: "any" }) },
    migration_mapping: { version: MAPPING_CONTRACT_VERSION, schema: z.toJSONSchema(MigrationMappingSchema, { io: "input", unrepresentable: "any" }) },
  }),
);
