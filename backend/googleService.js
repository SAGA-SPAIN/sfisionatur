const express = require("express");
const router = express.Router();
const fs = require("fs/promises");
const path = require("path");
const { google } = require("googleapis");

// Variables para Google
let GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
let GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
let GOOGLE_REDIRECT_URI = "http://localhost:3001/api/google-calendar/callback";

// Archivo donde guardo el token
let TOKEN_FILE = path.join(__dirname, "data", "google-calendar-token.json");

// Funcion para crear cliente de Google
function crearClienteGoogle() {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        console.log("ERROR: No hay credenciales de Google");
        return null;
    }
    
    return new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
    );
}

// Guardar token en archivo
async function guardarToken(token) {
    try {
        await fs.mkdir(path.dirname(TOKEN_FILE), { recursive: true });
        await fs.writeFile(TOKEN_FILE, JSON.stringify(token, null, 2));
        console.log("Token guardado");
    } catch (error) {
        console.log("Error guardando token:", error);
    }
}

// Verificar si tengo token
async function tengoToken() {
    try {
        await fs.access(TOKEN_FILE);
        return true;
    } catch (error) {
        return false;
    }
}

// Obtener cliente de calendar
async function obtenerCalendar() {
    try {
        let oauth2Client = crearClienteGoogle();
        let tokenData = await fs.readFile(TOKEN_FILE, "utf8");
        let token = JSON.parse(tokenData);
        
        oauth2Client.setCredentials(token);
        
        return google.calendar({ version: "v3", auth: oauth2Client });
    } catch (error) {
        console.log("Error obteniendo calendar:", error);
        return null;
    }
}

// Ruta para obtener URL de autenticacion
router.get("/auth-url", (req, res) => {
    try {
        let cliente = crearClienteGoogle();
        
        if (!cliente) {
            return res.status(500).json({ mensaje: "No se pudo crear cliente Google" });
        }
        
        let urlAuth = cliente.generateAuthUrl({
            access_type: "offline",
            prompt: "consent",
            scope: ["https://www.googleapis.com/auth/calendar"]
        });
        
        res.json({ authUrl: urlAuth });
    } catch (error) {
        console.log("Error en auth-url:", error);
        res.status(500).json({ mensaje: "Error interno" });
    }
});

// Callback de Google despues de autorizar
router.get("/callback", async (req, res) => {
    try {
        let codigo = req.query.code;
        
        if (!codigo) {
            return res.status(400).send("Falta el codigo de autorizacion");
        }
        
        let cliente = crearClienteGoogle();
        let resultado = await cliente.getToken(codigo);
        
        await guardarToken(resultado.tokens);
        
        res.send("¡Google conectado correctamente!");
    } catch (error) {
        console.log("Error en callback:", error);
        res.status(500).send("Error al conectar Google");
    }
});

// Verificar si estamos conectados a Google
router.get("/status", async (req, res) => {
    try {
        let conectado = await tengoToken();
        res.json({ conectado: conectado });
    } catch (error) {
        console.log("Error en status:", error);
        res.status(500).json({ mensaje: "Error verificando estado" });
    }
});

// Ver disponibilidad entre fechas
router.get("/availability", async (req, res) => {
    try {
        if (!(await tengoToken())) {
            return res.status(400).json({ mensaje: "Necesitas conectar Google primero" });
        }

        let fechaInicio = req.query.startDate;
        let fechaFin = req.query.endDate;
        
        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({ mensaje: "Necesito fecha de inicio y fin" });
        }

        let calendar = await obtenerCalendar();
        
        if (!calendar) {
            return res.status(500).json({ mensaje: "No pude obtener el calendar" });
        }
        
        let eventos = await calendar.events.list({
            calendarId: "primary",
            timeMin: new Date(fechaInicio).toISOString(),
            timeMax: new Date(fechaFin).toISOString(),
            singleEvents: true,
            orderBy: "startTime"
        });

        let listaEventos = eventos.data.items || [];
        
        // Agrupar eventos por hora
        let eventosPorHora = {};
        
        for (let i = 0; i < listaEventos.length; i++) {
            let evento = listaEventos[i];
            if (evento.start && evento.start.dateTime) {
                let fechaEvento = new Date(evento.start.dateTime);
                let hora = fechaEvento.getHours();
                let claveFecha = fechaEvento.toDateString();
                
                if (!eventosPorHora[claveFecha]) {
                    eventosPorHora[claveFecha] = {};
                }
                
                if (!eventosPorHora[claveFecha][hora]) {
                    eventosPorHora[claveFecha][hora] = 0;
                }
                
                eventosPorHora[claveFecha][hora]++;
            }
        }

        res.json({ eventosPorHora });
        
    } catch (error) {
        console.log("Error en availability:", error);
        res.status(500).json({ mensaje: "Error verificando disponibilidad" });
    }
});

// Verificar si un horario específico está disponible
router.get("/check-slot", async (req, res) => {
    try {
        if (!(await tengoToken())) {
            return res.status(400).json({ mensaje: "Necesitas conectar Google primero" });
        }

        let fechaHora = req.query.dateTime;
        
        if (!fechaHora) {
            return res.status(400).json({ mensaje: "Necesito fecha y hora" });
        }

        let calendar = await obtenerCalendar();
        let fechaCita = new Date(fechaHora);
        
        // Buscar eventos en ventana de tiempo
        let inicioVentana = new Date(fechaCita.getTime() - 30 * 60 * 1000);
        let finVentana = new Date(fechaCita.getTime() + 90 * 60 * 1000);
        
        let eventos = await calendar.events.list({
            calendarId: "primary",
            timeMin: inicioVentana.toISOString(),
            timeMax: finVentana.toISOString(),
            singleEvents: true
        });

        let listaEventos = eventos.data.items || [];
        
        // Contar eventos en la misma hora
        let eventosMismaHora = [];
        for (let i = 0; i < listaEventos.length; i++) {
            let evento = listaEventos[i];
            if (evento.start && evento.start.dateTime) {
                let inicioEvento = new Date(evento.start.dateTime);
                let horaEvento = inicioEvento.getHours();
                let horaCita = fechaCita.getHours();
                
                if (horaEvento === horaCita) {
                    eventosMismaHora.push(evento);
                }
            }
        }

        let disponible = eventosMismaHora.length < 2;
        
        res.json({ 
            disponible: disponible, 
            cantidadActual: eventosMismaHora.length,
            maximoPermitido: 2
        });
        
    } catch (error) {
        console.log("Error en check-slot:", error);
        res.status(500).json({ mensaje: "Error verificando horario" });
    }
});

// Crear una nueva cita
router.post("/create-appointment", async (req, res) => {
    try {
        if (!(await tengoToken())) {
            return res.status(400).json({ mensaje: "Necesitas conectar Google primero" });
        }

        let titulo = req.body.summary;
        let descripcion = req.body.description;
        let fechaHora = req.body.dateTime;
        let duracion = req.body.duration || 60;
        let nombreCliente = req.body.customerName;
        let telefonoCliente = req.body.customerPhone;
        
        if (!titulo || !fechaHora) {
            return res.status(400).json({ mensaje: "Necesito título y fecha/hora" });
        }

        let calendar = await obtenerCalendar();
        let fechaCita = new Date(fechaHora);
        
        // Primero verificar si hay espacio
        let eventosExistentes = await calendar.events.list({
            calendarId: "primary",
            timeMin: new Date(fechaCita.getTime() - 30 * 60 * 1000).toISOString(),
            timeMax: new Date(fechaCita.getTime() + 90 * 60 * 1000).toISOString(),
            singleEvents: true
        });

        let eventos = eventosExistentes.data.items || [];
        let eventosMismaHora = [];
        
        for (let i = 0; i < eventos.length; i++) {
            let evento = eventos[i];
            if (evento.start && evento.start.dateTime) {
                let inicioEvento = new Date(evento.start.dateTime);
                if (inicioEvento.getHours() === fechaCita.getHours()) {
                    eventosMismaHora.push(evento);
                }
            }
        }

        if (eventosMismaHora.length >= 2) {
            return res.status(400).json({ 
                mensaje: "Máximo 2 citas permitidas a la misma hora",
                cantidadActual: eventosMismaHora.length 
            });
        }

        // Crear el evento
        let fechaFin = new Date(fechaCita.getTime() + duracion * 60 * 1000);
        
        let descripcionCompleta = descripcion || 'Cita de fisioterapia';
        descripcionCompleta += '\n\n';
        descripcionCompleta += 'Cliente: ' + (nombreCliente || 'No especificado') + '\n';
        descripcionCompleta += 'Teléfono: ' + (telefonoCliente || 'No especificado') + '\n';
        descripcionCompleta += 'Duración: ' + duracion + ' minutos\n';
        descripcionCompleta += 'Creado: ' + new Date().toLocaleString('es-ES');

        let nuevoEvento = await calendar.events.insert({
            calendarId: "primary",
            requestBody: {
                summary: titulo,
                description: descripcionCompleta,
                start: { 
                    dateTime: fechaCita.toISOString(),
                    timeZone: 'Europe/Madrid'
                },
                end: { 
                    dateTime: fechaFin.toISOString(),
                    timeZone: 'Europe/Madrid'
                },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 },
                        { method: 'popup', minutes: 60 }
                    ]
                }
            }
        });

        res.status(201).json({
            mensaje: "Cita creada exitosamente",
            eventId: nuevoEvento.data.id,
            eventLink: nuevoEvento.data.htmlLink,
            cita: {
                titulo: titulo,
                fechaHora: fechaCita.toISOString(),
                duracion: duracion,
                nombreCliente: nombreCliente,
                telefonoCliente: telefonoCliente
            }
        });
        
    } catch (error) {
        console.log("Error en create-appointment:", error);
        res.status(500).json({ mensaje: "Error creando cita" });
    }
});

// Ver proxima disponibilidad
router.get("/next-availability", async (req, res) => {
    try {
        if (!(await tengoToken())) {
            return res.status(400).json({ mensaje: "Necesitas conectar Google primero" });
        }

        let dias = req.query.days || 7;
        let calendar = await obtenerCalendar();
        
        let hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        
        let fechaFin = new Date(hoy);
        fechaFin.setDate(hoy.getDate() + parseInt(dias));
        fechaFin.setHours(23, 59, 59, 999);
        
        let eventos = await calendar.events.list({
            calendarId: "primary",
            timeMin: hoy.toISOString(),
            timeMax: fechaFin.toISOString(),
            singleEvents: true,
            orderBy: "startTime"
        });

        let listaEventos = eventos.data.items || [];
        
        // Horarios de atención
        let horariosLaborales = {
            diasSemana: [1, 2, 3, 4, 5], // Lunes a Viernes
            horarios: ["09:00", "10:00", "11:00", "16:00", "17:00", "18:00"]
        };
        
        let disponibilidad = {};
        
        for (let i = 0; i < parseInt(dias); i++) {
            let fechaActual = new Date(hoy);
            fechaActual.setDate(hoy.getDate() + i);
            
            if (horariosLaborales.diasSemana.includes(fechaActual.getDay())) {
                let claveFecha = fechaActual.toDateString();
                disponibilidad[claveFecha] = {
                    fecha: fechaActual.toISOString().split('T')[0],
                    formateada: fechaActual.toLocaleDateString('es-ES', { 
                        weekday: 'long', 
                        day: 'numeric', 
                        month: 'long' 
                    }),
                    horarios: {}
                };
                
                // Verificar cada horario
                for (let j = 0; j < horariosLaborales.horarios.length; j++) {
                    let horario = horariosLaborales.horarios[j];
                    let [horas, minutos] = horario.split(":");
                    let fechaHorario = new Date(fechaActual);
                    fechaHorario.setHours(parseInt(horas), parseInt(minutos), 0, 0);
                    
                    // Contar eventos en esa hora
                    let eventosEnHora = [];
                    for (let k = 0; k < listaEventos.length; k++) {
                        let evento = listaEventos[k];
                        if (evento.start && evento.start.dateTime) {
                            let inicioEvento = new Date(evento.start.dateTime);
                            if (inicioEvento.getHours() === parseInt(horas) && 
                                inicioEvento.toDateString() === fechaActual.toDateString()) {
                                eventosEnHora.push(evento);
                            }
                        }
                    }
                    
                    disponibilidad[claveFecha].horarios[horario] = {
                        disponible: eventosEnHora.length < 2,
                        cantidadActual: eventosEnHora.length,
                        maximoPermitido: 2
                    };
                }
            }
        }
        
        res.json({ disponibilidad });
        
    } catch (error) {
        console.log("Error en next-availability:", error);
        res.status(500).json({ mensaje: "Error obteniendo disponibilidad" });
    }
});

// Ruta de prueba
router.post("/test-hola", async (req, res) => {
    try {
        if (!(await tengoToken())) {
            return res.status(400).json({ mensaje: "Necesitas conectar Google primero" });
        }

        let calendar = await obtenerCalendar();
        let inicio = new Date();
        let fin = new Date(inicio.getTime() + 60 * 60 * 1000);

        let eventos = await calendar.events.list({
            calendarId: "primary",
            timeMin: inicio.toISOString(),
            timeMax: fin.toISOString(),
            singleEvents: true
        });

        let listaEventos = eventos.data.items || [];

        if (listaEventos.length >= 2) {
            return res.status(400).json({ mensaje: "Máximo 2 citas por hora" });
        }

        let respuesta = await calendar.events.insert({
            calendarId: "primary",
            requestBody: {
                summary: "Cita de prueba",
                description: "Reserva automatica de prueba",
                start: { dateTime: inicio.toISOString() },
                end: { dateTime: fin.toISOString() }
            }
        });

        res.status(201).json({
            mensaje: "Evento creado",
            eventId: respuesta.data.id
        });

    } catch (error) {
        console.log("Error en test-hola:", error);
        res.status(500).json({ mensaje: "Error en prueba" });
    }
});

  module.exports = router;