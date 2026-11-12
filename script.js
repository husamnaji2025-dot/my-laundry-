// ==========================================
// إعدادات الاتصال
// ==========================================

const API_URL = "https://pathkcnviuwqaljpvjbn.supabase.co/functions/v1/super-function";
const SUPABASE_KEY = "sb_publishable_IO9zpRCSMDdMU0wH0QuVeA_xkFzXDP_";

let currentStudent = null;
let adminPin = null;
let refreshTimer = null;
let countdownTimer = null;
let currentReservations = [];

const $ = id => document.getElementById(id);

// ==========================================
// تطبيع رقم الهاتف
// ==========================================

function normalizePhone(phone) {
    phone = phone.replace(/[\s-]/g, "");

    if (phone.startsWith("+")) return phone;
    if (phone.startsWith("967")) return "+" + phone;

    if (phone.startsWith("0")) {
        phone = phone.substring(1);
    }

    return "+967" + phone;
}

// ==========================================
// الاتصال بالخادم
// ==========================================

async function api(action, data = {}) {
    const response = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_KEY
        },
        body: JSON.stringify({
            action,
            ...data
        })
    });

    let result;

    try {
        result = await response.json();
    } catch {
        throw new Error("استجابة غير صحيحة من الخادم");
    }

    if (!response.ok) {
        throw new Error(result.error || "حدث خطأ");
    }

    return result;
}

// ==========================================
// عناصر الواجهة
// ==========================================

const loginScreen = $("login-screen");
const studentDashboard = $("student-dashboard");
const adminDashboard = $("admin-dashboard");
const message = $("message");

// ==========================================
// تسجيل الدخول
// ==========================================

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

        // دخول الطالب
        const result = await api("student_login", {
            phone: normalizePhone(number)
        });

        currentStudent = result.student;
        currentReservations = result.reservations || [];

        loginScreen.hidden = true;
        adminDashboard.hidden = true;
        studentDashboard.hidden = false;

        $("welcome").textContent =
            "مرحباً " + currentStudent.student_name;

        $("credits").textContent = currentStudent.credits;

        displayMachines(
            result.machines || [],
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

// ==========================================
// عرض الغسالات والمكاوي
// ==========================================

function displayMachines(machines, washerId, ironId, reservations = []) {
    const washers = $(washerId);
    const irons = $(ironId);

    if (!washers || !irons) return;

    washers.innerHTML = "";
    irons.innerHTML = "";

    machines.forEach(machine => {
        const card = document.createElement("div");
        card.className = "machine-card";

        const title = document.createElement("h3");
        title.textContent = machine.name;

        const status = document.createElement("p");

        status.textContent =
            machine.status === "occupied"
                ? "مشغولة"
                : "متاحة";

        card.appendChild(title);
        card.appendChild(status);

        // عداد الغسالة
        if (
            machine.type === "washer" &&
            machine.status === "occupied"
        ) {
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

        // زر الحجز للطالب
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
            washers.appendChild(card);
        } else {
            irons.appendChild(card);
        }
    });

    updateCountdowns();
}

// ==========================================
// تحديث عداد الوقت
// ==========================================

function updateCountdowns() {
    document.querySelectorAll(".laundry-timer").forEach(timer => {
        const remaining =
            new Date(timer.dataset.expires).getTime() - Date.now();

        if (remaining <= 0) {
            timer.textContent = "انتهى الوقت، جارٍ تحديث الحالة...";
            return;
        }

        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);

        timer.textContent =
            "الوقت المتبقي: " +
            String(minutes).padStart(2, "0") +
            ":" +
            String(seconds).padStart(2, "0");
    });
}

// ==========================================
// تشغيل التحديث التلقائي
// ==========================================

function startTimers() {
    clearInterval(refreshTimer);
    clearInterval(countdownTimer);

    countdownTimer = setInterval(updateCountdowns, 1000);

    refreshTimer = setInterval(async () => {
        await refreshStudentMachines();
    }, 15000);
}

// ==========================================
// تحديث حالة الغسالات للطالب
// ==========================================

async function refreshStudentMachines() {
    if (!currentStudent) return;

    try {
        const result = await api("get_machines");

        currentReservations = result.reservations || [];

        displayMachines(
            result.machines || [],
            "washers",
            "irons",
            currentReservations
        );

    } catch (error) {
        console.log(error);
    }
}

// ==========================================
// حجز غسالة
// ==========================================

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

// ==========================================
// لوحة المدير
// ==========================================

async function loadAdminData() {
    await loadStudents();
    await loadAdminMachines();
    await loadReservations();
    await loadSubscriptionPanel();
}

// ==========================================
// عرض الطلاب
// ==========================================

async function loadStudents() {
    try {
        const result = await api("list_students", {
            pin: adminPin
        });

        const container = $("students-list");

        if (!container) return;

        container.innerHTML = "";

        (result.students || []).forEach(student => {
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

// ==========================================
// إضافة طالب
// ==========================================

$("add-student").addEventListener("click", async () => {
    const name = $("student-name").value.trim();

    const phone = normalizePhone(
        $("student-phone").value.trim()
    );

    const credits = Number(
        $("student-credits").value
    );

    if (
        !name ||
        !phone ||
        !Number.isInteger(credits) ||
        credits < 0
    ) {
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

// ==========================================
// عرض الغسالات والمكاوي للمدير
// ==========================================

async function loadAdminMachines() {
    try {
        const result = await api("get_machines");

        displayMachines(
            result.machines || [],
            "admin-washers",
            "admin-irons",
            result.reservations || []
        );

    } catch (error) {
        alert(error.message);
    }
}

// ==========================================
// إنهاء الحجز
// ==========================================

async function finishReservation(id) {
    if (!confirm("هل تريد إنهاء هذا الحجز؟")) {
        return;
    }

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

// ==========================================
// عرض الحجوزات
// ==========================================

async function loadReservations() {
    const container = $("reservations-list");

    if (!container) return;

    container.textContent = "جاري تحميل الحجوزات...";

    try {
        const result = await api("list_reservations", {
            pin: adminPin
        });

        container.innerHTML = "";

        if (
            !result.reservations ||
            result.reservations.length === 0
        ) {
            container.textContent = "لا توجد حجوزات حتى الآن";
            return;
        }

        result.reservations.forEach(r => {
            const card = document.createElement("div");

            card.className = "student-card";

            const info = document.createElement("div");

            info.innerHTML = `
                <p>رقم الحجز: ${r.id}</p>
                <p>الطالب: ${r.students?.student_name || "غير معروف"}</p>
                <p>الجهاز: ${r.machines?.name || "غير معروف"}</p>
                <p>الحالة: ${r.status}</p>
            `;

            card.appendChild(info);

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

// زر تحديث الحجوزات (مرة واحدة فقط)
$("refresh-reservations").addEventListener(
    "click",
    loadReservations
);

// ==========================================
// تسجيل الخروج
// ==========================================

function logout() {
    clearInterval(refreshTimer);
    clearInterval(countdownTimer);

    currentStudent = null;
    adminPin = null;

    location.reload();
}

$("logout").addEventListener("click", logout);
$("admin-logout").addEventListener("click", logout);

// ==========================================
// إدارة الاشتراكات
// ==========================================

async function loadSubscriptionPanel() {
    if (!adminPin) return;

    let panel = $("subscription-panel");

    if (!panel) {
        panel = document.createElement("div");

        panel.id = "subscription-panel";

        adminDashboard.appendChild(panel);
    }

    panel.innerHTML = `
        <h2>إدارة الاشتراكات</h2>

        <h3>إعدادات الباقة الشهرية</h3>

        <input
            id="package-price"
            type="number"
            min="0"
            placeholder="سعر الاشتراك"
        >

        <input
            id="package-washes"
            type="number"
            min="1"
            placeholder="عدد الغسلات"
        >

        <input
            id="package-days"
            type="number"
            min="1"
            value="30"
            placeholder="مدة الاشتراك"
        >

        <button id="save-package">حفظ الباقة</button>

        <hr>

        <h3>البحث عن طالب</h3>

        <input
            id="subscription-search"
            placeholder="اسم الطالب أو رقم الهاتف"
        >

        <button id="search-subscription-student">
            بحث
        </button>

        <div id="subscription-search-results"></div>

        <hr>

        <h3>الاشتراكات الحالية</h3>

        <button id="refresh-subscriptions">
            تحديث الاشتراكات
        </button>

        <div id="subscriptions-list"></div>

        <hr>

        <h3>سجل المدفوعات</h3>

        <button id="refresh-payments">
            عرض المدفوعات
        </button>

        <div id="payments-list"></div>
    `;

    $("save-package").onclick = saveSubscriptionPackage;

    $("search-subscription-student").onclick =
        searchSubscriptionStudent;

    $("refresh-subscriptions").onclick =
        loadSubscriptions;

    $("refresh-payments").onclick =
        loadSubscriptionPayments;

    await loadSubscriptionSettings();
    await loadSubscriptions();
}

// ==========================================
// تحميل إعدادات الباقة
// ==========================================

async function loadSubscriptionSettings() {
    try {
        const result = await api("get_subscription_settings", {
            pin: adminPin
        });

        const s = result.settings;

        $("package-price").value = s.monthly_price;
        $("package-washes").value = s.monthly_washes;
        $("package-days").value = s.duration_days;

    } catch (error) {
        alert(error.message);
    }
}

// ==========================================
// حفظ إعدادات الباقة
// ==========================================

async function saveSubscriptionPackage() {
    const price = Number($("package-price").value);
    const washes = Number($("package-washes").value);
    const days = Number($("package-days").value);

    if (
        !Number.isFinite(price) ||
        price < 0 ||
        !Number.isInteger(washes) ||
        washes < 1 ||
        !Number.isInteger(days) ||
        days < 1
    ) {
        alert("تأكد من إدخال السعر وعدد الغسلات والمدة بشكل صحيح");
        return;
    }

    try {
        await api("update_subscription_settings", {
            pin: adminPin,
            monthly_price: price,
            monthly_washes: washes,
            duration_days: days
        });

        alert("تم حفظ الباقة بنجاح");

    } catch (error) {
        alert(error.message);
    }
}

// ==========================================
// البحث عن طالب
// ==========================================

async function searchSubscriptionStudent() {
    const query = $("subscription-search").value.trim();

    if (!query) {
        alert("أدخل اسم الطالب أو رقم الهاتف");
        return;
    }

    const container = $("subscription-search-results");

    container.textContent = "جاري البحث...";

    try {
        const result = await api("search_student", {
            pin: adminPin,
            query
        });

        container.innerHTML = "";

        if (!result.students || result.students.length === 0) {
            container.textContent = "لم يتم العثور على الطالب";
            return;
        }

        result.students.forEach(student => {
            const card = document.createElement("div");

            card.className = "student-card";

            const info = document.createElement("p");

            info.textContent =
                student.student_name +
                " | " +
                student.phone +
                " | الرصيد: " +
                student.credits;

            const button = document.createElement("button");

            button.textContent = "إنشاء اشتراك";

            button.onclick = () => {
                createStudentSubscription(student);
            };

            card.append(info, button);

            container.appendChild(card);
        });

    } catch (error) {
        container.textContent = error.message;
    }
}

// ==========================================
// إنشاء اشتراك لطالب مسجل
// ==========================================

async function createStudentSubscription(student) {
    const paid = prompt(
        "أدخل المبلغ المدفوع الآن، أو اكتب 0 إذا لم يدفع"
    );

    if (paid === null) return;

    const paidAmount = Number(paid);

    if (
        !Number.isFinite(paidAmount) ||
        paidAmount < 0
    ) {
        alert("المبلغ غير صحيح");
        return;
    }

    try {
        await api("create_subscription", {
            pin: adminPin,
            studentId: student.id,
            paid_amount: paidAmount
        });

        alert("تم إنشاء الاشتراك وإضافة الغسلات للطالب");

        await loadStudents();
        await loadSubscriptions();

    } catch (error) {
        alert(error.message);
    }
}

// ==========================================
// عرض الاشتراكات
// ==========================================

async function loadSubscriptions() {
    const container = $("subscriptions-list");

    container.textContent = "جاري التحميل...";

    try {
        const result = await api("list_subscriptions", {
            pin: adminPin
        });

        container.innerHTML = "";

        const subscriptions = result.subscriptions || [];

        if (subscriptions.length === 0) {
            container.textContent = "لا توجد اشتراكات";
            return;
        }

        subscriptions.forEach(s => {
            const card = document.createElement("div");

            card.className = "student-card";

            const remaining =
                Number(s.price) - Number(s.paid_amount);

            const info = document.createElement("p");

            info.textContent =
                (s.students?.student_name || "طالب") +
                " | السعر: " + s.price +
                " | المدفوع: " + s.paid_amount +
                " | المتبقي: " + remaining +
                " | الغسلات: " + s.total_washes +
                " | ينتهي: " +
                new Date(s.end_date).toLocaleDateString();

            card.appendChild(info);

            if (remaining > 0) {
                const button = document.createElement("button");

                button.textContent = "تسديد وإرفاق السند";

                button.onclick = () => {
                    addSubscriptionPayment(s);
                };

                card.appendChild(button);
            }

            container.appendChild(card);
        });

    } catch (error) {
        container.textContent = error.message;
    }
}

// ==========================================
// تسجيل دفعة وإرفاق صورة السند
// ==========================================

async function addSubscriptionPayment(subscription) {
    const remaining =
        Number(subscription.price) -
        Number(subscription.paid_amount);

    const amount = prompt(
        "المبلغ المتبقي: " +
        remaining +
        "\nأدخل مبلغ التسديد:"
    );

    if (amount === null) return;

    const value = Number(amount);

    if (
        !Number.isFinite(value) ||
        value <= 0 ||
        value > remaining
    ) {
        alert("المبلغ غير صحيح");
        return;
    }

    const input = document.createElement("input");

    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";

    input.onchange = async () => {
        const file = input.files[0];

        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            alert("حجم الصورة يجب ألا يتجاوز 5 ميجابايت");
            return;
        }

        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            alert("اختر صورة بصيغة JPG أو PNG أو WEBP");
            return;
        }

        try {
            const receiptBase64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();

                reader.onload = () => resolve(reader.result);

                reader.onerror = () => {
                    reject(new Error("تعذرت قراءة صورة السند"));
                };

                reader.readAsDataURL(file);
            });

            await api("add_subscription_payment", {
                pin: adminPin,
                subscriptionId: subscription.id,
                amount: value,
                receiptBase64,
                receiptType: file.type
            });

            alert("تم تسجيل الدفعة وحفظ صورة السند بنجاح");

            await loadSubscriptions();
            await loadSubscriptionPayments();

        } catch (error) {
            alert(error.message);
        }
    };

    input.click();
}

// ==========================================
// سجل المدفوعات
// ==========================================

async function loadSubscriptionPayments() {
    const container = $("payments-list");

    container.textContent = "جاري التحميل...";

    try {
        const result = await api("list_subscription_payments", {
            pin: adminPin
        });

        container.innerHTML = "";

        const payments = result.payments || [];

        if (payments.length === 0) {
            container.textContent = "لا توجد مدفوعات";
            return;
        }

        payments.forEach(payment => {
            const card = document.createElement("div");

            card.className = "student-card";

            const info = document.createElement("p");

            info.textContent =
                "المبلغ: " + payment.amount +
                " | التاريخ: " +
                new Date(payment.payment_date).toLocaleDateString();

            card.appendChild(info);

            if (payment.receipt_url) {
                const link = document.createElement("a");

                link.href = payment.receipt_url;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.textContent = "عرض صورة سند السداد";

                card.appendChild(link);
            }

            container.appendChild(card);
        });

    } catch (error) {
        container.textContent = error.message;
    }
}

// ==========================================
// نهاية الملف
// ==========================================
