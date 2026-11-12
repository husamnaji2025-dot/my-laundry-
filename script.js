// ==========================================
// إعدادات الاتصال
// ==========================================

const API_URL = "https://pathkcnviuwqaljpvjbn.supabase.co/functions/v1/super-function";
const SUPABASE_KEY = "sb_publishable_IO9zpRCSMDdMU0wH0QuVeA_xkFzXDP_";

let currentStudent = null;
let adminPin = null;
let currentPhone = null;

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
// تسجيل دخول الطالب
// ==========================================

async function loginStudent(phone, saveSession = true) {
    const result = await api("student_login", {
        phone: normalizePhone(phone)
    });

    currentStudent = result.student;
    currentPhone = normalizePhone(phone);

    currentReservations = result.reservations || [];

    if (saveSession) {
        localStorage.setItem("laundry_student_phone", currentPhone);
    }

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

    await loadStudentSubscription();

    startTimers();
}

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
        if (number === "2007") {
            const pin = prompt("أدخل رمز المدير");

            if (!pin) return;

            await api("list_students", { pin });

            adminPin = pin;

            localStorage.removeItem("laundry_student_phone");

            loginScreen.hidden = true;
            studentDashboard.hidden = true;
            adminDashboard.hidden = false;

            message.textContent = "";

            await loadAdminData();

            return;
        }

        await loginStudent(number);

    } catch (error) {
        message.textContent = error.message;
    } finally {
        $("login-button").disabled = false;
    }
});

// ==========================================
// استعادة جلسة الطالب بعد تحديث الصفحة
// ==========================================

async function restoreStudentSession() {
    const savedPhone = localStorage.getItem("laundry_student_phone");

    if (!savedPhone) return;

    try {
        await loginStudent(savedPhone, false);
    } catch (error) {
        localStorage.removeItem("laundry_student_phone");
        console.log("تعذرت استعادة الجلسة:", error.message);
    }
}

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
// عداد الوقت
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
        await refreshStudentSubscription();
    }, 15000);
}

// ==========================================
// تحديث الغسالات
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
// اشتراك الطالب
// ==========================================

async function loadStudentSubscription() {
    if (!currentPhone) return;

    const info = $("student-subscription-info");

    info.textContent = "جاري تحميل بيانات الاشتراك...";

    try {
        const result = await api("student_subscription_status", {
            phone: currentPhone
        });

        const settings = result.settings || {};
        const subscription = result.subscription;
        const request = result.request;

        let html = `
            <div>
                <p>💰 سعر الباقة: ${settings.monthly_price ?? 0}</p>
                <p>🧺 عدد الغسلات: ${settings.monthly_washes ?? 0}</p>
                <p>📅 مدة الاشتراك: ${settings.duration_days ?? 30} يوم</p>
            </div>
        `;

        if (subscription) {
            html += `
                <hr>
                <h3>اشتراكك الحالي</h3>
                <p>الحالة: نشط</p>
                <p>الغسلات: ${subscription.total_washes}</p>
                <p>تاريخ الانتهاء: ${
                    new Date(subscription.end_date).toLocaleDateString()
                }</p>
            `;
        } else if (request && request.status === "pending") {
            html += `
                <hr>
                <p style="color:#d88900">
                    ⏳ طلب اشتراكك قيد مراجعة المدير.
                </p>
            `;
        } else if (request && request.status === "rejected") {
            html += `
                <hr>
                <p style="color:#c0392b">
                    تم رفض طلب الاشتراك السابق. يمكنك تقديم طلب جديد.
                </p>
            `;
        } else {
            html += `
                <hr>
                <p>لا يوجد لديك اشتراك نشط حالياً.</p>
            `;
        }

        info.innerHTML = html;

        const requestButton = $("student-request-subscription");

        if (subscription || (request && request.status === "pending")) {
            requestButton.hidden = true;
        } else {
            requestButton.hidden = false;
        }

    } catch (error) {
        info.textContent = error.message;
    }
}

async function refreshStudentSubscription() {
    if (!currentStudent) return;

    await loadStudentSubscription();
}

// ==========================================
// فتح نموذج إرفاق السند
// ==========================================

$("student-request-subscription").addEventListener("click", () => {
    $("student-receipt-area").hidden = false;
    $("student-subscription-message").textContent = "";
});

// ==========================================
// اختيار صورة السند
// ==========================================

$("receipt-picker").addEventListener("click", () => {
    $("student-receipt").click();
});

$("student-receipt").addEventListener("change", () => {
    const file = $("student-receipt").files[0];

    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        alert("حجم الصورة يجب ألا يتجاوز 5 ميجابايت");
        $("student-receipt").value = "";
        return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        alert("اختر صورة JPG أو PNG أو WEBP");
        $("student-receipt").value = "";
        return;
    }

    const preview = $("receipt-preview");

    preview.src = URL.createObjectURL(file);
    preview.hidden = false;

    $("receipt-picker").textContent = "تم اختيار صورة السند ✓";
});

// ==========================================
// إرسال طلب الاشتراك
// ==========================================

$("student-upload-receipt").addEventListener("click", async () => {
    const file = $("student-receipt").files[0];

    if (!file) {
        alert("اختر صورة السند أولاً");
        return;
    }

    const button = $("student-upload-receipt");

    button.disabled = true;
    button.textContent = "جاري إرسال السند...";

    try {
        const receiptBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => resolve(reader.result);

            reader.onerror = () => {
                reject(new Error("تعذرت قراءة الصورة"));
            };

            reader.readAsDataURL(file);
        });

        const result = await api("student_request_subscription", {
            phone: currentPhone,
            receiptBase64,
            receiptType: file.type
        });

        $("student-subscription-message").textContent =
            result.message || "تم إرسال طلب الاشتراك بنجاح";

        $("student-subscription-message").style.color = "green";

        $("student-receipt-area").hidden = true;
        $("student-receipt").value = "";
        $("receipt-preview").hidden = true;

        await loadStudentSubscription();

    } catch (error) {
        alert(error.message);
    } finally {
        button.disabled = false;
        button.textContent = "إرسال السند";
    }
});

// ==========================================
// إلغاء إرفاق السند
// ==========================================

$("cancel-receipt").addEventListener("click", () => {
    $("student-receipt-area").hidden = true;
    $("student-receipt").value = "";
    $("receipt-preview").hidden = true;
    $("receipt-picker").textContent = "📤 اضغط هنا لاختيار الصورة";
});

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

    const rawPhone = $("student-phone").value.trim();

    const credits = Number($("student-credits").value);

    if (
        !name ||
        !rawPhone ||
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
            phone: normalizePhone(rawPhone),
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
// أجهزة المدير
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

// ==========================================
// سجل الحجوزات
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

        if (!result.reservations || result.reservations.length === 0) {
            container.textContent = "لا توجد حجوزات حتى الآن";
            return;
        }

        result.reservations.forEach(r => {
            const card = document.createElement("div");

            card.className = "student-card";

            const info = document.createElement("div");

            const p1 = document.createElement("p");
            p1.textContent = "رقم الحجز: " + r.id;

            const p2 = document.createElement("p");
            p2.textContent =
                "الطالب: " + (r.students?.student_name || "غير معروف");

            const p3 = document.createElement("p");
            p3.textContent =
                "الجهاز: " + (r.machines?.name || "غير معروف");

            const p4 = document.createElement("p");
            p4.textContent = "الحالة: " + r.status;

            info.append(p1, p2, p3, p4);
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

$("refresh-reservations").addEventListener(
    "click",
    loadReservations
);

// ==========================================
// إدارة الاشتراكات
// ==========================================

async function loadSubscriptionPanel() {
    if (!adminPin) return;

    const panel = $("subscription-panel");

    panel.innerHTML = `
        <h2>💳 إدارة الاشتراكات</h2>

        <h3>طلبات الاشتراك الجديدة</h3>

        <button id="refresh-subscription-requests">
            تحديث الطلبات
        </button>

        <div id="subscription-requests-list">
            جاري تحميل الطلبات...
        </div>

        <hr>

        <h3>إعدادات الباقة الشهرية</h3>

        <input id="package-price" type="number" min="0"
            placeholder="سعر الاشتراك">

        <input id="package-washes" type="number" min="1"
            placeholder="عدد الغسلات">

        <input id="package-days" type="number" min="1"
            placeholder="مدة الاشتراك">

        <button id="save-package">حفظ الباقة</button>

        <hr>

        <h3>البحث عن طالب</h3>

        <input id="subscription-search"
            placeholder="اسم الطالب أو رقم الهاتف">

        <button id="search-subscription-student">بحث</button>

        <div id="subscription-search-results"></div>

        <hr>

        <h3>الاشتراكات الحالية</h3>

        <button id="refresh-subscriptions">تحديث الاشتراكات</button>

        <div id="subscriptions-list"></div>

        <hr>

        <h3>سجل المدفوعات</h3>

        <button id="refresh-payments">عرض المدفوعات</button>

        <div id="payments-list"></div>
    `;

    $("save-package").onclick = saveSubscriptionPackage;

    $("search-subscription-student").onclick =
        searchSubscriptionStudent;

    $("refresh-subscriptions").onclick =
        loadSubscriptions;

    $("refresh-payments").onclick =
        loadSubscriptionPayments;

    $("refresh-subscription-requests").onclick =
        loadSubscriptionRequests;

    await loadSubscriptionSettings();
    await loadSubscriptionRequests();
    await loadSubscriptions();
}

// ==========================================
// طلبات الاشتراك للمدير
// ==========================================

async function loadSubscriptionRequests() {
    const container = $("subscription-requests-list");

    if (!container) return;

    container.textContent = "جاري تحميل الطلبات...";

    try {
        const result = await api("list_subscription_requests", {
            pin: adminPin
        });

        container.innerHTML = "";

        const requests = result.requests || [];

        if (requests.length === 0) {
            container.textContent = "لا توجد طلبات اشتراك جديدة";
            return;
        }

        requests.forEach(request => {
            const card = document.createElement("div");

            card.className = "student-card";

            const title = document.createElement("h3");

            title.textContent =
                request.students?.student_name || "طالب";

            const phone = document.createElement("p");

            phone.textContent =
                "رقم الهاتف: " +
                (request.students?.phone || "غير معروف");

            const price = document.createElement("p");

            price.textContent = "السعر: " + request.price;

            const washes = document.createElement("p");

            washes.textContent = "الغسلات: " + request.total_washes;

            const status = document.createElement("p");

            status.textContent =
                "الحالة: " + request.status;

            card.append(title, phone, price, washes, status);

            if (request.receipt_url) {
                const link = document.createElement("a");

                link.href = request.receipt_url;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.textContent = "📷 عرض سند الدفع";

                card.appendChild(link);
            }

            if (request.status === "pending") {
                const approve = document.createElement("button");

                approve.textContent = "قبول الطلب";
                approve.onclick = () => {
                    reviewSubscriptionRequest(request.id, "approved");
                };

                const reject = document.createElement("button");

                reject.textContent = "رفض الطلب";
                reject.onclick = () => {
                    reviewSubscriptionRequest(request.id, "rejected");
                };

                card.append(approve, reject);
            }

            container.appendChild(card);
        });

    } catch (error) {
        container.textContent = error.message;
    }
}

// ==========================================
// قبول أو رفض طلب الاشتراك
// ==========================================

async function reviewSubscriptionRequest(requestId, decision) {
    const question = decision === "approved"
        ? "هل تأكدت من صحة السند وتريد قبول الطلب؟"
        : "هل تريد رفض طلب الاشتراك؟";

    if (!confirm(question)) return;

    try {
        const result = await api("review_subscription_request", {
            pin: adminPin,
            requestId,
            decision
        });

        alert(result.message || "تم تنفيذ العملية");

        await loadSubscriptionRequests();
        await loadSubscriptions();
        await loadStudents();

    } catch (error) {
        alert(error.message);
    }
}

// ==========================================
// إعدادات الباقة
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

            card.textContent =
                student.student_name +
                " | " + student.phone +
                " | الرصيد: " + student.credits;

            container.appendChild(card);
        });

    } catch (error) {
        container.textContent = error.message;
    }
}

// ==========================================
// عرض الاشتراكات الحالية
// ==========================================

async function loadSubscriptions() {
    const container = $("subscriptions-list");

    if (!container) return;

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

            container.appendChild(card);
        });

    } catch (error) {
        container.textContent = error.message;
    }
}

// ==========================================
// سجل المدفوعات
// ==========================================

async function loadSubscriptionPayments() {
    const container = $("payments-list");

    if (!container) return;

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
// تسجيل الخروج
// ==========================================

function logout() {
    clearInterval(refreshTimer);
    clearInterval(countdownTimer);

    localStorage.removeItem("laundry_student_phone");

    currentStudent = null;
    currentPhone = null;
    adminPin = null;

    location.reload();
}

$("logout").addEventListener("click", logout);
$("admin-logout").addEventListener("click", logout);

// ==========================================
// استعادة الجلسة عند فتح الصفحة
// ==========================================

restoreStudentSession();
