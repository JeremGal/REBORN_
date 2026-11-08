import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "./proxy";
import { PATH_HEADER } from "@/components/shell/next-path";

/**
 * Lot B3 : redirection optimiste (présence du cookie seulement). Le contrôle réel est fait par le
 * layout serveur et par l'API ; ici on vérifie le périmètre (pages concernées) et l'adresse de retour.
 */

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

describe("proxy.ts — périmètre", () => {
  it("couvre l'espace connecté, l'atelier et /app", () => {
    for (const p of ["/espace", "/projets", "/projets/nouveau", "/projets/MIG_0123abcd/validation", "/activite", "/parametres", "/operations", "/atelier", "/investigation", "/regles", "/reconstruction", "/comparaison", "/migration", "/design-system", "/app"]) {
      expect(matches(p), p).toBe(true);
    }
  });

  it("ne touche ni aux pages publiques, ni à l'API, ni aux fichiers statiques", () => {
    for (const p of ["/", "/connexion", "/inscription", "/reinitialisation", "/legal/conditions", "/legal/confidentialite", "/api/me", "/api/projects", "/api/auth/sign-in/email", "/_next/static/chunks/x.js", "/favicon.ico", "/espaces", "/projetsx"]) {
      expect(matches(p), p).toBe(false);
    }
  });
});

describe("proxy.ts — comportement", () => {
  it("sans cookie de session : redirection vers la connexion avec le retour prévu", () => {
    const res = proxy(new NextRequest("http://127.0.0.1:3000/projets/MIG_0123abcd/validation?vue=ecarts"));
    expect(res.status).toBe(307);
    // NextURL écrit les adresses de bouclage « localhost » ; le serveur Next rend ensuite la
    // redirection relative quand l'hôte est le même (vérifié sur la pile isolée : on reste sur 127.0.0.1).
    const loc = new URL(res.headers.get("location") ?? "");
    expect(loc.port).toBe("3000");
    expect(loc.pathname).toBe("/connexion");
    expect(loc.searchParams.get("suite")).toBe("/projets/MIG_0123abcd/validation?vue=ecarts");
  });

  it("vers l'espace : pas de ?suite= inutile", () => {
    const res = proxy(new NextRequest("http://127.0.0.1:3000/espace"));
    expect(new URL(res.headers.get("location") ?? "").search).toBe("");
  });

  it("un autre cookie (ancien jeton, logiciel livré) ne suffit pas", () => {
    const res = proxy(new NextRequest("http://127.0.0.1:3000/espace", { headers: { cookie: "reborn_token=x; app_0123456789_sid=y" } }));
    expect(res.status).toBe(307);
  });

  it("avec le cookie de session : la requête continue (aucune lecture de base) et le chemin est transmis", () => {
    const res = proxy(new NextRequest("http://127.0.0.1:3000/activite?projet=MIG_0123abcd", { headers: { cookie: "reborn.session_token=abc.def" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    // NextResponse.next({ request: { headers } }) : en-têtes transmis à l'application
    expect(res.headers.get(`x-middleware-request-${PATH_HEADER}`)).toBe("/activite?projet=MIG_0123abcd");
  });

  it("accepte aussi le cookie __Secure- (Studio en https)", () => {
    const res = proxy(new NextRequest("https://studio.exemple.fr/espace", { headers: { cookie: "__Secure-reborn.session_token=abc.def" } }));
    expect(res.status).toBe(200);
  });
});
