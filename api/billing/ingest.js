/**
 * Billing Ingest API Endpoint
 *
 * POST /api/billing/ingest
 *
 * Ingests billing events to Metronome for usage tracking and credit consumption.
 * Matches Metronome's API structure exactly.
 *
 * Request Body:
 * {
 *   "customerId": "string (required) - Metronome customer ID",
 *   "eventType": "string (required) - Event type name",
 *   "timestamp": "string (optional, ISO 8601)",
 *   "properties": {
 *     "credits": number (required, positive integer),
 *     "user_id": "string (optional)",
 *     "project_id": "string (optional)",
 *     ... any additional properties
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "transactionId": "customer-id+random-key",
 *   "eventType": "event-name",
 *   "timestamp": "2025-10-09T12:00:00.000Z",
 *   "customerId": "metronome-customer-id",
 *   "properties": { "credits": 25, "user_id": "user_1", ... },
 *   "billing": { ... }
 * }
 */

const metronomeService = require('../../services/metronome-service');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'Only POST requests are supported'
    });
  }

  try {
    const body = req.body || {};
    const {
      customerId,
      eventType,
      timestamp = null,
      properties = {}
    } = body;

    // Validate required fields
    if (!customerId || typeof customerId !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid required field: customerId',
        message: 'customerId (Metronome customer ID) must be a non-empty string'
      });
    }

    if (!eventType || typeof eventType !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid required field: eventType',
        message: 'eventType must be a non-empty string'
      });
    }

    if (!properties || typeof properties !== 'object') {
      return res.status(400).json({
        error: 'Missing or invalid required field: properties',
        message: 'properties must be an object'
      });
    }

    if (typeof properties.credits !== 'number' || properties.credits <= 0) {
      return res.status(400).json({
        error: 'Missing or invalid required field: properties.credits',
        message: 'properties.credits must be a positive number'
      });
    }

    // Validate timestamp if provided
    if (timestamp && typeof timestamp === 'string') {
      const parsedDate = new Date(timestamp);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          error: 'Invalid timestamp format',
          message: 'timestamp must be a valid ISO 8601 date string'
        });
      }
    }



    // Ingest event to Metronome directly
    const ingestResult = await metronomeService.ingestEvent({
      organization_id: customerId, // Use customerId as organization_id for transaction ID
      customer_id: customerId,
      event_type: eventType,
      timestamp,
      properties
    });

    if (ingestResult.success) {

      return res.status(200).json({
        success: true,
        transactionId: ingestResult.transaction_id,
        eventType: ingestResult.event_type,
        timestamp: ingestResult.timestamp,
        customerId: customerId,
        properties: ingestResult.properties,
        billing: {
          provider: 'metronome',
          customerId: customerId
        }
      });
    } else {
      console.error('Failed to ingest event:', {
        error: ingestResult.error,
        details: ingestResult.details
      });

      return res.status(ingestResult.status || 500).json({
        error: 'Failed to ingest billing event',
        details: ingestResult.error,
        metronomeDetails: ingestResult.details
      });
    }

  } catch (error) {
    console.error('Billing ingest error:', {
      message: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};

