import { config } from 'dotenv';
config();
import express from 'express';
import axios from 'axios';
import firebase from 'firebase/compat/app';
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  getDoc,
  doc,
  updateDoc,
  addDoc,
} from 'firebase/firestore';

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

const app = express();
const port = process.env.PORT || 3001;

// Middleware to parse request body
app.use(express.json());

// Serve static files from the "public" directory
app.use(express.static('public'));

// Route to serve the landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'landing.html'));
});

// Route to serve the phishing page
app.get('/phishing-link', (req, res) => {
  res.sendFile(path.join(__dirname, 'phishing.html'));
});

// Route to send email templates
app.post('/send-email', (req, res) => {
  const { template, params } = req.body;

  const data = JSON.stringify({
    service_id: process.env.EMAILJS_SERVICEID,
    template_id: template,
    user_id: process.env.EMAILJS_PUBLICKEY,
    template_params: params,
    accessToken: process.env.EMAILJS_PRIVATEKEY,
  });

  const config = {
    method: 'post',
    url: 'https://api.emailjs.com/api/v1.0/email/send',
    headers: {
      'Access-Control-Allow': '*',
      'Content-Type': 'application/json',
    },
    data: data,
  };

  axios(config)
    .then(function (response) {
      console.log('Success!!!', JSON.stringify(response.data));
    })
    .catch(function (error) {
      console.log(error);
    });
});

app.get('/record-behavior', async (req, res) => {
  const { templateId, userId, groupId } = req.query;

  try {
    // Get the group document
    const groupRef = db.collection('groups').doc(groupId);
    const groupDoc = await groupRef.get();

    if (!groupDoc.exists) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const groupData = groupDoc.data();

    // Create a new result
    const newResult = {
      user: userId,
      templateId: templateId,
      comment: 'User clicked the phishing link',
    };

    // Add the new result to the group's results array
    const updatedGroup = {
      ...groupData,
      results: [...(groupData.results || []), newResult],
    };

    // Update the group document
    await groupRef.update(updatedGroup);

    // Redirect the user to the phishing page
    res.redirect('/phishing-link');
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const testFirebaseConnection = async () => {
  try {
    // Get a reference to the Firestore database
    const testDocRef = collection(getFirestore(), 'groups');

    const querySnapshot = await getDocs(testDocRef);
    querySnapshot.forEach(doc => {
      console.log(doc.id, ' => ', doc.data());
    });

    console.log('Firebase connection successful!');
  } catch (error) {
    console.error('Error connecting to Firebase:', error);
  }
};

await testFirebaseConnection();

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
