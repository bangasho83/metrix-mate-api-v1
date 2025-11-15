// Vercel function config (CJS)
module.exports.config = { maxDuration: 60 };

const { withLogging } = require('../utils/logging.cjs.js');
const { db } = require('../services/firebase-service');
const metronomeService = require('../services/metronome-service');
const stripeService = require('../services/stripe-service');

module.exports = withLogging(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // DELETE: Soft delete organization (secure)
  if (req.method === 'DELETE') {
    try {
      const body = req.body || {};
      const { organizationId, userId } = body;

      // Security Check 1: Validate required parameters
      if (!organizationId || typeof organizationId !== 'string') {
        console.warn('DELETE attempt with missing/invalid organizationId:', { body });
        return res.status(400).json({
          error: 'Missing or invalid required field: organizationId',
          message: 'organizationId must be a valid string'
        });
      }

      if (!userId || typeof userId !== 'string') {
        console.warn('DELETE attempt with missing/invalid userId:', { organizationId, body });
        return res.status(400).json({
          error: 'Missing or invalid required field: userId',
          message: 'userId must be a valid string for authorization'
        });
      }

      console.log('DELETE organization request:', {
        organizationId,
        userId,
        timestamp: new Date().toISOString()
      });

      // Security Check 2: Verify organization exists
      const orgRef = db.collection('orgs').doc(organizationId);
      const orgDoc = await orgRef.get();

      if (!orgDoc.exists) {
        console.warn('DELETE attempt on non-existent organization:', { organizationId, userId });
        return res.status(404).json({
          error: 'Organization not found',
          organizationId,
          message: 'The specified organization does not exist'
        });
      }

      const orgData = orgDoc.data();

      // Security Check 3: Verify organization is not already deleted
      if (orgData.deleted === true || orgData.deletedAt) {
        console.warn('DELETE attempt on already deleted organization:', {
          organizationId,
          userId,
          deletedAt: orgData.deletedAt,
          deletedBy: orgData.deletedBy
        });
        return res.status(410).json({
          error: 'Organization already deleted',
          organizationId,
          deletedAt: orgData.deletedAt,
          message: 'This organization has already been deleted'
        });
      }

      // Security Check 4: Verify user is the creator (CRITICAL)
      const createdBy = orgData.createdBy;

      if (!createdBy) {
        console.error('SECURITY ALERT: Organization has no createdBy field:', {
          organizationId,
          userId,
          orgData
        });
        return res.status(403).json({
          error: 'Authorization failed',
          message: 'This organization has no creator information. Contact support.'
        });
      }

      if (createdBy !== userId) {
        console.error('SECURITY ALERT: Unauthorized delete attempt:', {
          organizationId,
          attemptedBy: userId,
          actualCreator: createdBy,
          timestamp: new Date().toISOString(),
          ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress
        });
        return res.status(403).json({
          error: 'Unauthorized',
          message: 'Only the organization creator can delete this organization',
          organizationId
        });
      }

      // Security Check 5: Additional validation - check if user exists
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
          console.error('SECURITY ALERT: Delete attempt with non-existent user:', {
            organizationId,
            userId,
            timestamp: new Date().toISOString()
          });
          return res.status(403).json({
            error: 'Unauthorized',
            message: 'Invalid user credentials'
          });
        }
      } catch (userCheckError) {
        console.error('Error verifying user:', userCheckError);
        // Continue with deletion if user check fails (user collection might not exist)
      }

      // All security checks passed - perform soft delete
      const now = new Date();
      const timestamp = db.FieldValue ? db.FieldValue.serverTimestamp() : now;

      const deleteData = {
        deleted: true,
        deletedAt: timestamp,
        deletedBy: userId,
        updatedAt: timestamp,
        // Preserve original data for audit trail
        deletedMetadata: {
          organizationName: orgData.organizationName,
          organizationUsername: orgData.organizationUsername,
          createdBy: orgData.createdBy,
          createdAt: orgData.createdAt,
          billingCustomerId: orgData.billingCustomerId || null,
          deletedTimestamp: now.toISOString()
        }
      };

      await orgRef.update(deleteData);

      console.log('Organization soft deleted successfully:', {
        organizationId,
        deletedBy: userId,
        organizationName: orgData.organizationName,
        timestamp: now.toISOString()
      });

      // Return success response
      return res.status(200).json({
        success: true,
        message: 'Organization deleted successfully',
        organization: {
          id: organizationId,
          organizationName: orgData.organizationName,
          deletedAt: now.toISOString(),
          deletedBy: userId
        }
      });

    } catch (err) {
      console.error('DELETE organization error:', {
        message: err?.message || err,
        code: err?.code,
        stack: err?.stack,
        body: req.body
      });
      return res.status(500).json({
        error: 'Failed to delete organization',
        details: err?.message || 'Unknown error'
      });
    }
  }

  // PATCH: Add billing to existing organization
  if (req.method === 'PATCH') {
    try {
      const body = req.body || {};
      const { organizationId } = body;

      // Validate required field
      if (!organizationId || typeof organizationId !== 'string') {
        return res.status(400).json({
          error: 'Missing or invalid required field: organizationId',
          message: 'organizationId is required to add billing to existing organization'
        });
      }

      console.log('PATCH: Adding billing to existing organization:', organizationId);

      // Check if organization exists
      const orgRef = db.collection('orgs').doc(organizationId);
      const orgDoc = await orgRef.get();

      if (!orgDoc.exists) {
        return res.status(404).json({
          error: 'Organization not found',
          organizationId,
          message: 'The specified organization does not exist'
        });
      }

      const orgData = orgDoc.data();

      // Check if organization is deleted
      if (orgData.deleted === true) {
        return res.status(410).json({
          error: 'Organization has been deleted',
          organizationId,
          deletedAt: orgData.deletedAt
        });
      }

      // Check if it already has billing
      if (orgData.billingCustomerId) {
        console.log('Organization already has billing:', {
          organizationId,
          billingCustomerId: orgData.billingCustomerId
        });

        // Verify the customer still exists in Metronome
        let customerExists = false;
        let hasFreeTrialContract = false;

        try {
          const customerCheck = await metronomeService.getCustomer(orgData.billingCustomerId);

          if (customerCheck.success) {
            customerExists = true;

            // Check if customer has free trial by getting balance
            try {
              const balanceResult = await metronomeService.getCustomerBalance(orgData.billingCustomerId);
              if (balanceResult.success && balanceResult.credits && balanceResult.credits.length > 0) {
                hasFreeTrialContract = true;
              }
            } catch (balanceError) {
              console.warn('Could not check free trial status:', balanceError.message);
            }

            return res.status(200).json({
              success: true,
              message: 'Organization already has billing configured',
              organization: {
                id: organizationId,
                organizationName: orgData.organizationName,
                organizationUsername: orgData.organizationUsername,
                createdBy: orgData.createdBy || null,
                createdAt: orgData.createdAt?.toDate?.()?.toISOString() || null,
                updatedAt: orgData.updatedAt?.toDate?.()?.toISOString() || null,
                billingCustomerId: orgData.billingCustomerId
              },
              billing: {
                provider: 'metronome',
                customerId: orgData.billingCustomerId,
                hasFreeTrialContract
              }
            });
          }
        } catch (customerError) {
          console.warn('Customer not found in Metronome, will recreate:', {
            billingCustomerId: orgData.billingCustomerId,
            error: customerError.message
          });

          // Customer doesn't exist in Metronome, clear the billingCustomerId and continue
          await orgRef.update({
            billingCustomerId: null,
            updatedAt: db.FieldValue ? db.FieldValue.serverTimestamp() : new Date()
          });

          console.log('Cleared invalid billingCustomerId, will create new customer');
          // Continue to create new customer below
        }
      }

      // Get user email for Stripe customer creation
      let userEmail = null;
      const createdBy = orgData.createdBy;

      if (createdBy) {
        try {
          const userDoc = await db.collection('users').doc(createdBy).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            userEmail = userData.email || null;
            console.log('Retrieved user email for Stripe (PATCH):', {
              userId: createdBy,
              email: userEmail
            });
          }
        } catch (userError) {
          console.warn('Failed to fetch user email:', userError.message);
          // Continue without email
        }
      }

      // Create Metronome customer
      let metronomeResult = null;

      try {
        console.log('Creating Metronome customer for organization:', {
          organizationId,
          organizationName: orgData.organizationName,
          organizationUsername: orgData.organizationUsername
        });

        metronomeResult = await metronomeService.createCustomer({
          external_id: organizationId,
          name: orgData.organizationName || orgData.organizationUsername || 'Unknown Organization',
          custom_fields: {}
        });

        if (metronomeResult.success) {
          const isExistingCustomer = metronomeResult.isExisting || false;

          console.log('Metronome customer result for existing org:', {
            organizationId,
            metronome_id: metronomeResult.metronome_id,
            isExistingCustomer,
            message: metronomeResult.message
          });

          // Update organization with billingCustomerId
          const timestamp = db.FieldValue ? db.FieldValue.serverTimestamp() : new Date();

          await orgRef.update({
            billingCustomerId: metronomeResult.metronome_id,
            updatedAt: timestamp
          });

          console.log('Updated organization with billing:', {
            organizationId,
            billingCustomerId: metronomeResult.metronome_id
          });

          // Create free trial contract (500 credits) - only if new customer
          let freeTrialResult = null;

          if (!isExistingCustomer) {
            try {
              freeTrialResult = await metronomeService.createFreeTrialContract(
                metronomeResult.metronome_id
              );

              if (freeTrialResult.success) {
                console.log('Free trial contract created for existing org:', {
                  customer_id: metronomeResult.metronome_id,
                  contract_id: freeTrialResult.contract_id,
                  credits: freeTrialResult.credits
                });
              } else {
                console.error('Failed to create free trial contract:', freeTrialResult.error);
                // Continue even if free trial fails
              }
            } catch (trialError) {
              console.error('Free trial creation error:', trialError.message);
              // Continue even if free trial fails
            }
          } else {
            console.log('Skipping free trial - Metronome customer already existed');
          }

          // Create customer in Stripe
          let stripeResult = null;

          if (userEmail) {
            try {
              stripeResult = await stripeService.createCustomer({
                name: orgData.organizationName || orgData.organizationUsername || 'Unknown Organization',
                email: userEmail,
                description: `Organization: ${orgData.organizationName || orgData.organizationUsername}`,
                metadata: {
                  organization_id: organizationId,
                  organization_username: orgData.organizationUsername || '',
                  created_by: createdBy,
                  metronome_customer_id: metronomeResult.metronome_id
                }
              });

              if (stripeResult.success) {
                console.log('Stripe customer created (PATCH):', {
                  stripe_id: stripeResult.stripe_id,
                  email: stripeResult.email,
                  organization_id: organizationId
                });

                // Store Stripe customer ID in organization document
                await orgRef.update({
                  stripeCustomerId: stripeResult.stripe_id
                });

                // Link Stripe to Metronome
                if (metronomeResult?.metronome_id) {
                  try {
                    const linkResult = await metronomeService.addStripeBillingProvider(
                      metronomeResult.metronome_id,
                      stripeResult.stripe_id
                    );

                    if (linkResult.success) {
                      console.log('Stripe billing provider linked to Metronome customer');
                    } else {
                      console.error('Failed to link Stripe to Metronome:', {
                        error: linkResult.error,
                        details: linkResult.details,
                        status: linkResult.status,
                        customer_id: metronomeResult.metronome_id,
                        stripe_customer_id: stripeResult.stripe_id
                      });
                    }
                  } catch (linkError) {
                    console.error('Error linking Stripe to Metronome:', linkError.message);
                  }
                }
              } else {
                console.error('Failed to create Stripe customer:', stripeResult.error);
                // Continue even if Stripe fails
              }
            } catch (stripeError) {
              console.error('Stripe integration error:', stripeError.message);
              // Continue even if Stripe fails
            }
          } else {
            console.warn('Skipping Stripe customer creation - no user email available');
          }

          // Get updated organization data
          const updatedOrgDoc = await orgRef.get();
          const updatedOrgData = updatedOrgDoc.data();

          return res.status(200).json({
            success: true,
            message: 'Billing added to existing organization successfully',
            organization: {
              id: organizationId,
              organizationName: updatedOrgData.organizationName,
              organizationUsername: updatedOrgData.organizationUsername,
              createdBy: updatedOrgData.createdBy || null,
              createdAt: updatedOrgData.createdAt?.toDate?.()?.toISOString() || null,
              updatedAt: updatedOrgData.updatedAt?.toDate?.()?.toISOString() || null,
              billingCustomerId: updatedOrgData.billingCustomerId,
              stripeCustomerId: updatedOrgData.stripeCustomerId || null
            },
            billing: {
              metronome: {
                success: true,
                customerId: metronomeResult.metronome_id,
                freeTrial: freeTrialResult ? {
                  success: freeTrialResult.success,
                  contractId: freeTrialResult.contract_id || null,
                  credits: freeTrialResult.credits || null,
                  error: freeTrialResult.error || null
                } : null
              },
              stripe: stripeResult ? {
                success: stripeResult.success,
                customerId: stripeResult.stripe_id || null,
                email: stripeResult.email || null,
                error: stripeResult.error || null
              } : null
            }
          });

        } else {
          console.error('Failed to create Metronome customer:', {
            error: metronomeResult.error,
            details: metronomeResult.details,
            status: metronomeResult.status,
            organizationId
          });
          return res.status(500).json({
            error: 'Failed to create billing customer',
            details: metronomeResult.error,
            metronomeDetails: metronomeResult.details
          });
        }
      } catch (metronomeError) {
        console.error('Metronome integration error:', {
          message: metronomeError.message,
          stack: metronomeError.stack,
          organizationId
        });
        return res.status(500).json({
          error: 'Failed to create billing customer',
          details: metronomeError.message,
          stack: metronomeError.stack
        });
      }

    } catch (err) {
      console.error('PATCH organization error:', {
        message: err?.message || err,
        code: err?.code,
        stack: err?.stack
      });
      return res.status(500).json({
        error: 'Failed to add billing to organization',
        details: err?.message || 'Unknown error'
      });
    }
  }

  // POST: Create new organization
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const { organizationName, organizationUsername, createdBy } = body;

      // Validate required fields
      if (!organizationName || typeof organizationName !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid required field: organizationName' });
      }
      if (!organizationUsername || typeof organizationUsername !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid required field: organizationUsername' });
      }

      // Create organization in Firebase
      const orgRef = db.collection('orgs').doc();
      const organizationId = orgRef.id;

      const now = new Date();
      const timestamp = db.FieldValue ? db.FieldValue.serverTimestamp() : now;

      const orgData = {
        organizationName,
        organizationUsername,
        createdBy: createdBy || null,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      await orgRef.set(orgData);

      console.log('Organization created in Firebase:', {
        id: organizationId,
        name: organizationName
      });

      // Get user email for Stripe customer creation
      let userEmail = null;
      if (createdBy) {
        try {
          const userDoc = await db.collection('users').doc(createdBy).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            userEmail = userData.email || null;
            console.log('Retrieved user email for Stripe:', {
              userId: createdBy,
              email: userEmail
            });
          }
        } catch (userError) {
          console.warn('Failed to fetch user email:', userError.message);
          // Continue without email
        }
      }

      // Create customer in Metronome
      let metronomeResult = null;
      let freeTrialResult = null;

      try {
        metronomeResult = await metronomeService.createCustomer({
          external_id: organizationId,
          name: organizationName,
          custom_fields: {}
        });

        if (metronomeResult.success) {
          console.log('Metronome customer created:', {
            metronome_id: metronomeResult.metronome_id,
            external_id: metronomeResult.external_id
          });

          // Store billing customer ID in organization document
          await orgRef.update({
            billingCustomerId: metronomeResult.metronome_id
          });

          // Create free trial contract (500 credits)
          try {
            freeTrialResult = await metronomeService.createFreeTrialContract(
              metronomeResult.metronome_id
            );

            if (freeTrialResult.success) {
              console.log('Free trial contract created:', {
                customer_id: metronomeResult.metronome_id,
                contract_id: freeTrialResult.contract_id,
                credits: freeTrialResult.credits
              });
            } else {
              console.error('Failed to create free trial contract:', freeTrialResult.error);
              // Continue even if free trial fails
            }
          } catch (trialError) {
            console.error('Free trial creation error:', trialError.message);
            // Continue even if free trial fails
          }
        } else {
          console.error('Failed to create Metronome customer:', metronomeResult.error);
          // Continue even if Metronome fails - organization is already created
        }
      } catch (metronomeError) {
        console.error('Metronome integration error:', metronomeError.message);
        // Continue even if Metronome fails
      }

      // Create customer in Stripe
      let stripeResult = null;

      if (userEmail) {
        try {
          stripeResult = await stripeService.createCustomer({
            name: organizationName,
            email: userEmail,
            description: `Organization: ${organizationName}`,
            metadata: {
              organization_id: organizationId,
              organization_username: organizationUsername,
              created_by: createdBy,
              metronome_customer_id: metronomeResult?.metronome_id || null
            }
          });

          if (stripeResult.success) {
            console.log('Stripe customer created:', {
              stripe_id: stripeResult.stripe_id,
              email: stripeResult.email,
              organization_id: organizationId
            });

            // Store Stripe customer ID in organization document
            await orgRef.update({
              stripeCustomerId: stripeResult.stripe_id
            });

            // Link Stripe to Metronome
            if (metronomeResult?.metronome_id) {
              try {
                const linkResult = await metronomeService.addStripeBillingProvider(
                  metronomeResult.metronome_id,
                  stripeResult.stripe_id
                );

                if (linkResult.success) {
                  console.log('Stripe billing provider linked to Metronome customer');
                } else {
                  console.error('Failed to link Stripe to Metronome:', {
                    error: linkResult.error,
                    details: linkResult.details,
                    status: linkResult.status,
                    customer_id: metronomeResult.metronome_id,
                    stripe_customer_id: stripeResult.stripe_id
                  });
                }
              } catch (linkError) {
                console.error('Error linking Stripe to Metronome:', linkError.message);
              }
            }
          } else {
            console.error('Failed to create Stripe customer:', stripeResult.error);
            // Continue even if Stripe fails - organization is already created
          }
        } catch (stripeError) {
          console.error('Stripe integration error:', stripeError.message);
          // Continue even if Stripe fails
        }
      } else {
        console.warn('Skipping Stripe customer creation - no user email available');
      }

      // Return success response
      return res.status(201).json({
        success: true,
        organization: {
          id: organizationId,
          organizationName,
          organizationUsername,
          createdBy: createdBy || null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          billingCustomerId: metronomeResult?.metronome_id || null,
          stripeCustomerId: stripeResult?.stripe_id || null
        },
        billing: {
          metronome: metronomeResult ? {
            success: metronomeResult.success,
            customerId: metronomeResult.metronome_id || null,
            error: metronomeResult.error || null,
            freeTrial: freeTrialResult ? {
              success: freeTrialResult.success,
              contractId: freeTrialResult.contract_id || null,
              credits: freeTrialResult.credits || null,
              error: freeTrialResult.error || null
            } : null
          } : null,
          stripe: stripeResult ? {
            success: stripeResult.success,
            customerId: stripeResult.stripe_id || null,
            email: stripeResult.email || null,
            error: stripeResult.error || null
          } : null
        }
      });

    } catch (err) {
      console.error('organizations POST error:', {
        message: err?.message || err,
        code: err?.code,
        stack: err?.stack
      });
      return res.status(500).json({
        error: 'Failed to create organization',
        details: err?.message || 'Unknown error'
      });
    }
  }

  // GET: Get single organization or list organizations
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const q = req.query || {};
    const organizationId = q.organizationId || q.id;

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
        
        // Format: "June 2, 2025 at 10:54:33 PM UTC"
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

    // GET single organization by ID
    if (organizationId) {
      console.log('Fetching single organization:', organizationId);

      const orgDoc = await db.collection('orgs').doc(organizationId).get();

      if (!orgDoc.exists) {
        return res.status(404).json({
          error: 'Organization not found',
          organizationId
        });
      }

      const orgData = orgDoc.data();

      // Check if organization is deleted
      if (orgData.deleted === true) {
        return res.status(410).json({
          error: 'Organization has been deleted',
          organizationId,
          deletedAt: orgData.deletedAt
        });
      }

      // Get brand count for this organization
      let brandsCount = 0;
      try {
        const brandsSnapshot = await db.collection('brands')
          .where('organizationId', '==', organizationId)
          .get();
        brandsCount = brandsSnapshot.size;
      } catch (error) {
        console.warn('Failed to fetch brand count:', error.message);
      }

      // Get member count for this organization
      let membersCount = 0;
      try {
        const usersSnapshot = await db.collection('users')
          .where('organizationId', '==', organizationId)
          .get();
        membersCount = usersSnapshot.size;
      } catch (error) {
        console.warn('Failed to fetch member count:', error.message);
      }

      const organization = {
        id: orgDoc.id,
        organizationName: orgData.organizationName || null,
        organizationUsername: orgData.organizationUsername || null,
        createdBy: orgData.createdBy || null,
        createdAt: formatTimestamp(orgData.createdAt),
        updatedAt: formatTimestamp(orgData.updatedAt),
        billingCustomerId: orgData.billingCustomerId || null,
        stripeCustomerId: orgData.stripeCustomerId || null,
        brandsCount,
        membersCount
      };

      console.log('Organization retrieved successfully:', {
        id: organization.id,
        name: organization.organizationName,
        brandsCount,
        membersCount
      });

      return res.status(200).json({
        success: true,
        organization
      });
    }

    // GET list of organizations
    const limitParam = parseInt(q.limit, 10);
    const lim = Math.min(Math.max(isNaN(limitParam) ? 500 : limitParam, 1), 500);

    console.log('Fetching organizations list with limit:', lim);

    // Query orgs collection (not 'organizations')
    let queryRef = db.collection('orgs');
    if (lim) queryRef = queryRef.limit(lim);

    const snapshot = await queryRef.get();

    const organizations = [];
    const orgIds = [];

    snapshot.forEach(doc => {
      const d = doc.data() || {};

      // Skip deleted organizations
      if (d.deleted === true) {
        return;
      }

      orgIds.push(doc.id);
      organizations.push({
        id: doc.id,
        organizationName: d.organizationName || null,
        organizationUsername: d.organizationUsername || null,
        createdBy: d.createdBy || null,
        createdAt: formatTimestamp(d.createdAt),
        updatedAt: formatTimestamp(d.updatedAt),
        billingCustomerId: d.billingCustomerId || null,
        stripeCustomerId: d.stripeCustomerId || null,
        brandsCount: 0, // Will be updated below
        membersCount: 0 // Will be updated below
      });
    });

    // Fetch brand counts and member counts for each organization
    if (organizations.length > 0) {
      try {
        // Get all brands and count by organizationId
        const brandsSnapshot = await db.collection('brands').get();
        const brandCounts = {};

        brandsSnapshot.forEach(doc => {
          const brandData = doc.data();
          const orgId = brandData.organizationId;
          if (orgId) {
            brandCounts[orgId] = (brandCounts[orgId] || 0) + 1;
          }
        });

        // Get all users and count by organizationId
        const usersSnapshot = await db.collection('users').get();
        const memberCounts = {};

        usersSnapshot.forEach(doc => {
          const userData = doc.data();
          const orgId = userData.organizationId;
          if (orgId) {
            memberCounts[orgId] = (memberCounts[orgId] || 0) + 1;
          }
        });

        // Update organizations with brand counts and member counts
        organizations.forEach(org => {
          org.brandsCount = brandCounts[org.id] || 0;
          org.membersCount = memberCounts[org.id] || 0;
        });
      } catch (error) {
        console.warn('Failed to fetch brand/member counts:', error.message);
        // Continue with counts as 0 if fetching fails
      }
    }

    return res.status(200).json({
      count: organizations.length,
      organizations
    });
  } catch (err) {
    console.error('organizations GET error:', {
      message: err?.message || err,
      code: err?.code,
      stack: err?.stack,
      query: req.query
    });
    return res.status(500).json({
      error: 'Failed to fetch organizations',
      details: err?.message || 'Unknown error'
    });
  }
});

