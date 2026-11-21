
// js/request-document.js

import { db } from "./firebase-config.js";

import {
    collection,
    addDoc,
    doc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    const userName = sessionStorage.getItem("userName");
    const userRole = sessionStorage.getItem("userRole");

    if (!userName || userRole !== "student") {
        window.location.replace("../login.html");
        return;
    }

    document.getElementById("studentName").textContent = userName;

    const documentFees = {
        "Certificate of Enrollment": 50,
        "Transcript of Records": 100,
        "Certificate of Grades": 50,
        "Good Moral Certificate": 75,
        "Honorable Dismissal": 150,
        "Certificate of Graduation": 100,
        "Other Document": 50
    };

    const documentScores = {
        "Certificate of Enrollment": 90,
        "Transcript of Records": 85,
        "Certificate of Grades": 80,
        "Good Moral Certificate": 75,
        "Honorable Dismissal": 90,
        "Certificate of Graduation": 100,
        "Other Document": 50
    };

    const form = document.getElementById("requestForm");
    const documentSelect = document.getElementById("documentType");
    const copiesInput = document.getElementById("copies");

    let currentRequest = null;
    let currentRequestRef = null;

    function peso(amount) {
        return "₱" + Number(amount).toFixed(2);
    }

    function calculateDeadlineScore(dateNeeded) {
        if (!dateNeeded) return 30;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const deadline = new Date(dateNeeded + "T00:00:00");

        const daysRemaining = Math.ceil(
            (deadline.getTime() - today.getTime()) / 86400000
        );

        if (daysRemaining <= 1) return 100;
        if (daysRemaining <= 3) return 85;
        if (daysRemaining <= 7) return 70;
        if (daysRemaining <= 14) return 50;

        return 25;
    }

    function calculatePriority(request) {

        const urgencyScore =
            request.urgency === "Urgent" ? 100 : 50;

        const deadlineScore =
            calculateDeadlineScore(request.neededDate);

        const importanceScore =
            Number(request.importance) || 50;

        const documentScore =
            documentScores[request.document] || 50;

        const submitted = new Date(request.submittedAt).getTime();

        const waitingDays = Number.isFinite(submitted)
            ? Math.max(0, (Date.now() - submitted) / 86400000)
            : 0;

        const waitingScore = Math.min(100, 20 + waitingDays * 10);

        const score =
            urgencyScore * 0.30 +
            deadlineScore * 0.25 +
            importanceScore * 0.20 +
            documentScore * 0.15 +
            waitingScore * 0.10;

        let level = "Low";

        if (score >= 90) level = "Critical";
        else if (score >= 75) level = "High";
        else if (score >= 50) level = "Medium";

        return {
            priorityScore: Math.round(score * 100) / 100,
            priorityLevel: level,
            priorityFactors: {
                urgency: urgencyScore,
                deadline: deadlineScore,
                importance: importanceScore,
                documentType: documentScore,
                waitingTime: Math.round(waitingScore * 100) / 100
            }
        };
    }

    function calculateTotal() {

        const documentType = documentSelect.value;

        const copies = Math.max(
            1,
            Math.min(10, Number(copiesInput.value) || 1)
        );

        const fee = documentFees[documentType] || 0;
        const total = fee * copies;

        document.getElementById("unitFee").textContent = peso(fee);
        document.getElementById("copyDisplay").textContent = copies;
        document.getElementById("totalFee").textContent = peso(total);

        return { fee, copies, total };
    }

    function showMessage(elementId, message, type) {
        const element = document.getElementById(elementId);
        element.textContent = message;
        element.className = "message " + type;
    }

    documentSelect.addEventListener("change", calculateTotal);
    copiesInput.addEventListener("input", calculateTotal);

    const logoutButton = document.getElementById("logoutButton");

    if (logoutButton) {
        logoutButton.addEventListener("click", function (event) {
            event.preventDefault();

            if (confirm("Are you sure you want to log out?")) {
                sessionStorage.clear();
                window.location.replace("../login.html");
            }
        });
    }

    // SUBMIT REQUEST TO FIRESTORE
    form.addEventListener("submit", async function (event) {

        event.preventDefault();

        if (!form.reportValidity()) return;

        if (typeof QRCode === "undefined") {
            showMessage(
                "formMessage",
                "QR code library could not load. Check your internet connection and reload.",
                "error"
            );
            return;
        }

        const submitButton = document.getElementById("submitButton");
        submitButton.disabled = true;

        try {
            const amount = calculateTotal();
            const requestId = "REQ-" + Date.now();

            const submittedAt = new Date().toISOString();

            currentRequest = {
                id: requestId,
                student: userName,
                studentId: document.getElementById("studentId").value.trim(),
                course: document.getElementById("course").value.trim(),
                yearLevel: document.getElementById("yearLevel").value,
                contact: document.getElementById("contact").value.trim(),
                email: document.getElementById("email").value.trim(),
                office: document.getElementById("office").value,
                document: documentSelect.value,
                copies: amount.copies,
                unitFee: amount.fee,
                total: amount.total,
                urgency: document.getElementById("urgency").value,
                importance: document.getElementById("importance").value,
                neededDate: document.getElementById("neededDate").value,
                purpose: document.getElementById("purpose").value.trim(),
                notes: document.getElementById("notes").value.trim(),
                date: new Date().toLocaleString(),
                submittedAt: submittedAt,
                paymentStatus: "UNPAID",
                status: "Pending Payment",
                createdAt: serverTimestamp()
            };

            Object.assign(
                currentRequest,
                calculatePriority(currentRequest)
            );

            // Save the request to Firestore.
            currentRequestRef = await addDoc(
                collection(db, "documentRequests"),
                currentRequest
            );

            document.getElementById("requestIdDisplay").textContent =
                requestId;

            document.getElementById("documentDisplay").textContent =
                currentRequest.document;

            document.getElementById("officeDisplay").textContent =
                currentRequest.office;

            document.getElementById("amountDisplay").textContent =
                peso(currentRequest.total);

            const qrContainer = document.getElementById("qrcode");
            qrContainer.innerHTML = "";

            const qrPayload = JSON.stringify({
                type: "ISATU_DEMO_PAYMENT",
                requestId: requestId,
                amount: currentRequest.total,
                student: userName,
                paymentStatus: "UNPAID"
            });

            new QRCode(qrContainer, {
                text: qrPayload,
                width: 190,
                height: 190,
                correctLevel: QRCode.CorrectLevel.H
            });

            document.getElementById("paymentSection").style.display = "block";

            showMessage(
                "formMessage",
                "Request successfully saved! Your payment QR code is ready.",
                "success"
            );

            document.getElementById("simulatePaymentButton").disabled = false;
            document.getElementById("simulatePaymentButton").textContent =
                "Simulate Payment";

            document.getElementById("paymentSection").scrollIntoView({
                behavior: "smooth"
            });

        } catch (error) {
            console.error("Firestore request submission failed:", error);

            showMessage(
                "formMessage",
                "Unable to save your request: " + error.message,
                "error"
            );

            submitButton.disabled = false;
        }
    });

    // SIMULATE PAYMENT AND UPDATE FIRESTORE
    document.getElementById("simulatePaymentButton")
        .addEventListener("click", async function () {

            if (!currentRequest || !currentRequestRef) return;

            this.disabled = true;

            try {
                await updateDoc(currentRequestRef, {
                    paymentStatus: "PAID",
                    status: "Pending",
                    paidAt: serverTimestamp()
                });

                currentRequest.paymentStatus = "PAID";
                currentRequest.status = "Pending";

                const status = document.getElementById("paymentStatus");
                status.textContent = "PAID";
                status.classList.add("paid");

                showMessage(
                    "paymentMessage",
                    "Demo payment successful! Your request is now available to the registrar.",
                    "success"
                );

                this.textContent = "Payment Simulated";

                document.getElementById("submitButton").disabled = true;

            } catch (error) {
                console.error("Payment update failed:", error);

                showMessage(
                    "paymentMessage",
                    "Unable to update payment: " + error.message,
                    "error"
                );

                this.disabled = false;
            }
        });

    document.getElementById("printButton").addEventListener("click", function () {
        window.print();
    });

    calculateTotal();

});
