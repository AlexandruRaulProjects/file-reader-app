const express = require("express");
const { json } = require("body-parser");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const axios = require("axios");

require("dotenv").config();

const { getStorage, ref, getDownloadURL } = require("firebase/storage");
const { initializeApp } = require("firebase/app");

const app = express();
const PORT = process.env.PORT;

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: "audiobook-react-native.firebaseapp.com",
  databaseURL:
    "https://audiobook-react-native-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "audiobook-react-native",
  storageBucket: "audiobook-react-native.appspot.com",
  messagingSenderId: "768939966835",
  appId: "1:768939966835:web:ac0457ccf78d1664c9c506",
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

const getSummaryFromText = async (text) => {};

app.post("/finalize", async (req, res) => {
  try {
    const { fileDetails } = req.body;
    console.log("Received file details:", fileDetails);

    // Extract information from fileDetails
    const { mimeType, name, size, uri } = fileDetails;
    console.log(
      `Mime Type: ${mimeType}, Name: ${name}, Size: ${size}, URI: ${uri}`
    );

    // Get the download URL
    const url = getUrl(storage, name);
    console.log(`Download URL: ${url}`);

    // Download the PDF file from the URL
    const response = await axios.get(url, { responseType: "arraybuffer" });
    console.log(`Downloaded PDF file of size: ${response.data.byteLength}`);

    // Extracted text from the PDF
    const extractedText = getPDFfileData(response.data);
    console.log(`Extracted text: ${extractedText}`);

    res.send(`Extracted text from the PDF: ${extractedText}`);
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