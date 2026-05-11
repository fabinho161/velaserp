const admin = require("firebase-admin");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

let firebaseApp = null;
let firebaseProjectId = null;

const getServiceAccount = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON nao configurado.");
  }

  const serviceAccount = JSON.parse(raw);
  const expectedProjectId = process.env.FIREBASE_PROJECT_ID;

  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }

  if (expectedProjectId && serviceAccount.project_id !== expectedProjectId) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_JSON project_id (${serviceAccount.project_id || "indefinido"}) nao confere com FIREBASE_PROJECT_ID (${expectedProjectId}).`
    );
  }

  return serviceAccount;
};

const getFirebaseApp = () => {
  if (firebaseApp) return firebaseApp;

  if (admin.apps.length > 0) {
    firebaseApp = admin.app();
    firebaseProjectId = firebaseApp.options.projectId || process.env.FIREBASE_PROJECT_ID || null;
    return firebaseApp;
  }

  const serviceAccount = getServiceAccount();

  firebaseProjectId =
    process.env.FIREBASE_PROJECT_ID ||
    serviceAccount.project_id ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    null;

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: firebaseProjectId || undefined,
  });

  return firebaseApp;
};

const getDb = () => {
  return getFirestore(getFirebaseApp());
};

const getAuthClient = () => {
  return getAuth(getFirebaseApp());
};

const getFirebaseProjectId = () => {
  if (!firebaseProjectId) {
    firebaseProjectId =
      process.env.FIREBASE_PROJECT_ID ||
      process.env.GCLOUD_PROJECT ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      null;
  }

  if (!firebaseProjectId && firebaseApp) {
    firebaseProjectId = firebaseApp.options.projectId || null;
  }

  return firebaseProjectId;
};

module.exports = {
  FieldValue,
  getAuthClient,
  getDb,
  getFirebaseProjectId,
};
