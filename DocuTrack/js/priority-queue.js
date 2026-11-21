
import { db } from "./firebase-config.js";

import {
    collection,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    // ---------------------------------------
    // 1. CHECK REGISTRAR SESSION
    // ---------------------------------------

    const userName = sessionStorage.getItem("userName");
    const userRole = sessionStorage.getItem("userRole");

    if (!userName || userRole !== "registrar") {
        window.location.replace("../login.html");
        return;
    }

    document.getElementById("userName").textContent = userName;

    // ---------------------------------------
    // 2. ELEMENTS
    // ---------------------------------------

    const tableBody = document.getElementById("priorityTableBody");

    const searchInput = document.getElementById("searchInput");
    const priorityFilter = document.getElementById("priorityFilter");
    const paymentFilter = document.getElementById("paymentFilter");
    const officeFilter = document.getElementById("officeFilter");

    const totalRequests = document.getElementById("totalRequests");
    const criticalCount = document.getElementById("criticalCount");
    const highCount = document.getElementById("highCount");
    const paidCount = document.getElementById("paidCount");

    const refreshButton = document.getElementById("refreshButton");

    const modal = document.getElementById("priorityModal");
    const closeModal = document.getElementById("closeModal");
    const priorityDetails = document.getElementById("priorityDetails");

    let allRequests = [];
    let unsubscribe = null;

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

    function getTimestamp(value) {

        if (!value) return 0;

        if (typeof value.toMillis === "function") {
            return value.toMillis();
        }

        if (typeof value.toDate === "function") {
            return value.toDate().getTime();
        }

        const date = new Date(value);

        return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    }

    const documentScores = {
        "Certificate of Enrollment": 90,
        "Transcript of Records": 85,
        "Certificate of Grades": 80,
        "Good Moral Certificate": 75,
        "Honorable Dismissal": 90,
        "Certificate of Graduation": 100,
        "Other Document": 50
    };

    // ---------------------------------------
    // 4. CALCULATE PRIORITY
    // ---------------------------------------

    function calculatePriority(request) {

        const urgency =
            request.urgency === "Urgent" ? 100 : 50;

        let deadline = 30;

        if (request.neededDate) {

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const dueDate = new Date(
                request.neededDate + "T00:00:00"
            );

            if (!Number.isNaN(dueDate.getTime())) {

                const days = Math.ceil(
                    (dueDate.getTime() - today.getTime()) / 86400000
                );

                if (days <= 1) deadline = 100;
                else if (days <= 3) deadline = 85;
                else if (days <= 7) deadline = 70;
                else if (days <= 14) deadline = 50;
                else deadline = 25;

            }
        }

        const importance = Number(request.importance) || 50;

        const documentScore =
            documentScores[request.document] || 50;

        const submitted = getTimestamp(
            request.submittedAt || request.createdAt
        );

        const waitingDays = submitted
            ? Math.max(0, (Date.now() - submitted) / 86400000)
            : 0;

        const waiting = Math.min(100, 20 + waitingDays * 10);

        const score =
            urgency * 0.30 +
            deadline * 0.25 +
            importance * 0.20 +
            documentScore * 0.15 +
            waiting * 0.10;

        let level = "Low";

        if (score >= 90) level = "Critical";
        else if (score >= 75) level = "High";
        else if (score >= 50) level = "Medium";

        return {
            score: Math.round(score * 100) / 100,
            level
        };
    }

    // ---------------------------------------
    // 5. SORT BY PRIORITY
    // ---------------------------------------

    function sortRequests(requests) {

        return [...requests].sort((a, b) => {

            const priorityA = calculatePriority(a).score;
            const priorityB = calculatePriority(b).score;

            if (priorityB !== priorityA) {
                return priorityB - priorityA;
            }

            // FIFO tie-breaker.
            const submittedA = getTimestamp(
                a.submittedAt || a.createdAt
            );

            const submittedB = getTimestamp(
                b.submittedAt || b.createdAt
            );

            return submittedA - submittedB;

        });

    }

    // ---------------------------------------
    // 6. UPDATE SUMMARY CARDS
    // ---------------------------------------

    function updateStatistics() {

        const calculated = allRequests.map(request => ({
            ...request,
            priority: calculatePriority(request)
        }));

        totalRequests.textContent = calculated.length;

        criticalCount.textContent =
            calculated.filter(request =>
                request.priority.level === "Critical"
            ).length;

        highCount.textContent =
            calculated.filter(request =>
                request.priority.level === "High"
            ).length;

        paidCount.textContent =
            calculated.filter(request =>
                request.paymentStatus === "PAID"
            ).length;

    }

    // ---------------------------------------
    // 7. FILTER REQUESTS
    // ---------------------------------------

    function getFilteredRequests() {

        const search = searchInput.value.trim().toLowerCase();

        const selectedPriority = priorityFilter.value;
        const selectedPayment = paymentFilter.value;
        const selectedOffice = officeFilter.value;

        return sortRequests(allRequests).filter(request => {

            const priority = calculatePriority(request);

            const searchableText = [
                request.id,
                request.student,
                request.studentId,
                request.document,
                request.office
            ].join(" ").toLowerCase();

            const matchesSearch =
                !search || searchableText.includes(search);

            const matchesPriority =
                !selectedPriority ||
                priority.level === selectedPriority;

            const matchesPayment =
                !selectedPayment ||
                (request.paymentStatus || "UNPAID") === selectedPayment;

            const matchesOffice =
                !selectedOffice ||
                request.office === selectedOffice;

            return (
                matchesSearch &&
                matchesPriority &&
                matchesPayment &&
                matchesOffice
            );

        });

    }

    // ---------------------------------------
    // 8. RENDER PRIORITY QUEUE
    // ---------------------------------------

    function renderQueue() {

        const requests = getFilteredRequests();

        if (requests.length === 0) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="10" class="empty">
                        No matching document requests found.
                    </td>
                </tr>
            `;

            return;

        }

        tableBody.innerHTML = requests.map((request, index) => {

            const priority = calculatePriority(request);

            const payment = request.paymentStatus || "UNPAID";

            return `
                <tr>

                    <td>
                        <span class="rank">#${index + 1}</span>
                    </td>

                    <td>
                        <strong>${escapeHTML(request.id || request.firestoreId)}</strong>
                    </td>

                    <td>${escapeHTML(request.student)}</td>

                    <td>${escapeHTML(request.document)}</td>

                    <td>${escapeHTML(request.office)}</td>

                    <td>
                        <span class="score">
                            ${priority.score.toFixed(2)}
                        </span>
                    </td>

                    <td>
                        <span class="badge ${priority.level.toLowerCase()}">
                            ${priority.level}
                        </span>
                    </td>

                    <td>
                        <span class="badge ${payment === "PAID" ? "paid" : "unpaid"}">
                            ${escapeHTML(payment)}
                        </span>
                    </td>

                    <td>
                        <span class="badge status-badge">
                            ${escapeHTML(request.status || "Pending")}
                        </span>
                    </td>

                    <td>
                        <button
                            type="button"
                            class="btn btn-primary view-button"
                            data-id="${escapeHTML(request.firestoreId)}">
                            View Details
                        </button>
                    </td>

                </tr>
            `;

        }).join("");

    }

    // ---------------------------------------
    // 9. VIEW REQUEST DETAILS
    // ---------------------------------------

    function openDetails(request) {

        const priority = calculatePriority(request);

        const factors = [
            ["Urgency", request.urgency || "Normal", "30%"],
            ["Deadline", request.neededDate || "Not provided", "25%"],
            ["Importance", request.importance ?? "Not provided", "20%"],
            ["Document Type", request.document || "Not provided", "15%"],
            ["Waiting Time", "Based on submission time", "10%"]
        ];

        priorityDetails.innerHTML = `

            <div class="detail-row">
                <strong>Request ID:</strong>
                ${escapeHTML(request.id || request.firestoreId)}
            </div>

            <div class="detail-row">
                <strong>Student:</strong>
                ${escapeHTML(request.student)}
            </div>

            <div class="detail-row">
                <strong>Student ID:</strong>
                ${escapeHTML(request.studentId)}
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
                <strong>Purpose:</strong>
                ${escapeHTML(request.purpose)}
            </div>

            <div class="detail-row">
                <strong>Payment:</strong>
                ${escapeHTML(request.paymentStatus || "UNPAID")}
            </div>

            <div class="detail-row">
                <strong>Status:</strong>
                ${escapeHTML(request.status || "Pending")}
            </div>

            <div class="detail-row">
                <strong>Priority Score:</strong>
                <span class="score">${priority.score.toFixed(2)} / 100</span>
            </div>

            <div class="detail-row">
                <strong>Priority Level:</strong>
                <span class="badge ${priority.level.toLowerCase()}">
                    ${priority.level}
                </span>
            </div>

            <h4>Priority Factors</h4>

            ${factors.map(factor => `
                <div class="detail-row">
                    <strong>${escapeHTML(factor[0])} (${factor[2]}):</strong>
                    ${escapeHTML(factor[1])}
                </div>
            `).join("")}

            <p style="font-size:12px;color:#718078;margin-top:18px;">
                This queue is ranked using the current browser-side
                priority calculation. It is intended for the project
                prototype.
            </p>

        `;

        modal.style.display = "block";

    }

    // ---------------------------------------
    // 10. TABLE EVENTS
    // ---------------------------------------

    tableBody.addEventListener("click", function (event) {

        const button = event.target.closest(".view-button");

        if (!button) return;

        const request = allRequests.find(item =>
            item.firestoreId === button.dataset.id
        );

        if (request) {
            openDetails(request);
        }

    });

    // ---------------------------------------
    // 11. FILTER EVENTS
    // ---------------------------------------

    searchInput.addEventListener("input", renderQueue);
    priorityFilter.addEventListener("change", renderQueue);
    paymentFilter.addEventListener("change", renderQueue);
    officeFilter.addEventListener("change", renderQueue);

    // ---------------------------------------
    // 12. REFRESH BUTTON
    // ---------------------------------------

    refreshButton.addEventListener("click", function () {

        updateStatistics();
        renderQueue();

    });

    // ---------------------------------------
    // 13. CLOSE MODAL
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
    // 14. FIRESTORE REAL-TIME LISTENER
    // ---------------------------------------

    console.log("DocuTrack: Priority queue script loaded.");

    unsubscribe = onSnapshot(
        collection(db, "documentRequests"),

        (snapshot) => {

            console.log(
                "Priority queue records retrieved:",
                snapshot.size
            );

            allRequests = snapshot.docs.map(documentSnapshot => ({
                ...documentSnapshot.data(),
                firestoreId: documentSnapshot.id
            }));

            updateStatistics();
            renderQueue();

            console.log(
                "Priority queue updated successfully."
            );

        },

        (error) => {

            console.error("Priority queue Firestore error:", error);

            tableBody.innerHTML = `
                <tr>
                    <td colspan="10" class="empty">
                        Unable to load priority queue:
                        ${escapeHTML(error.message)}
                    </td>
                </tr>
            `;

        }
    );

});
