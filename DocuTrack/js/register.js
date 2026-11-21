
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

// ======================================
// FORM ELEMENTS
// ======================================

const registerForm = document.getElementById("registerForm");
const registerButton = document.getElementById("registerButton");
const registerMessage = document.getElementById("registerMessage");

const fullnameInput = document.getElementById("fullname");
const studentIdInput = document.getElementById("studentId");
const departmentInput = document.getElementById("department");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const agreeTermsInput = document.getElementById("agreeTerms");

const studentIdGroup = document.getElementById("studentIdGroup");
const roleNotice = document.getElementById("roleNotice");

// ======================================
// DASHBOARD DESTINATIONS
// ======================================

const dashboards = {
    student: "student/dashboard.html",
    faculty: "faculty/dashboard.html",
    registrar: "registrar/registrar_dashboard.html"
};

// ======================================
// DISPLAY MESSAGE
// ======================================

function showMessage(message, type = "error") {
    registerMessage.textContent = message;
    registerMessage.className = `message ${type}`;
    registerMessage.style.display = "block";
}

// ======================================
// GET SELECTED ROLE
// ======================================

function getSelectedRole() {
    return document.querySelector(
        'input[name="role"]:checked'
    )?.value;
}

// ======================================
// ROLE FIELD MANAGEMENT
// ======================================

function updateRoleFields() {
    const role = getSelectedRole();

    if (role === "student") {
        studentIdGroup.style.display = "block";
        studentIdInput.disabled = false;
        studentIdInput.required = true;

        roleNotice.textContent =
            "Student accounts will be created immediately.";
    } else {
        studentIdGroup.style.display = "none";
        studentIdInput.disabled = true;
        studentIdInput.required = false;
        studentIdInput.value = "";

        roleNotice.textContent =
            "Your account will be created with your selected role.";
    }
}

document.querySelectorAll('input[name="role"]').forEach(radio => {
    radio.addEventListener("change", updateRoleFields);
});

updateRoleFields();

// ======================================
// PASSWORD VISIBILITY
// ======================================

document.querySelectorAll(".toggle-password").forEach(button => {
    button.addEventListener("click", () => {
        const target = document.getElementById(
            button.dataset.target
        );

        if (!target) return;

        target.type =
            target.type === "password" ? "text" : "password";

        button.textContent =
            target.type === "password" ? "Show" : "Hide";
    });
});

// ======================================
// REGISTER ACCOUNT
// ======================================

async function registerAccount(data) {

    const {
        fullname,
        email,
        password,
        role,
        studentId,
        department
    } = data;

    if (!dashboards[role]) {
        throw new Error("Please select a valid account role.");
    }

    // 1. Create Firebase Authentication account
    const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
    );

    const user = credential.user;

    // 2. Set Firebase display name
    await updateProfile(user, {
        displayName: fullname
    });

    // 3. Save profile to Firestore
    await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        fullname: fullname,
        email: email,
        studentId: role === "student" ? studentId : null,
        department: department,
        requestedRole: role,
        role: role,
        accountStatus: "active",
        createdAt: serverTimestamp()
    });

    return dashboards[role];
}

// ======================================
// FORM SUBMISSION
// ======================================

registerForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    const fullname = fullnameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    const role = getSelectedRole();
    const studentId = studentIdInput.value.trim();
    const department = departmentInput.value.trim();

    // Validate required fields
    if (!fullname || !email || !department) {
        showMessage("Please complete all required fields.");
        return;
    }

    if (!role) {
        showMessage("Please select an account role.");
        return;
    }

    if (role === "student" && !studentId) {
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

    if (!agreeTermsInput.checked) {
        showMessage("Please agree to the Terms and Conditions.");
        return;
    }

    // Disable button during registration
    registerButton.disabled = true;
    registerButton.textContent = "Creating Account...";

    try {

        showMessage("Connecting to Firebase...", "success");

        const destination = await registerAccount({
            fullname,
            email,
            password,
            role,
            studentId,
            department
        });

        showMessage(
            "Account created successfully! Redirecting to your dashboard...",
            "success"
        );

        // Redirect according to registered role
        setTimeout(() => {
            window.location.href = destination;
        }, 1000);

    } catch (error) {

        console.error("Registration error:", error);

        let message = "Registration failed. Please try again.";

        switch (error.code) {

            case "auth/email-already-in-use":
                message = "This email is already registered.";
                break;

            case "auth/invalid-email":
                message = "Please enter a valid email address.";
                break;

            case "auth/weak-password":
                message = "Password must contain at least 8 characters.";
                break;

            case "auth/operation-not-allowed":
                message = "Email/Password authentication is not enabled in Firebase.";
                break;

            case "auth/network-request-failed":
                message = "Network error. Please check your internet connection.";
                break;

            case "permission-denied":
            case "firestore/permission-denied":
                message = "Firestore denied the profile creation. Check your Firestore rules.";
                break;

            default:
                if (error.message) {
                    message = error.message;
                }
        }

        showMessage(message, "error");

        registerButton.disabled = false;
        registerButton.textContent = "Create Account";
    }
});

console.log("ISATU Registration Script Loaded Successfully");
