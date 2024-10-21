import * as functions from "firebase-functions";
import * as nodemailer from "nodemailer";
import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/https";
require("dotenv").config();

admin.initializeApp();

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const generateVerificationCode = (length: number = 6): string => {
    let code = "";
    const characters = "0123456789";
    for (let i = 0; i < length; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return code;
};

export const sendVerificationCode = functions.https.onCall(
    async (request: functions.https.CallableRequest): Promise<{ success: boolean }> => {
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
        } catch (error) {
            console.error("Error sending email:", error);
            throw new functions.https.HttpsError("internal", "Unable to send email");
        }
    },
);

export const verifyVerificationCode = functions.https.onCall(
    async (request: functions.https.CallableRequest): Promise<{ success: boolean }> => {
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
        } catch (error) {
            console.error("Error verifying code:", error);
            const errorMessage =
                error instanceof HttpsError ? error.message : "Unable to verify code.";

            throw new functions.https.HttpsError("internal", errorMessage);
        }
    },
);
