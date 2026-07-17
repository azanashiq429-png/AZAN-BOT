const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const QRCode = require('qrcode');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const admin = require('firebase-admin'); // 👈 Firebase Admin SDK for VIP codes

// 🌟 Modules Import (Aap ke banaye hue specialized modules)
const firebaseModule = require('./modules/firebase');
const dashboardModule = require('./modules/dashboard');
const downloadModule = require('./modules/download');
const videoModule = require('./modules/video');
const privacyModule = require('./modules/privacy');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ==================== 🛠️ FIREBASE REALTIME DATABASE INIT ====================
// Agar aapka local 'firebaseModule' pehle se app initialize nahi kar raha, toh yeh safety check crash hone se bachaega
if (!admin.apps.length) {
    try {
        const serviceAccount = require("./firebase-key.json"); // Make sure firebase-key.json is in your root folder!
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: "https://console.firebase.google.com/u/0/project/azan-bot-id/database/azan-bot-id-default-rtdb/data/~2F?hl=en-PK" // 👈 Yahan apna actual Firebase Database URL paste karein
        });
        console.log("🔥 Firebase Admin SDK successfully connected for VIP Telemetry!");
    } catch (err) {
        console.error("❌ Firebase Initialization Error: check your firebase-key.json file!", err);
    }
}
const db = admin.database();

let sock;
let isConnecting = false;

// ⚡ Dynamic Connection Engine (QR Code aur Pairing Code dono ke liye single robust function)
async function connectToWhatsApp(socket, usePairingCode = false, phoneNumber = '') {
    if (isConnecting) return;
    isConnecting = true;

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    // 📲 Dynamic Pairing Code Engine
    if (usePairingCode && !sock.authState.creds.registered) {
        let cleanNumber = phoneNumber.replace(/[^0-9]/g, ''); // Non-numeric symbols remove karne ke liye
        
        setTimeout(async () => {
            try {
                console.log(`📲 Secure Pairing Code request for: ${cleanNumber}`);
                socket.emit('engine-status', { message: 'Generating Secure Code...', color: '#f1c40f' });
                
                const code = await sock.requestPairingCode(cleanNumber);
                
                // Frontend par dynamic code response bhejna
                socket.emit('pairing-code-response', { code: code });
                socket.emit('engine-status', { message: `Secure Link Code: ${code}`, color: '#00e5ff' });
            } catch (err) {
                console.error('Pairing code generation failed:', err);
                socket.emit('engine-status', { message: 'Failed to generate code. Check your number!', color: '#e74c3c' });
            }
        }, 3000);
    }

    // 🔄 Connection Events Update Handler
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // 📷 QR Code Stream Handler (Sirf tab chalega jab Pairing Code use na ho raha ho)
        if (qr && !usePairingCode) {
            console.log('📷 QR Code generated!');
            try {
                const qrImage = await QRCode.toDataURL(qr);
                socket.emit('qr-code', { image: qrImage });
                socket.emit('engine-status', { message: 'Scan this QR using WhatsApp linked devices!', color: '#00e5ff' });
            } catch (err) {
                console.error(err);
            }
        }

        if (connection === 'connecting') {
            socket.emit('engine-status', { message: 'Initializing VIP connection protocol...', color: '#f1c40f' });
        }

        if (connection === 'open') {
            console.log('🟢 WhatsApp Bot Connected successfully!');
            socket.emit('engine-status', { message: 'VIP Engine Connected & Active! ✅', color: '#2ecc71', connected: true });
            isConnecting = false;
        }

        if (connection === 'close') {
            isConnecting = false;
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            socket.emit('engine-status', { message: 'Connection interrupted. Re-connecting...', color: '#e74c3c' });

            if (shouldReconnect) {
                connectToWhatsApp(socket, usePairingCode, phoneNumber);
            }
        }
    });

    // ✉️ Incoming Messages Router
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const msg = chatUpdate.messages[0];
            // Apne bhejey hue messages aur group system updates ignore karein
            if (!msg.key.fromMe && chatUpdate.type === 'notify') {
                const senderNumber = msg.key.remoteJid;
                const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
                
                // Dashboard commands module par control transfer karein
                dashboardModule.handleCommand(sock, senderNumber, messageText);
            }
        } catch (error) {
            console.error("Message handling error:", error);
        }
    });
}

// 🔌 Socket.io Dashboard Synchronization Channel
io.on('connection', async (socket) => {
    console.log('⚡ AZAN VIP Admin Dashboard Connected.');

    // ==================== 🔑 NEW: VIP CODE INSTANT ACTIVATION ====================
    socket.on('activate-vip-code', async (data) => {
        try {
            const { phone, code } = data;

            if (!phone || !code) {
                return socket.emit('activation-response', { success: false, message: "Bhai Phone Number aur VIP Code dono likhna zaroori hai!" });
            }

            const cleanPhone = phone.replace(/[^0-9]/g, '');
            const cleanCode = code.trim();

            if (cleanPhone.length < 10) {
                return socket.emit('activation-response', { success: false, message: "Bhai phone number correct likhein (e.g. 923001234567)!" });
            }

            // Firebase database me code lookup check karein
            const codeRef = db.ref(`vip_codes/${cleanCode}`);
            const snapshot = await codeRef.once('value');

            if (snapshot.exists()) {
                const codeData = snapshot.val();

                if (codeData.status === 'unused') {
                    // User ka VIP Status directly database mein save karein
                    await db.ref(`users/${cleanPhone}`).set({
                        phone: cleanPhone,
                        isVipPro: true,
                        planName: codeData.plan || "VIP Pro Plan",
                        activatedAt: new Date().toISOString()
                    });

                    // Code ko disable/used mark kar dein taake koi dobara use na kar sake
                    await codeRef.update({
                        status: 'used',
                        usedBy: cleanPhone,
                        usedAt: new Date().toISOString()
                    });

                    console.log(`✅ VIP Activated via Code: Code ${cleanCode} used by ${cleanPhone}`);
                    socket.emit('activation-response', { 
                        success: true, 
                        message: `Congratulations! 🎉 Aapka ${codeData.plan || "VIP Pro"} plan successfully active ho gaya hai!` 
                    });
                } else {
                    socket.emit('activation-response', { success: false, message: "Yeh code pehle hi kisi aur ne use kar liya hai! ❌" });
                }
            } else {
                socket.emit('activation-response', { success: false, message: "Invalid VIP Code! Ghalat code likha hai aapne." });
            }

        } catch (error) {
            console.error("Error in VIP Code activation:", error);
            socket.emit('activation-response', { success: false, message: "Database error or server timeout!" });
        }
    });

    // 1. WhatsApp Connection (QR Method)
    socket.on('start-vip-engine', () => {
        connectToWhatsApp(socket, false);
    });

    // 2. WhatsApp Connection (Secure Pairing Code Method)
    socket.on('start-pairing-engine', (data) => {
        connectToWhatsApp(socket, true, data.phone);
    });

    // 3. Real-Time Settings Cloud Sync on Page Load
    try {
        const savedDbSettings = await firebaseModule.getSettings();
        if (savedDbSettings) {
            socket.emit('load-settings', savedDbSettings);
        }
    } catch (error) {
        console.error('Firebase sync on load failed:', error);
    }

    // 4. Handle Real-Time Live Switch Toggle Changes
    socket.on('toggle-feature', async (data) => {
        console.log(`Toggle event received: ${data.feature} -> ${data.status}`);
        
        // Local module level check aur variables state updates
        const response = privacyModule.handleToggle(data.feature, data.status);
        
        // Firebase Cloud Database par instant change save karna
        await firebaseModule.updateSingleSetting(data.feature, data.status);
        
        socket.emit('toggle-response', response);
    });

    socket.on('disconnect', () => {
        console.log('❌ Dashboard Disconnected.');
    });
});

// Port Execution
server.listen(PORT, () => {
    console.log(`🔥 Server is running flawlessly on port http://localhost:${PORT}`);
});
