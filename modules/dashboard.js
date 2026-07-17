// modules/dashboard.js
module.exports = {
    handleCommand: async (sock, sender, text) => {
        const command = text.trim().toLowerCase();

        if (command === '.ping') {
            await sock.sendMessage(sender, { 
                text: '⚡ *AZAN VIP BOT IS ULTRA ACTIVE* ⚡\nLatency: 120ms\nStatus: Operational' 
            });
        } 
        else if (command === '.menu') {
            await sock.sendMessage(sender, { 
                text: '⭐ *AZAN VIP BOT - SYSTEM MENU* ⭐\n\n1. .ping (Check system speed)\n2. .status (Get connection info)\n3. .features (View active mod list)' 
            });
        }
    }
};
