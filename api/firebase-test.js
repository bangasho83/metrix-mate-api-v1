/**
 * @fileoverview Firebase Test API endpoint - Test Firebase connection and basic operations
 */

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log('Firebase Test API - Starting tests');

  const testResults = {
    timestamp: new Date().toISOString(),
    tests: {}
  };

  try {
    // Test 1: Import Firebase modules
    console.log('Test 1: Importing Firebase modules...');
    try {
      const { initializeApp } = await import('firebase/app');
      const { getFirestore, collection, getDocs } = await import('firebase/firestore');
      testResults.tests.firebaseImport = {
        status: 'success',
        message: 'Firebase modules imported successfully'
      };
    } catch (error) {
      testResults.tests.firebaseImport = {
        status: 'error',
        message: error.message
      };
      throw error;
    }

    // Test 2: Initialize Firebase app
    console.log('Test 2: Initializing Firebase app...');
    try {
      const { initializeApp } = await import('firebase/app');
      
      const firebaseConfig = {
        apiKey: "AIzaSyA5RszTHcZfwZJwYosjZ2ox4wy16zdP1Fo",
        authDomain: "metrixmate-4535e.firebaseapp.com",
        projectId: "metrixmate-4535e",
        storageBucket: "metrixmate-4535e.firebasestorage.app",
        messagingSenderId: "1088870133164",
        appId: "1:1088870133164:web:380af7b331c76ac99dde09"
      };

      const app = initializeApp(firebaseConfig);
      testResults.tests.firebaseInit = {
        status: 'success',
        message: 'Firebase app initialized successfully'
      };
    } catch (error) {
      testResults.tests.firebaseInit = {
        status: 'error',
        message: error.message
      };
      throw error;
    }

    // Test 3: Initialize Firestore
    console.log('Test 3: Initializing Firestore...');
    try {
      const { initializeApp } = await import('firebase/app');
      const { getFirestore } = await import('firebase/firestore');
      
      const firebaseConfig = {
        apiKey: "AIzaSyA5RszTHcZfwZJwYosjZ2ox4wy16zdP1Fo",
        authDomain: "metrixmate-4535e.firebaseapp.com",
        projectId: "metrixmate-4535e",
        storageBucket: "metrixmate-4535e.firebasestorage.app",
        messagingSenderId: "1088870133164",
        appId: "1:1088870133164:web:380af7b331c76ac99dde09"
      };

      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app);
      
      testResults.tests.firestoreInit = {
        status: 'success',
        message: 'Firestore initialized successfully'
      };
    } catch (error) {
      testResults.tests.firestoreInit = {
        status: 'error',
        message: error.message
      };
      throw error;
    }

    // Test 4: Test basic Firestore query (list collections)
    console.log('Test 4: Testing basic Firestore operations...');
    try {
      const { initializeApp } = await import('firebase/app');
      const { getFirestore, collection, getDocs, limit, query } = await import('firebase/firestore');
      
      const firebaseConfig = {
        apiKey: "AIzaSyA5RszTHcZfwZJwYosjZ2ox4wy16zdP1Fo",
        authDomain: "metrixmate-4535e.firebaseapp.com",
        projectId: "metrixmate-4535e",
        storageBucket: "metrixmate-4535e.firebasestorage.app",
        messagingSenderId: "1088870133164",
        appId: "1:1088870133164:web:380af7b331c76ac99dde09"
      };

      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app);
      
      // Try to query brands collection (limit to 1 to test connection)
      const brandsRef = collection(db, 'brands');
      const q = query(brandsRef, limit(1));
      const querySnapshot = await getDocs(q);
      
      testResults.tests.firestoreQuery = {
        status: 'success',
        message: `Firestore query successful. Found ${querySnapshot.size} documents in brands collection`
      };
    } catch (error) {
      testResults.tests.firestoreQuery = {
        status: 'error',
        message: error.message
      };
    }

    testResults.overall = 'success';
    console.log('Firebase Test API - All tests completed successfully');

  } catch (error) {
    testResults.overall = 'error';
    testResults.error = error.message;
    console.error('Firebase Test API - Error during tests:', error);
  }

  return res.status(200).json(testResults);
}
