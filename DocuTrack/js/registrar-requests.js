
// js/registrar-requests.js

import { db } from "./firebase-config.js";

import {
    collection,
    onSnapshot,
    doc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    // ---------------------------------------
    // 1. CONFIGURATION
    // ---------------------------------------

    const COLLECTION_NAME = "documentRequests";

    // ---------------------------------------
    // 2. CHECK REGISTRAR SESSION
    // ---------------------------------------

    const userName = sessionStorage.getItem("userName");
    const userRole = sessionStorage.getItem("userRole");

    if (!userName || userRole !== "registrar") {
        window.location.replace("../login.html");
        return;
    }

    const userNameElement = document.getElementById("userName");

    if (userNameElement) {
        userNameElement.textContent = userName;
    }

    // ---------------------------------------
    // 3. HTML ELEMENTS
    // ---------------------------------------

    const tableBody = document.getElementById("requestTableBody");

    const searchInput = document.getElementById("searchInput");
    const statusFilter = document.getElementById("statusFilter");
    const officeFilter = document.getElementById("officeFilter");

    const modal = document.getElementById("requestModal");
    const requestDetails = document.getElementById("requestDetails");
    const modalActions = document.getElementById("modalActions");
    const closeModal = document.getElementById("closeModal");

    const logoutButton = document.getElementById("logoutButton");

    // Check required HTML elements.
    if (
        !tableBody ||
        !searchInput ||
        !statusFilter ||
        !officeFilter ||
        !modal ||
        !requestDetails ||
        !modalActions ||
        !closeModal
    ) {
        console.error("DocuTrack: One or more required HTML elements are missing.");
        return;
    }

    // ---------------------------------------
    // 4. GLOBAL VARIABLES
    // ---------------------------------------

    let allRequests = [];
    let selectedRequest = null;

    // ---------------------------------------
    // 5. LOGOUT
    // ---------------------------------------

    if (logoutButton) {

        logoutButton.addEventListener("click", function (event) {

            event.preventDefault();

            if (confirm("Are you sure you want to log out?")) {
                sessionStorage.clear();
                window.location.replace("../login.html");
            }

        });

    }

    // ---------------------------------------
    // 6. HELPER FUNCTIONS
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

        if (!value) return "Not provided";

        let date;

        if (typeof value.toDate === "function") {
            date = value.toDate();
        } else {
            date = new Date(value);
        }

        if (Number.isNaN(date.getTime())) {
            return "Not available";
        }

        return date.toLocaleString();

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

        return Number.isNaN(date.getTime())
            ? 0
            : date.getTime();

    }

    function peso(value) {
        return "₱" + Number(value || 0).toFixed(2);
    }

    // ---------------------------------------
    // 7. PRIORITY CONFIGURATION
    // ---------------------------------------

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
    // 8. CALCULATE PRIORITY
    // ---------------------------------------

    function calculatePriority(request) {

        // URGENCY: 30%

        const urgency =
            request.urgency === "Urgent" ? 100 : 50;

        // DEADLINE: 25%

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

        // IMPORTANCE: 20%

        const importance = Number(request.importance) || 50;

        // DOCUMENT TYPE: 15%

        const documentScore =
            documentScores[request.document] || 50;

        // WAITING TIME: 10%

        const submitted = getTimestamp(
            request.submittedAt || request.createdAt
        );

        const waitingDays = submitted
            ? Math.max(0, (Date.now() - submitted) / 86400000)
            : 0;

        const waiting = Math.min(100, 20 + waitingDays * 10);

        // WEIGHTED PRIORITY SCORE

        const score =
            urgency * 0.30 +
            deadline * 0.25 +
            importance * 0.20 +
            documentScore * 0.15 +
            waiting * 0.10;

        let level = "Low";

        if (score >= 90) {
            level = "Critical";
        } else if (score >= 75) {
            level = "High";
        } else if (score >= 50) {
            level = "Medium";
        }

        return {
            score: Math.round(score * 100) / 100,
            level
        };

    }

    // ---------------------------------------
    // 9. SORT REQUESTS
    // HIGHEST PRIORITY FIRST
    // ---------------------------------------

    function sortRequests(requests) {

        return [...requests].sort((a, b) => {

            const priorityA = calculatePriority(a).score;
            const priorityB = calculatePriority(b).score;

            // Highest priority first.
            if (priorityB !== priorityA) {
                return priorityB - priorityA;
            }

            // FIFO: oldest request first when scores are equal.
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
    // 10. UPDATE STATISTICS
    // ---------------------------------------

    function updateStatistics(requests) {

        document.getElementById("totalCount").textContent =
            requests.length;

        document.getElementById("paidCount").textContent =
            requests.filter(request =>
                request.paymentStatus === "PAID"
            ).length;

        document.getElementById("pendingCount").textContent =
            requests.filter(request =>
                ["Pending", "Pending Payment"].includes(request.status)
            ).length;

        document.getElementById("processingCount").textContent =
            requests.filter(request =>
                request.status === "Processing"
            ).length;

    }

    // ---------------------------------------
    // 11. FILTER REQUESTS
    // ---------------------------------------

    function getFilteredRequests() {

        const search = searchInput.value.trim().toLowerCase();
        const selectedStatus = statusFilter.value;
        const selectedOffice = officeFilter.value;

        return sortRequests(allRequests).filter(request => {

            const searchableText = [
                request.id,
                request.student,
                request.studentId,
                request.document
            ].join(" ").toLowerCase();

            const matchesSearch =
                !search || searchableText.includes(search);

            const matchesStatus =
                !selectedStatus || request.status === selectedStatus;

            const matchesOffice =
                !selectedOffice || request.office === selectedOffice;

            return matchesSearch && matchesStatus && matchesOffice;

        });

    }

    // ---------------------------------------
    // 12. DISPLAY REQUEST TABLE
    // ---------------------------------------

    function renderRequests() {

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

        tableBody.innerHTML = requests.map(request => {

            const priority = calculatePriority(request);

            const priorityClass = priority.level.toLowerCase();

            const payment = request.paymentStatus || "UNPAID";

            const paymentClass =
                payment === "PAID" ? "paid" : "unpaid";

            return `
                <tr>

                    <td>
                        <strong>${escapeHTML(request.id || request.firestoreId)}</strong>
                    </td>

                    <td>${escapeHTML(request.student)}</td>

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
                        <strong>${priority.score.toFixed(2)}</strong>
                    </td>

                    <td>
                        <span class="badge ${priorityClass}">
                            ${priority.level}
                        </span>
                    </td>

                    <td>
                        <span class="badge ${paymentClass}">
                            ${escapeHTML(payment)}
                        </span>
                    </td>

                    <td>
                        <span class="badge status">
                            ${escapeHTML(request.status || "Pending")}
                        </span>
                    </td>

                    <td>
                        <button
                            class="btn btn-primary view-button"
                            data-id="${escapeHTML(request.firestoreId)}"
                            type="button">
                            View / Update
                        </button>
                    </td>

                </tr>
            `;

        }).join("");

    }

    // ---------------------------------------
    // 13. REQUEST DETAILS MODAL
    // ---------------------------------------

    function showDetail(label, value) {

        return `
            <div class="detail-row">
                <strong>${escapeHTML(label)}:</strong>
                ${escapeHTML(value || "Not provided")}
            </div>
        `;

    }

    function openRequestModal(request) {

        selectedRequest = request;

        const priority = calculatePriority(request);

        requestDetails.innerHTML = `

            ${showDetail("Request ID", request.id || request.firestoreId)}
            ${showDetail("Student Name", request.student)}
            ${showDetail("Student ID", request.studentId)}
            ${showDetail("Course", request.course)}
            ${showDetail("Year Level", request.yearLevel)}
            ${showDetail("Contact Number", request.contact)}
            ${showDetail("Email", request.email)}
            ${showDetail("Office", request.office)}
            ${showDetail("Document", request.document)}
            ${showDetail("Copies", request.copies)}
            ${showDetail("Unit Fee", peso(request.unitFee))}
            ${showDetail("Total Fee", peso(request.total))}
            ${showDetail("Urgency", request.urgency)}
            ${showDetail("Importance", request.importance)}
            ${showDetail("Date Needed", request.neededDate)}
            ${showDetail("Purpose", request.purpose)}
            ${showDetail("Additional Notes", request.notes)}
            ${showDetail("Date Requested", request.date || formatDate(request.submittedAt || request.createdAt))}
            ${showDetail("Payment Status", request.paymentStatus)}
            ${showDetail("Request Status", request.status)}
            ${showDetail("Priority Score", priority.score.toFixed(2))}
            ${showDetail("Priority Level", priority.level)}

        `;

        renderModalActions(request);

        modal.style.display = "block";

    }

    // ---------------------------------------
    // 14. STATUS ACTION BUTTONS
    // ---------------------------------------

    function renderModalActions(request) {

        modalActions.innerHTML = "";

        if (request.paymentStatus !== "PAID") {

            modalActions.innerHTML = `
                <p>
                    Payment is not yet marked as paid.
                    This request cannot be processed.
                </p>
            `;

            return;

        }

        const actions = [];

        if (request.status === "Pending") {

            actions.push({
                label: "Approve Request",
                status: "Approved",
                className: "btn-primary"
            });

            actions.push({
                label: "Reject Request",
                status: "Rejected",
                className: "btn-danger"
            });

        }

        if (request.status === "Approved") {

            actions.push({
                label: "Start Processing",
                status: "Processing",
                className: "btn-primary"
            });

        }

        if (request.status === "Processing") {

            actions.push({
                label: "Ready for Claim",
                status: "Ready for Claim",
                className: "btn-gold"
            });

        }

        if (request.status === "Ready for Claim") {

            modalActions.innerHTML = `
                <p>
                    <strong>
                        This document is ready for student collection.
                    </strong>
                </p>
            `;

            return;

        }

        if (request.status === "Rejected") {

            modalActions.innerHTML = `
                <p>
                    <strong>This request has been rejected.</strong>
                </p>
            `;

            return;

        }

        if (actions.length === 0) {

            modalActions.textContent = "No status actions available.";

            return;

        }

        actions.forEach(action => {

            const button = document.createElement("button");

            button.type = "button";
            button.className = `btn ${action.className}`;
            button.textContent = action.label;

            button.addEventListener("click", function () {
                updateRequestStatus(request, action.status);
            });

            modalActions.appendChild(button);

        });

    }

    // ---------------------------------------
    // 15. UPDATE REQUEST STATUS
    // ---------------------------------------

    async function updateRequestStatus(request, newStatus) {

        const allowedTransitions = {
            "Pending": ["Approved", "Rejected"],
            "Approved": ["Processing"],
            "Processing": ["Ready for Claim"]
        };

        if (
            !allowedTransitions[request.status] ||
            !allowedTransitions[request.status].includes(newStatus)
        ) {

            alert("This status change is not allowed.");

            return;

        }

        if (request.paymentStatus !== "PAID") {

            alert("Only paid requests can be processed.");

            return;

        }

        if (!confirm(`Change request status to "${newStatus}"?`)) {
            return;
        }

        try {

            await updateDoc(
                doc(db, COLLECTION_NAME, request.firestoreId),
                {
                    status: newStatus,
                    updatedAt: serverTimestamp(),
                    updatedBy: userName
                }
            );

            alert(
                "Request status successfully updated to " + newStatus + "."
            );

            modal.style.display = "none";
            selectedRequest = null;

        } catch (error) {

            console.error("Status update failed:", error);

            alert(
                "Unable to update request status: " + error.message
            );

        }

    }

    // ---------------------------------------
    // 16. TABLE BUTTON EVENTS
    // ---------------------------------------

    tableBody.addEventListener("click", function (event) {

        const button = event.target.closest(".view-button");

        if (!button) return;

        const request = allRequests.find(item =>
            item.firestoreId === button.dataset.id
        );

        if (request) {
            openRequestModal(request);
        }

    });

    // ---------------------------------------
    // 17. FILTER EVENTS
    // ---------------------------------------

    searchInput.addEventListener("input", renderRequests);

    statusFilter.addEventListener("change", renderRequests);

    officeFilter.addEventListener("change", renderRequests);

    // ---------------------------------------
    // 18. MODAL CLOSE EVENTS
    // ---------------------------------------

    closeModal.addEventListener("click", function () {

        modal.style.display = "none";
        selectedRequest = null;

    });

    modal.addEventListener("click", function (event) {

        if (event.target === modal) {

            modal.style.display = "none";
            selectedRequest = null;

        }

    });

    // ---------------------------------------
    // 19. FIRESTORE REAL-TIME LISTENER
    // ---------------------------------------

    console.log("DocuTrack: Registrar requests script loaded.");

    onSnapshot(
        collection(db, COLLECTION_NAME),

        function (snapshot) {

            console.log("Firestore connection successful.");

            console.log(
                "Documents retrieved:",
                snapshot.size
            );

            allRequests = snapshot.docs.map(documentSnapshot => ({
                ...documentSnapshot.data(),
                firestoreId: documentSnapshot.id
            }));

            // Sort highest priority first.
            allRequests = sortRequests(allRequests);

            // Display records in browser console.
            console.table(
                allRequests.map(request => ({
                    firestoreId: request.firestoreId,
                    requestId: request.id || "Missing ID",
                    student: request.student || "Missing student name",
                    document: request.document || "Missing document",
                    office: request.office || "Missing office",
                    payment: request.paymentStatus || "UNPAID",
                    status: request.status || "Missing status",
                    priority: calculatePriority(request).score
                }))
            );

            // Update statistics.
            updateStatistics(allRequests);

            // Display sorted requests.
            renderRequests();

            // Refresh an open modal.
            if (selectedRequest) {

                const updatedRequest = allRequests.find(request =>
                    request.firestoreId === selectedRequest.firestoreId
                );

                if (updatedRequest) {

                    selectedRequest = updatedRequest;

                    openRequestModal(updatedRequest);

                } else {

                    modal.style.display = "none";
                    selectedRequest = null;

                }

            }

        },

        function (error) {

            console.error("FIRESTORE ERROR:", error);

            tableBody.innerHTML = `
                <tr>
                    <td colspan="10" class="empty">
                        <strong>Unable to load requests.</strong>
                        <br>
                        ${escapeHTML(error.message)}
                    </td>
                </tr>
            `;

        }

    );

});
