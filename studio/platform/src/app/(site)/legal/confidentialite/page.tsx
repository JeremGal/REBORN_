import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { LEGAL_DOCUMENTS, PRIVACY_CONTACT_MISSING, privacyContact } from "@/lib/legal";
import { LegalDocument, type LegalSection } from "../LegalDocument";

const doc = LEGAL_DOCUMENTS.confidentialite;
const creds = LEGAL_DOCUMENTS.identifiants;

export const metadata: Metadata = {
  title: `${doc.title} (version ${doc.version}) — REBORN`,
  description: "Politique de confidentialité de REBORN Studio : document de travail versionné.",
};

/**
 * Politique de confidentialité (information, prise de connaissance à l'inscription) et section
 * « Traitement des identifiants de l'ancien logiciel » (ancre #identifiants, versionnée à part).
 * Contenu vrai, sans affirmation de conformité ; contact lu dans l'environnement du serveur.
 */
export default async function ConfidentialitePage() {
  await connection();
  const contact = privacyContact();
  const contactLine = contact ? (
    <>
      Adresse de contact : <strong>{contact}</strong>.
    </>
  ) : (
    <strong>{PRIVACY_CONTACT_MISSING}</strong>
  );

  const sections: LegalSection[] = [
    {
      id: "responsable",
      title: "Qui traite vos données",
      body: (
        <p>
          REBORN, éditeur de REBORN Studio. Les coordonnées complètes de l&apos;éditeur (raison sociale, adresse) seront précisées avant toute mise en service commerciale. {contactLine}
        </p>
      ),
    },
    {
      id: "donnees",
      title: "Données traitées",
      body: (
        <ul>
          <li>
            <strong>Compte</strong> : prénom, nom, entreprise, adresse e-mail, rôle. Le mot de passe n&apos;est jamais conservé en clair : seule une empreinte (scrypt) est enregistrée.
          </li>
          <li>
            <strong>Sessions</strong> : date d&apos;ouverture, d&apos;activité et d&apos;expiration, navigateur utilisé ; l&apos;adresse IP seulement quand le Studio est installé derrière un
            serveur mandataire de confiance.
          </li>
          <li>
            <strong>Consentements</strong> : document ou déclaration, version, date, et empreinte du texte exact que vous avez accepté.
          </li>
          <li>
            <strong>Projets</strong> : informations sur l&apos;ancien logiciel (nom, adresse, type, notes), autorisation d&apos;accès confirmée, historique des états.
          </li>
          <li>
            <strong>Données métier</strong> : fichiers et exports importés, correspondances, résultats et rapports de migration, logiciel livré.
          </li>
          <li>
            <strong>Identifiants de l&apos;ancien logiciel</strong>, si vous en confiez : voir la section dédiée ci-dessous.
          </li>
        </ul>
      ),
    },
    {
      id: "finalites",
      title: "Pourquoi",
      body: (
        <ul>
          <li>Gérer votre compte, vos sessions et la sécurité de l&apos;accès (blocage temporaire après des essais de connexion infructueux).</li>
          <li>Réaliser les projets que vous lancez : import, correspondances, migration, vérification, reconstruction et livraison.</li>
          <li>Garder la preuve des conditions acceptées et des autorisations confirmées.</li>
        </ul>
      ),
    },
    {
      id: "acces",
      title: "Qui y accède",
      body: (
        <ul>
          <li>
            <strong>REBORN Studio</strong>, l&apos;application qui exécute vos projets.
          </li>
          <li>
            <strong>Le connecteur du Studio</strong>, qui teste l&apos;accès à l&apos;adresse de l&apos;ancien logiciel déclarée dans le projet, et à aucune autre.
          </li>
          <li>
            <strong>L&apos;exécuteur habilité</strong> (agent d&apos;exploration de REBORN, en cours d&apos;intégration) : quand il sera actif, il recevra les identifiants d&apos;un projet pour
            une mission en lecture seule, par un jeton à usage unique valable 15 minutes.
          </li>
          <li>
            <strong>H Company</strong>, prestataire de cet agent : les pages de votre ancien logiciel que l&apos;agent consulte passent par le navigateur hébergé de H Company, et les
            identifiants par son coffre, où l&apos;agent doit les saisir sans les montrer au modèle d&apos;IA (intégration en cours, non vérifiée à ce jour). Ces données transitent
            chez H Company ; leur durée de conservation n&apos;est pas documentée par H Company à ce jour.
          </li>
          <li>
            <strong>L&apos;Analyste</strong> (agent d&apos;analyse de REBORN, en cours d&apos;intégration) : il lit les données métier récupérées (fichiers et exports) pour proposer les
            correspondances et le modèle métier. Il ne reçoit jamais les identifiants de l&apos;ancien logiciel.
          </li>
          <li>
            <strong>L&apos;équipe REBORN</strong>, pour l&apos;assistance et l&apos;exploitation du service.
          </li>
        </ul>
      ),
    },
    {
      id: "identifiants",
      title: `Identifiants de l'ancien logiciel (version ${creds.version})`,
      body: (
        <ul>
          <li>
            Chiffrés au repos, avec une clé propre à chaque identifiant. REBORN Studio ne les affiche jamais, ne les renvoie jamais à votre navigateur et ne les écrit ni dans ses journaux
            ni dans ses rapports.
          </li>
          <li>
            Remis au seul exécuteur habilité, pour une mission en lecture seule. Prévu : saisie hors du modèle d&apos;IA, par le coffre de H Company ou le navigateur piloté par
            l&apos;agent ; cette intégration est en cours et n&apos;est pas vérifiée à ce jour. Ce que l&apos;agent et H Company en conservent de leur côté n&apos;est pas documenté à ce
            jour.
          </li>
          <li>Conservés au plus 24 heures après leur dépôt, puis effacés automatiquement.</li>
          <li>
            Effacés plus tôt : à la fin de l&apos;extraction, quand la mission de l&apos;exécuteur est terminée, au passage à l&apos;étape Correspondances, au changement d&apos;adresse de
            l&apos;ancien logiciel, à la mise en service, ou dès que vous le demandez.
          </li>
          <li>Les données métier déjà récupérées sont conservées séparément : effacer les identifiants ne les supprime pas.</li>
          <li>Conseil : confiez un compte dédié, en lecture seule, que vous pourrez désactiver après la migration.</li>
        </ul>
      ),
    },
    {
      id: "duree",
      title: "Durées de conservation",
      body: (
        <p>
          En dehors des identifiants (24 heures au plus), aucune suppression automatique n&apos;est en place aujourd&apos;hui : le compte, les projets et leurs données sont conservés tant
          que leur suppression n&apos;est pas demandée. Les durées de conservation définitives seront fixées avant toute mise en service commerciale.
        </p>
      ),
    },
    {
      id: "securite",
      title: "Sécurité",
      body: (
        <ul>
          <li>Sessions de 7 jours, prolongées à l&apos;usage, fermées à la déconnexion ; vous pouvez fermer toutes vos sessions depuis Paramètres.</li>
          <li>Changer ou réinitialiser votre mot de passe ferme vos autres sessions.</li>
          <li>Chaque projet n&apos;est accessible qu&apos;à son propriétaire, à l&apos;équipe REBORN et aux services internes habilités (exécuteur, Analyste).</li>
        </ul>
      ),
    },
    {
      id: "cookies",
      title: "Cookies",
      body: <p>Un seul cookie, nécessaire à la connexion : le cookie de session (inaccessible aux scripts de la page). Aucun cookie de mesure d&apos;audience ni de publicité.</p>,
    },
    {
      id: "demandes",
      title: "Vos demandes",
      body: (
        <ul>
          <li>Prénom, nom et entreprise se modifient dans Paramètres, rubrique Profil.</li>
          <li>
            Identifiants confiés : bouton d&apos;effacement immédiat dans le projet et dans Paramètres, rubrique Confidentialité.
          </li>
          <li>Suppression du compte, d&apos;un projet ou de ses données, ou toute autre demande : {contactLine}</li>
        </ul>
      ),
    },
    {
      id: "versions",
      title: "Versions de ce document",
      body: (
        <p>
          Chaque version porte un numéro et une date d&apos;effet. Votre prise de connaissance est enregistrée avec la version lue ; l&apos;historique est visible dans{" "}
          <Link href="/parametres#confidentialite" className="ds-link">
            Paramètres, rubrique Confidentialité
          </Link>
          .
        </p>
      ),
    },
  ];
  return (
    <LegalDocument
      doc={doc}
      intro={<p>Ce document explique quelles données REBORN Studio traite, pourquoi, qui y accède, combien de temps elles sont conservées et comment exercer vos demandes.</p>}
      sections={sections}
      related={{ href: LEGAL_DOCUMENTS.conditions.path, label: "Conditions d'utilisation" }}
    />
  );
}
