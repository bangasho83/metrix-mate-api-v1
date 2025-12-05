// Vercel function config (CJS)
module.exports.config = { maxDuration: 60 };

const { withLogging } = require('../utils/logging.cjs.js');
const { db } = require('../services/firebase-service');

module.exports = withLogging(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const q = req.query || {};
    const uid = q.uid || q.userId || q.user_id;
    const organization = q.organizationId || q.organization_id || q.org;
    const brandId = q.brandId || q.brand_id;
    const statusFilter = q.status; // Filter by user status (e.g., 'active', 'inactive')

    // Helper function to format Firestore timestamp to readable format
    const formatTimestamp = (timestamp) => {
      if (!timestamp) return null;

      try {
        // Handle Firestore Timestamp object
        let date;
        if (timestamp._seconds !== undefined) {
          date = new Date(timestamp._seconds * 1000);
        } else if (timestamp.toDate) {
          date = timestamp.toDate();
        } else if (timestamp instanceof Date) {
          date = timestamp;
        } else {
          return timestamp;
        }

        // Format: "June 11, 2025 at 4:00:51 AM UTC"
        return date.toLocaleString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
          timeZone: 'UTC',
          timeZoneName: 'short'
        });
      } catch (error) {
        console.warn('Error formatting timestamp:', error);
        return timestamp;
      }
    };

    // If UID is provided, get single user
    if (uid) {
      const userDoc = await db.collection('users').doc(uid).get();

      if (!userDoc.exists) {
        return res.status(404).json({
          error: 'User not found',
          uid,
          message: 'The specified user does not exist'
        });
      }

      const d = userDoc.data() || {};
      const user = {
        uid: d.uid || userDoc.id,
        email: d.email || null,
        name: d.name || null,
        avatarUrl: d.avatarUrl || null,
        organizationId: d.organizationId || null,
        role: d.role || null,
        status: d.status || null,
        lastLoginAt: formatTimestamp(d.lastLoginAt),
        createdAt: formatTimestamp(d.createdAt),
        updatedAt: formatTimestamp(d.updatedAt)
      };

      // Get organization data if user has organizationId
      let organizationData = null;
      if (d.organizationId) {
        try {
          const orgDoc = await db.collection('orgs').doc(d.organizationId).get();
          if (orgDoc.exists) {
            const orgData = orgDoc.data() || {};
            organizationData = {
              id: orgDoc.id,
              organizationName: orgData.organizationName || null,
              billingCustomerId: orgData.billingCustomerId || null
            };
          }
        } catch (orgError) {
          console.warn('Failed to fetch organization data:', orgError.message);
          // Continue without organization data
        }
      }

      const response = {
        success: true,
        user
      };

      if (organizationData) {
        response.organization = organizationData;
      }

      return res.status(200).json(response);
    }

    // Parse limit parameter
    const limitParam = parseInt(q.limit, 10);
    const lim = Math.min(Math.max(isNaN(limitParam) ? 100 : limitParam, 1), 500);

    let queryRef;
    let snapshot;
    let users = [];

    // NEW: Filter by brandId using brandAccess collection
    if (brandId) {
      console.log('Users API - Filtering by brandId:', brandId);

      // Step 1: Get all brandAccess records for this brand
      const brandAccessSnap = await db.collection('brandAccess')
        .where('brandId', '==', brandId)
        .where('status', '==', 'Active')
        .get();

      const userIds = [];
      brandAccessSnap.forEach(doc => {
        const data = doc.data();
        if (data.userId) {
          userIds.push(data.userId);
        }
      });

      console.log('Users API - Found brand access records:', {
        brandId,
        userCount: userIds.length,
        userIds
      });

      // If no users have access to this brand, return empty result
      if (userIds.length === 0) {
        return res.status(200).json({
          count: 0,
          users: [],
          brandId,
          message: 'No active users found for this brand'
        });
      }

      // Step 2: Fetch user details for each userId
      // Note: Firestore doesn't support 'in' queries with more than 10 items,
      // so we need to batch the queries or fetch individually
      const userPromises = userIds.slice(0, lim).map(async (userId) => {
        try {
          const userDoc = await db.collection('users').doc(userId).get();
          if (userDoc.exists) {
            const d = userDoc.data() || {};
            return {
              uid: d.uid || userDoc.id,
              email: d.email || null,
              name: d.name || null,
              avatarUrl: d.avatarUrl || null,
              organizationId: d.organizationId || null,
              role: d.role || null,
              status: d.status || null,
              lastLoginAt: formatTimestamp(d.lastLoginAt),
              createdAt: formatTimestamp(d.createdAt),
              updatedAt: formatTimestamp(d.updatedAt)
            };
          }
          return null;
        } catch (error) {
          console.warn('Failed to fetch user:', userId, error.message);
          return null;
        }
      });

      const fetchedUsers = await Promise.all(userPromises);
      users = fetchedUsers.filter(u => u !== null);

      // Apply status filter if provided
      if (statusFilter) {
        const beforeFilterCount = users.length;
        users = users.filter(u => u.status === statusFilter);
        console.log('Users API - Applied status filter:', {
          statusFilter,
          beforeCount: beforeFilterCount,
          afterCount: users.length
        });
      }

      console.log('Users API - Fetched user details:', {
        brandId,
        requestedCount: userIds.length,
        fetchedCount: users.length,
        statusFilter: statusFilter || 'none'
      });

      return res.status(200).json({
        count: users.length,
        users,
        brandId,
        totalBrandAccessRecords: userIds.length,
        ...(statusFilter && { statusFilter })
      });
    }

    // EXISTING: Filter by organizationId
    if (organization) {
      // Filter by organizationId with lastLoginAt ordering
      try {
        queryRef = db.collection('users')
          .where('organizationId', '==', organization)
          .orderBy('lastLoginAt', 'desc');

        if (lim) queryRef = queryRef.limit(lim);
        snapshot = await queryRef.get();
      } catch (indexError) {
        if (indexError.message.includes('index') || indexError.code === 9) {
          console.warn('Users API - Missing index for organizationId + lastLoginAt. Using fallback without ordering.');
          queryRef = db.collection('users').where('organizationId', '==', organization);
          if (lim) queryRef = queryRef.limit(lim);
          snapshot = await queryRef.get();
        } else {
          throw indexError;
        }
      }
    } else {
      // Get all users sorted by lastLoginAt
      try {
        queryRef = db.collection('users').orderBy('lastLoginAt', 'desc');
        if (lim) queryRef = queryRef.limit(lim);
        snapshot = await queryRef.get();
      } catch (indexError) {
        if (indexError.message.includes('index') || indexError.code === 9) {
          console.warn('Users API - Missing index for lastLoginAt. Using fallback without ordering.');
          queryRef = db.collection('users');
          if (lim) queryRef = queryRef.limit(lim);
          snapshot = await queryRef.get();
        } else {
          throw indexError;
        }
      }
    }

    snapshot.forEach(doc => {
      const d = doc.data() || {};

      // Apply status filter if provided
      if (statusFilter && d.status !== statusFilter) {
        return; // Skip this user
      }

      users.push({
        uid: d.uid || doc.id,
        email: d.email || null,
        name: d.name || null,
        avatarUrl: d.avatarUrl || null,
        organizationId: d.organizationId || null,
        role: d.role || null,
        status: d.status || null,
        lastLoginAt: formatTimestamp(d.lastLoginAt),
        createdAt: formatTimestamp(d.createdAt),
        updatedAt: formatTimestamp(d.updatedAt)
      });
    });

    const response = {
      count: users.length,
      users
    };

    if (organization) {
      response.organizationId = organization;
    }

    if (statusFilter) {
      response.statusFilter = statusFilter;
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error('users GET error:', {
      message: err?.message || err,
      code: err?.code,
      stack: err?.stack,
      query: req.query
    });
    return res.status(500).json({
      error: 'Failed to fetch users',
      details: err?.message || 'Unknown error'
    });
  }
});

