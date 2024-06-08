const express = require("express");
const { json } = require("body-parser");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const axios = require("axios");
const OpenAI = require("openai");

require("dotenv").config();

const { getStorage, ref, getDownloadURL } = require("firebase/storage");
const { initializeApp } = require("firebase/app");

const app = express();

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

const getUrl = async (storage, fileName) => {
  const pathReference = ref(storage, `unprocessed_files/${fileName}`);
  return await getDownloadURL(pathReference);
};

const getPDFfileData = async (dataResponse) => {
  const pdfBuffer = Buffer.from(dataResponse, "binary");
  console.log(`PDF Buffer length: ${pdfBuffer.length}`);

  // Parse the PDF using pdf-parse
  const data = await pdfParse(pdfBuffer);
  console.log(`Parsed PDF data: ${data}`);

  return data.text;
};

app.post("/finalize", async (req, res) => {
  try {
    const { fileDetails } = req.body;
    console.log("Received file details:", fileDetails);

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
          content: "Summarize content you are provided with.",
        },
        {
          role: "user",
          content: extractedText,
        },
      ],
      temperature: 0.7,
      max_tokens: 128,
      top_p: 1,
    });

    const summary = openaiRes.choices[0].message.content;

    console.log(`Summary: ${summary}`);
  } catch (error) {
    res.status(500).send(error.toString());
  }
});

app.get("/finalize", async (req, res) => {
  res.send(req.body);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
