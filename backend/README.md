# Backend de Leads (MVP)

Backend minimo para recibir formularios de la landing, validar reCAPTCHA y guardar los leads.

## 1) Instalar dependencias

```bash
cd backend
npm install
```

## 2) Configurar variables

1. Copia `.env.example` a `.env`
2. Rellena:
   - `RECAPTCHA_SECRET_KEY`: clave secreta de Google reCAPTCHA
   - `CORS_ORIGIN`: origen desde donde abres el HTML (ejemplo Live Server)

## 3) Ejecutar

```bash
npm start
```

Servidor en `http://localhost:3001`.

## 4) Flujo

- Frontend envia `POST /api/leads`
- Backend valida:
  - campos obligatorios
  - telefono basico
  - honeypot (`website`)
  - reCAPTCHA con Google
- Si todo ok, guarda en `backend/data/leads.jsonl`
