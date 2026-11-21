
// js/firebase-config.js

// Import Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBgJixqcMpdMe34d-SwTumOxgtWpElVcEk",
    authDomain: "docutrack-2854c.firebaseapp.com",
    projectId: "docutrack-2854c",
    storageBucket: "docutrack-2854c.firebasestorage.app",
    messagingSenderId: "981587900917",
    appId: "1:981587900917:web:e87c65756fcdb89c57c8bc",
    measurementId: "G-FLZ5X05PLG"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Authentication
const auth = getAuth(app);

// Initialize Firestore
const db = getFirestore(app);

// Export Firebase services
export { app, auth, db };
