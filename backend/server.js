const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs/promises");
const path = require("path");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);

// Middlewares base
app.use(cors({ origin: "*" }));
app.use(express.json());

// =================== RECAPTCHA + LEADS =====================

const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || "";
const LEADS_FILE = path.join(__dirname, "data", "leads.jsonl");

// validar teléfono
function isValidPhone(phone) {
  return /^[+()\d\s-]{7,20}$/.test(phone);
}

// reCAPTCHA
async function verifyRecaptcha(token) {
  if (!RECAPTCHA_SECRET_KEY) {
    throw new Error("RECAPTCHA no configurado");
  }

  const params = new URLSearchParams();
  params.append("secret", RECAPTCHA_SECRET_KEY);
  params.append("response", token);

  const response = await fetch(
    "https://www.google.com/recaptcha/api/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }
  );

  const data = await response.json();
  return data.success === true;
}

// guardar lead
async function saveLead(lead) {
  try {
    const line = JSON.stringify(lead) + "\n";
    await fs.mkdir(path.dirname(LEADS_FILE), { recursive: true });
    await fs.appendFile(LEADS_FILE, line);
    console.log("LEAD GUARDADO");
  } catch (err) {
    console.error("ERROR GUARDANDO LEAD:", err);
  }
}

// endpoint leads
app.post("/api/leads", async (req, res) => {
  console.log("LLEGOO REQUEST");
  try {
    const { name, phone, message, website, captchaToken } = req.body;

    // bot trap
    if (website) {
      return res.status(400).json({ message: "Bot detectado" });
    }

    // validaciones
    if (!name || !phone || !message || !captchaToken) {
      return res.status(400).json({ message: "Faltan campos" });
    }

    if (name.trim().length < 2 || message.trim().length < 10) {
      return res.status(400).json({ message: "Texto demasiado corto" });
    }

    if (!isValidPhone(phone)) {
      return res.status(400).json({ message: "Teléfono inválido" });
    }

    const captchaOk = await verifyRecaptcha(captchaToken);
    if (!captchaOk) {
      return res.status(400).json({ message: "Captcha inválido" });
    }

    const lead = {
      createdAt: new Date().toISOString(),
      name: name.trim(),
      phone: phone.trim(),
      message: message.trim(),
      status: "new",
    };

    await saveLead(lead);

    return res.status(201).json({ message: "Lead guardado" });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Error interno",
    });
  }
});

// ============= GOOGLE CALENDAR ROUTES ====================

const googleService = require("./googleService");

app.use("/api/google-calendar", googleService);

// ============= WHATSAPP BOT ROUTES ====================

const whatsappService = require("./whatsappService");

app.use("/api/whatsapp", whatsappService);

// ================== START SERVER =====================

app.listen(PORT, () => {
  console.log(`Servidor activo en http://localhost:${PORT}`);
});