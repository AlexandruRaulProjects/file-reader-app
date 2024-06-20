const express = require("express");
const { json } = require("body-parser");
const pdfParse = require("pdf-parse");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const OpenAI = require("openai");

require("dotenv").config();

const {
  getStorage,
  ref,
  getDownloadURL,
  uploadBytesResumable,
} = require("firebase/storage");
const { initializeApp } = require("firebase/app");

const app = express();
// Generate a new UUID
const uniqueId = uuidv4();

// Initializing the env variables
const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_API_KEY,
});
const PORT = process.env.PORT;
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.FIREBASE_DATABASE_UR,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

console.log(PORT);

const firebaseApp = initializeApp(firebaseConfig);
const storage = getStorage(firebaseApp);

app.use(cors());
app.use(json({ limit: "50mb" }));

app.get("/", async (req, res) => {
  res.send("Hello World!");
});

// Delay function for async/await
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Default values for pdfUrl and mp3Url
let pdfUrl = "";
let mp3Url = "";

app.post("/finalize", async (req, res) => {
  try {
    const { fileDetails, settings } = req.body;
    console.log("Received file details:", fileDetails);
    console.log("Received settings:", settings);

    // Extract information from fileDetails
    const { mimeType, name, size, uri } = fileDetails;

    console.log(
      `Mime Type: ${mimeType}, Name: ${name}, Size: ${size}, URI: ${uri}`
    );

    console.log("Waiting to get storage...");
    const storage = getStorage();
    console.log(`Storage received! : ${storage}`);
    console.log("Waiting to get reference...");
    const pathReference = ref(storage, `unprocessed_files/${name}`);
    console.log("Reference received!");

    // Get the download URL
    await delay(1000);
    const url = await getDownloadURL(pathReference);
    console.log(`Download URL: ${url}`);

    // Download the PDF file from the URL
    const response = await axios.get(url, { responseType: "arraybuffer" });
    console.log(`Downloaded PDF file of size: ${response.data.byteLength}`);

    const pdfBuffer = Buffer.from(response.data, "binary");
    console.log(`PDF Buffer length: ${pdfBuffer.length}`);

    // Parse the PDF using pdf-parse
    const data = await pdfParse(pdfBuffer);
    console.log(`Parsed PDF data: ${data}`);

    // Extracted text from the PDF
    const extractedText = data.text;
    console.log(`Extracted text: ${extractedText}`);

    const openaiRes = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `Summarize content you are provided with in ${settings.language} language.`,
        },
        {
          role: "user",
          content: extractedText,
        },
      ],
      temperature: settings.typeOfSummary,
      max_tokens: settings.size,
      top_p: 1,
    });

    const summary = openaiRes.choices[0].message.content;

    console.log(`Summary: ${summary}`);

    try {
      // Create a new PDF document
      const doc = new PDFDocument();

      const pdfPath = `${name}_summary.pdf`;

      const writeStream = fs.createWriteStream(pdfPath);

      // Pipe the PDF into a writable stream (in this case, a file)
      doc.pipe(writeStream);

      // Add text to the PDF
      doc.fontSize(25).text(summary, 100, 100);

      // Finalize the PDF and end the stream
      doc.end();

      // Wait for the write stream to finish
      await new Promise((resolve, reject) => {
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      });

      // Read the PDF file as a blob
      const pdfBlob = fs.readFileSync(pdfPath);

      if (!pdfBlob) return;

      const pdfFileName = name.replace(".pdf", "");

      const storageRef = ref(
        storage,
        `processed_files/${pdfFileName}_summary_${uniqueId}.pdf`
      );
      const uploadTaskForPdf = uploadBytesResumable(storageRef, pdfBlob);
      uploadTaskForPdf.on(
        "state_changed",
        null,
        (error) => console.log(error),
        () => {
          getDownloadURL(uploadTaskForPdf.snapshot.ref).then((downloadURL) => {
            return downloadURL;
          });
        }
      );

      const mp3 = await openai.audio.speech.create({
        model: "tts-1",
        voice: settings.voice,
        input: summary,
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());

      // Create Blob from buffer
      const mp3Blob = new Blob([buffer], { type: "audio/mp3" });

      if (!mp3Blob) return;

      // preprocess the file extension
      const mp3FileName = name.replace(".pdf", "");

      const speechFileRef = ref(
        storage,
        `audios/${mp3FileName}_${uniqueId}.mp3`
      );
      const uploadTaskForMp3 = uploadBytesResumable(speechFileRef, mp3Blob);
      uploadTaskForMp3.on(
        "state_changed",
        null,
        (error) => console.log(error),
        () => {
          getDownloadURL(uploadTaskForMp3.snapshot.ref).then((downloadURL) => {
            return downloadURL;
          });
        }
      );
      const pathReferenceForPdf = ref(
        storage,
        `processed_files/${pdfFileName}_summary_${uniqueId}.pdf`
      );
      // Get the download URL
      pdfUrl = await getDownloadURL(pathReferenceForPdf);
      const pathReferenceForMp3 = ref(
        storage,
        `audios/${mp3FileName}_${uniqueId}.mp3`
      );
      console.log("Reference received!");

      await delay(2000); // Adding delay to ensure file availability

      // Get the download URL
      mp3Url = await getDownloadURL(pathReferenceForMp3);
      console.log(`2 Download URL for mp3: ${mp3Url}`);

      res.send({ processedFileURI: pdfUrl, mp3FileUri: mp3Url });
    } catch (e) {
      console.error(e);
    }
  } catch (error) {
    res.status(500).send(error.toString());
  }
});

app.get("/finalize", async (req, res) => {
  res.send({ processedFileURI: pdfUrl, mp3FileUri: mp3Url });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
