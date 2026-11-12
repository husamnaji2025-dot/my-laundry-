const API_URL = "https://pathkcnviuwqaljpvjbn.supabase.co/functions/v1/super-function";
const SUPABASE_KEY = "sb_publishable_IO9zpRCSMDdMU0wH0QuVeA_xkFzXDP_";

let currentStudent = null;
let adminPin = null;
let refreshTimer = null;
let countdownTimer = null;
let currentReservations = [];

function normalizePhone(phone) {
    phone = phone.replace(/[\s-]/g, "");
    if (phone.startsWith("+")) return phone;
    if (phone.startsWith("967")) return "+" + phone;
    if (phone.startsWith("0")) phone = phone.substring(1);
    return "+967" + phone;
}

const $ = id => document.getElementById(id);
async function finishReservation(id) {
    if (!confirm("هل تريد إنهاء هذا الحجز؟")) return;

    try {
        await api("finish_reservation", {
            pin: adminPin,
            reservationId: id
        });

        alert("تم إنهاء الحجز وتحرير الغسالة");
        await loadReservations();
        await loadAdminMachines();

    } catch (error) {
        alert(error.message);
    }
}
const loginScreen = $("login-screen");
const studentDashboard = $("student-dashboard");
const adminDashboard = $("admin-dashboard");
const message = $("message");

async function api(action, data = {}) {
    const response = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_KEY
        },
        body: JSON.stringify({ action, ...data })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "حدث خطأ");
    return result;
}

$("login-button").addEventListener("click", async () => {
    const number = $("student-number").value.trim();

    if (!number) {
        message.textContent = "أدخل رقم الهاتف";
        return;
    }

    $("login-button").disabled = true;
    message.textContent = "جاري تسجيل الدخول...";

    try {
        if (number === "2007") {
            const pin = prompt("أدخل رمز المدير");
            if (!pin) return;

            adminPin = pin;
            await api("list_students", { pin });

            loginScreen.hidden = true;
            studentDashboard.hidden = true;
            adminDashboard.hidden = false;
            message.textContent = "";

            await loadAdminData();
            return;
        }

        const result = await api("student_login", {
            phone: normalizePhone(number)
        });

        currentStudent = result.student;
        currentReservations = result.reservations || [];

        loginScreen.hidden = true;
        adminDashboard.hidden = true;
        studentDashboard.hidden = false;

        $("welcome").textContent = "مرحباً " + currentStudent.student_name;
        $("credits").textContent = currentStudent.credits;

        displayMachines(
            result.machines,
            "washers",
            "irons",
            currentReservations
        );

        startTimers();

    } catch (error) {
        message.textContent = error.message;
    } finally {
        $("login-button").disabled = false;
    }
});

function displayMachines(machines, washerId, ironId, reservations = []) {
    $(washerId).innerHTML = "";
    $(ironId).innerHTML = "";

    machines.forEach(machine => {
        const card = document.createElement("div");
        card.className = "machine-card";

        const title = document.createElement("h3");
        title.textContent = machine.name;

        const status = document.createElement("p");
        status.textContent =
            machine.status === "occupied" ? "مشغولة" : "متاحة";

        card.appendChild(title);
        card.appendChild(status);

        if (machine.type === "washer" && machine.status === "occupied") {
            const reservation = reservations.find(
                r => String(r.machine_id) === String(machine.id)
            );

            if (reservation && reservation.expires_at) {
                const timer = document.createElement("p");
                timer.className = "laundry-timer";
                timer.dataset.expires = reservation.expires_at;
                card.appendChild(timer);
            }
        }

        if (
            washerId === "washers" &&
            machine.type === "washer" &&
            machine.status === "available" &&
            currentStudent
        ) {
            const button = document.createElement("button");
            button.textContent = "احجز الغسالة";
            button.addEventListener("click", () => bookMachine(machine.id));
            card.appendChild(button);
        }

        if (machine.type === "washer") {
            $(washerId).appendChild(card);
        } else {
            $(ironId).appendChild(card);
        }
    });

    updateCountdowns();
}

function updateCountdowns() {
    document.querySelectorAll(".laundry-timer").forEach(timer => {
        const remaining = new Date(timer.dataset.expires).getTime() - Date.now();

        if (remaining <= 0) {
            timer.textContent = "انتهى الوقت، جارٍ تحديث الحالة...";
            return;
        }

        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);

        timer.textContent =
            "الوقت المتبقي: " +
            String(minutes).padStart(2, "0") + ":" +
            String(seconds).padStart(2, "0");
    });
}

function startTimers() {
    clearInterval(refreshTimer);
    clearInterval(countdownTimer);

    countdownTimer = setInterval(updateCountdowns, 1000);

    refreshTimer = setInterval(async () => {
        await refreshStudentMachines();
    }, 15000);
}

async function refreshStudentMachines() {
    if (!currentStudent) return;

    try {
        const result = await api("get_machines");

        currentReservations = result.reservations || [];

        displayMachines(
            result.machines,
            "washers",
            "irons",
            currentReservations
        );
    } catch (error) {
        console.log(error);
    }
}

async function bookMachine(machineId) {
    if (!currentStudent) return;

    if (currentStudent.credits <= 0) {
        alert("رصيدك لا يكفي للحجز");
        return;
    }

    if (!confirm("هل تريد تأكيد حجز هذه الغسالة؟")) return;

    try {
        const result = await api("book_machine", {
            studentId: currentStudent.id,
            machineId
        });

        currentStudent.credits = result.credits;
        $("credits").textContent = result.credits;

        alert("تم الحجز بنجاح!");

        await refreshStudentMachines();

    } catch (error) {
        alert(error.message);
    }
}

async function loadAdminData() {
    await loadStudents();
    await loadAdminMachines();
}

async function loadStudents() {
    try {
        const result = await api("list_students", { pin: adminPin });
        const container = $("students-list");

        container.innerHTML = "";

        result.students.forEach(student => {
            const card = document.createElement("div");
            card.className = "student-card";
            card.textContent =
                student.student_name +
                " | رقم: " + student.phone +
                " | الغسلات: " + student.credits;

            container.appendChild(card);
        });
    } catch (error) {
        alert(error.message);
    }
}

$("add-student").addEventListener("click", async () => {
    const name = $("student-name").value.trim();
    const phone = normalizePhone($("student-phone").value.trim());
    const credits = Number($("student-credits").value);

    if (!name || !phone || !Number.isInteger(credits) || credits < 0) {
        alert("تأكد من إدخال بيانات الطالب بشكل صحيح");
        return;
    }

    try {
        await api("add_student", {
            pin: adminPin,
            name,
            phone,
            credits
        });

        alert("تمت إضافة الطالب بنجاح");

        $("student-name").value = "";
        $("student-phone").value = "";
        $("student-credits").value = "";

        await loadStudents();

    } catch (error) {
        alert(error.message);
    }
});

async function loadAdminMachines() {
    try {
        const result = await api("get_machines");

        displayMachines(
            result.machines,
            "admin-washers",
            "admin-irons",
            result.reservations || []
        );
    } catch (error) {
        alert(error.message);
    }
}

function logout() {
    clearInterval(refreshTimer);
    clearInterval(countdownTimer);

    currentStudent = null;
    adminPin = null;

    location.reload();
}

$("logout").addEventListener("click", logout);
$("admin-logout").addEventListener("click", logout);
async function loadReservations() {
    const container = $("reservations-list");
    container.textContent = "جاري تحميل الحجوزات...";

    try {
        const result = await api("list_reservations", {
            pin: adminPin
        });

        container.innerHTML = "";

        if (!result.reservations || result.reservations.length === 0) {
            container.textContent = "لا توجد حجوزات حتى الآن";
            return;
        }

        result.reservations.forEach(r => {
            const card = document.createElement("div");
            card.className = "student-card";

            card.innerHTML = `
    <p>رقم الحجز: ${r.id}</p>
    <p>الطالب: ${r.students?.student_name || "غير معروف"}</p>
    <p>الجهاز: ${r.machines?.name || "غير معروف"}</p>
    <p>الحالة: ${r.status}</p>
`;

if (r.status === "active") {
    const button = document.createElement("button");
    button.textContent = "إنهاء الحجز";
    button.onclick = () => finishReservation(r.id);
    card.appendChild(button);
}

container.appendChild(card);
        });

    } catch (error) {
        container.textContent = error.message;
    }
}

$("refresh-reservations").addEventListener(
    "click",
    loadReservations
);
