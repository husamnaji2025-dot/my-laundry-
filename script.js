// =====================================
// مغسلتي - My Laundry
// تسجيل الدخول برقم الطالب فقط
// =====================================

const db = firebase.database();

// عناصر الصفحة
const loginScreen = document.getElementById("login-screen");
const studentDashboard = document.getElementById("student-dashboard");
const adminDashboard = document.getElementById("admin-dashboard");

const message = document.getElementById("message");
const studentNumberInput = document.getElementById("student-number");
const loginButton = document.getElementById("login-button");

// رقم المدير المؤقت
// غيّره إلى رقم خاص بك
const ADMIN_NUMBER = "0000";

let currentStudent = null;
let currentStudentNumber = null;


// =====================================
// تسجيل الدخول
// =====================================

loginButton.addEventListener("click", async function () {

    const number = studentNumberInput.value.trim();

    if (!number) {
        message.textContent = "أدخل رقم الطالب أولاً";
        return;
    }

    loginButton.disabled = true;
    message.textContent = "جاري تسجيل الدخول...";

    try {

        // دخول المدير
        if (number === ADMIN_NUMBER) {

            currentStudent = null;
            currentStudentNumber = number;

            loginScreen.hidden = true;
            studentDashboard.hidden = true;
            adminDashboard.hidden = false;

            message.textContent = "";

            loadAdminData();

            return;
        }

        // البحث عن الطالب في قاعدة البيانات
        const snapshot = await db.ref("students/" + number).once("value");

        if (!snapshot.exists()) {
            message.textContent = "رقم الطالب غير مسجل";
            return;
        }

        currentStudent = snapshot.val();
        currentStudentNumber = number;

        loginScreen.hidden = true;
        adminDashboard.hidden = true;
        studentDashboard.hidden = false;

        document.getElementById("welcome").textContent =
            "مرحباً " + (currentStudent.name || "بالطالب");

        document.getElementById("credits").textContent =
            currentStudent.credits || 0;

        loadMachines();

    } catch (error) {

        message.textContent = "حدث خطأ في الاتصال بقاعدة البيانات";

        console.error(error);

    } finally {

        loginButton.disabled = false;

    }

});


// =====================================
// عرض الغسالات والمكاوي للطالب
// =====================================

function loadMachines() {

    db.ref("machines/washers").on("value", function (snapshot) {

        const container = document.getElementById("washers");

        container.innerHTML = "";

        snapshot.forEach(function (item) {

            const machine = item.val();

            const card = document.createElement("div");

            card.className = "machine-card";

            card.textContent =
                (machine.name || item.key) + " : " +
                (machine.status === "busy" ? "مشغولة" : "متاحة");

            container.appendChild(card);

        });

    });


    db.ref("machines/irons").on("value", function (snapshot) {

        const container = document.getElementById("irons");

        container.innerHTML = "";

        snapshot.forEach(function (item) {

            const iron = item.val();

            const card = document.createElement("div");

            card.className = "machine-card";

            card.textContent =
                (iron.name || item.key) + " : " +
                (iron.status === "busy" ? "مشغولة" : "متاحة");

            container.appendChild(card);

        });

    });

}


// =====================================
// لوحة المدير
// =====================================

function loadAdminData() {

    loadStudents();
    loadAdminMachines();

}


// إضافة طالب
document.getElementById("add-student").addEventListener("click", async function () {

    const name = document.getElementById("student-name").value.trim();

    const phone = document.getElementById("student-phone").value.trim();

    const credits = Number(document.getElementById("student-credits").value);

    if (!name || !phone || !Number.isInteger(credits) || credits < 0) {

        alert("أدخل اسم الطالب ورقمه ورصيد الغسلات بشكل صحيح");

        return;

    }

    try {

        const snapshot = await db.ref("students/" + phone).once("value");

        if (snapshot.exists()) {

            alert("هذا الرقم مسجل مسبقاً");

            return;

        }

        await db.ref("students/" + phone).set({

            name: name,

            phone: phone,

            credits: credits,

            createdAt: Date.now()

        });

        alert("تمت إضافة الطالب بنجاح");

        document.getElementById("student-name").value = "";
        document.getElementById("student-phone").value = "";
        document.getElementById("student-credits").value = "";

        loadStudents();

    } catch (error) {

        alert("تعذرت إضافة الطالب");

        console.error(error);

    }

});


// عرض الطلاب
function loadStudents() {

    db.ref("students").on("value", function (snapshot) {

        const container = document.getElementById("students-list");

        container.innerHTML = "";

        snapshot.forEach(function (item) {

            const student = item.val();

            const card = document.createElement("div");

            card.className = "student-card";

            card.textContent =
                student.name + " | رقم: " + student.phone +
                " | الغسلات: " + student.credits;

            container.appendChild(card);

        });

    });

}


// عرض الأجهزة في لوحة المدير
function loadAdminMachines() {

    db.ref("machines/washers").on("value", function (snapshot) {

        const container = document.getElementById("admin-washers");

        container.innerHTML = "";

        snapshot.forEach(function (item) {

            const machine = item.val();

            const card = document.createElement("div");

            card.textContent =
                (machine.name || item.key) + " - " +
                (machine.status === "busy" ? "مشغولة" : "متاحة");

            container.appendChild(card);

        });

    });


    db.ref("machines/irons").on("value", function (snapshot) {

        const container = document.getElementById("admin-irons");

        container.innerHTML = "";

        snapshot.forEach(function (item) {

            const iron = item.val();

            const card = document.createElement("div");

            card.textContent =
                (iron.name || item.key) + " - " +
                (iron.status === "busy" ? "مشغولة" : "متاحة");

            container.appendChild(card);

        });

    });

}


// =====================================
// تسجيل الخروج
// =====================================

document.getElementById("logout").addEventListener("click", function () {

    currentStudent = null;
    currentStudentNumber = null;

    location.reload();

});


document.getElementById("admin-logout").addEventListener("click", function () {

    currentStudent = null;
    currentStudentNumber = null;

    location.reload();

});
