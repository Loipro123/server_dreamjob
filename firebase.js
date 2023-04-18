// Import the functions you need from the SDKs you need
const { initializeApp } = require("firebase/app");
const { getStorage } = require("firebase/storage");
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.FB_KEY,
  authDomain: process.env.FB_DOMAIN,
  projectId: process.env.FB_PJ_ID,
  storageBucket: process.env.FB_SR_BG,
  messagingSenderId: process.env.FB_MSG_ID,
  appId: process.env.FB_APP_ID,
  measurementId: process.env.FB_MS_ID
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);
module.exports = getStorage(app);