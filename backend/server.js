const express = require("express"); //Creamos el servidor con express
const cors = require("cors"); //Nos deja que nos comuniquemos con el frontend
const dotenv = require("dotenv"); //Con esto leemos variables del archivo .env

dotenv.config(); //cargamos las variables del archivo .env

const app = express(); //con express creamos el servidor
const PORT = Number(process.env.PORT || 3001); //agarramos el puerto del archivo .env, y si no usamos el 3001
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || ""; //agarramos del archivo .env el secret-key
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*"; 

app.use(cors({ origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN })); // deja que el front llame al back
app.use(express.json({ limit: "200kb" })); //Recibimos JSON en el body
 
function isValidPhone(phone) { // Funcion para validar el telefono
  return /^[+()\d\s-]{7,20}$/.test(phone);
}
//Funcion que verifica el token, que llega del front
async function verifyRecaptcha(token) {
  if (!RECAPTCHA_SECRET_KEY) {
    throw new Error("RECAPTCHA_SECRET_KEY no configurada en backend.");
  }
 //Con esto preparamos los datos para enviar a google
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

  const data = await response.json(); //Convertimos la respuesta en objeto JSON
  console.log(data);
  return data.success === true;
}

// con post recibimos los datos del front
app.post("/api/leads", async (req, res) => {
  try {
    const { name, phone, message, website, captchaToken, source } = req.body || {};
    //Si esta relleno es que es un bots
    if (website) {
      return res.status(400).json({ message: "Solicitud invalida." });
    }
    //If para que los campos sean obligatorios
    if (!name || !phone || !message || !captchaToken) {
      return res.status(400).json({ message: "Faltan campos obligatorios." });
    }
    //If para nombres y mensajes, que no sean cortos
    if (name.trim().length < 2 || message.trim().length < 10) {
      return res.status(400).json({ message: "Nombre o mensaje demasiado cortos." });
    }
    //Con la funcion de mas arriba, se valida el telefono
    if (!isValidPhone(phone.trim())) {
      return res.status(400).json({ message: "Telefono invalido." });
    }

    const captchaOk = await verifyRecaptcha(captchaToken);
    if (!captchaOk) {
      return res.status(400).json({ message: "Captcha invalido." });
    }
    return res.status(201).json({ message: "Lead guardado correctamente." });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Error interno del servidor." });
  }
});

app.listen(PORT, () => {
  console.log(`Backend de leads activo en http://localhost:${PORT}`);
});
