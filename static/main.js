let accessToken = null;
let userName = null;
let userPicture = null;
let isEditing = false;

function logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_name");
    localStorage.removeItem("user_picture");
    location.href = "/";
}

async function authenticate() {
    const res = await fetch("/login/google");
    const data = await res.json();
    window.location.href = data.auth_url;
}

function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

async function fetchToken() {
    const token = getQueryParam("token");
    const name = getQueryParam("name");
    const picture = getQueryParam("picture");

    if (!token) return;

    accessToken = token;
    localStorage.setItem("access_token", accessToken);

    if (name && picture) {
        userName = decodeURIComponent(name);
        userPicture = decodeURIComponent(picture);
        localStorage.setItem("user_name", userName);
        localStorage.setItem("user_picture", userPicture);
    }

    window.history.replaceState({}, document.title, "/");

    displayUserInfo();
    await loadEvents();
}

function displayUserInfo() {
    userName = localStorage.getItem("user_name");
    userPicture = localStorage.getItem("user_picture");

    const userDiv = document.getElementById("userInfo");
    const authButtons = document.getElementById("authButtons");

    if (userName && userPicture) {
        const safePicture = encodeURI(userPicture);
        userDiv.innerHTML = `
    <img src="${safePicture}" alt="User Picture" class="w-8 h-8 rounded-full object-cover">
        <span class="font-medium">${userName}</span>
        `;
        document.getElementById("loginBtn").classList.add("hidden");
    } else {
        userDiv.innerHTML = "";
        document.getElementById("loginBtn").classList.remove("hidden");
    }
}

function formatDateTime(dateTimeString) {
    if (!dateTimeString) return "N/A";

    const date = new Date(dateTimeString);
    return date.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function loadEvents() {
    if (!accessToken) accessToken = localStorage.getItem("access_token");
    if (!accessToken) return;

    try {
        const res = await fetch("/events", {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!res.ok) throw new Error("Unauthorized or failed to fetch events");

        const data = await res.json();
        const eventsContainer = document.getElementById("eventsList");

        if (data.length === 0) {
            eventsContainer.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-calendar-plus text-4xl mb-2 opacity-50"></i>
                    <p>No upcoming events found. Add your first event!</p>
                </div>
            `;
            return;
        }

        eventsContainer.innerHTML = data.map(event => `
        <div class="event-card bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 p-4 transition duration-200">
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="font-semibold text-lg mb-1">${event.summary || 'No Title'}</h3>
                    <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <i class="fas fa-clock"></i>
                        <span>${formatDateTime(event.start?.dateTime)}</span>
                        <i class="fas fa-arrow-right mx-1"></i>
                        <span>${formatDateTime(event.end?.dateTime)}</span>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="deleteEvent('${event.id}')" class="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-gray-600 rounded-full transition">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button onclick="editEvent('${event.id}', '${event.summary}', '${event.start?.dateTime || ''}', '${event.end?.dateTime || ''}')" class="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-gray-600 rounded-full transition">
                        <i class="fas fa-edit"></i>
                    </button>
                </div>
            </div>
        </div>
        `).join('');

    } catch (err) {
        console.error("Failed to load events:", err);
        alert("Failed to load events. Please login again.");
        logout();
    }
}

async function deleteEvent(eventId) {
    if (!confirm("Are you sure you want to delete this event?")) return;

    try {
        await fetch(`/events/${eventId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        await loadEvents();

        // Show success notification
        showNotification("Event deleted successfully", "success");
    } catch (err) {
        console.error("Failed to delete event:", err);
        showNotification("Failed to delete event", "error");
    }
}

function editEvent(id, summary, start, end) {
    isEditing = true;
    const form = document.getElementById("eventForm");
    form.dataset.editing = id;
    form.summary.value = summary;

    // Convert to datetime-local format
    const startDate = new Date(start);
    const endDate = new Date(end);

    form.start.value = startDate.toISOString().slice(0, 16);
    form.end.value = endDate.toISOString().slice(0, 16);

    // Update UI for editing mode
    document.getElementById("formTitle").textContent = "Edit Event";
    document.getElementById("submitBtnText").textContent = "Update Event";
    document.getElementById("cancelEditBtn").classList.remove("hidden");
}

function cancelEdit() {
    isEditing = false;
    const form = document.getElementById("eventForm");
    delete form.dataset.editing;
    form.reset();

    // Reset UI to add mode
    document.getElementById("formTitle").textContent = "Add Event";
    document.getElementById("submitBtnText").textContent = "Create Event";
    document.getElementById("cancelEditBtn").classList.add("hidden");
}

function showNotification(message, type) {
    const notification = document.createElement("div");
    notification.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white font-medium flex items-center gap-2 z-50 ${type === "success" ? "bg-green-500" : "bg-red-500"
        }`;
    notification.innerHTML = `
        <i class="fas ${type === " success" ? "fa-check-circle" : "fa-exclamation-circle"}"></i>
    ${message}
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add("opacity-0", "transition-opacity", "duration-300");
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

document.getElementById("eventForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const body = {
        summary: formData.get("summary"),
        start: { dateTime: new Date(formData.get("start")).toISOString() },
        end: { dateTime: new Date(formData.get("end")).toISOString() }
    };

    const editingId = form.dataset.editing;

    try {
        if (editingId) {
            await fetch(`/events/${editingId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`
                },
                body: JSON.stringify(body)
            });
            showNotification("Event updated successfully", "success");
        } else {
            await fetch("/events", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`
                },
                body: JSON.stringify(body)
            });
            showNotification("Event created successfully", "success");
        }

        form.reset();
        cancelEdit();
        await loadEvents();
    } catch (err) {
        console.error("Failed to save event:", err);
        showNotification("Failed to save event", "error");
    }
});

window.onload = () => {
    accessToken = localStorage.getItem("access_token");
    displayUserInfo();
    if (accessToken) {
        loadEvents();
    } else {
        fetchToken();
    }

    // Initialize dark mode toggle (optional)
    const darkModeToggle = document.createElement("button");
    darkModeToggle.className = "fixed bottom-4 right-4 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 p-3 rounded-full shadow-lg z-50";
    darkModeToggle.innerHTML = '<i class="fas fa-moon dark:hidden"></i><i class="fas fa-sun hidden dark:block"></i>';
    darkModeToggle.onclick = () => {
        document.documentElement.classList.toggle('dark');
        localStorage.setItem('darkMode', document.documentElement.classList.contains('dark'));
    };
    document.body.appendChild(darkModeToggle);

    // Check for saved dark mode preference
    if (localStorage.getItem('darkMode') === 'true') {
        document.documentElement.classList.add('dark');
    }
};
