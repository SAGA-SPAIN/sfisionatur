1. Instalar modulos de node " npm install " en ruta backend \fisio\backend 
2. Una vez instalada levantamos el servidor con npm start
3. Y cuando lo tengamos levantado entramos con Live server y nos lleva a = http://127.0.0.1:5500/index.html
4. Una vez ahi nos dirigimos al formulario y rellenamos todos los campos.
5. Para verificar que funciona nos vamos a la ruta /backend/data/leads.jsonl
6. Ahi dentro estan guardados todos los usuarios
7. Prueba


1. Conectar con Google calender
2. Instalamos modulos, en la ruta backend, y levantamos servidor con npm start.
3. Copiamos esta url http://localhost:3001/api/google-calendar/status 
4. Si nos devuelve true, genial el token quedo guardado.
5. {
  "connected": true
   }

6. NO BORRAR ARCHIVO EN backend/data/google-calendar-token.json



PROBAR RESULTADOS
1. En bruno o postman utilizamos el metodo POST 
2. No ponemos nada en el body, e copiamos esta URL 
    http://localhost:3001/api/google-calendar/test-hola
3. Si nos da un mensaje de activar google calendar API a este proyecto,
    entramos al link que nos da, y habilitamos
4. Volvemos a ir a postman o bruno, y repetimos el paso, nos tiene que devolver el evento.
