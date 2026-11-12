const firebaseConfig = {
    apiKey: "AIzaSyBK3Fqno36Orym8xF_eJRM9gfCi3MuEvb4",
    authDomain: "my-laundry-6150f.firebaseapp.com",
    databaseURL: "https://my-laundry-6150f-default-rtdb.firebaseio.com",
    projectId: "my-laundry-6150f",
    storageBucket: "my-laundry-6150f.firebasestorage.app",
    messagingSenderId: "810880281337",
    appId: "1:810880281337:web:6aab3e43f56086b5655028",
    measurementId: "G-J3SCSCZ7K3"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const database = firebase.database();