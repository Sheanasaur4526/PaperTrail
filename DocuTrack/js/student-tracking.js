
import { db } from "./firebase-config.js";

import {
    collection,
    query,
    where,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    // ---------------------------------------
    // 1. CHECK STUDENT SESSION
    // ---------------------------------------

    const userName = sessionStorage.getItem("userName");
    const userRole = sessionStorage.getItem("userRole");

    if (!userName || userRole !== "student") {
        window.location.replace("../login.html");
        return;
    }

    document.getElementById("userName").textContent = userName;

    // ---------------------------------------
    // 2. ELEMENTS
    // ---------------------------------------

    const tableBody = document.getElementById("trackingTableBody");
    const totalRequests = document.getElementById("totalRequests");
    const processingRequests = document.getElementById("processingRequests");
    const readyRequests = document.getElementById("readyRequests");

    const searchInput = document.getElementById("searchInput");
    const statusFilter = document.getElementById("statusFilter");

    const modal = document.getElementById("trackingModal");
    const closeModal = document.getElementById("closeModal");
    const requestDetails = document.getElementById("requestDetails");
    const requestTimeline = document.getElementById("requestTimeline");

    let studentRequests = [];

    // ---------------------------------------
    // 3. HELPERS
    // ---------------------------------------

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    }

    function formatDate(value) {

        if (!value) return "Not available";

        const date = typeof value.toDate === "function"
            ? value.toDate()
            : new Date(value);

        return Number.isNaN(date.getTime())
            ? "Not available"
            : date.toLocaleString();

    }

    function getStatusClass(status) {

        if (status === "Ready for Claim") return "ready";
        if (status === "Processing" || status === "Approved") return "processing";
        if (status === "Pending" || status === "Pending Payment") return "pending";
        if (status === "Rejected") return "rejected";

        return "neutral";
    }

    // ---------------------------------------
    // 4. FILTER REQUESTS
    // ---------------------------------------

    function getFilteredRequests() {

        const search = searchInput.value.trim().toLowerCase();
        const status = statusFilter.value;

        return studentRequests.filter(request => {

            const searchableText = [
                request.id,
                request.document,
                request.office
            ].join(" ").toLowerCase();

            const matchesSearch =
                !search || searchableText.includes(search);

            const matchesStatus =
                !status || request.status === status;

            return matchesSearch && matchesStatus;

        });

    }

    // ---------------------------------------
    // 5. RENDER REQUESTS
    // ---------------------------------------

    function renderRequests() {

        const requests = getFilteredRequests();

        if (requests.length === 0) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty">
                        No document requests found.
                    </td>
                </tr>
            `;

            return;

        }

        tableBody.innerHTML = requests.map(request => {

            const payment = request.paymentStatus || "UNPAID";

            return `
                <tr>

                    <td>
                        <strong>${escapeHTML(request.id || request.firestoreId)}</strong>
                    </td>

                    <td>${escapeHTML(request.document)}</td>

                    <td>${escapeHTML(request.office)}</td>

                    <td>
                        ${escapeHTML(
                            request.date || formatDate(
                                request.submittedAt || request.createdAt
                            )
                        )}
                    </td>

                    <td>
                        <span class="badge ${payment === "PAID" ? "paid" : "unpaid"}">
                            ${escapeHTML(payment)}
                        </span>
                    </td>

                    <td>
                        <span class="badge ${getStatusClass(request.status)}">
                            ${escapeHTML(request.status || "Pending")}
                        </span>
                    </td>

                    <td>
                        <button
                            type="button"
                            class="view-button"
                            data-id="${escapeHTML(request.firestoreId)}">
                            View Details
                        </button>
                    </td>

                </tr>
            `;

        }).join("");

    }

    // ---------------------------------------
    // 6. UPDATE SUMMARY
    // ---------------------------------------

    function updateSummary() {

        totalRequests.textContent = studentRequests.length;

        processingRequests.textContent =
            studentRequests.filter(request =>
                ["Approved", "Processing"].includes(request.status)
            ).length;

        readyRequests.textContent =
            studentRequests.filter(request =>
                request.status === "Ready for Claim"
            ).length;

    }

    // ---------------------------------------
    // 7. REQUEST TIMELINE
    // ---------------------------------------

    function renderTimeline(request) {

        const stages = [
            "Request Submitted",
            "Payment Confirmed",
            "Request Approved",
            "Processing",
            "Ready for Claim"
        ];

        const statusOrder = {
            "Pending Payment": 0,
            "Pending": 1,
            "Approved": 2,
            "Processing": 3,
            "Ready for Claim": 4,
            "Rejected": -1
        };

        const currentStage = statusOrder[request.status] ?? 0;

        if (request.status === "Rejected") {

            requestTimeline.innerHTML = `
                <div class="timeline-item">
                    <strong>Request Rejected</strong>
                    <p>Please contact the office for further information.</p>
                </div>
            `;

            return;

        }

        requestTimeline.innerHTML = stages.map((stage, index) => {

            let description = "Waiting for this step.";

            if (index === 0) {
                description = "Your document request was submitted.";
            }

            if (index === 1) {
                description = request.paymentStatus === "PAID"
                    ? "Payment is marked as paid."
                    : "Waiting for payment confirmation.";
            }

            if (index === 2) {
                description = request.status === "Approved" ||
                    request.status === "Processing" ||
                    request.status === "Ready for Claim"
                    ? "The office approved your request."
                    : "Waiting for office approval.";
            }

            if (index === 3) {
                description = request.status === "Processing" ||
                    request.status === "Ready for Claim"
                    ? "Your document is being processed."
                    : "Waiting for document processing.";
            }

            if (index === 4) {
                description = request.status === "Ready for Claim"
                    ? "Your document is ready for collection."
                    : "Your document is not yet ready.";
            }

            const completed = index <= currentStage &&
                request.status !== "Pending Payment";

            return `
                <div class="timeline-item">
                    <strong>
                        ${completed ? "✓ " : "○ "}
                        ${escapeHTML(stage)}
                    </strong>
                    <p>${escapeHTML(description)}</p>
                </div>
            `;

        }).join("");

    }

    // ---------------------------------------
    // 8. OPEN REQUEST DETAILS
    // ---------------------------------------

    function openRequestDetails(request) {

        requestDetails.innerHTML = `

            <div class="detail-row">
                <strong>Request ID:</strong>
                ${escapeHTML(request.id || request.firestoreId)}
            </div>

            <div class="detail-row">
                <strong>Student:</strong>
                ${escapeHTML(request.student)}
            </div>

            <div class="detail-row">
                <strong>Document:</strong>
                ${escapeHTML(request.document)}
            </div>

            <div class="detail-row">
                <strong>Office:</strong>
                ${escapeHTML(request.office)}
            </div>

            <div class="detail-row">
                <strong>Copies:</strong>
                ${escapeHTML(request.copies)}
            </div>

            <div class="detail-row">
                <strong>Total Fee:</strong>
                ₱${Number(request.total || 0).toFixed(2)}
            </div>

            <div class="detail-row">
                <strong>Payment:</strong>
                ${escapeHTML(request.paymentStatus)}
            </div>

            <div class="detail-row">
                <strong>Status:</strong>
                ${escapeHTML(request.status)}
            </div>

            <div class="detail-row">
                <strong>Date Requested:</strong>
                ${escapeHTML(request.date || formatDate(request.submittedAt || request.createdAt))}
            </div>

            <div class="detail-row">
                <strong>Date Needed:</strong>
                ${escapeHTML(request.neededDate)}
            </div>

            <div class="detail-row">
                <strong>Purpose:</strong>
                ${escapeHTML(request.purpose)}
            </div>

            <div class="detail-row">
                <strong>Office Notes:</strong>
                ${escapeHTML(request.officeNotes || "No additional instructions yet.")}
            </div>

            ${request.status === "Ready for Claim" ? `
                <div class="detail-row">
                    <strong>Claim Instructions:</strong>
                    ${escapeHTML(request.claimInstructions || "Please contact the office for collection instructions.")}
                </div>
            ` : ""}

        `;

        renderTimeline(request);

        modal.style.display = "block";

    }

    // ---------------------------------------
    // 9. TABLE EVENTS
    // ---------------------------------------

    tableBody.addEventListener("click", function (event) {

        const button = event.target.closest(".view-button");

        if (!button) return;

        const request = studentRequests.find(item =>
            item.firestoreId === button.dataset.id
        );

        if (request) {
            openRequestDetails(request);
        }

    });

    // ---------------------------------------
    // 10. FILTER EVENTS
    // ---------------------------------------

    searchInput.addEventListener("input", renderRequests);
    statusFilter.addEventListener("change", renderRequests);

    // ---------------------------------------
    // 11. CLOSE MODAL
    // ---------------------------------------

    closeModal.addEventListener("click", function () {
        modal.style.display = "none";
    });

    modal.addEventListener("click", function (event) {
        if (event.target === modal) {
            modal.style.display = "none";
        }
    });

    // ---------------------------------------
    // 12. FIRESTORE REAL-TIME LISTENER
    // ---------------------------------------

    // The request must contain the student's name
    // in the same format as sessionStorage.userName.

    const requestsQuery = query(
        collection(db, "documentRequests"),
        where("student", "==", userName)
    );

    onSnapshot(
        requestsQuery,

        (snapshot) => {

            studentRequests = snapshot.docs.map(documentSnapshot => ({
                ...documentSnapshot.data(),
                firestoreId: documentSnapshot.id
            }));

            // Newest requests first.
            studentRequests.sort((a, b) => {

                const getTime = value => {
                    if (!value) return 0;
                    if (typeof value.toMillis === "function") return value.toMillis();
                    if (typeof value.toDate === "function") return value.toDate().getTime();

                    const date = new Date(value);
                    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
                };

                return getTime(b.submittedAt || b.createdAt) -
                    getTime(a.submittedAt || a.createdAt);

            });

            updateSummary();
            renderRequests();

            console.log(
                "Student tracking requests loaded:",
                studentRequests.length
            );

        },

        (error) => {

            console.error("Student tracking Firestore error:", error);

            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty">
                        Unable to load your requests.
                        ${escapeHTML(error.message)}
                    </td>
                </tr>
            `;

        }
    );

});
