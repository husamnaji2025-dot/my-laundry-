// عناصر الصفحة
const phoneInput = document.getElementById("phone");
const sendButton = document.getElementById("send-code");
const codeInput = document.getElementById("verification-code");
const verifyButton = document.getElementById("verify-code");
const verificationSection = document.getElementById("verification-section");
const message = document.getElementById("message");

let confirmationResult = null;
let recaptchaVerifier = null;

// إعداد التحقق من الهاتف
function setupRecaptcha() {
    if (recaptchaVerifier) return;

    recaptchaVerifier = new firebase.auth.RecaptchaVerifier(
        "recaptcha-container",
        {
            size: "normal"
        }
    );

    recaptchaVerifier.render();
}

// إرسال رمز SMS
sendButton.addEventListener("click", async function () {
    const phone = phoneInput.value.trim();

    if (!phone.startsWith("+")) {
        message.textContent =
            "اكتب رقم الهاتف مع رمز الدولة، مثال: +9677XXXXXXXX";
        return;
    }

    sendButton.disabled = true;
    message.textContent = "جاري إرسال الرمز...";

    try {
        setupRecaptcha();

        await recaptchaVerifier.render();

        confirmationResult =
            await auth.signInWithPhoneNumber(phone, recaptchaVerifier);

        verificationSection.hidden = false;
        message.textContent = "تم إرسال رمز التحقق إلى هاتفك.";

    } catch (error) {
        message.textContent = "تعذر إرسال الرمز: " + error.message;

        if (recaptchaVerifier) {
            recaptchaVerifier.clear();
            recaptchaVerifier = null;
        }
    }

    sendButton.disabled = false;
});

// تأكيد رمز SMS
verifyButton.addEventListener("click", async function () {
    const code = codeInput.value.trim();

    if (!code) {
        message.textContent = "أدخل رمز التحقق أولاً.";
        return;
    }

    verifyButton.disabled = true;
    message.textContent = "جاري التحقق...";

    try {
        await confirmationResult.confirm(code);

        message.textContent = "تم تسجيل الدخول بنجاح.";

    } catch (error) {
        message.textContent = "الرمز غير صحيح أو انتهت صلاحيته.";
    }

    verifyButton.disabled = false;
});

// متابعة حالة تسجيل الدخول
auth.onAuthStateChanged(function (user) {
    document.getElementById("student-dashboard").hidden = true;
    document.getElementById("admin-dashboard").hidden = true;

    if (user) {
        document.getElementById("login-screen").hidden = false;

        message.textContent =
            "تم التحقق من الهاتف. انتظر اعتماد حسابك من الإدارة.";
    } else {
        document.getElementById("login-screen").hidden = false;
        message.textContent = "";
    }
});
    


// تسجيل الخروج
document.getElementById("logout").addEventListener("click", async function () {
    await auth.signOut();
    message.textContent = "تم تسجيل الخروج.";
});