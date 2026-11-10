import nodemailer, { type Transporter } from "nodemailer";

// Envoi des e-mails de l'application (codes de connexion pour l'instant).
// En développement, tout part vers Mailpit (SMTP local sur le port 1025,
// boîte de réception lisible sur http://localhost:8025) : aucun e-mail ne
// sort de la machine. En production, SMTP_HOST doit être renseigné.

type Courriel = { a: string; sujet: string; texte: string };

const globalPourCourriel = globalThis as unknown as {
  transport?: Transporter;
};

function creerTransport() {
  const hote = process.env.SMTP_HOST;
  if (!hote && process.env.NODE_ENV === "production") {
    throw new Error("SMTP_HOST n'est pas définie (voir .env.example).");
  }
  return nodemailer.createTransport({
    host: hote ?? "localhost",
    port: Number(process.env.SMTP_PORT ?? 1025),
    // Mailpit n'a ni TLS ni authentification ; un vrai serveur en aura.
    secure: false,
    auth: process.env.SMTP_UTILISATEUR
      ? {
          user: process.env.SMTP_UTILISATEUR,
          pass: process.env.SMTP_MOT_DE_PASSE,
        }
      : undefined,
  });
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
