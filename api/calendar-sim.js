
const { generateCalendar } = require('../services/calendar-service');

// Increase max execution time for Vercel (Pro plan supports higher limits)
module.exports.config = { maxDuration: 300 };

const { withLogging } = require('../utils/logging.cjs.js');

module.exports = withLogging(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const params = req.body;
    if (!params.brandName || !params.website || !params.noOfPosts || !params.contentDistribution) {
      return res.status(400).json({ error: 'Missing required fields: brandName, website, noOfPosts, contentDistribution' });
    }

    // Validate contentDistribution structure
    if (!params.contentDistribution.productPercentage ||
        !params.contentDistribution.engagementPercentage ||
        !params.contentDistribution.salePercentage) {
      return res.status(400).json({
        error: 'contentDistribution must include productPercentage, engagementPercentage, and salePercentage'
      });
    }

    console.log('Generating calendar with params:', {
      brandName: params.brandName,
      website: params.website,
      noOfPosts: params.noOfPosts,
      postsPerWeek: params.postsPerWeek,
      startingDate: params.startingDate,
      contentDistribution: params.contentDistribution
    });

    const calendar = await generateCalendar(params);

    if (!calendar || calendar.trim() === '') {
      throw new Error('Generated calendar is empty');
    }

    // Log a sample of the calendar to help with debugging
    console.log('Calendar generated successfully, length:', calendar.length);
    console.log('Calendar sample (first 200 chars):', calendar.substring(0, 200));

    res.json({ calendar });
  } catch (error) {
    console.error('Calendar Sim API error:', error.message);
    res.status(500).json({
      error: 'Failed to generate calendar',
      details: error.message
    });
  }
});
