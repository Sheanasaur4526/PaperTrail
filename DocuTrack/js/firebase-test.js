
import { auth, db } from "./firebase-config.js";

import {
    createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";

console.log("Firebase connected!");
console.log("Project ID:", db.app.options.projectId);
console.log("Authentication initialized:", !!auth);
console.log("Firestore initialized:", !!db);
