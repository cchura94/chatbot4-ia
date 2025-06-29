const { useMultiFileAuthState, default: makeWASocket, DisconnectReason } = require("baileys")
const QRCode = require('qrcode')
const axios = require("axios");
require('dotenv').config()
// const Producto = require("./models/Producto.js")

const userContext = {}

async function connectToWhatsApp () {

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')
    const sock = makeWASocket({
        // can provide additional config here
        auth: state
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const {connection, lastDisconnect, qr } = update
        // on a qr event, the connection and lastDisconnect fields will be empty
      
        if(connection === 'close'){
            const puedeConectarse = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if(puedeConectarse){
                connectToWhatsApp()
            }
        }else if(connection === 'open'){
            console.log("CONEXION ABIERTA!!!");
        }

        // In prod, send this string to your frontend then generate the QR there
        if (qr) {
          // as an example, this prints the qr code to the terminal
          console.log(await QRCode.toString(qr, {type:'terminal', small: true}))
        }
      });


       // recibir Mensajes
    sock.ev.on("messages.upsert", async (event) => {

        for (const m of event.messages) {
            const id = m.key.remoteJid;

            if(event.type != 'notify' || m.key.fromMe || id.includes('@g.us') || id.includes('@broadcast')){
                return;
            }
            const nombre = m.pushName;
            const mensaje = m.message?.conversation || m.message?.extendedTextMessage?.text;
            
            if(!userContext[id]){
                userContext[id] = {list_mensajes: []};
            }
            const respuestaIA = await conectarConOpeAi(mensaje, id);
            await sock.sendMessage(id, {text: respuestaIA});
        }
    });


}

connectToWhatsApp()


async function conectarConOpeAi(mensaje, id){
    const TOKEN = process.env.OPENAI_TOKEN
    
    const productos = await axios.get("https://fakestoreapi.com/products");
    // const productos = await Producto.findAll();

    if(userContext[id]?.list_mensajes.length == 0){
        userContext[id].list_mensajes = [
            {
                "role": "system",
                "content": "Actua como parte del equipo de ventas del negocio (tienda de electronica) responde en no más de 25 palabras y no respondas sobre otros temas."
            },
            {
                "role": "user",
                "content": "Hola, Tiene Monitores?"
            },
            {
                "role": "assistant",
                "content": "No, en este momento no contamos con monitores, solo tenemos: "+JSON.stringify(productos.data)
            }
        ]
    }

    userContext[id]?.list_mensajes.push({
        "role": "user",
        "content": mensaje
    })

    const mensajesss = userContext[id]?.list_mensajes
    // console.log(mensajesss);

    const { data } = await axios.post("https://api.openai.com/v1/chat/completions", {
        "model": "gpt-4.1",
        "messages": userContext[id]?.list_mensajes
    }, {headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer "+TOKEN
    }});

    console.log(data.choices[0].message.content);

    userContext[id].list_mensajes.push(data.choices[0].message);

    return data.choices[0].message.content;

}