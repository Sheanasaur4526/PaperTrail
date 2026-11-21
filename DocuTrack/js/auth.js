
// js/auth.js

import { auth, db } from "./firebase-config.js";

import {
    createUserWithEmailAndPassword,
    updateProfile
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";

import {
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";


const registerForm = document.getElementById("registerForm");

if (registerForm) {

    registerForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        const fullname = document.getElementById("fullname").value.trim();
        const studentId = document.getElementById("studentId").value.trim();
        const department = document.getElementById("department").value.trim();
        const email = document.getElementById("email").value.trim().toLowerCase();

        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirmPassword").value;

        const selectedRole = document.querySelector(
            'input[name="role"]:checked'
        );

        const agreeTerms = document.getElementById("agreeTerms").checked;

        const registerButton = document.getElementById("registerButton");
        const registerMessage = document.getElementById("registerMessage");

        // Display messages
        function showMessage(message, type = "error") {
            registerMessage.textContent = message;
            registerMessage.className = `message ${type}`;
        }

        // Validate role
        if (!selectedRole) {
            showMessage("Please select an account role.");
            return;
        }

        const requestedRole = selectedRole.value;

        // Validate required information
        if (!fullname || !department || !email) {
            showMessage("Please complete all required fields.");
            return;
        }

        if (requestedRole === "student" && !studentId) {
            showMessage("Please enter your Student ID.");
            return;
        }

        if (password.length < 8) {
            showMessage("Password must contain at least 8 characters.");
            return;
        }

        if (password !== confirmPassword) {
            showMessage("Passwords do not match.");
            return;
        }

        if (!agreeTerms) {
            showMessage("Please agree to the Terms and Conditions.");
            return;
        }

        try {

            registerButton.disabled = true;
            registerButton.textContent = "Creating Account...";

            // Create Firebase Authentication account
            const userCredential = await createUserWithEmailAndPassword(
                auth,
                email,
                password
            );

            const user = userCredential.user;

            // Save user's display name
            await updateProfile(user, {
                displayName: fullname
            });

            // Public registration cannot grant privileged roles.
            const assignedRole =
                requestedRole === "student" ? "student" : "pending";

            const accountStatus =
                requestedRole === "student" ? "active" : "pending";

            // Prepare Firestore user information
            const userData = {
                uid: user.uid,
                fullname: fullname,
                email: email,
                studentId: requestedRole === "student" ? studentId : null,
                department: department,

                requestedRole: requestedRole,
                role: assignedRole,
                accountStatus: accountStatus,

                createdAt: serverTimestamp()
            };

            // Save information in Firestore
            await setDoc(doc(db, "users", user.uid), userData);

            showMessage("Account created successfully!", "success");

            // Redirect based on registration role
            setTimeout(() => {

                if (requestedRole === "student") {
                    window.location.href = "student/dashboard.html";
                } else {
                    window.location.href = "pending-approval.html";
                }

            }, 1000);

        } catch (error) {

            console.error("Registration error:", error);

            let errorMessage = "Unable to create your account.";

            switch (error.code) {

                case "auth/email-already-in-use":
                    errorMessage = "This email is already registered.";
                    break;

                case "auth/invalid-email":
                    errorMessage = "Please enter a valid email address.";
                    break;

                case "auth/weak-password":
                    errorMessage = "Please choose a stronger password.";
                    break;

                case "auth/network-request-failed":
                    errorMessage = "Network error. Please check your connection.";
                    break;

                case "permission-denied":
                    errorMessage = "Firestore denied the request. Check your security rules.";
                    break;
            }

            showMessage(errorMessage);

            registerButton.disabled = false;
            registerButton.textContent = "Create Account";

        }

    });

}
