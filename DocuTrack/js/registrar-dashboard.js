
// js/registrar-dashboard.js

import { db } from "./firebase-config.js";

import {
    collection,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", function () {

    // CHECK REGISTRAR SESSION
    const userName = sessionStorage.getItem("userName");
    const userRole = sessionStorage.getItem("userRole");

    if (!userName || userRole !== "registrar") {
        window.location.replace("../login.html");
        return;
    }

    document.getElementById("userName").textContent = userName;
    document.getElementById("userRole").textContent = "Registrar Account";

    // LOGOUT
    const logoutButton = document.getElementById("logoutButton");

    if (logoutButton) {
        logoutButton.addEventListener("click", function () {
            if (confirm("Are you sure you want to log out?")) {
                sessionStorage.clear();
                window.location.replace("../login.html");
            }
        });
    }

    // SAFE HTML OUTPUT
    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    }

    // PRIORITY CALCULATION
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

            const days = Math.ceil(
                (dueDate.getTime() - today.getTime()) / 86400000
            );

            if (days <= 1) deadline = 100;
            else if (days <= 3) deadline = 85;
            else if (days <= 7) deadline = 70;
            else if (days <= 14) deadline = 50;
            else deadline = 25;
        }

        const importance = Number(request.importance) || 50;

        const documentScores = {
            "Certificate of Enrollment": 90,
            "Transcript of Records": 85,
            "Certificate of Grades": 80,
            "Good Moral Certificate": 75,
            "Honorable Dismissal": 90,
            "Certificate of Graduation": 100,
            "Other Document": 50
        };

        const documentScore =
            documentScores[request.document] || 50;

        const submitted = new Date(request.submittedAt).getTime();

        const waitingDays = Number.isFinite(submitted)
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

    // UPDATE DASHBOARD CARDS
    function updateStatistics(requests) {

        document.getElementById("totalRequests").textContent =
            requests.length;

        document.getElementById("pendingRequests").textContent =
            requests.filter(request =>
                ["Pending", "Pending Payment"].includes(request.status)
            ).length;

        document.getElementById("processingRequests").textContent =
            requests.filter(request =>
                request.status === "Processing"
            ).length;

        document.getElementById("readyRequests").textContent =
            requests.filter(request =>
                request.status === "Ready for Claim"
            ).length;
    }

    // DISPLAY RECENT REQUESTS
    function displayRecentRequests(requests) {

        const tableBody = document.getElementById("recentRequestsBody");

        if (!tableBody) return;

        if (requests.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty">
                        No document requests available yet.
                    </td>
                </tr>
            `;
            return;
        }

        const recentRequests = [...requests]
            .sort((a, b) =>
                new Date(b.submittedAt || 0) -
                new Date(a.submittedAt || 0)
            )
            .slice(0, 5);

        tableBody.innerHTML = recentRequests.map(request => {

            const priority = calculatePriority(request);

            const payment = request.paymentStatus || "UNPAID";

            return `
                <tr>
                    <td>${escapeHTML(request.id)}</td>
                    <td>${escapeHTML(request.student)}</td>
                    <td>${escapeHTML(request.document)}</td>

                    <td>
                        <span class="badge ${priority.level.toLowerCase()}">
                            ${priority.score.toFixed(2)} - ${priority.level}
                        </span>
                    </td>

                    <td>
                        <span class="badge ${
                            payment === "PAID" ? "paid" : "unpaid"
                        }">
                            ${escapeHTML(payment)}
                        </span>
                    </td>

                    <td>
                        <span class="badge status">
                            ${escapeHTML(request.status)}
                        </span>
                    </td>

                    <td>
                        <a href="requests.html" class="view-link">View</a>
                    </td>
                </tr>
            `;

        }).join("");
    }

    // REAL-TIME FIRESTORE LISTENER
    const requestsCollection = collection(db, "documentRequests");

    onSnapshot(
        requestsCollection,

        function (snapshot) {

            const requests = snapshot.docs.map(documentSnapshot => ({
                firestoreId: documentSnapshot.id,
                ...documentSnapshot.data()
            }));

            updateStatistics(requests);
            displayRecentRequests(requests);

            console.log(
                "Firestore requests loaded:",
                requests.length,
                requests
            );
        },

        function (error) {
            console.error("Firestore listener error:", error);

            document.getElementById("recentRequestsBody").innerHTML = `
                <tr>
                    <td colspan="7" class="empty">
                        Unable to load requests. Check Firestore permissions.
                        <br>
                        ${escapeHTML(error.message)}
                    </td>
                </tr>
            `;
        }
    );

});
