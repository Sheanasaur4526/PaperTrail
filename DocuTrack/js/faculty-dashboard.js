import { db } from "./firebase-config.js";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    updateDoc,
    serverTimestamp,
    limit
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    // ---------------------------------------
    // 1. CHECK FACULTY SESSION
    // ---------------------------------------

    const userName = sessionStorage.getItem("userName");
    const userRole = sessionStorage.getItem("userRole");

    if (!userName || userRole !== "faculty") {
        window.location.replace("../login.html");
        return;
    }

    document.getElementById("userName").textContent = userName;

    // ---------------------------------------
    // 2. ELEMENTS
    // ---------------------------------------

    const trackingInput = document.getElementById("trackingNumber");
    const searchButton = document.getElementById("searchButton");
    const searchMessage = document.getElementById("searchMessage");

    const requestCard = document.getElementById("requestCard");
    const emptyState = document.getElementById("emptyState");

    const startScannerButton = document.getElementById("startScannerButton");
    const stopScannerButton = document.getElementById("stopScannerButton");
    const scannerMessage = document.getElementById("scannerMessage");

    const confirmSignedButton = document.getElementById("confirmSignedButton");
    const confirmMessage = document.getElementById("confirmMessage");

    let selectedRequest = null;
    let selectedRequestRef = null;
    let html5QrCode = null;
    let scannerRunning = false;
    let isUpdating = false;

    // ---------------------------------------
    // 3. HELPER FUNCTIONS
    // ---------------------------------------

    function showMessage(element, message, type = "info") {
        element.textContent = message;
        element.className = "message " + type;
    }

    function safeText(value) {
        return value === undefined || value === null || value === ""
            ? "Not provided"
            : String(value);
    }

    function getRequestDate(request) {
        const timestamp = request.submittedAt || request.createdAt || request.date;

        if (!timestamp) return "Not available";

        if (typeof timestamp.toDate === "function") {
            return timestamp.toDate().toLocaleString();
        }

        const date = new Date(timestamp);

        return Number.isNaN(date.getTime())
            ? "Not available"
            : date.toLocaleString();
    }

    function getTrackingNumber(request, documentId) {
        return request.trackingNumber || request.id || documentId;
    }

    // ---------------------------------------
    // 4. DISPLAY REQUEST DETAILS
    // ---------------------------------------

    function displayRequest(request, documentId, requestRef) {
        selectedRequest = request;
        selectedRequestRef = requestRef;

        document.getElementById("detailTracking").textContent =
            getTrackingNumber(request, documentId);

        document.getElementById("detailStudent").textContent =
            safeText(request.student);

        document.getElementById("detailDocument").textContent =
            safeText(request.document);

        document.getElementById("detailOffice").textContent =
            safeText(request.office);

        document.getElementById("detailStudentId").textContent =
            safeText(request.studentId);

        document.getElementById("detailDate").textContent =
            getRequestDate(request);

        document.getElementById("detailPurpose").textContent =
            safeText(request.purpose);

        const currentStatus = safeText(request.status);
        const signatureStatus = safeText(request.signatureStatus);

        document.getElementById("requestStatus").textContent =
            signatureStatus === "SIGNED" || currentStatus.toLowerCase() === "signed"
                ? "SIGNED"
                : currentStatus.toUpperCase();

        const alreadySigned =
            signatureStatus === "SIGNED" ||
            currentStatus.toLowerCase() === "signed";

        if (alreadySigned) {
            confirmSignedButton.disabled = true;
            confirmSignedButton.textContent = "Document Already Marked as Signed";

            document.getElementById("confirmationNote").textContent =
                "This request has already been marked as signed.";

            showMessage(
                confirmMessage,
                "The student has already been notified that this document was signed.",
                "success"
            );
        } else {
            confirmSignedButton.disabled = false;
            confirmSignedButton.textContent = "Confirm Document Signed";

            document.getElementById("confirmationNote").textContent =
                "Confirm only if you have physically signed the document.";

            confirmMessage.textContent = "";
        }

        requestCard.classList.add("visible");
        emptyState.style.display = "none";
    }

    function clearRequest() {
        selectedRequest = null;
        selectedRequestRef = null;

        requestCard.classList.remove("visible");
        emptyState.style.display = "block";

        confirmSignedButton.disabled = true;
        confirmMessage.textContent = "";
    }

    // ---------------------------------------
    // 5. FIND REQUEST IN FIRESTORE
    // ---------------------------------------

    async function findRequest(trackingNumber) {
        const tracking = trackingNumber.trim();

        if (!tracking) {
            throw new Error("Please enter a tracking number.");
        }

        const requestsRef = collection(db, "documentRequests");

        // First: check if the tracking number is the Firestore document ID.
        const directRef = doc(db, "documentRequests", tracking);
        const directSnapshot = await getDoc(directRef);

        if (directSnapshot.exists()) {
            return {
                data: directSnapshot.data(),
                id: directSnapshot.id,
                ref: directRef
            };
        }

        // Second: search the stored trackingNumber field.
        let requestQuery = query(
            requestsRef,
            where("trackingNumber", "==", tracking),
            limit(1)
        );

        let result = await getDocs(requestQuery);

        if (!result.empty) {
            const requestDoc = result.docs[0];

            return {
                data: requestDoc.data(),
                id: requestDoc.id,
                ref: requestDoc.ref
            };
        }

        // Third: search the stored id field.
        requestQuery = query(
            requestsRef,
            where("id", "==", tracking),
            limit(1)
        );

        result = await getDocs(requestQuery);

        if (!result.empty) {
            const requestDoc = result.docs[0];

            return {
                data: requestDoc.data(),
                id: requestDoc.id,
                ref: requestDoc.ref
            };
        }

        return null;
    }

    // ---------------------------------------
    // 6. SEARCH TRACKING NUMBER
    // ---------------------------------------

    async function searchRequest(trackingNumber) {
        clearRequest();

        showMessage(searchMessage, "Searching for document request...", "info");

        try {
            const found = await findRequest(trackingNumber);

            if (!found) {
                showMessage(
                    searchMessage,
                    "No request found. Check the tracking number and try again.",
                    "error"
                );
                return;
            }

            displayRequest(found.data, found.id, found.ref);

            showMessage(
                searchMessage,
                "Request found. Review the details before confirming.",
                "success"
            );

        } catch (error) {
            console.error("Request search error:", error);

            showMessage(
                searchMessage,
                "Unable to search. Check your Firestore connection and permissions.",
                "error"
            );
        }
    }

    searchButton.addEventListener("click", function () {
        searchRequest(trackingInput.value);
    });

    trackingInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            searchRequest(trackingInput.value);
        }
    });

    // ---------------------------------------
    // 7. READ QR CODE CONTENT
    // ---------------------------------------

    function extractTrackingNumber(qrText) {
        const raw = String(qrText || "").trim();

        if (!raw) return "";

        // QR code may contain a JSON object.
        try {
            const parsed = JSON.parse(raw);

            if (typeof parsed === "string") {
                return parsed.trim();
            }

            return String(
                parsed.trackingNumber ||
                parsed.requestId ||
                parsed.id ||
                parsed.reference ||
                ""
            ).trim();

        } catch (error) {
            // Not JSON; continue with plain text.
        }

        // QR code may contain a URL with a tracking parameter.
        try {
            const url = new URL(raw);

            const tracking =
                url.searchParams.get("trackingNumber") ||
                url.searchParams.get("requestId") ||
                url.searchParams.get("id");

            if (tracking) return tracking.trim();

        } catch (error) {
            // Not a URL; use the raw QR text.
        }

        return raw;
    }

    // ---------------------------------------
    // 8. QR SCANNER
    // ---------------------------------------

    async function stopScanner() {
        if (!html5QrCode || !scannerRunning) return;

        try {
            await html5QrCode.stop();
            await html5QrCode.clear();
        } catch (error) {
            console.warn("Scanner stop:", error);
        }

        scannerRunning = false;
        startScannerButton.disabled = false;
        stopScannerButton.disabled = true;
    }

    startScannerButton.addEventListener("click", async function () {
        if (typeof Html5Qrcode === "undefined") {
            showMessage(
                scannerMessage,
                "QR scanner library did not load. Refresh the page and try again.",
                "error"
            );
            return;
        }

        try {
            if (scannerRunning) return;

            html5QrCode = new Html5Qrcode("reader");

            startScannerButton.disabled = true;

            await html5QrCode.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: { width: 230, height: 230 }
                },
                async function (decodedText) {
                    const trackingNumber = extractTrackingNumber(decodedText);

                    if (!trackingNumber) {
                        showMessage(
                            scannerMessage,
                            "The QR code does not contain a tracking number.",
                            "error"
                        );
                        return;
                    }

                    trackingInput.value = trackingNumber;

                    showMessage(
                        scannerMessage,
                        "QR code detected. Looking up the request...",
                        "success"
                    );

                    await stopScanner();
                    await searchRequest(trackingNumber);
                },
                function () {
                    // Ignore normal camera scanning misses.
                }
            );

            scannerRunning = true;
            stopScannerButton.disabled = false;

            showMessage(
                scannerMessage,
                "Camera is active. Point it at the student's QR code.",
                "success"
            );

        } catch (error) {
            console.error("QR scanner error:", error);

            startScannerButton.disabled = false;
            stopScannerButton.disabled = true;

            showMessage(
                scannerMessage,
                "Could not start the camera. Allow camera permission and use HTTPS or localhost.",
                "error"
            );
        }
    });

    stopScannerButton.addEventListener("click", stopScanner);

    // ---------------------------------------
    // 9. CONFIRM PHYSICAL SIGNATURE
    // ---------------------------------------

    confirmSignedButton.addEventListener("click", async function () {
        if (!selectedRequest || !selectedRequestRef || isUpdating) {
            return;
        }

        const alreadySigned =
            selectedRequest.signatureStatus === "SIGNED" ||
            String(selectedRequest.status || "").toLowerCase() === "signed";

        if (alreadySigned) {
            showMessage(
                confirmMessage,
                "This document has already been marked as signed.",
                "info"
            );
            return;
        }

        const studentName = selectedRequest.student || "the student";
        const trackingNumber = getTrackingNumber(
            selectedRequest,
            selectedRequestRef.id
        );

        const confirmed = confirm(
            "Have you physically signed this document?\n\n" +
            "Student: " + studentName + "\n" +
            "Tracking Number: " + trackingNumber + "\n\n" +
            "Only continue if the physical document has been signed."
        );

        if (!confirmed) return;

        isUpdating = true;
        confirmSignedButton.disabled = true;
        confirmSignedButton.textContent = "Updating...";

        try {
            await updateDoc(selectedRequestRef, {
                status: "Signed",
                signatureStatus: "SIGNED",
                signedBy: userName,
                signedAt: serverTimestamp(),

                studentNotification: {
                    title: "Document Signed",
                    message: "Your document has been signed by " + userName + ".",
                    type: "signature",
                    isRead: false,
                    createdAt: serverTimestamp()
                },

                studentNotified: true,
                updatedAt: serverTimestamp()
            });

            selectedRequest.status = "Signed";
            selectedRequest.signatureStatus = "SIGNED";

            document.getElementById("requestStatus").textContent = "SIGNED";
            document.getElementById("confirmationNote").textContent =
                "The signature confirmation has been saved to Firestore.";

            confirmSignedButton.textContent = "Document Signed Successfully";

            showMessage(
                confirmMessage,
                "Success! The request is marked as signed. The student's tracking page can now display this update.",
                "success"
            );

            showMessage(
                searchMessage,
                "Signature status successfully updated for " + studentName + ".",
                "success"
            );

        } catch (error) {
            console.error("Signature update error:", error);

            confirmSignedButton.disabled = false;
            confirmSignedButton.textContent = "Confirm Document Signed";

            showMessage(
                confirmMessage,
                "Unable to update the request. Check Firestore permissions and try again.",
                "error"
            );

        } finally {
            isUpdating = false;
        }
    });

    // ---------------------------------------
    // 10. LOG OUT
    // ---------------------------------------

    document.getElementById("logoutButton").addEventListener("click", function (event) {
        event.preventDefault();

        if (confirm("Are you sure you want to log out?")) {
            sessionStorage.clear();
            window.location.replace("../login.html");
        }
    });

});
