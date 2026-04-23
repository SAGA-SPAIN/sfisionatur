const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs/promises");
const path = require("path");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || "";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const LEADS_FILE = path.join(__dirname, "data", "leads.jsonl");

app.use(cors({ origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN }));
app.use(express.json({ limit: "200kb" }));

function isValidPhone(phone) {
  return /^[+()\d\s-]{7,20}$/.test(phone);
}

async function verifyRecaptcha(token) {
  if (!RECAPTCHA_SECRET_KEY) {
    throw new Error("RECAPTCHA_SECRET_KEY no configurada en backend.");
  }

  const params = new URLSearchParams();
  params.append("secret", RECAPTCHA_SECRET_KEY);
  params.append("response", token);

  const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error("No se pudo verificar reCAPTCHA.");
  }

  const data = await response.json();
  return data.success === true;
}

async function saveLead(lead) {
  const line = `${JSON.stringify(lead)}\n`;
  await fs.mkdir(path.dirname(LEADS_FILE), { recursive: true });
  await fs.appendFile(LEADS_FILE, line, "utf8");
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/leads", async (req, res) => {
  try {
    const { name, phone, message, website, captchaToken, source } = req.body || {};

    if (website) {
      return res.status(400).json({ message: "Solicitud invalida." });
    }

    if (!name || !phone || !message || !captchaToken) {
      return res.status(400).json({ message: "Faltan campos obligatorios." });
    }

    if (name.trim().length < 2 || message.trim().length < 10) {
      return res.status(400).json({ message: "Nombre o mensaje demasiado cortos." });
    }

    if (!isValidPhone(phone.trim())) {
      return res.status(400).json({ message: "Telefono invalido." });
    }

    const captchaOk = await verifyRecaptcha(captchaToken);
    if (!captchaOk) {
      return res.status(400).json({ message: "Captcha invalido." });
    }

    const lead = {
      createdAt: new Date().toISOString(),
      source: source || "landing",
      name: name.trim(),
      phone: phone.trim(),
      message: message.trim(),
      status: "new",
    };

    await saveLead(lead);
    return res.status(201).json({ message: "Lead guardado correctamente." });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Error interno del servidor." });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend de leads activo en http://localhost:${PORT}`);
});
