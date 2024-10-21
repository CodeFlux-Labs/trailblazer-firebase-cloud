"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyVerificationCode = exports.sendVerificationCode = void 0;
const functions = __importStar(require("firebase-functions"));
const nodemailer = __importStar(require("nodemailer"));
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/https");
require("dotenv").config();
admin.initializeApp();
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});
const generateVerificationCode = (length = 6) => {
    let code = "";
    const characters = "0123456789";
    for (let i = 0; i < length; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
};
exports.sendVerificationCode = functions.https.onCall(async (request) => {
    const { email } = request.data;
    console.log("EMAIL: ", email);
    const code = generateVerificationCode();
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Your Verification Code",
        text: `Your verification code is ${code}`,
    };
    try {
        const expirationTime = new Date(Date.now() + 10 * 60 * 1000);
        const snapshot = await admin
            .firestore()
            .collection("verificationCodes")
            .where("email", "==", email)
            .get();
        const batch = admin.firestore().batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        await admin.firestore().collection("verificationCodes").add({
            email,
            code,
            createdAt: new Date(),
            expiresAt: expirationTime,
        });
        await transporter.sendMail(mailOptions);
        return { success: true };
    }
    catch (error) {
        console.error("Error sending email:", error);
        throw new functions.https.HttpsError("internal", "Unable to send email");
    }
});
exports.verifyVerificationCode = functions.https.onCall(async (request) => {
    const { email, code } = request.data;
    try {
        const snapshot = await admin
            .firestore()
            .collection("verificationCodes")
            .where("email", "==", email)
            .where("code", "==", code)
            .get();
        if (snapshot.empty) {
            throw new functions.https.HttpsError("not-found", "Code not found or invalid.");
        }
        const doc = snapshot.docs[0];
        const { expiresAt } = doc.data();
        if (new Date() > expiresAt.toDate()) {
            throw new functions.https.HttpsError("deadline-exceeded", "Code has expired.");
        }
        return { success: true };
    }
    catch (error) {
        console.error("Error verifying code:", error);
        const errorMessage = error instanceof https_1.HttpsError ? error.message : "Unable to verify code.";
        throw new functions.https.HttpsError("internal", errorMessage);
    }
});
//# sourceMappingURL=index.js.map