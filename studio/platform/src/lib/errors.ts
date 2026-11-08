/**
 * Erreur d'API avec statut HTTP et détails lisibles (réexportée par lib/http.ts).
 * Module sans dépendance : importable par lib/migration/project.ts sans cycle avec http.ts.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues?: unknown,
  ) {
    super(message);
  }
}
