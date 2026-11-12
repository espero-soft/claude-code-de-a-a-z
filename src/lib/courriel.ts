import nodemailer, { type Transporter } from "nodemailer";
import { optionsSmtp } from "@/lib/configuration";

// Envoi des e-mails de l'application (codes de connexion pour l'instant).
// En développement, tout part vers Mailpit (SMTP local sur le port 1025,
// boîte de réception lisible sur http://localhost:8025) : aucun e-mail ne
// sort de la machine. En production, SMTP_HOST doit être renseigné, et la
// connexion passe obligatoirement en TLS (optionsSmtp, src/lib/configuration.ts).

type Courriel = { a: string; sujet: string; texte: string };

const globalPourCourriel = globalThis as unknown as {
  transport?: Transporter;
};

function creerTransport() {
  const hote = process.env.SMTP_HOST;
  if (!hote && process.env.NODE_ENV === "production") {
    throw new Error("SMTP_HOST n'est pas définie (voir .env.example).");
  }
  // Mailpit : ni TLS ni authentification. Un vrai serveur (Brevo) : STARTTLS
  // exigé, ou TLS implicite sur le port 465 ; jamais d'envoi en clair.
  return nodemailer.createTransport(optionsSmtp(process.env));
}

export async function envoyerCourriel({ a, sujet, texte }: Courriel) {
  const transport = (globalPourCourriel.transport ??= creerTransport());
  await transport.sendMail({
    from: process.env.COURRIEL_EXPEDITEUR ?? "Réunéa <ne-pas-repondre@reunea.test>",
    to: a,
    subject: sujet,
    text: texte,
  });
}
