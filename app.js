import { config } from 'dotenv';
config();
import express from 'express';
import axios from 'axios';
import firebase from 'firebase/compat/app';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  getDoc,
  query,
  where,
} from 'firebase/firestore';
import path from 'path';
import { fileURLToPath } from 'url'; // Import fileURLToPath to use import.meta.url
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_APIKEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTHDOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECTID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGEBUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGINGSENDERID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APPID,
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const db = getFirestore(); // Initialize Firestore

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());

// Middleware to parse request body
app.use(express.json());

// Serve static files from the "public" directory
app.use(express.static('public'));

async function getUserById(userId) {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      const userData = userDoc.data();
      return userData;
    } else {
      throw new Error('User not found');
    }
  } catch (error) {
    console.error('Error getting user:', error);
    throw error;
  }
}

// Route to serve the landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Route to serve the phishing page
app.get('/phishing-link', (req, res) => {
  res.sendFile(path.join(__dirname, 'phishing.html'));
});

// Route to serve the error page
app.get('/error-404', (req, res) => {
  res.sendFile(path.join(__dirname, 'error.html'));
});

// Route to send email templates
app.post('/send-email', async (req, res) => {
  const { params } = req.body;

  const data = JSON.stringify({
    service_id: process.env.EMAILJS_SERVICEID,
    template_id: params.template,
    user_id: process.env.EMAILJS_PUBLICKEY,
    template_params: {
      fullname: params.fullname,
      email: params.email,
      url: params.url,
      to_email: params.to_email,
      from_service: params.from_service,
    },
    accessToken: process.env.EMAILJS_PRIVATEKEY,
  });

  const config = {
    method: 'post',
    url: `https://api.emailjs.com/api/v1.0/email/send`,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    },
    data: data,
  };

  try {
    const response = await axios(config);
    console.log('Success!!!', JSON.stringify(response.data));
    res.status(200).json({ message: 'Email sent successfully!' });
  } catch (error) {
    console.error(
      'Error details:',
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: 'Failed to send email' });
  }
});

app.get('/record-behavior', async (req, res) => {
  const { templateId, userId, groupId, uniqueId } = req.query;

  try {
    // Get a reference to the group document
    const groupRef = doc(db, 'groups', groupId);
    const groupDoc = await getDoc(groupRef);

    if (!groupDoc.exists()) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const groupData = groupDoc.data();

    try {
      let username = '';

      try {
        // Get the user's display name using getUserById
        const user = await getUserById(userId);
        username = user.displayName || '';
      } catch (error) {
        console.error('Error getting user:', error);
        // Handle the error if unable to fetch the user's display name
      }

      // Filter out any existing results for this user and template
      const filteredResults = groupData.results.filter(
        result => !(result.user === userId && result.templateId === templateId)
      );

      // Create a new result object
      const newResult = {
        id: uniqueId,
        user: userId,
        username: username,
        templateId: templateId,
        comment: 'User clicked the phishing link',
        updatedAt: new Date().toISOString(),
      };

      // Add the new result to the filtered results
      const updatedResults = [...filteredResults, newResult];

      // Update the group document with the new results
      await updateDoc(groupRef, { results: updatedResults });

      // Redirect the user to the phishing page
      res.redirect('/phishing-link');
    } catch (error) {
      console.error('Error updating result:', error);
      res.status(500).json({ error: 'Internal Server Error' });
      res.redirect('/error.html');
    }
  } catch (error) {
    console.error('Error getting group document:', error);
    res.status(500).json({ error: 'Internal Server Error' });
    res.redirect('/error.html');
  }
});

app.get('/debug-firebase', async (req, res) => {
  try {
    // Get a reference to the Firestore database
    const testDocRef = collection(db, 'groups');

    const querySnapshot = await getDocs(testDocRef);
    querySnapshot.forEach(doc => {
      console.log(doc.id, ' => ', doc.data());
    });

    console.log('Firebase connection successful!');
  } catch (error) {
    console.error('Error connecting to Firebase:', error);
  }
});

app.post('/scan-url', async (req, res) => {
  const { url } = req.body;
  console.log('testtttt', url);

  try {
    // Step 1: Submit URL for scan request
    const scanResponse = await axios.post(
      'https://developers.checkphish.ai/api/neo/scan',
      {
        apiKey: process.env.CHECKPHISH_KEY,
        urlInfo: { url },
        scanType: 'full',
      }
    );

    const { jobID } = scanResponse.data;

    // Step 2: Poll the API until the scan status is "DONE"
    let scanResult = null;
    while (true) {
      const statusResponse = await axios.post(
        'https://developers.checkphish.ai/api/neo/scan/status',
        {
          apiKey: process.env.CHECKPHISH_KEY,
          jobID,
          insights: true,
        }
      );

      scanResult = statusResponse.data;

      if (scanResult.status === 'DONE') {
        break;
      }

      // Wait for a short interval before polling again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Process the scan result as needed
    console.log('Scan Result:', scanResult);

    res.json(scanResult);
  } catch (error) {
    console.error('Error scanning URL:', error);
    res.status(500).json({ error: 'Failed to scan URL' });
  }
});

app.post('/api/scan-email', async (req, res) => {
  const { email } = req.body;

  try {
    const scanner = new SpamScanner();
    const scan = await scanner.scan(email);
    res.json(scan);
  } catch (error) {
    console.error('Failed to scan email:', error);
    res.status(500).json({ error: 'Failed to scan email' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
