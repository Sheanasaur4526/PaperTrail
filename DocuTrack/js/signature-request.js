import { db } from "./firebase-config.js";

import {
    collection,
    addDoc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    // ---------------------------------------
    // 1. CHECK STUDENT SESSION
    // ---------------------------------------

    const studentName = sessionStorage.getItem("userName");
    const userRole = sessionStorage.getItem("userRole");

    if (!studentName || userRole !== "student") {
        window.location.replace("../login.html");
        return;
    }

    // ---------------------------------------
    // 2. GET HTML ELEMENTS
    // ---------------------------------------

    const form = document.getElementById("signatureRequestForm");
    const submitButton = document.getElementById("submitButton");
    const formMessage = document.getElementById("formMessage");

    const qrResult = document.getElementById("qrResult");
    const trackingNumberDisplay = document.getElementById("trackingNumberDisplay");
    const qrCodeContainer = document.getElementById("qrcode");
    const printButton = document.getElementById("printButton");

    const studentNameInput = document.getElementById("studentName");
    const neededDateInput = document.getElementById("neededDate");

    studentNameInput.value = studentName;

    // Prevent selecting a past date.
    const today = new Date();
    const localToday = new Date(
        today.getTime() - today.getTimezoneOffset() * 60000
    ).toISOString().split("T")[0];

    neededDateInput.min = localToday;

    let submittedTrackingNumber = "";

    // ---------------------------------------
    // 3. MESSAGE HELPER
    // ---------------------------------------

    function showMessage(message, type = "error") {
        formMessage.textContent = message;
        formMessage.className = "message " + type;
    }

    // ---------------------------------------
    // 4. GENERATE TRACKING NUMBER
    // ---------------------------------------

    function generateTrackingNumber() {
        const datePart = new Date()
            .toISOString()
            .slice(0, 10)
            .replaceAll("-", "");

        const randomPart = Math.random()
            .toString(36)
            .substring(2, 8)
            .toUpperCase();

        return "SIG-" + datePart + "-" + randomPart;
    }

    // ---------------------------------------
    // 5. GENERATE QR CODE
    // ---------------------------------------

    function generateQRCode(trackingNumber) {

        qrCodeContainer.innerHTML = "";

        if (typeof QRCode === "undefined") {
            qrCodeContainer.textContent =
                "QR library could not load. Keep your tracking number.";
            return;
        }

        const qrData = JSON.stringify({
            type: "FACULTY_SIGNATURE",
            trackingNumber: trackingNumber
        });

        new QRCode(qrCodeContainer, {
            text: qrData,
            width: 200,
            height: 200,
            colorDark: "#003D29",
            colorLight: "#FFFFFF",
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    // ---------------------------------------
    // 6. SUBMIT SIGNATURE REQUEST
    // ---------------------------------------

    form.addEventListener("submit", async function (event) {

        event.preventDefault();

        if (submitButton.disabled) return;

        const studentId = document.getElementById("studentId").value.trim();
        const course = document.getElementById("course").value.trim();
        const yearLevel = document.getElementById("yearLevel").value;

        const facultyName = document.getElementById("facultyName").value.trim();
        const department = document.getElementById("department").value.trim();
        const facultyEmail = document.getElementById("facultyEmail").value.trim();

        const neededDate = neededDateInput.value;

        const documentType = document.getElementById("documentType").value;
        const subject = document.getElementById("subject").value.trim();
        const purpose = document.getElementById("purpose").value.trim();
        const notes = document.getElementById("notes").value.trim();

        // ---------------------------------------
        // VALIDATION
        // ---------------------------------------

        if (
            !studentId ||
            !course ||
            !yearLevel ||
            !facultyName ||
            !department ||
            !neededDate ||
            !documentType ||
            !purpose
        ) {
            showMessage("Please complete all required fields.");
            return;
        }

        if (neededDate < localToday) {
            showMessage("Please select today or a future date.");
            return;
        }

        if (facultyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(facultyEmail)) {
            showMessage("Please enter a valid faculty email address.");
            return;
        }

        // ---------------------------------------
        // SAVE TO FIRESTORE
        // ---------------------------------------

        submitButton.disabled = true;
        submitButton.textContent = "Submitting Request...";

        showMessage("Saving your signature request...", "success");

        try {

            const trackingNumber = generateTrackingNumber();

            const requestData = {
                trackingNumber: trackingNumber,
                requestType: "FACULTY_SIGNATURE",

                // Student information
                student: studentName,
                studentId: studentId,
                course: course,
                yearLevel: yearLevel,

                // Faculty information
                assignedFaculty: facultyName,
                facultyName: facultyName,
                facultyEmail: facultyEmail,
                department: department,

                // Document information
                document: documentType,
                subject: subject,
                office: department,
                purpose: purpose,
                notes: notes,
                neededDate: neededDate,

                // Request status
                status: "Pending Faculty Signature",
                signatureStatus: "PENDING",
                paymentStatus: "NOT_REQUIRED",

                // Timestamps
                date: new Date().toISOString(),
                submittedAt: serverTimestamp(),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            const requestRef = await addDoc(
                collection(db, "documentRequests"),
                requestData
            );

            // Save Firestore document ID into the request.
            await updateDoc(requestRef, {
                id: requestRef.id
            });

            submittedTrackingNumber = trackingNumber;

            // Display tracking number.
            trackingNumberDisplay.textContent = trackingNumber;

            // Generate QR code.
            generateQRCode(trackingNumber);

            // Display QR section.
            qrResult.classList.add("visible");

            showMessage(
                "Your faculty signature request was successfully submitted!",
                "success"
            );

            submitButton.textContent = "Request Submitted";

            // Prevent duplicate submissions.
            form.querySelectorAll("input, select, textarea").forEach(function (field) {
                field.disabled = true;
            });

            qrResult.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });

            console.log("Signature request saved:", requestRef.id);

        } catch (error) {

            console.error("Signature request error:", error);

            showMessage(
                "Unable to submit your request. Please check your Firestore connection and permissions.",
                "error"
            );

            submitButton.disabled = false;
            submitButton.textContent = "Submit Signature Request";
        }
    });

    // ---------------------------------------
    // 7. PRINT QR CODE
    // ---------------------------------------

    printButton.addEventListener("click", function () {

        if (!submittedTrackingNumber) {
            showMessage("Submit your request first.");
            return;
        }

        window.print();
    });

    // ---------------------------------------
    // 8. LOGOUT
    // ---------------------------------------

    document.getElementById("logoutButton").addEventListener("click", function (event) {

        event.preventDefault();

        if (confirm("Are you sure you want to log out?")) {
            sessionStorage.clear();
            window.location.replace("../login.html");
        }
    });

});