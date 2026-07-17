// modules/firebase.js
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set, get, update } = require('firebase/database');

// 🌟 Aapki actual Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyAGrcsmSR62n05_UyxAUWhkZQRtnHSDx8A",
  authDomain: "azan-bot-id.firebaseapp.com",
  projectId: "azan-bot-id",
  storageBucket: "azan-bot-id.firebasestorage.app",
  messagingSenderId: "793460618081",
  appId: "1:793460618081:web:3d36c6eafcd3b9c3d90b20",
  // Realtime Database ka URL (Apne console ke Realtime Database tab se copy karke yahan lagayein)
  databaseURL: "https://azan-bot-id-default-rtdb.firebaseio.com" 
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

module.exports = {
    // Toggles settings save karne ke liye
    saveSettings: async (settings) => {
        try {
            await set(ref(db, 'bot/settings'), settings);
            return { success: true };
        } catch (error) {
            console.error("Firebase Save Error:", error);
            return { success: false, error: error.message };
        }
    },

    // App start hone par settings fetch karne ke liye
    getSettings: async () => {
        try {
            const snapshot = await get(ref(db, 'bot/settings'));
            if (snapshot.exists()) {
                return snapshot.val();
            }
            return null;
        } catch (error) {
            console.error("Firebase Get Error:", error);
            return null;
        }
    },

    // Single switch toggle update karne ke liye
    updateSingleSetting: async (key, value) => {
        try {
            const updates = {};
            updates[`bot/settings/${key}`] = value;
            await update(ref(db), updates);
            return { success: true };
        } catch (error) {
            console.error("Firebase Update Error:", error);
            return { success: false };
        }
    }
};
