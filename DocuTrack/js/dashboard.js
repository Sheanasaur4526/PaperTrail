
document.addEventListener("DOMContentLoaded", function () {

    // Retrieve logged-in user information
    const userName = sessionStorage.getItem("userName");
    const userRole = sessionStorage.getItem("userRole");

    // Check login session and role
    if (!userName || userRole !== "student") {
        window.location.replace("../login.html");
        return;
    }

    // Display student name
    const nameElement = document.getElementById("userName");
    const roleElement = document.getElementById("userRole");

    if (nameElement) {
        nameElement.textContent = userName;
    }

    if (roleElement) {
        roleElement.textContent = "Student Account";
    }

    // Logout functionality
    const logoutButton = document.getElementById("logoutButton");

    if (logoutButton) {
        logoutButton.addEventListener("click", function () {

            const confirmLogout = confirm(
                "Are you sure you want to log out?"
            );

            if (confirmLogout) {
                sessionStorage.clear();
                window.location.replace("../login.html");
            }

        });
    }

});
