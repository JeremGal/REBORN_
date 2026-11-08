import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AUTHORIZATION_DECLARATION, LEGAL_DOCUMENTS, PRIVACY_CONTACT_MISSING, privacyContact } from "@/lib/legal";
import { LegalDocument, type LegalSection } from "../LegalDocument";

const doc = LEGAL_DOCUMENTS.conditions;

export const metadata: Metadata = {
  title: `${doc.title} (version ${doc.version}) — REBORN`,
  description: "Conditions d'utilisation de REBORN Studio : document de travail versionné.",
};

/**
 * Conditions d'utilisation (acceptation contractuelle à l'inscription). Document de travail : il
 * décrit le fonctionnement réel du Studio, sans promesse de conformité. Rendu à chaque requête
 * (adresse de contact lue dans l'environnement du serveur).
 */
export default async function ConditionsPage() {
  await connection();
  const contact = privacyContact();
  const sections: LegalSection[] = [
    {
      id: "objet",
      title: "Objet du service",
      body: (
        <>
          <p>
            REBORN Studio aide une entreprise à remplacer un logiciel métier historique : récupération des données de l&apos;ancien logiciel, correspondance des champs, migration et
            vérification des données, reconstruction puis livraison d&apos;un nouveau logiciel qui fonctionne de façon autonome.
          </p>
          <p>
            Certaines étapes sont encore en cours d&apos;intégration : l&apos;exploration de l&apos;ancien logiciel par un agent et la compréhension de ses règles par un agent d&apos;analyse. Tant
            qu&apos;elles ne sont pas opérationnelles, le Studio l&apos;indique clairement et ne présente aucun résultat simulé.
          </p>
        </>
      ),
    },
    {
      id: "compte",
      title: "Votre compte",
      body: (
        <ul>
          <li>Le compte est personnel. Les informations saisies (prénom, nom, entreprise, adresse e-mail) doivent être exactes.</li>
          <li>Vous gardez votre mot de passe secret. Après 8 essais de connexion infructueux en 15 minutes, le compte est bloqué 15 minutes.</li>
          <li>Vous pouvez à tout moment consulter vos sessions ouvertes et les fermer depuis Paramètres, rubrique Sécurité.</li>
          <li>Mot de passe oublié : un administrateur REBORN peut vous transmettre un lien de réinitialisation à usage unique, valable une heure.</li>
        </ul>
      ),
    },
    {
      id: "autorisation",
      title: "Autorisation d'accès à l'ancien logiciel",
      body: (
        <>
          <p>À la création d&apos;un projet, vous confirmez la déclaration suivante (version {AUTHORIZATION_DECLARATION.version}) :</p>
          <blockquote className="border-l-2 border-line-strong pl-4 text-ink">« {AUTHORIZATION_DECLARATION.text} »</blockquote>
          <p>Cette confirmation est enregistrée avec votre nom, la date et la version du texte. Sans elle, aucun projet n&apos;est créé.</p>
        </>
      ),
    },
    {
      id: "fonctionnement",
      title: "Fonctionnement d'un projet",
      body: (
        <ul>
          <li>Rien n&apos;est lancé sans votre demande : chaque étape (import, migration, mise en service) est déclenchée depuis votre espace.</li>
          <li>Les données peuvent être importées sous forme de fichiers (CSV, Excel, JSON, export SQL, base SQLite, archive ZIP).</li>
          <li>Les correspondances de champs qui demandent une décision vous sont soumises avant la migration.</li>
          <li>Chaque migration est vérifiée : les contrôles réussis, les contrôles en échec et les écarts sont consignés dans un rapport que vous pouvez consulter.</li>
        </ul>
      ),
    },
    {
      id: "identifiants",
      title: "Identifiants de l'ancien logiciel",
      body: (
        <p>
          Si vous confiez un identifiant et un mot de passe de votre ancien logiciel, ils sont chiffrés, jamais affichés et effacés au plus tard 24 heures après leur dépôt, ou plus tôt
          (voir la{" "}
          <Link href={LEGAL_DOCUMENTS.identifiants.path} className="ds-link">
            politique de confidentialité, section Identifiants
          </Link>
          ). Privilégiez un compte dédié, en lecture seule.
        </p>
      ),
    },
    {
      id: "livraison",
      title: "Données migrées et logiciel livré",
      body: (
        <ul>
          <li>Le logiciel livré fonctionne de façon autonome, avec ses propres comptes utilisateurs : chaque personne choisit son mot de passe à partir d&apos;un lien d&apos;activation.</li>
          <li>
            Un compte de secours « admin » est créé avec le logiciel livré, pour l&apos;assistance de l&apos;équipe REBORN ; son mot de passe initial est conservé sur le serveur qui héberge
            le logiciel. Un administrateur du logiciel livré peut le désactiver depuis l&apos;administration des accès.
          </li>
          <li>
            Le mot de passe de l&apos;ancien logiciel ne donne aucun accès au logiciel livré, et le compte REBORN ne remplace pas les comptes du logiciel livré.
          </li>
          <li>Les contrôles du rapport de migration ne remplacent pas votre propre recette : vérifiez le logiciel livré avant de l&apos;utiliser pour votre activité.</li>
        </ul>
      ),
    },
    {
      id: "fin",
      title: "Suppression du compte et des projets",
      body: (
        <p>
          Les identifiants confiés s&apos;effacent immédiatement depuis le projet ou depuis Paramètres. Pour supprimer votre compte ou un projet et ses données :{" "}
          {contact ? (
            <>
              écrivez à <strong>{contact}</strong>.
            </>
          ) : (
            <>
              la demande se fait auprès de l&apos;équipe REBORN ; <strong>{PRIVACY_CONTACT_MISSING.toLowerCase()}</strong>
            </>
          )}
        </p>
      ),
    },
    {
      id: "evolution",
      title: "Évolution des conditions",
      body: (
        <p>
          Chaque version de ces conditions porte un numéro et une date d&apos;effet. Une nouvelle version doit être acceptée à nouveau : le Studio refuse une acceptation donnée pour une
          version périmée. L&apos;historique de vos acceptations est visible dans Paramètres, rubrique Confidentialité.
        </p>
      ),
    },
  ];
  return (
    <LegalDocument
      doc={doc}
      intro={<p>Ces conditions s&apos;appliquent à l&apos;utilisation de REBORN Studio. En créant un compte, vous les acceptez dans leur version {doc.version}.</p>}
      sections={sections}
      related={{ href: LEGAL_DOCUMENTS.confidentialite.path, label: "Politique de confidentialité" }}
    />
  );
}
