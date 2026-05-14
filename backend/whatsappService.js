const express = require("express");
const router = express.Router();
const axios = require("axios");

// Configuración WhatsApp Business API
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN || "";
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID || "";
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "sfisionatur_verify_2024";

const WHATSAPP_API_URL = "https://graph.facebook.com/v18.0";

// Estado de conversaciones por usuario
const conversationState = new Map();

// Horarios de atención (Lunes a Viernes)
const BUSINESS_HOURS = {
  weekdays: [1, 2, 3, 4, 5], // Lunes a Viernes
  timeSlots: ["09:00", "10:00", "11:00", "16:00", "17:00", "18:00"]
};

// Función para enviar mensajes de WhatsApp
async function enviarMensajeWhatsApp(to, message) {
  try {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        text: { body: message }
      },
      {
        headers: {
          "Authorization": `Bearer ${WHATSAPP_API_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error enviando mensaje WhatsApp:", error.response?.data || error.message);
    throw error;
  }
}

// Función para enviar botones interactivos
async function enviarBotonesInteractivos(to, headerText, bodyText, buttons) {
  try {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "interactive",
        interactive: {
          type: "button",
          header: {
            type: "text",
            text: headerText
          },
          body: {
            text: bodyText
          },
          action: {
            buttons: buttons.map((btn, index) => ({
              type: "reply",
              reply: {
                id: `btn_${index}`,
                title: btn
              }
            }))
          }
        }
      },
      {
        headers: {
          "Authorization": `Bearer ${WHATSAPP_API_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error enviando botones interactivos:", error.response?.data || error.message);
    throw error;
  }
}

// Función para enviar lista interactiva
async function enviarListaInteractiva(to, headerText, bodyText, buttonText, sections) {
  try {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "interactive",
        interactive: {
          type: "list",
          header: {
            type: "text",
            text: headerText
          },
          body: {
            text: bodyText
          },
          action: {
            button: buttonText,
            sections: sections
          }
        }
      },
      {
        headers: {
          "Authorization": `Bearer ${WHATSAPP_API_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error enviando lista interactiva:", error.response?.data || error.message);
    throw error;
  }
}

// Obtener próximos días disponibles
function obtenerDiasDisponibles(daysAhead = 7) {
  const days = [];
  const today = new Date();
  
  for (let i = 1; i <= daysAhead; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    
    if (BUSINESS_HOURS.weekdays.includes(date.getDay())) {
      days.push({
        date: date,
        formatted: date.toLocaleDateString('es-ES', { 
          weekday: 'long', 
          day: 'numeric', 
          month: 'long' 
        }),
        short: date.toLocaleDateString('es-ES', { 
          weekday: 'short', 
          day: 'numeric' 
        })
      });
    }
  }
  
  return days.slice(0, 5); // Máximo 5 días
}

// Verificación webhook
router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log("Webhook WhatsApp verificado");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Procesar mensajes entrantes
router.post("/webhook", async (req, res) => {
  try {
    const data = req.body;
    
    if (data.object === "whatsapp_business_account") {
      for (const entry of data.entry) {
        for (const change of entry.changes) {
          if (change.field === "messages") {
            const messages = change.value.messages;
            if (messages && messages.length > 0) {
              await processMessage(messages[0]);
            }
          }
        }
      }
    }
    
    res.status(200).send("OK");
  } catch (error) {
    console.error("Error procesando webhook:", error);
    res.status(500).send("Error");
  }
});

// Procesar mensaje individual
async function procesarMensaje(message) {
  const from = message.from;
  const msgType = message.type;
  
  // Obtener estado actual de la conversación
  let state = conversationState.get(from) || {
    step: "welcome",
    data: {}
  };

  try {
    switch (msgType) {
      case "text":
        await procesarMensajeTexto(from, message.text.body, state);
        break;
      case "interactive":
        await procesarMensajeInteractivo(from, message.interactive, state);
        break;
      default:
        await enviarMensajeWhatsApp(from, "Por favor, selecciona una opción de los botones.");
    }
  } catch (error) {
    console.error("Error procesando mensaje:", error);
    await enviarMensajeWhatsApp(from, "Lo siento, ha ocurrido un error. Por favor, intenta de nuevo.");
  }
}

// Manejar mensajes de texto
async function procesarMensajeTexto(from, text, state) {
  const lowerText = text.toLowerCase().trim();
  
  switch (state.step) {
    case "welcome":
      if (lowerText.includes("cita") || lowerText.includes("agendar") || lowerText.includes("reservar")) {
        await iniciarFlujoCita(from, state);
      } else {
        await enviarMensajeWhatsApp(from, 
          "¡Hola! Soy el asistente de Sfisionatur. 🏥\n\n" +
          "Puedo ayudarte a:\n" +
          "📅 Agendar una cita\n" +
          "ℹ️ Información sobre tratamientos\n" +
          "📍 Ubicación y horarios\n\n" +
          "Escribe 'cita' para agendar o dime qué necesitas."
        );
      }
      break;
      
    case "collecting_name":
      if (lowerText.length >= 2) {
        state.data.name = text.trim();
        state.step = "selecting_date";
        await enviarSeleccionFecha(from, state);
      } else {
        await enviarMensajeWhatsApp(from, "Por favor, escribe tu nombre completo.");
      }
      break;
      
    case "collecting_treatment":
      if (lowerText.length >= 5) {
        state.data.treatment = text.trim();
        state.step = "selecting_date";
        await enviarSeleccionFecha(from, state);
      } else {
        await enviarMensajeWhatsApp(from, "Por favor, describe qué tratamiento necesitas.");
      }
      break;
      
    default:
      await enviarMensajeWhatsApp(from, "Por favor, usa los botones para continuar.");
  }
  
  conversationState.set(from, state);
}

// Manejar mensajes interactivos
async function procesarMensajeInteractivo(from, interactive, state) {
  if (interactive.type === "button_reply") {
    const buttonId = interactive.button_reply.id;
    const buttonText = interactive.button_reply.title;
    
    switch (state.step) {
      case "confirm_appointment":
        if (buttonText.includes("Confirmar")) {
          await confirmarCita(from, state);
        } else {
          await cancelarCita(from, state);
        }
        break;
        
      default:
        await enviarMensajeWhatsApp(from, "Por favor, sigue el flujo de agendamiento.");
    }
  } else if (interactive.type === "list_reply") {
    const selectedId = interactive.list_reply.id;
    const selectedTitle = interactive.list_reply.title;
    
    switch (state.step) {
      case "selecting_date":
        await procesarSeleccionFecha(from, selectedId, selectedTitle, state);
        break;
        
      case "selecting_time":
        await procesarSeleccionHora(from, selectedId, selectedTitle, state);
        break;
        
      default:
        await enviarMensajeWhatsApp(from, "Por favor, sigue el flujo de agendamiento.");
    }
  }
  
  conversationState.set(from, state);
}

// Iniciar flujo de agendamiento
async function iniciarFlujoCita(from, state) {
  state.step = "collecting_name";
  state.data = {};
  
  await enviarMensajeWhatsApp(from, 
    "¡Perfecto! Vamos a agendar tu cita. 📅\n\n" +
    "Primero, ¿cuál es tu nombre completo?"
  );
}

// Enviar selección de fecha
async function enviarSeleccionFecha(from, state) {
  const availableDays = obtenerDiasDisponibles();
  
  const sections = [{
    title: "Próximos días disponibles",
    rows: availableDays.map((day, index) => ({
      id: `date_${index}`,
      title: day.formatted,
      description: `Seleccionar ${day.formatted}`
    }))
  }];
  
  await enviarListaInteractiva(
    from,
    "📅 Selecciona una fecha",
    "Elige el día que prefieres para tu cita:",
    "Ver fechas",
    sections
  );
}

// Manejar selección de fecha
async function procesarSeleccionFecha(from, selectedId, selectedTitle, state) {
  const availableDays = obtenerDiasDisponibles();
  const dayIndex = parseInt(selectedId.split("_")[1]);
  
  if (dayIndex >= 0 && dayIndex < availableDays.length) {
    state.data.selectedDate = availableDays[dayIndex].date;
    state.data.selectedDateFormatted = availableDays[dayIndex].formatted;
    state.step = "selecting_time";
    
    await enviarSeleccionHora(from, state);
  } else {
    await enviarMensajeWhatsApp(from, "Por favor, selecciona una fecha válida.");
  }
}

// Enviar selección de hora
async function enviarSeleccionHora(from, state) {
  const sections = [{
    title: `Horarios disponibles para ${state.data.selectedDateFormatted}`,
    rows: BUSINESS_HOURS.timeSlots.map((time, index) => ({
      id: `time_${index}`,
      title: time,
      description: `Cita a las ${time}`
    }))
  }];
  
  await enviarListaInteractiva(
    from,
    "⏰ Selecciona una hora",
    `Elige la hora para tu cita del ${state.data.selectedDateFormatted}:`,
    "Ver horarios",
    sections
  );
}

// Manejar selección de hora
async function procesarSeleccionHora(from, selectedId, selectedTitle, state) {
  const timeIndex = parseInt(selectedId.split("_")[1]);
  
  if (timeIndex >= 0 && timeIndex < BUSINESS_HOURS.timeSlots.length) {
    state.data.selectedTime = BUSINESS_HOURS.timeSlots[timeIndex];
    state.step = "confirm_appointment";
    
    await enviarConfirmacionCita(from, state);
  } else {
    await enviarMensajeWhatsApp(from, "Por favor, selecciona una hora válida.");
  }
}

// Enviar confirmación de cita
async function enviarConfirmacionCita(from, state) {
  const dateTime = new Date(state.data.selectedDate);
  const [hours, minutes] = state.data.selectedTime.split(":");
  dateTime.setHours(parseInt(hours), parseInt(minutes));
  
  const confirmationText = 
    "✅ *Confirmación de Cita*\n\n" +
    `👤 Nombre: ${state.data.name || 'Pendiente'}\n` +
    `📋 Tratamiento: ${state.data.treatment || 'General'}\n` +
    `📅 Fecha: ${state.data.selectedDateFormatted}\n` +
    `⏰ Hora: ${state.data.selectedTime}\n` +
    `⏱️ Duración: 1 hora\n` +
    `📍 Sfisionatur - Avenida de la Libertad 77\n\n` +
    "¿Confirmas esta reserva?";
  
  await enviarBotonesInteractivos(
    from,
    "Confirmar Cita",
    confirmationText,
    ["✅ Confirmar", "❌ Cancelar"]
  );
}

// Confirmar cita
async function confirmarCita(from, state) {
  try {
    // Crear fecha y hora completas
    const dateTime = new Date(state.data.selectedDate);
    const [hours, minutes] = state.data.selectedTime.split(":");
    dateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    // Llamar a Google Calendar API para crear la cita
    const axios = require("axios");
    const response = await axios.post(
      `http://localhost:3001/api/google-calendar/create-appointment`,
      {
        summary: `Cita - ${state.data.name || 'Cliente'}`,
        description: state.data.treatment || 'Cita de fisioterapia',
        dateTime: dateTime.toISOString(),
        duration: 60, // 1 hora
        customerName: state.data.name || 'Cliente',
        customerPhone: from // Número de WhatsApp como contacto
      }
    );
    
    if (response.status === 201) {
      const confirmationMessage = 
        "🎉 *¡Cita Confirmada!*\n\n" +
        `📅 ${state.data.selectedDateFormatted} a las ${state.data.selectedTime}\n` +
        `👤 ${state.data.name || 'Cliente'}\n` +
        `🏥 Tratamiento: ${state.data.treatment || 'General'}\n` +
        `📍 Sfisionatur - Avenida de la Libertad 77\n\n` +
        "📝 Te enviaremos un recordatorio 24 horas antes.\n" +
        "🚗 Puedes aparcar en la zona.\n\n" +
        "¿Necesitas algo más?";
      
      await enviarMensajeWhatsApp(from, confirmationMessage);
    } else {
      throw new Error("Error al crear la cita en Google Calendar");
    }
    
    // Resetear estado
    conversationState.delete(from);
    
  } catch (error) {
    console.error("Error confirmando cita:", error);
    await enviarMensajeWhatsApp(from, "Lo siento, no pude confirmar tu cita. Por favor, intenta de nuevo o contacta directamente al 965123456.");
  }
}

// Cancelar cita
async function cancelarCita(from, state) {
  await enviarMensajeWhatsApp(from, 
    "❌ Cita cancelada.\n\n" +
    "Si quieres agendar en otro momento, simplemente escribe 'cita'.\n\n" +
    "¿Te puedo ayudar con algo más?"
  );
  
  // Resetear estado
  conversationState.delete(from);
}

module.exports = router;
