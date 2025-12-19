/**
 * @fileoverview Rate Card API endpoint - Returns pricing information for all services
 * @route GET /api/billing/rate-card
 */

const fs = require('fs').promises;
const path = require('path');

module.exports = async (req, res) => {
  try {
    // Read the rate card file
    const rateCardPath = path.join(process.cwd(), 'settings', 'rate-card.txt');
    const rateCardContent = await fs.readFile(rateCardPath, 'utf8');

    // Parse the rate card
    const rateCard = {};
    const lines = rateCardContent.trim().split('\n');

    lines.forEach(line => {
      const [service, credits] = line.split('=');
      if (service && credits) {
        rateCard[service.trim()] = parseInt(credits, 10);
      }
    });

    // Return the rate card
    res.status(200).json({
      success: true,
      rateCard,
      totalServices: Object.keys(rateCard).length,
      description: 'Each credit is USD .005 (For example 10,000 credits = USD 50)'
    });
  } catch (error) {
    console.error('Error fetching rate card:', error.message);
    res.status(500).json({
      error: 'Failed to fetch rate card',
      details: error.message
    });
  }
};

