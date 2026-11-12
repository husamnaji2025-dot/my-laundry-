// =====================================
// مغسلتي - Supabase API
// =====================================

const API_URL =
"https://pathkcnviuwqaljpvjbn.supabase.co/functions/v1/super-function";

const SUPABASE_KEY = "sb_publishable_IO9zpRCSMDdMU0wH0QuVeA_xkFzXDP_";

let currentStudent = null;
let adminPin = null;

function normalizePhone(phone) {
    phone = phone.replace(/[\s-]/g, "");

    if (phone.startsWith("+")) return phone;
    if (phone.startsWith("967")) return "+" + phone;
    if (phone.startsWith("0")) phone = phone.substring(1);

    return "+967" + phone;
}

const $ = (id) => document.getElementById(id);

const loginScreen = $("login-screen");
const studentDashboard = $("student-dashboard");
const adminDashboard = $("admin-dashboard");
const message = $("message");

// =====================================
// الاتصال بالخادم
// =====================================

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

    if (!response.ok) {
        throw new Error(result.error || "حدث خطأ");
    }

    return result;
}

// =====================================
// تسجيل الدخول
// =====================================

$("login-button").addEventListener("click", async () => {

    const number = $("student-number").value.trim();

    if (!number) {
        message.textContent = "أدخل رقم الهاتف";
        return;
    }

    $("login-button").disabled = true;
    message.textContent = "جاري تسجيل الدخول...";

    try {

        // دخول المدير
        if (number === "2007") {

            const pin = prompt("أدخل رمز المدير");

            if (!pin) {
                message.textContent = "تم إلغاء الدخول";
                return;
            }

            adminPin = pin;

            await api("list_students", { pin: adminPin });

            loginScreen.hidden = true;
            studentDashboard.hidden = true;
            adminDashboard.hidden = false;

            message.textContent = "";

            await loadAdminData();
            return;
        }

        // دخول الطالب
        const result = await api("student_login", {
            phone: normalizePhone(number)
        });

        currentStudent = result.student;

        loginScreen.hidden = true;
        adminDashboard.hidden = true;
        studentDashboard.hidden = false;

        $("welcome").textContent =
            "مرحباً " + currentStudent.student_name;

        $("credits").textContent = currentStudent.credits;

        displayMachines(result.machines, "washers", "irons");

    } catch (error) {

        message.textContent = error.message;

    } finally {

        $("login-button").disabled = false;

    }

});

// =====================================
// عرض الأجهزة
// =====================================

function displayMachines(machines, washerId, ironId) {

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

        // زر حجز الغسالة للطالب فقط
        if (
            washerId === "washers" &&
            machine.type === "washer" &&
            machine.status === "available" &&
            currentStudent
        ) {

            const button = document.createElement("button");

            button.textContent = "احجز الغسالة";

            button.addEventListener("click", () => {
                bookMachine(machine.id);
            });

            card.appendChild(button);
        }

        if (machine.type === "washer") {
            $(washerId).appendChild(card);
        } else {
            $(ironId).appendChild(card);
        }

    });

}

// =====================================
// حجز غسالة
// =====================================

async function bookMachine(machineId) {

    if (!currentStudent) return;

    if (currentStudent.credits <= 0) {
        alert("رصيدك لا يكفي للحجز");
        return;
    }

    if (!confirm("هل تريد تأكيد حجز هذه الغسالة؟")) {
        return;
    }

    try {

        const result = await api("book_machine", {
            studentId: currentStudent.id,
            machineId: machineId
        });

        currentStudent.credits = result.credits;

        $("credits").textContent = result.credits;

        alert("تم الحجز بنجاح!");

        const machines = await api("get_machines");

        displayMachines(
            machines.machines,
            "washers",
            "irons"
        );

    } catch (error) {

        alert(error.message);

    }

}

// =====================================
// لوحة المدير
// =====================================

async function loadAdminData() {

    await loadStudents();
    await loadAdminMachines();

}

// =====================================
// عرض الطلاب
// =====================================

async function loadStudents() {

    try {

        const result = await api("list_students", {
            pin: adminPin
        });

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

// =====================================
// إضافة طالب
// =====================================

$("add-student").addEventListener("click", async () => {

    const name = $("student-name").value.trim();

    const phone = normalizePhone(
        $("student-phone").value.trim()
    );

    const credits = Number($("student-credits").value);

    if (!name || !phone ||
        !Number.isInteger(credits) || credits < 0) {

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

// =====================================
// عرض الأجهزة للمدير
// =====================================

async function loadAdminMachines() {

    try {

        const result = await api("get_machines");

        displayMachines(
            result.machines,
            "admin-washers",
            "admin-irons"
        );

    } catch (error) {

        alert(error.message);

    }

}

// =====================================
// تسجيل الخروج
// =====================================

function logout() {

    currentStudent = null;
    adminPin = null;

    location.reload();

}

$("logout").addEventListener("click", logout);
$("admin-logout").addEventListener("click", logout);
