// Firebase Configuration for Minor OT Manager
// Update these credentials with your Firebase project values

const firebaseConfig = {
  apiKey: "AIzaSyBhLIBL9j5ynCqLE_-0Bkj-qVY3y3SEzOg",
  authDomain: "minor-ot-manager.firebaseapp.com",
  projectId: "minor-ot-manager",
  storageBucket: "minor-ot-manager.firebasestorage.app",
  messagingSenderId: "240851011199",
  appId: "1:240851011199:web:3c3cf35c56751849eb214a"
};

// Initialize Firebase (this will be called from the main HTML)
// The app will use:
// - Cloud Firestore for data storage
// - Real-time listeners via onSnapshot()
// - Transactions for token generation
// - Offline persistence enabled by default in the app

// Instructions:
// 1. Go to https://console.firebase.google.com
// 2. Create a new project (or use existing)
// 3. Enable Cloud Firestore (start in test mode for development)
// 4. Enable Realtime Database if needed
// 5. Go to Project Settings → General
// 6. Copy your web app credentials and replace the placeholders above
// 7. Security Rules for Firestore (use in production):
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow all reads and writes for development
    match /{document=**} {
      allow read, write: if true;
    }
    
    // For production, use authentication:
    // match /minorOT/{date}/patients/{document=**} {
    //   allow read, write: if request.auth != null;
    // }
  }
}
*/
