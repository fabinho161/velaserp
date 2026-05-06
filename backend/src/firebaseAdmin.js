const admin = require("firebase-admin");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

let firebaseApp = null;

const getServiceAccount = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON nao configurado.");
  }

  const serviceAccount = JSON.parse(raw);

  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  return serviceAccount;
};

const getFirebaseApp = () => {
  if (firebaseApp) return firebaseApp;

  if (admin.apps.length > 0) {
    firebaseApp = admin.app();
    return firebaseApp;
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(getServiceAccount()),
  });

  return firebaseApp;
};

const getDb = () => {
  return getFirestore(getFirebaseApp());
};

const getAuthClient = () => {
  return getAuth(getFirebaseApp());
};

module.exports = {
  FieldValue,
  getAuthClient,
  getDb,
};
