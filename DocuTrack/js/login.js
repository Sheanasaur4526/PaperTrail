
document.addEventListener("DOMContentLoaded", function () {

    const loginForm = document.getElementById("loginForm");
    const fullnameInput = document.getElementById("fullname");
    const roleInput = document.getElementById("role");
    const loginButton = document.getElementById("loginButton");
    const loginMessage = document.getElementById("loginMessage");

    const dashboards = {
        student: "student/dashboard.html",
        faculty: "faculty/dashboard.html",
        registrar: "registrar/registrar_dashboard.html"
    };

    function showMessage(message, type = "error") {
        loginMessage.textContent = message;
        loginMessage.className = "message " + type;
    }

    if (!loginForm) {
        console.error("Login form not found. Check the loginForm ID.");
        return;
    }

    loginForm.addEventListener("submit", function (event) {

        event.preventDefault();

        const fullname = fullnameInput.value.trim();
        const role = roleInput.value;

        if (!fullname) {
            showMessage("Please enter your full name.");
            return;
        }

        if (!dashboards[role]) {
            showMessage("Please select your role.");
            return;
        }

        // Save user information
        sessionStorage.setItem("userName", fullname);
        sessionStorage.setItem("userRole", role);

        // Get the correct dashboard URL
        const destination = new URL(
            dashboards[role],
            document.baseURI
        ).href;

        console.log("Selected role:", role);
        console.log("Redirecting to:", destination);

        showMessage(
            "Welcome, " + fullname + "! Redirecting to your dashboard...",
            "success"
        );

        loginButton.disabled = true;
        loginButton.textContent = "Redirecting...";

        // Redirect
        window.location.assign(destination);

    });

});
